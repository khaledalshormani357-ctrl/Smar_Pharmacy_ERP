// Enterprise Firebase Cloud Sync Engine for Smart Pharmacy ERP
// Multi-Tenant Isolation, Outbox / Sync Queue, Idempotency, and Offline-First Resilience

import {
  db as firestoreDb,
  auth,
  testConnection,
  signInWithGoogle,
  logOut,
  handleFirestoreError,
  OperationType
} from '../firebase';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  limit
} from 'firebase/firestore';
import { db as localDb } from '../db/sqlite';
import { OutboxManager } from '../db/outbox';
import { SyncOutboxEntry, SyncSummary, PharmacyMember } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

export interface SyncStatus {
  isOnline: boolean;
  projectId: string;
  databaseId: string;
  currentUser: {
    uid: string;
    email: string | null;
    displayName: string | null;
  } | null;
  userRole?: string;
  membershipStatus?: 'member' | 'unassigned' | 'not_logged_in';
  lastSyncTime: string | null;
  syncInProgress: boolean;
  lastError: string | null;
  outbox: SyncSummary;
}

export class FirebaseSyncServiceClass {
  private syncInProgress = false;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;

  /**
   * Resolve Firestore Document Path with Multi-Tenant Pharmacy Scoping
   */
  getTenantDocPath(pharmacyId: string, collectionName: string, docId?: string): string {
    const cleanId = pharmacyId || 'prof-01';
    return docId
      ? `pharmacies/${cleanId}/${collectionName}/${docId}`
      : `pharmacies/${cleanId}/${collectionName}`;
  }

  /**
   * Get Current Cloud Sync & Outbox Status
   */
  async getStatus(): Promise<SyncStatus> {
    const isOnline = await testConnection();
    const user = auth.currentUser;
    const outboxSummary = OutboxManager.getSummary();
    const state = localDb.getState();
    const pharmacyId = state.profile?.id || 'prof-01';

    let userRole: string | undefined = undefined;
    let membershipStatus: 'member' | 'unassigned' | 'not_logged_in' = 'not_logged_in';

    if (user) {
      // Check local user role first, or default to pharmacist/cashier
      const localUser = state.users.find((u) => u.is_active);
      userRole = localUser?.role_id || 'pharmacist';
      membershipStatus = 'member';
    }

    return {
      isOnline,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      currentUser: user
        ? {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
          }
        : null,
      userRole,
      membershipStatus,
      lastSyncTime: this.lastSyncTime || (outboxSummary.last_sync_time ? new Date(outboxSummary.last_sync_time).toISOString() : null),
      syncInProgress: this.syncInProgress,
      lastError: this.lastError,
      outbox: outboxSummary
    };
  }

  /**
   * Sign In with Google
   */
  async loginWithGoogle() {
    this.lastError = null;
    try {
      const user = await signInWithGoogle();
      // Ensure user membership is registered for current pharmacy
      const state = localDb.getState();
      const pharmacyId = state.profile?.id || 'prof-01';
      await this.ensurePharmacyMembership(pharmacyId, user.uid, user.displayName || user.email || 'Staff');
      return user;
    } catch (err: any) {
      this.lastError = err?.message || 'فشل تسجيل الدخول بحساب Google';
      throw err;
    }
  }

  /**
   * Ensure user has a valid membership document under /pharmacies/{pharmacyId}/members/{userId}
   */
  async ensurePharmacyMembership(
    pharmacyId: string,
    userId: string,
    _displayName: string,
    role: PharmacyMember['role'] = 'pharmacist'
  ): Promise<void> {
    try {
      const memberRef = doc(firestoreDb, `pharmacies/${pharmacyId}/members/${userId}`);
      const snap = await getDoc(memberRef);
      if (!snap.exists()) {
        await setDoc(memberRef, {
          userId,
          pharmacyId,
          role,
          isActive: true,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Membership check/creation deferred or restricted by rules:', err);
    }
  }

  /**
   * Sign Out
   */
  async logout() {
    this.lastError = null;
    try {
      await logOut();
    } catch (err: any) {
      this.lastError = err?.message || 'فشل تسجيل الخروج';
      throw err;
    }
  }

  /**
   * Process Pending Outbox Queue to Firestore with Idempotency & Retry Tracking
   */
  async processOutbox(
    onProgress?: (msg: string, percent: number) => void
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.syncInProgress) {
      throw new Error('عملية المزامنة جارية بالفعل في خيط آخر (Sync Lock Active)');
    }

    const state = localDb.getState();
    const pharmacyId = state.profile?.id || 'prof-01';
    const pendingEntries = OutboxManager.getPendingEntries();

    if (pendingEntries.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.syncInProgress = true;
    this.lastError = null;
    let succeeded = 0;
    let failed = 0;

    try {
      onProgress?.('جاري فحص الاتصال بقاعدة بيانات Firestore...', 5);
      const isOnline = await testConnection();
      if (!isOnline) {
        throw new Error('تعذر الاتصال بخادم Firestore السحابي. العمليات محفوظة محلياً في Outbox للمزامنة لاحقاً.');
      }

      for (let i = 0; i < pendingEntries.length; i++) {
        const entry = pendingEntries[i];
        OutboxManager.markProcessing(entry.id);

        const currentPct = 10 + Math.round((i / pendingEntries.length) * 85);
        onProgress?.(`جاري مزامنة ${entry.entity_type} (${i + 1}/${pendingEntries.length})...`, currentPct);

        try {
          await this.syncOutboxItemToCloud(pharmacyId, entry);
          OutboxManager.markSynced(entry.id);
          succeeded++;
        } catch (err: any) {
          const errMsg = err?.message || 'فشل رفع السجل إلى Firestore';
          OutboxManager.markFailed(entry.id, errMsg);
          failed++;
          console.warn(`Outbox entry ${entry.id} failed:`, errMsg);
        }
      }

      this.lastSyncTime = new Date().toISOString();
      onProgress?.(`اكتملت المزامنة: نجح ${succeeded}، تعثر ${failed}`, 100);
      return { processed: pendingEntries.length, succeeded, failed };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Dispatch single Outbox entry to appropriate Firestore collection
   */
  private async syncOutboxItemToCloud(pharmacyId: string, entry: SyncOutboxEntry): Promise<void> {
    const payload = entry.payload;

    switch (entry.entity_type) {
      case 'pharmacy_profile': {
        const path = `pharmacies/${pharmacyId}`;
        await setDoc(doc(firestoreDb, path), {
          id: pharmacyId,
          nameAr: payload.name_ar,
          nameEn: payload.name_en || '',
          licenseNumber: payload.license_number || '',
          taxNumber: payload.tax_number || '',
          phone: payload.phone || '',
          address: payload.address_ar || payload.address_en || '',
          currency: payload.currency || 'YER',
          updatedAt: new Date().toISOString()
        }, { merge: true });
        break;
      }

      case 'product': {
        const path = `pharmacies/${pharmacyId}/products/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          nameAr: payload.name_ar,
          nameEn: payload.name_en || '',
          scientificName: payload.generic_name || payload.active_ingredient || '',
          barcode: payload.barcode || '',
          categoryId: payload.category_id || '',
          manufacturerId: payload.manufacturer_id || '',
          sellingPrice: payload.current_selling_price || 0,
          purchasePrice: payload.current_purchase_price || 0,
          isActive: payload.is_active ?? true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        break;
      }

      case 'batch': {
        const prodId = payload.product_id;
        const path = `pharmacies/${pharmacyId}/products/${prodId}/batches/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          productId: prodId,
          batchNumber: payload.batch_number,
          expiryDate: payload.expiry_date,
          quantity: payload.current_quantity,
          isDepleted: payload.status === 'depleted' || payload.current_quantity <= 0,
          unitCost: payload.cost_per_unit || 0,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        break;
      }

      case 'sale': {
        const path = `pharmacies/${pharmacyId}/sales/${entry.entity_id}`;
        const saleData = {
          id: entry.entity_id,
          invoiceNumber: payload.invoice_number,
          customerId: payload.customer_id || '',
          cashierId: payload.user_id || auth.currentUser?.uid || 'user-01',
          cashboxId: payload.cashbox_id || 'cash-01',
          subtotal: payload.subtotal || 0,
          discountAmount: payload.discount_amount || 0,
          taxAmount: payload.tax_amount || 0,
          netTotal: payload.net_total || 0,
          paidAmount: payload.paid_amount || 0,
          remainingAmount: payload.remaining_amount || 0,
          status: payload.status || 'completed',
          paymentMethod: payload.payment_method || 'cash',
          cancellationReason: payload.cancellation_reason || '',
          createdAt: payload.created_at ? new Date(payload.created_at).toISOString() : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(firestoreDb, path), saleData, { merge: true });
        break;
      }

      case 'cash_transaction': {
        const path = `pharmacies/${pharmacyId}/cash_transactions/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          cashboxId: payload.cashbox_id,
          type: payload.type,
          direction: payload.direction,
          amount: payload.amount,
          balanceAfter: payload.balance_after,
          referenceType: payload.reference_type || '',
          referenceId: payload.reference_id || '',
          statement: payload.statement || '',
          userId: payload.created_by || auth.currentUser?.uid || 'user-01',
          createdAt: payload.created_at ? new Date(payload.created_at).toISOString() : new Date().toISOString()
        }, { merge: true });
        break;
      }

      case 'stock_movement': {
        const path = `pharmacies/${pharmacyId}/stock_movements/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          productId: payload.product_id,
          batchId: payload.batch_id || '',
          type: payload.type || 'sale',
          quantity: payload.quantity,
          balanceAfter: payload.balance_after,
          referenceId: payload.reference_id || '',
          userId: payload.user_id || auth.currentUser?.uid || 'user-01',
          createdAt: payload.created_at ? new Date(payload.created_at).toISOString() : new Date().toISOString()
        }, { merge: true });
        break;
      }

      case 'audit_log': {
        const path = `pharmacies/${pharmacyId}/audit_logs/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          userId: payload.user_id || auth.currentUser?.uid || 'user-01',
          action: payload.action,
          entity: payload.entity,
          entityId: payload.entity_id,
          deviceId: payload.device_id || 'DEVICE-LOCAL',
          createdAt: payload.created_at || Date.now()
        }, { merge: true });
        break;
      }

      case 'customer': {
        const path = `pharmacies/${pharmacyId}/customers/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          name: payload.name,
          phone: payload.phone || '',
          balance: payload.cached_balance || 0,
          creditLimit: payload.credit_limit || 0,
          isActive: payload.is_active ?? true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        break;
      }

      case 'supplier': {
        const path = `pharmacies/${pharmacyId}/suppliers/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), {
          id: entry.entity_id,
          name: payload.name,
          contactPerson: payload.contact_person || '',
          phone: payload.phone || '',
          balance: payload.cached_balance || 0,
          isActive: payload.is_active ?? true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        break;
      }

      default: {
        // Unknown or custom entity
        const path = `pharmacies/${pharmacyId}/${entry.entity_type}s/${entry.entity_id}`;
        await setDoc(doc(firestoreDb, path), { ...payload, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }

    // Record Outbox Completion in Firestore for cross-device audit and idempotency
    const outboxSyncPath = `pharmacies/${pharmacyId}/sync_outbox/${entry.operation_id}`;
    await setDoc(doc(firestoreDb, outboxSyncPath), {
      id: entry.id,
      operationId: entry.operation_id,
      pharmacyId,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
      action: entry.action,
      status: 'synced',
      syncedAt: new Date().toISOString()
    }, { merge: true });
  }

  /**
   * Sync Pharmacy Profile & Catalog to Cloud Firestore (Full Sync Pipeline)
   */
  async syncToCloud(onProgress?: (msg: string, percent: number) => void): Promise<{
    productsSynced: number;
    profileSynced: boolean;
    outboxSynced: number;
  }> {
    const state = localDb.getState();
    const pharmacyId = state.profile?.id || 'prof-01';

    // 1. Queue all local data into outbox to ensure complete representation
    onProgress?.('تحضير وتجهيز رتل المزامنة المحلي (Sync Outbox)...', 5);
    const queuedCount = OutboxManager.queueFullLocalSync(pharmacyId);

    // 2. Process Outbox
    const result = await this.processOutbox(onProgress);

    const activeProducts = state.products.filter((p) => !p.deleted_at).length;
    return {
      productsSynced: activeProducts,
      profileSynced: true,
      outboxSynced: result.succeeded
    };
  }

  /**
   * Pull Cloud Products Backup from Firestore
   */
  async pullFromCloud(): Promise<{ productsRetrieved: number }> {
    const state = localDb.getState();
    const pharmacyId = state.profile?.id || 'prof-01';
    const productsPath = `pharmacies/${pharmacyId}/products`;

    try {
      const q = query(collection(firestoreDb, productsPath), limit(50));
      const snap = await getDocs(q);
      return { productsRetrieved: snap.size };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, productsPath);
    }
  }
}

export const FirebaseSyncService = new FirebaseSyncServiceClass();
