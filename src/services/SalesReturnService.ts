// Sales Return Service for Smart Pharmacy ERP
// Strict Return Provenance, Historical COGS Integrity, Stock Restoration & Financial Reversals

import { db } from '../db/sqlite';
import { DomainValidator } from '../db/validation';
import { AuditManager } from '../db/audit';
import { TransactionManager } from '../db/transaction';
import { StockService } from './StockService';
import {
  SaleReturn,
  SaleReturnItem,
  SaleReturnAllocation,
  CashTransaction,
  CustomerTransaction,
  ItemCondition,
  ReturnReason
} from '../types';

export interface CreateSaleReturnPayload {
  sale_id: string;
  items: Array<{
    sale_item_id: string;
    returned_quantity: number; // in sale unit
    item_condition?: ItemCondition;
    item_reason?: string;
    allocations?: Array<{
      batch_id: string;
      returned_base_quantity: number;
    }>;
  }>;
  settlement_method: 'cash' | 'credit';
  cashbox_id?: string;
  return_reason?: string;
  item_condition?: ItemCondition;
  idempotency_key?: string;
  userId?: string;
}

export class SalesReturnService {
  static createSaleReturn(payload: CreateSaleReturnPayload): SaleReturn {
    const userId = payload.userId || 'user-01';

    if (!payload.sale_id) {
      throw new Error('رقم الفاتورة الأصلية إلزامي لإنشاء مردود مبيعات.');
    }

    if (!payload.items || payload.items.length === 0) {
      throw new Error('يجب تحديد صنف واحد على الأقل للإرجاع.');
    }

    const lockKey = payload.idempotency_key || `sale-return:${payload.sale_id}:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    TransactionManager.acquireLock(lockKey);

    return db.transaction(() => {
      const state = db.getState();
      const sale = state.sales.find((s) => s.id === payload.sale_id);
      if (!sale) {
        throw new Error('فاتورة المبيعات الأصلية غير موجودة.');
      }

      // Check if original sale is cancelled
      if (sale.status === 'cancelled') {
        throw new Error('لا يمكن إنشاء مردود لفاتورة مبيعات ملغاة مسبقاً.');
      }

      const saleItems = state.sale_items.filter((si) => si.sale_id === sale.id);
      const allAllocations = state.sale_item_allocations.filter((a) => a.sale_id === sale.id);

      const returnId = 'sret-' + Math.random().toString(36).substring(2, 9);
      const returnNumber = 'SRTN-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(100 + Math.random() * 900);
      const now = Date.now();

      const createdReturnItems: SaleReturnItem[] = [];
      const createdReturnAllocations: SaleReturnAllocation[] = [];

      let totalRefundAmount = 0;
      let totalCogsReversed = 0;

      for (const reqItem of payload.items) {
        if (reqItem.returned_quantity <= 0) {
          throw new Error('كمية المردود يجب أن تكون أكبر من الصفر.');
        }

        const saleItem = saleItems.find((si) => si.id === reqItem.sale_item_id);
        if (!saleItem) {
          throw new Error(`بند الفاتورة (${reqItem.sale_item_id}) غير موجود في الفاتورة الأصلية.`);
        }

        // Calculate already returned quantity for this sale item across active returns
        const existingReturns = state.sale_return_items.filter((ri) => {
          if (ri.original_sale_item_id !== saleItem.id) return false;
          const parentReturn = state.sale_returns.find((r) => r.id === ri.return_id);
          return parentReturn && parentReturn.status !== 'cancelled';
        });

        const alreadyReturnedQty = existingReturns.reduce((sum, ri) => sum + ri.returned_quantity, 0);
        const remainingReturnableQty = saleItem.quantity - alreadyReturnedQty;

        if (reqItem.returned_quantity > remainingReturnableQty) {
          throw new Error(
            `الكمية المطلوب إرجاعها (${reqItem.returned_quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${remainingReturnableQty}) لبند الصنف.`
          );
        }

        const returnedBaseQty = reqItem.returned_quantity * saleItem.unit_factor;
        const itemCondition = reqItem.item_condition || payload.item_condition || 'resellable';

        // Provenance & Multi-Batch resolution
        const itemAllocations = allAllocations.filter((a) => a.sale_item_id === saleItem.id);
        if (itemAllocations.length === 0) {
          throw new Error(`لا توجد سجلات صرف دفعات (Allocations) تاريخية لهذا البند.`);
        }

        const returnItemId = 'sri-' + Math.random().toString(36).substring(2, 9);
        let itemCogsReversed = 0;
        let lineTargetBatchId = itemAllocations[0].batch_id;

        if (reqItem.allocations && reqItem.allocations.length > 0) {
          // Explicit multi-batch allocation provided
          let sumAllocatedBase = 0;
          for (const allocReq of reqItem.allocations) {
            if (allocReq.returned_base_quantity <= 0) continue;
            sumAllocatedBase += allocReq.returned_base_quantity;

            const sourceAlloc = itemAllocations.find((a) => a.batch_id === allocReq.batch_id);
            if (!sourceAlloc) {
              throw new Error(`التشغيلة (${allocReq.batch_id}) لم تكن جزءاً من مبيعات هذا البند الأصلية.`);
            }

            // Check existing returned quantity from this batch allocation
            const existingBatchReturned = state.sale_return_allocations
              .filter((sra) => {
                if (sra.sale_item_id !== saleItem.id || sra.batch_id !== allocReq.batch_id) return false;
                const parentReturn = state.sale_returns.find((r) => r.id === sra.return_id);
                return parentReturn && parentReturn.status !== 'cancelled';
              })
              .reduce((sum, sra) => sum + sra.returned_base_quantity, 0);

            const remainingInBatch = sourceAlloc.allocated_base_quantity - existingBatchReturned;
            if (allocReq.returned_base_quantity > remainingInBatch) {
              throw new Error(
                `الكمية المطلوب إرجاعها من التشغيلة (${allocReq.batch_id}) تتجاوز المتبقي القابل للإرجاع من هذه التشغيلة (${remainingInBatch}).`
              );
            }

            const cogsReversedForBatch = allocReq.returned_base_quantity * sourceAlloc.unit_purchase_cost;
            itemCogsReversed += cogsReversedForBatch;
            lineTargetBatchId = sourceAlloc.batch_id;

            // Restore stock to batch strictly via StockService
            StockService.executeSaleReturn(state, {
              productId: saleItem.product_id,
              batchId: sourceAlloc.batch_id,
              returnNumber,
              quantityDelta: allocReq.returned_base_quantity,
              unitCost: sourceAlloc.unit_purchase_cost,
              reason: reqItem.item_reason || payload.return_reason,
              userId,
              condition: itemCondition
            });

            createdReturnAllocations.push({
              id: 'sra-' + Math.random().toString(36).substring(2, 9),
              return_id: returnId,
              return_item_id: returnItemId,
              sale_item_id: saleItem.id,
              sale_item_allocation_id: sourceAlloc.id,
              batch_id: sourceAlloc.batch_id,
              returned_base_quantity: allocReq.returned_base_quantity,
              unit_purchase_cost: sourceAlloc.unit_purchase_cost,
              total_cogs_reversed: cogsReversedForBatch,
              created_at: now
            });
          }

          if (sumAllocatedBase !== returnedBaseQty) {
            throw new Error(`مجموع كميات التشغيلات المرتجعة (${sumAllocatedBase}) لا يتطابق مع إجمالي كمية البند (${returnedBaseQty}).`);
          }
        } else {
          // Automatic resolution across original allocations (FIFO of original allocations)
          let remainingToRestore = returnedBaseQty;

          for (const sourceAlloc of itemAllocations) {
            if (remainingToRestore <= 0) break;

            const existingBatchReturned = state.sale_return_allocations
              .filter((sra) => {
                if (sra.sale_item_id !== saleItem.id || sra.batch_id !== sourceAlloc.batch_id) return false;
                const parentReturn = state.sale_returns.find((r) => r.id === sra.return_id);
                return parentReturn && parentReturn.status !== 'cancelled';
              })
              .reduce((sum, sra) => sum + sra.returned_base_quantity, 0);

            const remainingInBatch = sourceAlloc.allocated_base_quantity - existingBatchReturned;
            if (remainingInBatch <= 0) continue;

            const takeFromBatch = Math.min(remainingInBatch, remainingToRestore);
            const cogsReversedForBatch = takeFromBatch * sourceAlloc.unit_purchase_cost;
            itemCogsReversed += cogsReversedForBatch;
            lineTargetBatchId = sourceAlloc.batch_id;

            // Restore stock strictly to the original batch
            StockService.executeSaleReturn(state, {
              productId: saleItem.product_id,
              batchId: sourceAlloc.batch_id,
              returnNumber,
              quantityDelta: takeFromBatch,
              unitCost: sourceAlloc.unit_purchase_cost,
              reason: reqItem.item_reason || payload.return_reason,
              userId,
              condition: itemCondition
            });

            createdReturnAllocations.push({
              id: 'sra-' + Math.random().toString(36).substring(2, 9),
              return_id: returnId,
              return_item_id: returnItemId,
              sale_item_id: saleItem.id,
              sale_item_allocation_id: sourceAlloc.id,
              batch_id: sourceAlloc.batch_id,
              returned_base_quantity: takeFromBatch,
              unit_purchase_cost: sourceAlloc.unit_purchase_cost,
              total_cogs_reversed: cogsReversedForBatch,
              created_at: now
            });

            remainingToRestore -= takeFromBatch;
          }

          if (remainingToRestore > 0) {
            throw new Error(`تعذر استرجاع كامل الكمية من الدفعات الأصلية المباعة.`);
          }
        }

        // Calculate refund amount based on original sale unit net price
        const netUnitPrice = Math.round(saleItem.line_total / saleItem.quantity);
        const lineRefundTotal = netUnitPrice * reqItem.returned_quantity;

        totalRefundAmount += lineRefundTotal;
        totalCogsReversed += itemCogsReversed;

        // Update returned_quantity snapshot on saleItem
        saleItem.returned_quantity = alreadyReturnedQty + reqItem.returned_quantity;

        const returnItem: SaleReturnItem = {
          id: returnItemId,
          return_id: returnId,
          original_sale_item_id: saleItem.id,
          product_id: saleItem.product_id,
          target_batch_id: lineTargetBatchId,
          unit_name: saleItem.unit_name,
          unit_factor: saleItem.unit_factor,
          returned_quantity: reqItem.returned_quantity,
          returned_base_quantity: returnedBaseQty,
          refund_unit_price: netUnitPrice,
          line_refund_total: lineRefundTotal,
          reversed_unit_cost: Math.round(itemCogsReversed / returnedBaseQty),
          reversed_line_cogs: itemCogsReversed,
          item_condition: itemCondition,
          item_reason: reqItem.item_reason || payload.return_reason
        };

        createdReturnItems.push(returnItem);
      }

      const grossProfitReversed = totalRefundAmount - totalCogsReversed;

      // Settlement and Financial Reversal
      if (payload.settlement_method === 'cash') {
        const cashboxId = payload.cashbox_id || sale.cashbox_id || state.cashboxes[0]?.id;
        const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
        if (!cashbox) {
          throw new Error('الصندوق المحدد غير موجود.');
        }

        if (cashbox.cached_balance < totalRefundAmount) {
          throw new Error(
            `رصيد الصندوق (${cashbox.name_ar}) غير كافٍ لسداد قيمة المردود نقداً. الرصيد المتاح: ${cashbox.cached_balance}، المطلوب صرفه: ${totalRefundAmount}.`
          );
        }

        cashbox.cached_balance -= totalRefundAmount;
        cashbox.updated_at = now;

        const cashTx: CashTransaction = {
          id: 'ctx-' + Math.random().toString(36).substring(2, 9),
          cashbox_id: cashbox.id,
          type: 'sale_return_cash',
          direction: 'OUT',
          amount: totalRefundAmount,
          balance_after: cashbox.cached_balance,
          reference_type: 'sale_return',
          reference_id: returnNumber,
          statement: `سداد مردود مبيعات ${returnNumber} للفاتورة ${sale.invoice_number}`,
          created_by: userId,
          created_at: now
        };
        state.cash_transactions.push(cashTx);
      } else if (payload.settlement_method === 'credit') {
        if (!sale.customer_id) {
          throw new Error('لا يمكن إجراء مردود آجل (Credit) لفاتورة زبون نقدي عام بدون حساب عميل.');
        }
        const customer = state.customers.find((c) => c.id === sale.customer_id);
        if (!customer) {
          throw new Error('العميل المحدد غير موجود.');
        }

        customer.cached_balance -= totalRefundAmount;
        customer.updated_at = now;

        const custTx: CustomerTransaction = {
          id: 'cust-tx-' + Math.random().toString(36).substring(2, 9),
          customer_id: customer.id,
          transaction_type: 'sale_return_credit',
          reference_type: 'sale_return',
          reference_id: returnNumber,
          debit: 0,
          credit: totalRefundAmount,
          balance_after: customer.cached_balance,
          notes: `إشعار دائن لمردود مبيعات ${returnNumber}`,
          created_by: userId,
          created_at: now
        };
        state.customer_transactions.push(custTx);
      }

      // Check if all items in original sale are now returned
      const allItemsReturned = saleItems.every((si) => {
        const totalRet = state.sale_return_items
          .concat(createdReturnItems)
          .filter((ri) => ri.original_sale_item_id === si.id)
          .reduce((sum, ri) => sum + ri.returned_quantity, 0);
        return totalRet >= si.quantity;
      });

      sale.status = allItemsReturned ? 'returned_fully' : 'returned_partially';
      sale.updated_at = now;

      const saleReturn: SaleReturn = {
        id: returnId,
        return_number: returnNumber,
        original_sale_id: sale.id,
        customer_id: sale.customer_id,
        return_type: 'by_invoice',
        settlement_method: payload.settlement_method,
        cashbox_id: payload.cashbox_id || sale.cashbox_id,
        subtotal: totalRefundAmount,
        tax_amount: 0,
        discount_amount: 0,
        total_refund_amount: totalRefundAmount,
        total_cogs_reversed: totalCogsReversed,
        gross_profit_reversed: grossProfitReversed,
        return_reason: payload.return_reason || 'طلب الزبون',
        item_condition: payload.item_condition || 'resellable',
        status: 'completed',
        created_by: userId,
        created_at: now,
        updated_at: now
      };

      state.sale_returns.push(saleReturn);
      state.sale_return_items.push(...createdReturnItems);
      state.sale_return_allocations.push(...createdReturnAllocations);

      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'sale_return', returnId, state.profile.device_id, {
          payloadAfter: {
            returnNumber,
            originalSaleId: sale.id,
            totalRefundAmount,
            totalCogsReversed,
            settlementMethod: payload.settlement_method,
            itemsCount: createdReturnItems.length
          }
        })
      );

      return saleReturn;
    });
  }

  // Soft Cancellation of a Sale Return (Physical Deletion strictly forbidden)
  static cancelSaleReturn(returnId: string, reason: string, userId = 'user-01'): SaleReturn {
    if (!reason || !reason.trim()) {
      throw new Error('سبب إلغاء مردود المبيعات إلزامي.');
    }

    return db.transaction(() => {
      const state = db.getState();
      const returnDoc = state.sale_returns.find((r) => r.id === returnId);
      if (!returnDoc) {
        throw new Error('سند مردود المبيعات غير موجود.');
      }

      if (returnDoc.status === 'cancelled') {
        throw new Error('سند المردود ملغى بالفعل مسبقاً.');
      }

      const returnAllocations = state.sale_return_allocations.filter((a) => a.return_id === returnId);

      // Verify and deduct the restored stock back from the batches
      for (const alloc of returnAllocations) {
        const batch = state.batches.find((b) => b.id === alloc.batch_id);
        if (!batch) {
          throw new Error(`التشغيلة (${alloc.batch_id}) غير موجودة لإلغاء المردود.`);
        }
        if (batch.current_quantity < alloc.returned_base_quantity) {
          throw new Error(
            `لا يمكن إلغاء المردود: تم بيع أو استهلاك البضاعة المرتجعة من التشغيلة (${batch.batch_number}). الرصيد المتاح: ${batch.current_quantity}، والمطلوب خصمه: ${alloc.returned_base_quantity}.`
          );
        }

        batch.current_quantity -= alloc.returned_base_quantity;
        if (batch.current_quantity === 0) {
          batch.status = 'depleted';
        }

        const productTotalStock = state.batches
          .filter((b) => b.product_id === batch.product_id && b.status === 'active')
          .reduce((sum, b) => sum + b.current_quantity, 0);

        StockService.recordMovement(state, {
          productId: batch.product_id,
          batchId: batch.id,
          movementType: 'sale',
          referenceType: 'sale_return_cancellation',
          referenceId: returnDoc.return_number,
          quantityDelta: -alloc.returned_base_quantity,
          balanceAfter: batch.current_quantity,
          productTotalBalanceAfter: productTotalStock,
          unitCost: alloc.unit_purchase_cost,
          reason: `إلغاء مردود مبيعات ${returnDoc.return_number}: ${reason.trim()}`,
          userId
        });
      }

      // Reverse Financial Settlement
      const now = Date.now();
      if (returnDoc.settlement_method === 'cash') {
        const cashbox = state.cashboxes.find((c) => c.id === returnDoc.cashbox_id) || state.cashboxes[0];
        if (cashbox) {
          cashbox.cached_balance += returnDoc.total_refund_amount;
          cashbox.updated_at = now;

          state.cash_transactions.push({
            id: 'ctx-' + Math.random().toString(36).substring(2, 9),
            cashbox_id: cashbox.id,
            type: 'sale_cash',
            direction: 'IN',
            amount: returnDoc.total_refund_amount,
            balance_after: cashbox.cached_balance,
            reference_type: 'sale_return_cancellation',
            reference_id: returnDoc.return_number,
            statement: `استرجاع نقدية لإلغاء مردود مبيعات ${returnDoc.return_number}`,
            created_by: userId,
            created_at: now
          });
        }
      } else if (returnDoc.settlement_method === 'credit' && returnDoc.customer_id) {
        const customer = state.customers.find((c) => c.id === returnDoc.customer_id);
        if (customer) {
          customer.cached_balance += returnDoc.total_refund_amount;
          customer.updated_at = now;

          state.customer_transactions.push({
            id: 'cust-tx-' + Math.random().toString(36).substring(2, 9),
            customer_id: customer.id,
            transaction_type: 'sale_credit',
            reference_type: 'sale_return_cancellation',
            reference_id: returnDoc.return_number,
            debit: returnDoc.total_refund_amount,
            credit: 0,
            balance_after: customer.cached_balance,
            notes: `إلغاء مردود مبيعات ${returnDoc.return_number} وإعادة قيد المديونية`,
            created_by: userId,
            created_at: now
          });
        }
      }

      // Re-evaluate original sale status
      if (returnDoc.original_sale_id) {
        const originalSale = state.sales.find((s) => s.id === returnDoc.original_sale_id);
        if (originalSale && originalSale.status !== 'cancelled') {
          const remainingActiveReturns = state.sale_returns.filter(
            (r) => r.original_sale_id === originalSale.id && r.id !== returnId && r.status !== 'cancelled'
          );
          originalSale.status = remainingActiveReturns.length > 0 ? 'returned_partially' : 'completed';
          originalSale.updated_at = now;
        }
      }

      returnDoc.status = 'cancelled';
      returnDoc.cancellation_reason = reason.trim();
      returnDoc.cancelled_at = now;
      returnDoc.cancelled_by = userId;
      returnDoc.updated_at = now;

      state.audit_logs.push(
        AuditManager.createLog(userId, 'CANCEL', 'sale_return', returnId, state.profile.device_id, {
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
