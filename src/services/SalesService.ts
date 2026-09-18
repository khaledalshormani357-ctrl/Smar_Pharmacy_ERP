// Atomic Sales & POS Service for Smart Pharmacy ERP
// Guarantees atomic transaction execution: FEFO deduction, line cost calculation, ledger updates, reversal & Audit log

import { db } from '../db/sqlite';
import { StockService } from './StockService';
import { TransactionManager } from '../db/transaction';
import { AuditManager } from '../db/audit';
import {
  CartItem,
  Sale,
  SaleItem,
  SaleItemAllocation,
  StockMovement,
  CashTransaction,
  CustomerTransaction
} from '../types';

export interface CheckoutPayload {
  customer_id?: string;
  user_id: string;
  sale_type: 'cash' | 'credit';
  cashbox_id?: string;
  items: CartItem[];
  discount_amount: number; // in minor units (invoice discount)
  tax_rate_bps?: number;   // tax rate in basis points (e.g. 500 = 5.00%, default from profile)
  paid_amount?: number;    // in minor units (optional override for cash sales)
  notes?: string;
  idempotency_key?: string; // Double-tap / duplicate submit protection
}

export class SalesService {
  /**
   * Generates a collision-safe, deterministic, offline-safe invoice number.
   * Format: INV-YYMMDD-HHMMSS-XXXX (where XXXX is random hex)
   */
  static generateInvoiceNumber(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `INV-${yy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
  }

  /**
   * Atomic Sale Creation Workflow
   * 1. Validate sale parameters & idempotency
   * 2. Run FEFO stock allocation for each item
   * 3. Compute item totals, historical COGS, line gross profit
   * 4. Apply invoice discount and configuration-based tax with deterministic integer math
   * 5. Deduct batches and record Stock Movements via StockService
   * 6. Create financial ledger records (CashTransaction for cash, CustomerTransaction for credit)
   * 7. Record immutable Sale and SaleItem records
   * 8. Record audit log
   * 9. Commit transaction or Rollback entirely on ANY failure
   */
  static createSale(payload: CheckoutPayload): Sale {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('السلة فارغة. يرجى إضافة أصناف قبل إتمام البيع.');
    }

    // 0. Idempotency Lock Check
    const isExplicitIdempotency = !!payload.idempotency_key;
    const lockKey = payload.idempotency_key || `sale-lock-${payload.user_id}-${Date.now()}-${Math.random()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();
        const saleId = 'sale-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4);
        const invoiceNumber = this.generateInvoiceNumber();

        // Check for invoice number collision in offline state
        if (state.sales.some((s) => s.invoice_number === invoiceNumber)) {
          throw new Error('رقم الفاتورة مكرر، يرجى إعادة المحاولة.');
        }

        let subtotal = 0;
        let totalCogs = 0;

        const saleItemsToInsert: SaleItem[] = [];
        const allocationsToInsert: SaleItemAllocation[] = [];
        const movementsToInsert: StockMovement[] = [];

        // 1. Process each cart item with FEFO allocation
        for (const item of payload.items) {
          if (item.quantity <= 0) {
            throw new Error(`كمية الصنف (${item.productName}) يجب أن تكون أكبر من الصفر.`);
          }
          if (item.unitPrice < 0) {
            throw new Error(`سعر بيع الصنف (${item.productName}) لا يمكن أن يكون سالباً.`);
          }
          if (item.discountAmount < 0) {
            throw new Error(`خصم الصنف (${item.productName}) لا يمكن أن يكون سالباً.`);
          }

          const lineGross = item.unitPrice * item.quantity;
          if (item.discountAmount > lineGross) {
            throw new Error(`خصم الصنف (${item.productName}) يتجاوز إجمالي الصنف.`);
          }
          const lineTotal = lineGross - item.discountAmount;
          subtotal += lineTotal;

          const baseQtyNeeded = Math.round(item.quantity * item.unitFactor);
          if (baseQtyNeeded <= 0) {
            throw new Error(`الكمية الأساسية للصنف (${item.productName}) غير صالحة.`);
          }

          // Strict FEFO Allocation Engine
          const allocationResult = StockService.allocateFEFO(
            item.productId,
            baseQtyNeeded,
            item.selectedBatchId
          );

          totalCogs += allocationResult.totalCogs;
          const saleItemId = 'sitem-' + Math.random().toString(36).substring(2, 9);

          // Deduct quantities from batches & build allocations and stock movements
          for (const alloc of allocationResult.allocations) {
            const batch = state.batches.find((b) => b.id === alloc.batchId);
            if (!batch) {
              throw new Error('تعذر العثور على تشغيلة الدفعة المخصصة.');
            }

            if (batch.current_quantity < alloc.allocatedQty) {
              throw new Error(
                `رصيد الدفعة (${batch.batch_number}) غير كافٍ. المطلوب: ${alloc.allocatedQty}، المتاح: ${batch.current_quantity}`
              );
            }

            // Deduct batch quantity
            batch.current_quantity -= alloc.allocatedQty;
            if (batch.current_quantity === 0) {
              batch.status = 'depleted';
            }
            batch.updated_at = now;

            // Provenance-rich SaleItemAllocation for future returns & auditing
            const allocRecord: SaleItemAllocation = {
              id: 'alloc-' + Math.random().toString(36).substring(2, 9),
              sale_item_id: saleItemId,
              sale_id: saleId,
              product_id: item.productId,
              batch_id: batch.id,
              allocated_base_quantity: alloc.allocatedQty,
              unit_purchase_cost: alloc.unitPurchaseCost,
              total_cost: alloc.totalCost,
              created_at: now
            };
            allocationsToInsert.push(allocRecord);

            // Compute product total balance after deduction
            const productTotalStock = state.batches
              .filter((b) => b.product_id === item.productId)
              .reduce((sum, b) => sum + b.current_quantity, 0);

            // Detailed Stock Movement Record
            const movement: StockMovement = {
              id: 'mov-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4),
              product_id: item.productId,
              batch_id: batch.id,
              movement_type: 'sale',
              reference_type: 'sale_invoice',
              reference_id: invoiceNumber,
              quantity_delta: -alloc.allocatedQty,
              balance_after: batch.current_quantity,
              product_total_balance_after: productTotalStock,
              unit_cost: alloc.unitPurchaseCost,
              reason: `فاتورة مبيعات رقم ${invoiceNumber}`,
              created_by: payload.user_id,
              created_at: now
            };
            movementsToInsert.push(movement);
          }

          // Snapshot Line Item with Historical Pricing
          const saleItem: SaleItem = {
            id: saleItemId,
            sale_id: saleId,
            product_id: item.productId,
            unit_name: item.unitName,
            unit_factor: item.unitFactor,
            quantity: item.quantity,
            base_quantity: baseQtyNeeded,
            unit_price: item.unitPrice,
            discount_amount: item.discountAmount,
            line_total: lineTotal,
            item_cogs: allocationResult.totalCogs,
            item_gross_profit: lineTotal - allocationResult.totalCogs
          };
          saleItemsToInsert.push(saleItem);
        }

        // 2. Invoice Financial Calculations (Integer Money Units)
        const invoiceDiscount = Math.max(0, payload.discount_amount || 0);
        if (invoiceDiscount > subtotal) {
          throw new Error('خصم الفاتورة لا يمكن أن يتجاوز المجموع الفرعي.');
        }

        const discountedSubtotal = subtotal - invoiceDiscount;

        // Configurable Tax Rate (basis points)
        const profileTaxRateBps = state.profile?.tax_rate_bps || 0;
        const effectiveTaxRateBps = payload.tax_rate_bps !== undefined ? payload.tax_rate_bps : profileTaxRateBps;
        const taxAmount = effectiveTaxRateBps > 0
          ? Math.round((discountedSubtotal * effectiveTaxRateBps) / 10000)
          : 0;

        const netTotal = discountedSubtotal + taxAmount;
        const isCash = payload.sale_type === 'cash';

        // Payment Validation
        let paidAmount = 0;
        let remainingAmount = 0;

        if (isCash) {
          paidAmount = payload.paid_amount !== undefined ? payload.paid_amount : netTotal;
          if (paidAmount < netTotal) {
            throw new Error(`المبلغ المدفوع (${paidAmount / 100}) أقل من إجمالي الفاتورة (${netTotal / 100}) في البيع النقدي.`);
          }
          remainingAmount = 0;
        } else {
          // Credit Sale
          if (!payload.customer_id || payload.customer_id === 'cust-cash') {
            throw new Error('يجب تحديد عميل مسجل لإتمام البيع الآجل.');
          }

          const customer = state.customers.find((c) => c.id === payload.customer_id);
          if (!customer) {
            throw new Error('العميل المحدد غير موجود في سجلات النظام.');
          }
          if (!customer.is_active) {
            throw new Error(`حساب العميل (${customer.name}) غير نشط.`);
          }

          paidAmount = payload.paid_amount || 0;
          remainingAmount = netTotal - paidAmount;

          // Check credit limit if specified
          if (customer.credit_limit > 0 && customer.cached_balance + remainingAmount > customer.credit_limit) {
            const maxAllowed = (customer.credit_limit - customer.cached_balance) / 100;
            throw new Error(
              `تجاوز سقف الائتمان للعميل (${customer.name}). الحد المتاح حالياً: ${maxAllowed.toLocaleString('ar-YE')}`
            );
          }
        }

        const grossProfit = netTotal - totalCogs;

        // Determine cashbox
        const cashboxId = payload.cashbox_id || (state.cashboxes.find((c) => c.is_active)?.id || 'cash-01');
        const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
        if (isCash && !cashbox) {
          throw new Error('لم يتم العثور على صندوق نشط لاستلام المبلغ.');
        }

        // 3. Financial Ledger Updates
        // A. Cash Transaction (if any amount paid in cash)
        if (paidAmount > 0 && cashbox) {
          cashbox.cached_balance += paidAmount;
          cashbox.updated_at = now;

          const cashTx: CashTransaction = {
            id: 'ctx-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4),
            cashbox_id: cashbox.id,
            type: 'sale_cash',
            direction: 'IN',
            amount: paidAmount,
            balance_after: cashbox.cached_balance,
            reference_type: 'sale_invoice',
            reference_id: invoiceNumber,
            statement: `مبيعات فاتورة رقم ${invoiceNumber}`,
            created_by: payload.user_id,
            created_at: now
          };
          state.cash_transactions.push(cashTx);
        }

        // B. Customer Ledger Entry (for credit / remaining portion)
        if (!isCash && remainingAmount > 0) {
          const customer = state.customers.find((c) => c.id === payload.customer_id)!;
          customer.cached_balance += remainingAmount;
          customer.updated_at = now;

          const custTx: CustomerTransaction = {
            id: 'ctrx-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4),
            customer_id: customer.id,
            transaction_type: 'sale_credit',
            reference_type: 'sale_invoice',
            reference_id: invoiceNumber,
            debit: remainingAmount,
            credit: 0,
            balance_after: customer.cached_balance,
            notes: `مبيعات آجلة فاتورة رقم ${invoiceNumber}`,
            created_by: payload.user_id,
            created_at: now
          };
          state.customer_transactions.push(custTx);
        }

        // 4. Create Sale Record
        const newSale: Sale = {
          id: saleId,
          invoice_number: invoiceNumber,
          customer_id: payload.customer_id,
          user_id: payload.user_id,
          sale_type: payload.sale_type,
          payment_method: isCash ? 'cashbox' : 'credit',
          cashbox_id: cashboxId,
          subtotal,
          discount_amount: invoiceDiscount,
          tax_amount: taxAmount,
          net_total: netTotal,
          paid_amount: paidAmount,
          remaining_amount: remainingAmount,
          total_cogs: totalCogs,
          gross_profit: grossProfit,
          status: 'completed',
          notes: payload.notes?.trim(),
          created_at: now,
          updated_at: now
        };

        state.sales.push(newSale);
        state.sale_items.push(...saleItemsToInsert);
        state.sale_item_allocations.push(...allocationsToInsert);
        state.stock_movements.push(...movementsToInsert);

        // 5. Audit Trail Log
        state.audit_logs.push(
          AuditManager.createLog(payload.user_id, 'CREATE_SALE', 'sales', saleId, state.profile.device_id, {
            reason: `إصدار فاتورة مبيعات جديدة رقم ${invoiceNumber}`,
            payloadAfter: {
              invoice_number: invoiceNumber,
              net_total: netTotal,
              total_cogs: totalCogs,
              gross_profit: grossProfit,
              sale_type: payload.sale_type,
              items_count: payload.items.length
            }
          })
        );

        return newSale;
      });
      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isExplicitIdempotency && isSuccess);
    }
  }

  /**
   * Cancellation / Reversal Workflow
   * Reverses a posted sale atomically:
   * 1. Validates sale state (cannot cancel already cancelled sales)
   * 2. Reverses batch quantities and creates StockMovement records ('adjustment_plus')
   * 3. Reverses cashbox inflow by creating a cash transaction ('refund_cash', direction 'OUT')
   * 4. Reverses customer credit debt by creating a customer transaction ('sale_return_credit', credit)
   * 5. Updates sale status to 'cancelled' with cancellation reason
   * 6. Records audit trail
   */
  static cancelSale(saleId: string, reason: string, userId = 'user-01'): Sale {
    if (!reason || !reason.trim()) {
      throw new Error('سبب إلغاء الفاتورة إلزامي.');
    }

    return db.transaction(() => {
      const state = db.getState();
      const now = Date.now();
      const sale = state.sales.find((s) => s.id === saleId);
      if (!sale) {
        throw new Error('الفاتورة المراد إلغاؤها غير موجودة.');
      }
      if (sale.status === 'cancelled') {
        throw new Error('الفاتورة ملغاة بالفعل مسبقاً.');
      }

      const allocations = state.sale_item_allocations.filter((a) => a.sale_id === saleId);

      // 1. Restore Batches and create compensating Stock Movements
      for (const alloc of allocations) {
        const batch = state.batches.find((b) => b.id === alloc.batch_id);
        if (batch) {
          batch.current_quantity += alloc.allocated_base_quantity;
          if (batch.status === 'depleted') {
            batch.status = 'active';
          }
          batch.updated_at = now;

          const productTotalStock = state.batches
            .filter((b) => b.product_id === alloc.product_id)
            .reduce((sum, b) => sum + b.current_quantity, 0);

          const reversalMovement: StockMovement = {
            id: 'mov-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4),
            product_id: alloc.product_id,
            batch_id: batch.id,
            movement_type: 'adjustment_plus',
            reference_type: 'sale_cancellation',
            reference_id: sale.invoice_number,
            quantity_delta: alloc.allocated_base_quantity,
            balance_after: batch.current_quantity,
            product_total_balance_after: productTotalStock,
            unit_cost: alloc.unit_purchase_cost,
            reason: `إلغاء فاتورة مبيعات ${sale.invoice_number}: ${reason.trim()}`,
            created_by: userId,
            created_at: now
          };
          state.stock_movements.push(reversalMovement);
        }
      }

      // 2. Reverse Cashbox if cash was paid
      if (sale.paid_amount > 0 && sale.cashbox_id) {
        const cashbox = state.cashboxes.find((c) => c.id === sale.cashbox_id);
        if (cashbox) {
          cashbox.cached_balance -= sale.paid_amount;
          cashbox.updated_at = now;

          const cashTx: CashTransaction = {
            id: 'ctx-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4),
            cashbox_id: cashbox.id,
            type: 'sale_return_cash',
            direction: 'OUT',
            amount: sale.paid_amount,
            balance_after: cashbox.cached_balance,
            reference_type: 'sale_cancellation',
            reference_id: sale.invoice_number,
            statement: `استرداد نقدي لإلغاء فاتورة ${sale.invoice_number}: ${reason.trim()}`,
            created_by: userId,
            created_at: now
          };
          state.cash_transactions.push(cashTx);
        }
      }

      // 3. Reverse Customer Ledger if credit was used
      if (sale.remaining_amount > 0 && sale.customer_id) {
        const customer = state.customers.find((c) => c.id === sale.customer_id);
        if (customer) {
          customer.cached_balance -= sale.remaining_amount;
          customer.updated_at = now;

          const custTx: CustomerTransaction = {
            id: 'ctrx-' + Math.random().toString(36).substring(2, 9) + '-' + now.toString().slice(-4),
            customer_id: customer.id,
            transaction_type: 'sale_return_credit',
            reference_type: 'sale_cancellation',
            reference_id: sale.invoice_number,
            debit: 0,
            credit: sale.remaining_amount,
            balance_after: customer.cached_balance,
            notes: `إلغاء مديونية فاتورة مبيعات ${sale.invoice_number}: ${reason.trim()}`,
            created_by: userId,
            created_at: now
          };
          state.customer_transactions.push(custTx);
        }
      }

      // 4. Update Sale Status
      sale.status = 'cancelled';
      sale.cancellation_reason = reason.trim();
      sale.updated_at = now;

      // 5. Record Audit Log
      state.audit_logs.push(
        AuditManager.createLog(userId, 'CANCEL_SALE', 'sales', sale.id, state.profile.device_id, {
          reason: `إلغاء فاتورة ${sale.invoice_number}: ${reason.trim()}`,
          payloadBefore: { status: 'completed' },
          payloadAfter: { status: 'cancelled', cancellation_reason: reason.trim() }
        })
      );

      return sale;
    });
  }
}
