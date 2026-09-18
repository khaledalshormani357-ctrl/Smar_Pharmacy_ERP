// Centralized Stock & Inventory Service for Smart Pharmacy ERP
// The Single Source of Truth for all inventory mutations
// Direct mutations outside this service are strictly prohibited

import { db } from '../db/sqlite';
import { DomainValidator } from '../db/validation';
import { AuditManager } from '../db/audit';
import {
  Product,
  Batch,
  StockMovement,
  StockMovementType,
  UnitConversion,
  StockCountSession,
  StockCountItem,
  SaleItemAllocation
} from '../types';

export interface BatchAllocationResult {
  allocations: Array<{
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    allocatedQty: number;
    unitPurchaseCost: number;
    totalCost: number;
  }>;
  totalCogs: number;
}

export class StockService {
  // Central Movement Creator (Atomic with Audit Log)
  public static recordMovement(
    state: any,
    movementData: {
      productId: string;
      batchId: string;
      movementType: StockMovementType;
      referenceType: string;
      referenceId: string;
      quantityDelta: number;
      balanceAfter: number;
      productTotalBalanceAfter: number;
      unitCost: number;
      reason?: string;
      userId: string;
    }
  ): StockMovement {
    const movement: StockMovement = {
      id: 'mov-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString().slice(-4),
      product_id: movementData.productId,
      batch_id: movementData.batchId,
      movement_type: movementData.movementType,
      reference_type: movementData.referenceType,
      reference_id: movementData.referenceId,
      quantity_delta: movementData.quantityDelta,
      balance_after: movementData.balanceAfter,
      product_total_balance_after: movementData.productTotalBalanceAfter,
      unit_cost: movementData.unitCost,
      reason: movementData.reason?.trim(),
      created_by: movementData.userId,
      created_at: Date.now()
    };

    state.stock_movements.push(movement);
    return movement;
  }

  // 1.1 SALE RETURN STOCK RESTORATION (Single Source of Truth)
  static executeSaleReturn(
    state: any,
    payload: {
      productId: string;
      batchId: string;
      returnNumber: string;
      quantityDelta: number;
      unitCost: number;
      reason?: string;
      userId: string;
      condition?: 'resellable' | 'damaged' | 'expired' | 'quarantine';
    }
  ): StockMovement {
    if (payload.quantityDelta <= 0) {
      throw new Error('كمية المردود يجب أن تكون أكبر من الصفر.');
    }

    const batch = state.batches.find((b: any) => b.id === payload.batchId);
    if (!batch) {
      throw new Error(`التشغيلة المحددة (${payload.batchId}) غير موجودة.`);
    }

    const beforeBalance = batch.current_quantity;
    batch.current_quantity += payload.quantityDelta;
    batch.updated_at = Date.now();

    // Condition & Expiry handling:
    // If damaged or expired, it MUST NOT become sellable (status: quarantine or expired)
    const todayStr = new Date().toISOString().slice(0, 10);
    if (payload.condition === 'damaged' || payload.condition === 'quarantine' || payload.reason === 'damaged') {
      batch.status = 'quarantine';
    } else if (payload.condition === 'expired' || batch.expiry_date < todayStr || payload.reason === 'expired') {
      batch.status = 'expired';
    } else {
      // Resellable: if depleted, reactivate it
      if (batch.status === 'depleted') {
        batch.status = 'active';
      }
    }

    const productTotalStock = state.batches
      .filter((b: any) => b.product_id === payload.productId && (b.status === 'active' || b.status === 'quarantine'))
      .reduce((sum: number, b: any) => sum + b.current_quantity, 0);

    const movement = this.recordMovement(state, {
      productId: payload.productId,
      batchId: payload.batchId,
      movementType: 'sale_return',
      referenceType: 'sale_return',
      referenceId: payload.returnNumber,
      quantityDelta: payload.quantityDelta,
      balanceAfter: batch.current_quantity,
      productTotalBalanceAfter: productTotalStock,
      unitCost: payload.unitCost,
      reason: payload.reason || 'مردود مبيعات',
      userId: payload.userId
    });

    state.audit_logs.push(
      AuditManager.createLog(payload.userId, 'SALE_RETURN_STOCK', 'batch', payload.batchId, state.profile.device_id, {
        payloadBefore: { current_quantity: beforeBalance },
        payloadAfter: {
          returnNumber: payload.returnNumber,
          quantityReturned: payload.quantityDelta,
          condition: payload.condition || 'resellable',
          batchStatus: batch.status,
          current_quantity: batch.current_quantity
        }
      })
    );

    return movement;
  }

  // 1.2 PURCHASE RETURN STOCK DEDUCTION (Single Source of Truth)
  static executePurchaseReturn(
    state: any,
    payload: {
      productId: string;
      batchId: string;
      returnNumber: string;
      quantityDelta: number;
      unitCost: number;
      reason?: string;
      userId: string;
    }
  ): StockMovement {
    if (payload.quantityDelta <= 0) {
      throw new Error('كمية المردود يجب أن تكون أكبر من الصفر.');
    }

    const batch = state.batches.find((b: any) => b.id === payload.batchId);
    if (!batch) {
      throw new Error(`التشغيلة المحددة (${payload.batchId}) غير موجودة.`);
    }

    if (batch.current_quantity < payload.quantityDelta) {
      throw new Error(
        `رصيد التشغيلة (${batch.batch_number}) غير كافٍ لإرجاع الكمية المطلوبة للمورد. الرصيد الحالي المتوفر: ${batch.current_quantity}، والمطلوب إرجاعه: ${payload.quantityDelta}.`
      );
    }

    const beforeBalance = batch.current_quantity;
    batch.current_quantity -= payload.quantityDelta;
    batch.updated_at = Date.now();

    if (batch.current_quantity === 0) {
      batch.status = 'depleted';
    }

    const productTotalStock = state.batches
      .filter((b: any) => b.product_id === payload.productId && b.status === 'active')
      .reduce((sum: number, b: any) => sum + b.current_quantity, 0);

    const movement = this.recordMovement(state, {
      productId: payload.productId,
      batchId: payload.batchId,
      movementType: 'purchase_return',
      referenceType: 'purchase_return',
      referenceId: payload.returnNumber,
      quantityDelta: -payload.quantityDelta,
      balanceAfter: batch.current_quantity,
      productTotalBalanceAfter: productTotalStock,
      unitCost: payload.unitCost,
      reason: payload.reason || 'مردود مشتريات للمورد',
      userId: payload.userId
    });

    state.audit_logs.push(
      AuditManager.createLog(payload.userId, 'PURCHASE_RETURN_STOCK', 'batch', payload.batchId, state.profile.device_id, {
        payloadBefore: { current_quantity: beforeBalance },
        payloadAfter: {
          returnNumber: payload.returnNumber,
          quantityReturned: payload.quantityDelta,
          current_quantity: batch.current_quantity
        }
      })
    );

    return movement;
  }

  // 1. OPENING STOCK (Atomic: Batch -> Movement -> Audit Log)
  static addOpeningStock(payload: {
    productId: string;
    batchNumber: string;
    expiryDate: string;
    quantityBase: number;
    purchaseCostMinor: number;
    sellingPriceMinor: number;
    supplierId?: string;
    userId?: string;
  }): Batch {
    const userId = payload.userId || 'user-01';

    DomainValidator.validateBatch({
      batch_number: payload.batchNumber,
      expiry_date: payload.expiryDate,
      initial_quantity: payload.quantityBase,
      purchase_price: payload.purchaseCostMinor,
      selling_price: payload.sellingPriceMinor
    });

    if (payload.quantityBase <= 0) {
      throw new Error('كمية رصيد أول المدة يجب أن تكون أكبر من الصفر.');
    }

    return db.transaction(() => {
      const state = db.getState();
      const product = state.products.find((p) => p.id === payload.productId);
      if (!product) throw new Error('الصنف المراد إضافة رصيد افتتاحي له غير موجود.');

      const now = Date.now();
      const batchId = 'batch-' + Math.random().toString(36).substring(2, 9);
      const todayStr = new Date().toISOString().slice(0, 10);
      const isExpired = payload.expiryDate < todayStr;

      const newBatch: Batch = {
        id: batchId,
        product_id: payload.productId,
        batch_number: payload.batchNumber.trim(),
        expiry_date: payload.expiryDate,
        received_at: now,
        purchase_price: payload.purchaseCostMinor,
        selling_price: payload.sellingPriceMinor,
        initial_quantity: payload.quantityBase,
        current_quantity: payload.quantityBase,
        supplier_id: payload.supplierId,
        status: isExpired ? 'expired' : 'active',
        created_at: now,
        updated_at: now
      };

      state.batches.push(newBatch);

      // Calculate total stock after
      const productTotalStock = state.batches
        .filter((b) => b.product_id === payload.productId)
        .reduce((sum, b) => sum + b.current_quantity, 0);

      // Record Stock Movement
      this.recordMovement(state, {
        productId: payload.productId,
        batchId: batchId,
        movementType: 'opening_balance',
        referenceType: 'opening_stock',
        referenceId: 'OPN-' + now.toString().slice(-6),
        quantityDelta: payload.quantityBase,
        balanceAfter: payload.quantityBase,
        productTotalBalanceAfter: productTotalStock,
        unitCost: payload.purchaseCostMinor,
        reason: 'إثبات رصيد افتتاحي أولي',
        userId
      });

      // Record Audit Trail
      state.audit_logs.push(
        AuditManager.createLog(userId, 'OPENING_STOCK', 'batch', batchId, state.profile.device_id, {
          reason: 'إثبات رصيد أولي للصنف ' + product.name_ar,
          payloadAfter: newBatch
        })
      );

      return newBatch;
    });
  }

  // 2. CONTROLLED STOCK ADJUSTMENT (Plus or Minus with Movement & Audit)
  static adjustStock(payload: {
    productId: string;
    batchId: string;
    newQuantityBase: number;
    reason: string;
    userId?: string;
  }): void {
    const userId = payload.userId || 'user-01';
    if (!payload.reason || !payload.reason.trim()) {
      throw new Error('سبب التعديل المخزني إلزامي.');
    }
    if (payload.newQuantityBase < 0) {
      throw new Error('لا يمكن أن يكون رصيد الدفعة سالباً.');
    }

    db.transaction(() => {
      const state = db.getState();
      const batch = state.batches.find((b) => b.id === payload.batchId && b.product_id === payload.productId);
      if (!batch) throw new Error('الدفعة المحددة غير موجودة.');

      const beforeBalance = batch.current_quantity;
      const delta = payload.newQuantityBase - beforeBalance;
      if (delta === 0) return; // No change needed

      batch.current_quantity = payload.newQuantityBase;
      if (batch.current_quantity === 0) {
        batch.status = 'depleted';
      } else if (batch.status === 'depleted') {
        batch.status = 'active';
      }
      batch.updated_at = Date.now();

      // Product total stock after
      const productTotalStock = state.batches
        .filter((b) => b.product_id === payload.productId)
        .reduce((sum, b) => sum + b.current_quantity, 0);

      // Record Stock Movement
      this.recordMovement(state, {
        productId: payload.productId,
        batchId: payload.batchId,
        movementType: delta > 0 ? 'adjustment_plus' : 'adjustment_minus',
        referenceType: 'manual_adjustment',
        referenceId: 'ADJ-' + Date.now().toString().slice(-6),
        quantityDelta: delta,
        balanceAfter: batch.current_quantity,
        productTotalBalanceAfter: productTotalStock,
        unitCost: batch.purchase_price,
        reason: payload.reason.trim(),
        userId
      });

      // Record Audit Trail
      state.audit_logs.push(
        AuditManager.createLog(userId, 'STOCK_ADJUSTMENT', 'batch', payload.batchId, state.profile.device_id, {
          reason: payload.reason.trim(),
          payloadBefore: { current_quantity: beforeBalance },
          payloadAfter: { current_quantity: batch.current_quantity }
        })
      );
    });
  }

  /**
   * Set Quarantine Status on a Batch (حجر صحي أو تعليق دفعة دوائية)
   */
  static quarantineBatch(batchId: string, isQuarantined: boolean, reason: string, userId = 'user-01'): void {
    if (!reason || !reason.trim()) {
      throw new Error('سبب تعديل حالة الحجر الصحي إلزامي.');
    }

    db.transaction(() => {
      const state = db.getState();
      const batch = state.batches.find((b) => b.id === batchId);
      if (!batch) throw new Error('الدفعة المحددة غير موجودة.');

      const beforeStatus = batch.status;
      batch.status = isQuarantined ? 'quarantine' : batch.current_quantity === 0 ? 'depleted' : 'active';
      batch.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'QUARANTINE_BATCH', 'batch', batchId, state.profile.device_id, {
          reason: reason.trim(),
          payloadBefore: { status: beforeStatus },
          payloadAfter: { status: batch.status }
        })
      );
    });
  }

  /**
   * Write-off Expired or Damaged Batch (إتلاف رسمي لدفعة منتهية الصلاحية أو تالفة)
   */
  static writeOffExpiredBatch(batchId: string, reason: string, userId = 'user-01'): void {
    if (!reason || !reason.trim()) {
      throw new Error('يرجى تحديد سبب أو محضر إتلاف الدفعة.');
    }

    db.transaction(() => {
      const state = db.getState();
      const batch = state.batches.find((b) => b.id === batchId);
      if (!batch) throw new Error('الدفعة المحددة غير موجودة.');
      if (batch.current_quantity <= 0) {
        throw new Error('رصيد الدفعة منتهي أو صفر مسبقاً.');
      }

      const qty = batch.current_quantity;
      batch.current_quantity = 0;
      batch.status = 'expired';
      batch.updated_at = Date.now();

      const productTotalStock = state.batches
        .filter((b) => b.product_id === batch.product_id)
        .reduce((sum, b) => sum + b.current_quantity, 0);

      this.recordMovement(state, {
        productId: batch.product_id,
        batchId: batch.id,
        movementType: 'expired_writeoff',
        referenceType: 'writeoff_protocol',
        referenceId: 'WRITEOFF-' + Date.now().toString().slice(-6),
        quantityDelta: -qty,
        balanceAfter: 0,
        productTotalBalanceAfter: productTotalStock,
        unitCost: batch.purchase_price,
        reason: reason.trim(),
        userId
      });

      state.audit_logs.push(
        AuditManager.createLog(userId, 'BATCH_WRITEOFF', 'batch', batchId, state.profile.device_id, {
          reason: reason.trim(),
          payloadBefore: { quantity: qty },
          payloadAfter: { quantity: 0, status: 'expired' }
        })
      );
    });
  }

  // 3. FEFO ENGINE (First Expired, First Out) with Multi-Batch Allocation
  static allocateFEFO(
    productId: string,
    requiredBaseQty: number,
    preferredBatchId?: string
  ): BatchAllocationResult {
    const state = db.getState();
    const todayStr = new Date().toISOString().slice(0, 10);

    let candidateBatches = state.batches.filter(
      (b) =>
        b.product_id === productId &&
        b.current_quantity > 0 &&
        b.status === 'active' &&
        b.expiry_date >= todayStr // Exclude expired batches strictly
    );

    if (preferredBatchId) {
      const preferred = candidateBatches.find((b) => b.id === preferredBatchId);
      if (preferred) {
        candidateBatches = [preferred, ...candidateBatches.filter((b) => b.id !== preferredBatchId)];
      }
    } else {
      // Sort strictly: expiry_date ASC, then received_at ASC
      candidateBatches.sort((a, b) => {
        const expDiff = a.expiry_date.localeCompare(b.expiry_date);
        if (expDiff !== 0) return expDiff;
        return a.received_at - b.received_at;
      });
    }

    let remainingNeeded = requiredBaseQty;
    const allocations: Array<{
      batchId: string;
      batchNumber: string;
      expiryDate: string;
      allocatedQty: number;
      unitPurchaseCost: number;
      totalCost: number;
    }> = [];

    for (const batch of candidateBatches) {
      if (remainingNeeded <= 0) break;
      const take = Math.min(batch.current_quantity, remainingNeeded);
      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batch_number,
        expiryDate: batch.expiry_date,
        allocatedQty: take,
        unitPurchaseCost: batch.purchase_price, // Exact historical cost from batch
        totalCost: take * batch.purchase_price
      });
      remainingNeeded -= take;
    }

    if (remainingNeeded > 0) {
      const available = requiredBaseQty - remainingNeeded;
      throw new Error(
        `الكمية المطلوبة (${requiredBaseQty}) غير متوفرة في التشغيلات الصالحة. المتاح حالياً: (${available}).`
      );
    }

    const totalCogs = allocations.reduce((sum, a) => sum + a.totalCost, 0);

    return {
      allocations,
      totalCogs
    };
  }

  // 4. STOCK COUNT SESSIONS (جرد المخزون الدوري)
  static startStockCountSession(title: string, userId = 'user-01'): StockCountSession {
    return db.transaction(() => {
      const state = db.getState();
      const now = Date.now();
      const sessionNumber = 'CNT-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(100 + Math.random() * 900);

      const session: StockCountSession = {
        id: 'cnt-' + Math.random().toString(36).substring(2, 9),
        session_number: sessionNumber,
        title: title || 'جلسة جرد جديدة',
        status: 'draft',
        created_by: userId,
        created_at: now
      };

      state.stock_count_sessions.push(session);

      // Snapshot current system stock for all active batches
      for (const batch of state.batches) {
        if (batch.current_quantity > 0 || batch.status === 'active') {
          const item: StockCountItem = {
            id: 'cnt-item-' + Math.random().toString(36).substring(2, 9),
            session_id: session.id,
            product_id: batch.product_id,
            batch_id: batch.id,
            system_quantity_base: batch.current_quantity,
            physical_quantity_base: batch.current_quantity, // Initially set to system qty
            variance_base: 0,
            unit_cost: batch.purchase_price,
            variance_cost: 0,
            counted_at: now
          };
          state.stock_count_items.push(item);
        }
      }

      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'stock_count_session', session.id, state.profile.device_id, {
          reason: 'فتح جلسة جرد مخزني ' + session.session_number
        })
      );

      return session;
    });
  }

  // Update physical count for a single item in session
  static recordCountItem(sessionId: string, batchId: string, physicalQtyBase: number): void {
    if (physicalQtyBase < 0) {
      throw new Error('الكمية الفعلية لا يمكن أن تكون سالبة.');
    }
    db.transaction(() => {
      const state = db.getState();
      const item = state.stock_count_items.find((i) => i.session_id === sessionId && i.batch_id === batchId);
      if (!item) throw new Error('بند الجرد غير موجود في هذه الجلسة.');

      item.physical_quantity_base = physicalQtyBase;
      item.variance_base = physicalQtyBase - item.system_quantity_base;
      item.variance_cost = item.variance_base * item.unit_cost;
      item.counted_at = Date.now();
    });
  }

  // Approve Stock Count & Apply Discrepancies Atomically
  static approveStockCountSession(sessionId: string, userId = 'user-01'): void {
    db.transaction(() => {
      const state = db.getState();
      const session = state.stock_count_sessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('جلسة الجرد غير موجودة.');
      if (session.status === 'approved') throw new Error('جلسة الجرد معتمدة مسبقاً.');

      const countItems = state.stock_count_items.filter((i) => i.session_id === sessionId);

      for (const item of countItems) {
        if (item.variance_base !== 0) {
          const batch = state.batches.find((b) => b.id === item.batch_id);
          if (batch) {
            batch.current_quantity = item.physical_quantity_base;
            batch.updated_at = Date.now();

            const productTotalStock = state.batches
              .filter((b) => b.product_id === item.product_id)
              .reduce((sum, b) => sum + b.current_quantity, 0);

            this.recordMovement(state, {
              productId: item.product_id,
              batchId: item.batch_id,
              movementType: item.variance_base > 0 ? 'adjustment_plus' : 'adjustment_minus',
              referenceType: 'stock_count',
              referenceId: session.session_number,
              quantityDelta: item.variance_base,
              balanceAfter: batch.current_quantity,
              productTotalBalanceAfter: productTotalStock,
              unitCost: item.unit_cost,
              reason: `تسوية جرد ${session.session_number} (فارق ${item.variance_base})`,
              userId
            });
          }
        }
      }

      session.status = 'approved';
      session.approved_by = userId;
      session.approved_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'APPROVE', 'stock_count_session', sessionId, state.profile.device_id, {
          reason: 'اعتماد تسويات الجرد للجلسة ' + session.session_number
        })
      );
    });
  }

  // 5. INVENTORY VALUATION (Strict Batch Quantity × Historical Cost)
  static getInventoryValuation(): {
    totalValueMinor: number;
    totalUnitsCount: number;
    activeBatchesCount: number;
  } {
    const state = db.getState();
    let totalValueMinor = 0;
    let totalUnitsCount = 0;
    let activeBatchesCount = 0;

    for (const batch of state.batches) {
      if (batch.current_quantity > 0 && batch.status === 'active') {
        totalValueMinor += batch.current_quantity * batch.purchase_price;
        totalUnitsCount += batch.current_quantity;
        activeBatchesCount++;
      }
    }

    return {
      totalValueMinor,
      totalUnitsCount,
      activeBatchesCount
    };
  }

  // 6. EXPIRY MANAGEMENT & NEAR-EXPIRY POLICIES
  static getExpiryBreakdown(): {
    activeBatches: Batch[];
    nearExpiryBatches: Batch[];
    expiredBatches: Batch[];
    depletedBatches: Batch[];
  } {
    const state = db.getState();
    const todayStr = new Date().toISOString().slice(0, 10);
    const thresholdDays = state.profile?.near_expiry_days || 90;
    const thresholdDateStr = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const activeBatches: Batch[] = [];
    const nearExpiryBatches: Batch[] = [];
    const expiredBatches: Batch[] = [];
    const depletedBatches: Batch[] = [];

    for (const batch of state.batches) {
      if (batch.current_quantity === 0) {
        depletedBatches.push(batch);
      } else if (batch.expiry_date < todayStr) {
        expiredBatches.push(batch);
      } else if (batch.expiry_date <= thresholdDateStr) {
        nearExpiryBatches.push(batch);
      } else {
        activeBatches.push(batch);
      }
    }

    return {
      activeBatches,
      nearExpiryBatches,
      expiredBatches,
      depletedBatches
    };
  }
}
