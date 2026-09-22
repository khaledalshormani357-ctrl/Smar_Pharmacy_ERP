// Outbox & Sync Queue Engine for Smart Pharmacy ERP
// Ensures local SQLite operations are queued deterministically and synced idempotently to Firestore

import { db } from './sqlite';
import { SyncOutboxEntry, SyncSummary } from '../types';

export class OutboxManager {
  /**
   * Deterministically enqueue an operation to be synced to Cloud Firestore.
   * If an identical operation_id is already pending or synced, prevents duplicates.
   */
  static enqueue(params: {
    pharmacy_id: string;
    entity_type: SyncOutboxEntry['entity_type'];
    entity_id: string;
    action: 'create' | 'update' | 'delete';
    payload: any;
    operation_id?: string;
    max_retries?: number;
  }): SyncOutboxEntry {
    const state = db.getState();
    if (!state.sync_outbox) {
      state.sync_outbox = [];
    }

    const operationId =
      params.operation_id ||
      `${params.pharmacy_id}_${params.entity_type}_${params.entity_id}_${params.action}_${Date.now()}`;

    // Check if duplicate operation is already pending
    const existing = state.sync_outbox.find(
      (e) => e.operation_id === operationId && (e.status === 'pending' || e.status === 'processing')
    );
    if (existing) {
      return existing;
    }

    const entry: SyncOutboxEntry = {
      id: 'outbox-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString().slice(-4),
      operation_id: operationId,
      pharmacy_id: params.pharmacy_id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      action: params.action,
      payload: params.payload,
      status: 'pending',
      retry_count: 0,
      max_retries: params.max_retries ?? 5,
      created_at: Date.now()
    };

    state.sync_outbox.push(entry);
    db.saveState();
    return entry;
  }

  /**
   * Get pending or eligible-for-retry entries
   */
  static getPendingEntries(): SyncOutboxEntry[] {
    const state = db.getState();
    const now = Date.now();
    return (state.sync_outbox || []).filter((e) => {
      if (e.status === 'pending') return true;
      if (e.status === 'retry') {
        return !e.next_retry_at || now >= e.next_retry_at;
      }
      return false;
    });
  }

  /**
   * Mark an entry as currently processing
   */
  static markProcessing(id: string): void {
    const state = db.getState();
    const entry = (state.sync_outbox || []).find((e) => e.id === id);
    if (entry) {
      entry.status = 'processing';
      entry.last_attempt_at = Date.now();
    }
  }

  /**
   * Mark an entry as successfully synced
   */
  static markSynced(id: string): void {
    const state = db.getState();
    const entry = (state.sync_outbox || []).find((e) => e.id === id);
    if (entry) {
      entry.status = 'synced';
      entry.synced_at = Date.now();
      entry.last_error = undefined;
      db.saveState();
    }
  }

  /**
   * Mark an entry as failed with exponential backoff retry calculation
   */
  static markFailed(id: string, errorMsg: string): void {
    const state = db.getState();
    const entry = (state.sync_outbox || []).find((e) => e.id === id);
    if (entry) {
      entry.retry_count = (entry.retry_count || 0) + 1;
      entry.last_attempt_at = Date.now();
      entry.last_error = errorMsg;

      if (entry.retry_count < entry.max_retries) {
        entry.status = 'retry';
        // Exponential backoff: 2s, 4s, 8s, 16s... capped at 60s
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, entry.retry_count));
        entry.next_retry_at = Date.now() + backoffMs;
      } else {
        entry.status = 'failed';
      }
      db.saveState();
    }
  }

  /**
   * Reset failed entries for manual retry
   */
  static retryAllFailed(): number {
    const state = db.getState();
    let resetCount = 0;
    (state.sync_outbox || []).forEach((e) => {
      if (e.status === 'failed' || e.status === 'retry') {
        e.status = 'pending';
        e.retry_count = 0;
        e.next_retry_at = undefined;
        resetCount++;
      }
    });
    if (resetCount > 0) {
      db.saveState();
    }
    return resetCount;
  }

  /**
   * Queue local database initial seed / full catch-up into outbox
   */
  static queueFullLocalSync(pharmacyId: string): number {
    const state = db.getState();
    let count = 0;

    // 1. Profile
    if (state.profile) {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'pharmacy_profile',
        entity_id: state.profile.id,
        action: 'update',
        payload: state.profile,
        operation_id: `sync_profile_${state.profile.id}`
      });
      count++;
    }

    // 2. Active Products
    state.products.filter((p) => !p.deleted_at).forEach((p) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'product',
        entity_id: p.id,
        action: 'update',
        payload: p,
        operation_id: `sync_prod_${p.id}`
      });
      count++;
    });

    // 3. Batches
    state.batches.forEach((b) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'batch',
        entity_id: b.id,
        action: 'update',
        payload: b,
        operation_id: `sync_batch_${b.id}`
      });
      count++;
    });

    // 4. Sales
    state.sales.forEach((s) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'sale',
        entity_id: s.id,
        action: 'create',
        payload: s,
        operation_id: `sync_sale_${s.id}`
      });
      count++;
    });

    // 5. Cash Transactions
    state.cash_transactions.forEach((c) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'cash_transaction',
        entity_id: c.id,
        action: 'create',
        payload: c,
        operation_id: `sync_cash_${c.id}`
      });
      count++;
    });

    // 6. Customers
    state.customers.forEach((cust) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'customer',
        entity_id: cust.id,
        action: 'update',
        payload: cust,
        operation_id: `sync_cust_${cust.id}`
      });
      count++;
    });

    // 7. Suppliers
    state.suppliers.forEach((sup) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'supplier',
        entity_id: sup.id,
        action: 'update',
        payload: sup,
        operation_id: `sync_sup_${sup.id}`
      });
      count++;
    });

    // 8. Stock Movements
    state.stock_movements.forEach((m) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'stock_movement',
        entity_id: m.id,
        action: 'create',
        payload: m,
        operation_id: `sync_mov_${m.id}`
      });
      count++;
    });

    // 9. Audit Logs
    state.audit_logs.forEach((a) => {
      this.enqueue({
        pharmacy_id: pharmacyId,
        entity_type: 'audit_log',
        entity_id: a.id,
        action: 'create',
        payload: a,
        operation_id: `sync_audit_${a.id}`
      });
      count++;
    });

    return count;
  }

  /**
   * Outbox Summary Statistics
   */
  static getSummary(): SyncSummary {
    const state = db.getState();
    const outbox = state.sync_outbox || [];
    const pending = outbox.filter((e) => e.status === 'pending' || e.status === 'retry' || e.status === 'processing').length;
    const synced = outbox.filter((e) => e.status === 'synced').length;
    const failed = outbox.filter((e) => e.status === 'failed').length;

    let lastSync: number | undefined;
    outbox.forEach((e) => {
      if (e.synced_at && (!lastSync || e.synced_at > lastSync)) {
        lastSync = e.synced_at;
      }
    });

    return {
      total_queued: outbox.length,
      pending_count: pending,
      synced_count: synced,
      failed_count: failed,
      last_sync_time: lastSync,
      in_progress: outbox.some((e) => e.status === 'processing')
    };
  }
}
