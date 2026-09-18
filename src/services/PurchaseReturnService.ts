// Purchase Return Service for Smart Pharmacy ERP
// Strict Batch Provenance, Historical Cost Integrity, Stock Safety & Atomic Financial Reversals

import { db } from '../db/sqlite';
import { DomainValidator } from '../db/validation';
import { AuditManager } from '../db/audit';
import { TransactionManager } from '../db/transaction';
import { StockService } from './StockService';
import {
  PurchaseReturn,
  PurchaseReturnItem,
  PurchaseReturnAllocation,
  CashTransaction,
  SupplierTransaction,
  ReturnReason
} from '../types';

export interface CreatePurchaseReturnPayload {
  purchase_id: string;
  items: Array<{
    purchase_item_id: string;
    returned_quantity: number; // in purchase item unit
    batch_id?: string;
    item_reason?: string;
  }>;
  settlement_method: 'cash' | 'credit';
  cashbox_id?: string;
  return_reason?: string;
  idempotency_key?: string;
  userId?: string;
}

export class PurchaseReturnService {
  static createPurchaseReturn(payload: CreatePurchaseReturnPayload): PurchaseReturn {
    const userId = payload.userId || 'user-01';

    if (!payload.purchase_id) {
      throw new Error('رقم فاتورة المشتريات الأصلية إلزامي لإنشاء مردود مشتريات.');
    }

    if (!payload.items || payload.items.length === 0) {
      throw new Error('يجب تحديد صنف واحد على الأقل للإرجاع للمورد.');
    }

    const lockKey = payload.idempotency_key || `purchase-return:${payload.purchase_id}:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    TransactionManager.acquireLock(lockKey);

    return db.transaction(() => {
      const state = db.getState();
      const purchase = state.purchases.find((p) => p.id === payload.purchase_id);
      if (!purchase) {
        throw new Error('فاتورة المشتريات الأصلية غير موجودة.');
      }

      // Check if original purchase is cancelled
      if (purchase.status === 'cancelled') {
        throw new Error('لا يمكن إنشاء مردود مشتريات لفاتورة ملغاة مسبقاً.');
      }

      const purchaseItems = state.purchase_items.filter((pi) => pi.purchase_id === purchase.id);
      const supplier = state.suppliers.find((s) => s.id === purchase.supplier_id);
      if (!supplier) {
        throw new Error('المورد المحدد غير موجود.');
      }

      const returnId = 'pret-' + Math.random().toString(36).substring(2, 9);
      const returnNumber = 'PRTN-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(100 + Math.random() * 900);
      const now = Date.now();

      const createdReturnItems: PurchaseReturnItem[] = [];
      const createdReturnAllocations: PurchaseReturnAllocation[] = [];

      let totalRefundAmount = 0;

      for (const reqItem of payload.items) {
        if (reqItem.returned_quantity <= 0) {
          throw new Error('كمية المردود يجب أن تكون أكبر من الصفر.');
        }

        const purchaseItem = purchaseItems.find((pi) => pi.id === reqItem.purchase_item_id);
        if (!purchaseItem) {
          throw new Error(`بند فاتورة المشتريات (${reqItem.purchase_item_id}) غير موجود في الفاتورة الأصلية.`);
        }

        // Calculate already returned quantity for this purchase item across active returns
        const existingReturns = state.purchase_return_items.filter((pri) => {
          if (pri.original_purchase_item_id !== purchaseItem.id) return false;
          const parentReturn = state.purchase_returns.find((pr) => pr.id === pri.return_id);
          return parentReturn && parentReturn.status !== 'cancelled';
        });

        const alreadyReturnedQty = existingReturns.reduce((sum, pri) => sum + pri.returned_quantity, 0);
        const remainingReturnableQty = purchaseItem.quantity - alreadyReturnedQty;

        if (reqItem.returned_quantity > remainingReturnableQty) {
          throw new Error(
            `الكمية المطلوب إرجاعها (${reqItem.returned_quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${remainingReturnableQty}) لبند الشراء.`
          );
        }

        const returnedBaseQty = reqItem.returned_quantity * purchaseItem.unit_factor;

        // Strict batch provenance: strictly target the batch received with this purchase item!
        const targetBatchId = reqItem.batch_id || purchaseItem.batch_id;
        const targetBatch = state.batches.find((b) => b.id === targetBatchId);
        if (!targetBatch) {
          throw new Error(`التشغيلة المستهدفة للمردود (${targetBatchId}) غير موجودة.`);
        }

        // Check if there is enough physical stock currently available in that batch
        if (targetBatch.current_quantity < returnedBaseQty) {
          throw new Error(
            `رصيد التشغيلة (${targetBatch.batch_number}) غير كافٍ لإرجاع الكمية المطلوبة للمورد. الرصيد المتاح حالياً: ${targetBatch.current_quantity}، والمطلوب إرجاعه: ${returnedBaseQty}. تم بيع أو صرف جزء من هذه التشغيلة مسبقاً.`
          );
        }

        // Deduct stock strictly via StockService
        StockService.executePurchaseReturn(state, {
          productId: purchaseItem.product_id,
          batchId: targetBatch.id,
          returnNumber,
          quantityDelta: returnedBaseQty,
          unitCost: purchaseItem.unit_cost_base || targetBatch.purchase_price,
          reason: reqItem.item_reason || payload.return_reason,
          userId
        });

        // Historical cost integrity: calculate refund based on original purchase item snapshot price
        const lineTotal = reqItem.returned_quantity * purchaseItem.unit_purchase_price;
        totalRefundAmount += lineTotal;

        // Update returned_quantity on purchase item
        purchaseItem.returned_quantity = alreadyReturnedQty + reqItem.returned_quantity;

        const returnItemId = 'pri-' + Math.random().toString(36).substring(2, 9);
        const returnItem: PurchaseReturnItem = {
          id: returnItemId,
          return_id: returnId,
          original_purchase_item_id: purchaseItem.id,
          product_id: purchaseItem.product_id,
          batch_id: targetBatch.id,
          unit_name: purchaseItem.unit_name,
          unit_factor: purchaseItem.unit_factor,
          returned_quantity: reqItem.returned_quantity,
          returned_base_quantity: returnedBaseQty,
          unit_refund_price: purchaseItem.unit_purchase_price,
          unit_cost_base: purchaseItem.unit_cost_base || targetBatch.purchase_price,
          line_total: lineTotal,
          item_reason: reqItem.item_reason || payload.return_reason
        };

        createdReturnItems.push(returnItem);

        // Multi-Batch allocation record
        const returnAlloc: PurchaseReturnAllocation = {
          id: 'pra-' + Math.random().toString(36).substring(2, 9),
          return_id: returnId,
          return_item_id: returnItemId,
          original_purchase_item_id: purchaseItem.id,
          batch_id: targetBatch.id,
          returned_base_quantity: returnedBaseQty,
          unit_cost_base: purchaseItem.unit_cost_base || targetBatch.purchase_price,
          line_cost: lineTotal,
          created_at: now
        };

        createdReturnAllocations.push(returnAlloc);
      }

      // Financial Reversal & Settlement
      if (payload.settlement_method === 'cash') {
        // Supplier refunds cash back to pharmacy cashbox
        const cashboxId = payload.cashbox_id || purchase.cashbox_id || state.cashboxes[0]?.id;
        const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
        if (!cashbox) {
          throw new Error('الصندوق المحدد لاستلام قيمة المردود غير موجود.');
        }

        cashbox.cached_balance += totalRefundAmount;
        cashbox.updated_at = now;

        const cashTx: CashTransaction = {
          id: 'ctx-' + Math.random().toString(36).substring(2, 9),
          cashbox_id: cashbox.id,
          type: 'purchase_return_cash',
          direction: 'IN',
          amount: totalRefundAmount,
          balance_after: cashbox.cached_balance,
          reference_type: 'purchase_return',
          reference_id: returnNumber,
          statement: `استرداد نقدي لمردود مشتريات ${returnNumber} للفاتورة ${purchase.invoice_number}`,
          created_by: userId,
          created_at: now
        };
        state.cash_transactions.push(cashTx);
      } else if (payload.settlement_method === 'credit') {
        // Debit supplier balance (reduces debt payable to supplier)
        supplier.cached_balance -= totalRefundAmount;
        supplier.updated_at = now;

        const suppTx: SupplierTransaction = {
          id: 'supp-tx-' + Math.random().toString(36).substring(2, 9),
          supplier_id: supplier.id,
          transaction_type: 'purchase_return_credit',
          reference_type: 'purchase_return',
          reference_id: returnNumber,
          debit: totalRefundAmount, // reduces payable
          credit: 0,
          balance_after: supplier.cached_balance,
          notes: `إشعار مدين لمردود مشتريات ${returnNumber} للفاتورة ${purchase.invoice_number}`,
          created_by: userId,
          created_at: now
        };
        state.supplier_transactions.push(suppTx);
      }

      // Check if all items in original purchase are now fully returned
      const allItemsReturned = purchaseItems.every((pi) => {
        const totalRet = state.purchase_return_items
          .concat(createdReturnItems)
          .filter((pri) => pri.original_purchase_item_id === pi.id)
          .reduce((sum, pri) => sum + pri.returned_quantity, 0);
        return totalRet >= pi.quantity;
      });

      purchase.status = allItemsReturned ? 'returned_fully' : 'returned_partially';
      purchase.updated_at = now;

      const purchaseReturn: PurchaseReturn = {
        id: returnId,
        return_number: returnNumber,
        original_purchase_id: purchase.id,
        supplier_id: supplier.id,
        return_type: 'by_invoice',
        settlement_method: payload.settlement_method,
        cashbox_id: payload.cashbox_id || purchase.cashbox_id,
        subtotal: totalRefundAmount,
        tax_amount: 0,
        discount_amount: 0,
        total_refund_amount: totalRefundAmount,
        return_reason: payload.return_reason || 'إرجاع بضاعة للمورد',
        status: 'completed',
        created_by: userId,
        created_at: now,
        updated_at: now
      };

      state.purchase_returns.push(purchaseReturn);
      state.purchase_return_items.push(...createdReturnItems);
      state.purchase_return_allocations.push(...createdReturnAllocations);

      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'purchase_return', returnId, state.profile.device_id, {
          payloadAfter: {
            returnNumber,
            originalPurchaseId: purchase.id,
            supplierId: supplier.id,
            totalRefundAmount,
            settlementMethod: payload.settlement_method,
            itemsCount: createdReturnItems.length
          }
        })
      );

      return purchaseReturn;
    });
  }

  // Soft Cancellation of a Purchase Return (Physical Deletion strictly forbidden)
  static cancelPurchaseReturn(returnId: string, reason: string, userId = 'user-01'): PurchaseReturn {
    if (!reason || !reason.trim()) {
      throw new Error('سبب إلغاء مردود المشتريات إلزامي.');
    }

    return db.transaction(() => {
      const state = db.getState();
      const returnDoc = state.purchase_returns.find((pr) => pr.id === returnId);
      if (!returnDoc) {
        throw new Error('سند مردود المشتريات غير موجود.');
      }

      if (returnDoc.status === 'cancelled') {
        throw new Error('سند مردود المشتريات ملغى بالفعل مسبقاً.');
      }

      const returnAllocations = state.purchase_return_allocations.filter((a) => a.return_id === returnId);

      // Restore stock back to the original batches
      for (const alloc of returnAllocations) {
        const batch = state.batches.find((b) => b.id === alloc.batch_id);
        if (!batch) {
          throw new Error(`التشغيلة (${alloc.batch_id}) غير موجودة لإلغاء المردود.`);
        }

        batch.current_quantity += alloc.returned_base_quantity;
        if (batch.status === 'depleted') {
          batch.status = 'active';
        }
        batch.updated_at = Date.now();

        const productTotalStock = state.batches
          .filter((b) => b.product_id === batch.product_id && b.status === 'active')
          .reduce((sum, b) => sum + b.current_quantity, 0);

        StockService.recordMovement(state, {
          productId: batch.product_id,
          batchId: batch.id,
          movementType: 'purchase',
          referenceType: 'purchase_return_cancellation',
          referenceId: returnDoc.return_number,
          quantityDelta: alloc.returned_base_quantity,
          balanceAfter: batch.current_quantity,
          productTotalBalanceAfter: productTotalStock,
          unitCost: alloc.unit_cost_base,
          reason: `إلغاء مردود مشتريات ${returnDoc.return_number}: ${reason.trim()}`,
          userId
        });
      }

      // Reverse Financial Settlement
      const now = Date.now();
      if (returnDoc.settlement_method === 'cash') {
        const cashbox = state.cashboxes.find((c) => c.id === returnDoc.cashbox_id) || state.cashboxes[0];
        if (cashbox) {
          if (cashbox.cached_balance < returnDoc.total_refund_amount) {
            throw new Error(
              `رصيد الصندوق (${cashbox.name_ar}) غير كافٍ لعكس مردود المشتريات نقداً. الرصيد المتاح: ${cashbox.cached_balance}، المطلوب: ${returnDoc.total_refund_amount}.`
            );
          }

          cashbox.cached_balance -= returnDoc.total_refund_amount;
          cashbox.updated_at = now;

          state.cash_transactions.push({
            id: 'ctx-' + Math.random().toString(36).substring(2, 9),
            cashbox_id: cashbox.id,
            type: 'purchase_cash',
            direction: 'OUT',
            amount: returnDoc.total_refund_amount,
            balance_after: cashbox.cached_balance,
            reference_type: 'purchase_return_cancellation',
            reference_id: returnDoc.return_number,
            statement: `إرجاع نقدية لإلغاء مردود مشتريات ${returnDoc.return_number}`,
            created_by: userId,
            created_at: now
          });
        }
      } else if (returnDoc.settlement_method === 'credit' && returnDoc.supplier_id) {
        const supplier = state.suppliers.find((s) => s.id === returnDoc.supplier_id);
        if (supplier) {
          supplier.cached_balance += returnDoc.total_refund_amount;
          supplier.updated_at = now;

          state.supplier_transactions.push({
            id: 'supp-tx-' + Math.random().toString(36).substring(2, 9),
            supplier_id: supplier.id,
            transaction_type: 'purchase_credit',
            reference_type: 'purchase_return_cancellation',
            reference_id: returnDoc.return_number,
            debit: 0,
            credit: returnDoc.total_refund_amount,
            balance_after: supplier.cached_balance,
            notes: `إلغاء مردود مشتريات ${returnDoc.return_number} وإعادة قيد المديونية لصالح المورد`,
            created_by: userId,
            created_at: now
          });
        }
      }

      // Re-evaluate original purchase status
      if (returnDoc.original_purchase_id) {
        const originalPurchase = state.purchases.find((p) => p.id === returnDoc.original_purchase_id);
        if (originalPurchase && originalPurchase.status !== 'cancelled') {
          const remainingActiveReturns = state.purchase_returns.filter(
            (pr) => pr.original_purchase_id === originalPurchase.id && pr.id !== returnId && pr.status !== 'cancelled'
          );
          originalPurchase.status = remainingActiveReturns.length > 0 ? 'returned_partially' : 'posted';
          originalPurchase.updated_at = now;
        }
      }

      returnDoc.status = 'cancelled';
      returnDoc.cancellation_reason = reason.trim();
      returnDoc.cancelled_at = now;
      returnDoc.cancelled_by = userId;
      returnDoc.updated_at = now;

      state.audit_logs.push(
        AuditManager.createLog(userId, 'CANCEL', 'purchase_return', returnId, state.profile.device_id, {
          reason: reason.trim(),
          payloadAfter: {
            returnNumber: returnDoc.return_number,
            totalRefundAmount: returnDoc.total_refund_amount
          }
        })
      );

      return returnDoc;
    });
  }
}
