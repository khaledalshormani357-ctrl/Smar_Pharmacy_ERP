// Purchasing & Returns Services for Smart Pharmacy ERP

import { db } from '../db/sqlite';
import { TransactionManager } from '../db/transaction';
import { AuditManager } from '../db/audit';
import {
  Batch,
  Purchase,
  PurchaseItem,
  StockMovement,
  SupplierTransaction,
  CashTransaction,
  SaleReturn,
  SaleReturnItem,
  CustomerTransaction
} from '../types';

export interface PurchasePayload {
  supplier_id: string;
  invoice_number: string;
  purchase_date?: string;
  payment_type: 'cash' | 'credit' | 'partial';
  cashbox_id?: string;
  user_id: string;
  paid_amount?: number;
  discount_amount?: number;
  tax_rate_bps?: number;
  notes?: string;
  idempotency_key?: string;
  update_product_purchase_price?: boolean;
  update_product_selling_price?: boolean;
  items: Array<{
    product_id: string;
    batch_number: string;
    expiry_date: string; // YYYY-MM-DD
    unit_name: string;
    unit_factor: number;
    quantity: number;
    unit_purchase_price: number; // minor units per entered unit
    unit_selling_price: number;  // minor units per entered unit
    discount_amount?: number;
  }>;
}

export class PurchaseService {
  /**
   * Generates unique internal purchase invoice number
   */
  static generateInternalNumber(): string {
    const d = new Date();
    const dateStr = d.toISOString().slice(2, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PUR-${dateStr}-${rand}`;
  }

  /**
   * Atomic, idempotent purchase invoice creation and stock receiving
   */
  static createPurchase(payload: PurchasePayload): Purchase {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('يرجى إضافة أصناف التوريد أولاً.');
    }

    // 0. Idempotency Lock Check
    const isExplicitIdempotency = !!payload.idempotency_key;
    const lockKey = payload.idempotency_key || `purchase-lock-${payload.user_id}-${Date.now()}-${Math.random()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();
        const purchaseId = 'pur-' + Math.random().toString(36).substring(2, 9);
        const internalNumber = this.generateInternalNumber();

        // 1. Supplier Validation
        const supplier = state.suppliers.find((s) => s.id === payload.supplier_id);
        if (!supplier) {
          throw new Error('المورد المحدد غير موجود في سجلات النظام.');
        }
        if (!supplier.is_active) {
          throw new Error(`حساب المورد (${supplier.name_ar || supplier.name}) غير نشط.`);
        }

        // 2. Invoice Number Validation
        if (!payload.invoice_number || !payload.invoice_number.trim()) {
          throw new Error('رقم فاتورة المورد إلزامي.');
        }
        const cleanInvoiceNumber = payload.invoice_number.trim();

        // Check duplicate invoice number for the same supplier
        const existingPurchase = state.purchases.find(
          (p) =>
            p.supplier_id === payload.supplier_id &&
            p.invoice_number.toLowerCase() === cleanInvoiceNumber.toLowerCase() &&
            p.status !== 'cancelled'
        );
        if (existingPurchase) {
          throw new Error(`رقم الفاتورة (${cleanInvoiceNumber}) مسجل مسبقاً لنفس المورد.`);
        }

        // 3. Process and Validate Items
        let subtotal = 0;
        const purchaseItems: PurchaseItem[] = [];
        const today = new Date().toISOString().slice(0, 10);

        for (const item of payload.items) {
          const product = state.products.find((p) => p.id === item.product_id && !p.deleted_at);
          if (!product) {
            throw new Error(`الصنف ذو المعرف ${item.product_id} غير موجود.`);
          }
          if (!product.is_active) {
            throw new Error(`الصنف (${product.name_ar}) معطل وغير نشط.`);
          }

          if (item.quantity <= 0) {
            throw new Error(`الكمية المحددة للصنف (${product.name_ar}) يجب أن تكون أكبر من الصفر.`);
          }
          if (item.unit_factor <= 0) {
            throw new Error(`معامل تحويل الوحدة للصنف (${product.name_ar}) يجب أن يكون أكبر من الصفر.`);
          }
          if (item.unit_purchase_price < 0) {
            throw new Error(`سعر الشراء للصنف (${product.name_ar}) لا يمكن أن يكون بالسالب.`);
          }

          const lineDiscount = Math.max(0, item.discount_amount || 0);
          const rawLineTotal = item.quantity * item.unit_purchase_price;
          const lineTotal = Math.max(0, rawLineTotal - lineDiscount);
          subtotal += lineTotal;

          const baseQty = item.quantity * item.unit_factor;
          const unitCostBase = Math.round(item.unit_purchase_price / item.unit_factor);
          const unitSellingBase = Math.round(item.unit_selling_price / item.unit_factor);

          // Batch Number Validation
          const batchNumber = (item.batch_number || '').trim().toUpperCase();
          if (!batchNumber) {
            throw new Error(`رقم التشغيلة إلزامي للصنف (${product.name_ar}).`);
          }

          // Expiry Date Validation
          const expiryMatch = item.expiry_date && item.expiry_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!expiryMatch) {
            throw new Error(`تاريخ الصلاحية غير صالح للصنف (${product.name_ar}). الصيغة المطلوبة YYYY-MM-DD.`);
          }
          const [, yStr, mStr, dStr] = expiryMatch;
          const year = parseInt(yStr, 10);
          const month = parseInt(mStr, 10);
          const day = parseInt(dStr, 10);
          if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
            throw new Error(`تاريخ الصلاحية (${item.expiry_date}) غير ممكن للصنف (${product.name_ar}).`);
          }

          if (item.expiry_date <= today) {
            throw new Error(`لا يمكن استلام تشغيلة منتهية الصلاحية للصنف (${product.name_ar}) بتاريخ (${item.expiry_date}).`);
          }

          // Deterministic Batch Uniqueness & Reuse Check
          const existingBatch = state.batches.find(
            (b) => b.product_id === item.product_id && b.batch_number === batchNumber
          );

          let targetBatch: Batch;
          if (existingBatch) {
            // Validate that expiry date matches
            if (existingBatch.expiry_date !== item.expiry_date) {
              throw new Error(
                `رقم التشغيلة (${batchNumber}) مسجل مسبقاً بتاريخ صلاحية مختلف (${existingBatch.expiry_date}). لا يمكن دمج تشغيلتين مختلفتين بنفس الرقم وتواريخ مختلفة.`
              );
            }
            // Validate that purchase cost matches to prevent historical cost corruption
            if (existingBatch.purchase_price !== unitCostBase) {
              throw new Error(
                `رقم التشغيلة (${batchNumber}) مسجل مسبقاً بسعر تكلفة مختلف (${existingBatch.purchase_price / 100}). للحفاظ على دقة التكلفة التاريخية، لا يمكن دمج تشغيلتين بتكلفة مختلفة.`
              );
            }

            // Safe append to existing batch
            existingBatch.current_quantity += baseQty;
            existingBatch.initial_quantity += baseQty;
            if (existingBatch.status === 'depleted') {
              existingBatch.status = 'active';
            }
            existingBatch.updated_at = now;
            targetBatch = existingBatch;
          } else {
            targetBatch = {
              id: 'batch-' + Math.random().toString(36).substring(2, 9),
              product_id: item.product_id,
              batch_number: batchNumber,
              expiry_date: item.expiry_date,
              received_at: now,
              purchase_price: unitCostBase,
              selling_price: unitSellingBase,
              initial_quantity: baseQty,
              current_quantity: baseQty,
              supplier_id: payload.supplier_id,
              status: 'active',
              created_at: now,
              updated_at: now
            };
            state.batches.push(targetBatch);
          }

          // Reference Price Update Policy (Explicit opt-in only)
          if (payload.update_product_purchase_price) {
            product.current_purchase_price = unitCostBase;
            product.updated_at = now;
          }
          if (payload.update_product_selling_price) {
            product.current_selling_price = unitSellingBase;
            product.updated_at = now;
          }

          // Calculate total product stock
          const productTotalStock = state.batches
            .filter((b) => b.product_id === item.product_id)
            .reduce((sum, b) => sum + b.current_quantity, 0);

          // Stock Movement Record
          const mov: StockMovement = {
            id: 'mov-' + Math.random().toString(36).substring(2, 9),
            product_id: item.product_id,
            batch_id: targetBatch.id,
            movement_type: 'purchase',
            reference_type: 'purchase_invoice',
            reference_id: internalNumber,
            quantity_delta: baseQty,
            balance_after: targetBatch.current_quantity,
            product_total_balance_after: productTotalStock,
            unit_cost: unitCostBase,
            reason: `توريد بموجب فاتورة شراء ${cleanInvoiceNumber}`,
            created_by: payload.user_id,
            created_at: now
          };
          state.stock_movements.push(mov);

          // Immutable Purchase Item Snapshot
          const pItem: PurchaseItem = {
            id: 'pitem-' + Math.random().toString(36).substring(2, 9),
            purchase_id: purchaseId,
            product_id: item.product_id,
            product_name_snapshot: product.name_ar,
            product_code_snapshot: product.internal_code || product.barcode || '',
            batch_id: targetBatch.id,
            batch_number: batchNumber,
            expiry_date: item.expiry_date,
            unit_name: item.unit_name,
            unit_factor: item.unit_factor,
            quantity: item.quantity,
            base_quantity: baseQty,
            unit_purchase_price: item.unit_purchase_price,
            unit_cost_base: unitCostBase,
            unit_selling_price: item.unit_selling_price,
            discount_amount: lineDiscount,
            tax_amount: 0,
            line_total: lineTotal,
            returned_quantity: 0,
            created_at: now
          };
          purchaseItems.push(pItem);
        }

        // 4. Financial Calculations
        const invoiceDiscount = Math.max(0, payload.discount_amount || 0);
        if (invoiceDiscount > subtotal) {
          throw new Error('خصم الفاتورة لا يمكن أن يتجاوز المجموع الفرعي.');
        }

        const discountedSubtotal = subtotal - invoiceDiscount;
        const taxAmount = payload.tax_rate_bps ? Math.round((discountedSubtotal * payload.tax_rate_bps) / 10000) : 0;
        const netTotal = discountedSubtotal + taxAmount;

        // Payment Mode & Reconciliation (net_total = paid_amount + remaining_amount)
        let paidAmount = 0;
        let remainingAmount = 0;

        if (payload.payment_type === 'cash') {
          paidAmount = payload.paid_amount !== undefined ? payload.paid_amount : netTotal;
          if (paidAmount < netTotal) {
            throw new Error(`المبلغ المدفوع (${paidAmount / 100}) أقل من إجمالي الفاتورة (${netTotal / 100}) في الشراء النقدي.`);
          }
          remainingAmount = 0;
        } else if (payload.payment_type === 'credit') {
          paidAmount = payload.paid_amount || 0;
          remainingAmount = netTotal - paidAmount;
          if (remainingAmount < 0) {
            throw new Error('المبلغ المدفوع يتجاوز إجمالي الفاتورة.');
          }
        } else if (payload.payment_type === 'partial') {
          paidAmount = payload.paid_amount || 0;
          if (paidAmount <= 0 || paidAmount >= netTotal) {
            throw new Error('الدفع الجزئي يتطلب سداد جزء من الفاتورة وتبقي جزء.');
          }
          remainingAmount = netTotal - paidAmount;
        }

        // 5. Supplier Credit Limit Check
        if (remainingAmount > 0 && supplier.credit_limit && supplier.credit_limit > 0) {
          if (supplier.cached_balance + remainingAmount > supplier.credit_limit) {
            const maxAllowed = (supplier.credit_limit - supplier.cached_balance) / 100;
            throw new Error(
              `تجاوز سقف الائتمان للمورد (${supplier.name_ar || supplier.name}). الحد المتاح حالياً: ${maxAllowed.toLocaleString('ar-YE')}`
            );
          }
        }

        // 6. Cashbox Outflow
        if (paidAmount > 0) {
          const cashbox = state.cashboxes.find((c) => c.id === payload.cashbox_id) || state.cashboxes[0];
          if (!cashbox) {
            throw new Error('الصندوق المالي المحدد غير موجود.');
          }
          if (cashbox.cached_balance < paidAmount) {
            throw new Error(
              `رصيد الصندوق (${cashbox.name_ar}) غير كافٍ لسداد المبلغ المطلوب (${paidAmount / 100}). الرصيد المتوفر: ${cashbox.cached_balance / 100}`
            );
          }
          cashbox.cached_balance -= paidAmount;
          cashbox.updated_at = now;

          const cashTx: CashTransaction = {
            id: 'ctx-' + Math.random().toString(36).substring(2, 9),
            cashbox_id: cashbox.id,
            type: 'purchase_cash',
            direction: 'OUT',
            amount: paidAmount,
            balance_after: cashbox.cached_balance,
            reference_type: 'purchase_invoice',
            reference_id: internalNumber,
            statement: `سداد فاتورة مشتريات للمورد (${supplier.name_ar || supplier.name}) برقم ${cleanInvoiceNumber}`,
            created_by: payload.user_id,
            created_at: now
          };
          state.cash_transactions.push(cashTx);
        }

        // 7. Supplier Payable Ledger Entry
        if (remainingAmount > 0) {
          supplier.cached_balance += remainingAmount;
          supplier.updated_at = now;

          const suppTx: SupplierTransaction = {
            id: 'strx-' + Math.random().toString(36).substring(2, 9),
            supplier_id: supplier.id,
            transaction_type: 'purchase_credit',
            reference_type: 'purchase_invoice',
            reference_id: internalNumber,
            debit: 0,
            credit: remainingAmount,
            balance_after: supplier.cached_balance,
            notes: `فاتورة مشتريات آجلة برقم ${cleanInvoiceNumber}`,
            created_by: payload.user_id,
            created_at: now
          };
          state.supplier_transactions.push(suppTx);
        }

        // 8. Purchase Document
        const purchaseDoc: Purchase = {
          id: purchaseId,
          invoice_number: cleanInvoiceNumber,
          internal_number: internalNumber,
          supplier_id: payload.supplier_id,
          user_id: payload.user_id,
          purchase_date: payload.purchase_date || today,
          payment_type: payload.payment_type,
          cashbox_id: payload.cashbox_id,
          subtotal,
          discount_amount: invoiceDiscount,
          tax_amount: taxAmount,
          net_total: netTotal,
          paid_amount: paidAmount,
          remaining_amount: remainingAmount,
          status: 'posted',
          notes: payload.notes?.trim() || '',
          created_at: now,
          updated_at: now
        };

        state.purchases.push(purchaseDoc);
        state.purchase_items.push(...purchaseItems);

        // 9. Audit Trail
        state.audit_logs.push(
          AuditManager.createLog(payload.user_id, 'CREATE_PURCHASE', 'purchases', purchaseId, state.profile.device_id, {
            reason: `تسجيل فاتورة شراء جديدة برقم ${cleanInvoiceNumber} (الداخلي: ${internalNumber})`,
            payloadAfter: {
              invoice_number: cleanInvoiceNumber,
              internal_number: internalNumber,
              supplier_id: payload.supplier_id,
              net_total: netTotal,
              paid_amount: paidAmount,
              remaining_amount: remainingAmount,
              items_count: payload.items.length
            }
          })
        );

        return purchaseDoc;
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isExplicitIdempotency && isSuccess);
    }
  }

  /**
   * Atomic cancellation and reversal of a posted purchase invoice.
   * Enforces stock safety checks so that already consumed stock cannot be cancelled into negative.
   */
  static cancelPurchase(
    purchaseId: string,
    reason: string,
    userId = 'user-01',
    idempotencyKey?: string
  ): Purchase {
    if (!reason || !reason.trim()) {
      throw new Error('يرجى تحديد سبب إلغاء فاتورة المشتريات.');
    }

    const isExplicitIdempotency = !!idempotencyKey;
    const lockKey = idempotencyKey || `cancel-purchase-${purchaseId}-${Date.now()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const purchase = state.purchases.find((p) => p.id === purchaseId);
        if (!purchase) {
          throw new Error('فاتورة المشتريات غير موجودة.');
        }
        if (purchase.status === 'cancelled') {
          throw new Error('فاتورة المشتريات ملغاة بالفعل مسبقاً.');
        }

        const items = state.purchase_items.filter((it) => it.purchase_id === purchase.id);

        // 1. Critical Stock Safety Verification (Requirement 17)
        for (const item of items) {
          const batch = state.batches.find((b) => b.id === item.batch_id);
          if (!batch) {
            throw new Error(`التشغيلة (${item.batch_number}) المرتبطة بالصنف لم تعد موجودة.`);
          }
          if (batch.current_quantity < item.base_quantity) {
            const consumed = item.base_quantity - batch.current_quantity;
            throw new Error(
              `لا يمكن إلغاء فاتورة الشراء: تم بالفعل صرف أو بيع ${consumed} وحدة من التشغيلة (${item.batch_number}). الرصيد المتبقي (${batch.current_quantity}) لا يكفي لعكس كامل الكمية المستلمة (${item.base_quantity}).`
            );
          }
        }

        // 2. Reverse Stock directly on original batches (Requirement 16)
        for (const item of items) {
          const batch = state.batches.find((b) => b.id === item.batch_id)!;
          batch.current_quantity -= item.base_quantity;
          if (batch.current_quantity === 0) {
            batch.status = 'depleted';
          }
          batch.updated_at = now;

          const productTotalStock = state.batches
            .filter((b) => b.product_id === item.product_id)
            .reduce((sum, b) => sum + b.current_quantity, 0);

          const mov: StockMovement = {
            id: 'mov-' + Math.random().toString(36).substring(2, 9),
            product_id: item.product_id,
            batch_id: batch.id,
            movement_type: 'purchase_return',
            reference_type: 'purchase_cancellation',
            reference_id: purchase.internal_number,
            quantity_delta: -item.base_quantity,
            balance_after: batch.current_quantity,
            product_total_balance_after: productTotalStock,
            unit_cost: batch.purchase_price,
            reason: `إلغاء فاتورة الشراء ${purchase.invoice_number}: ${reason.trim()}`,
            created_by: userId,
            created_at: now
          };
          state.stock_movements.push(mov);
        }

        // 3. Financial Reversals
        // 3a. Reclaim Cashbox Paid Outflow
        if (purchase.paid_amount > 0) {
          const cashbox = state.cashboxes.find((c) => c.id === purchase.cashbox_id) || state.cashboxes[0];
          if (cashbox) {
            cashbox.cached_balance += purchase.paid_amount;
            cashbox.updated_at = now;

            const cashTx: CashTransaction = {
              id: 'ctx-' + Math.random().toString(36).substring(2, 9),
              cashbox_id: cashbox.id,
              type: 'purchase_return_cash',
              direction: 'IN',
              amount: purchase.paid_amount,
              balance_after: cashbox.cached_balance,
              reference_type: 'purchase_cancellation',
              reference_id: purchase.internal_number,
              statement: `استرداد نقدي لإلغاء فاتورة المشتريات رقم ${purchase.invoice_number}`,
              created_by: userId,
              created_at: now
            };
            state.cash_transactions.push(cashTx);
          }
        }

        // 3b. Reverse Supplier Debt
        if (purchase.remaining_amount > 0) {
          const supplier = state.suppliers.find((s) => s.id === purchase.supplier_id);
          if (supplier) {
            supplier.cached_balance -= purchase.remaining_amount;
            supplier.updated_at = now;

            const suppTx: SupplierTransaction = {
              id: 'strx-' + Math.random().toString(36).substring(2, 9),
              supplier_id: supplier.id,
              transaction_type: 'purchase_cancellation',
              reference_type: 'purchase_cancellation',
              reference_id: purchase.internal_number,
              debit: purchase.remaining_amount,
              credit: 0,
              balance_after: supplier.cached_balance,
              notes: `عكس رصيد إلغاء فاتورة الشراء الآجلة رقم ${purchase.invoice_number}`,
              created_by: userId,
              created_at: now
            };
            state.supplier_transactions.push(suppTx);
          }
        }

        // 4. Mark Purchase as Cancelled
        purchase.status = 'cancelled';
        purchase.cancellation_reason = reason.trim();
        purchase.cancelled_at = now;
        purchase.cancelled_by = userId;
        purchase.updated_at = now;

        // 5. Audit Log
        state.audit_logs.push(
          AuditManager.createLog(userId, 'CANCEL_PURCHASE', 'purchases', purchase.id, state.profile.device_id, {
            reason: `إلغاء فاتورة الشراء رقم ${purchase.invoice_number} بسبب: ${reason.trim()}`,
            payloadAfter: {
              invoice_number: purchase.invoice_number,
              internal_number: purchase.internal_number,
              cancellation_reason: reason.trim(),
              reversed_paid_amount: purchase.paid_amount,
              reversed_debt: purchase.remaining_amount
            }
          })
        );

        return purchase;
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isExplicitIdempotency && isSuccess);
    }
  }
}

import { SalesReturnService, CreateSaleReturnPayload } from './SalesReturnService';
import { PurchaseReturnService, CreatePurchaseReturnPayload } from './PurchaseReturnService';

export { SalesReturnService, PurchaseReturnService };

export class ReturnService {
  // Process Sales Return
  static createSaleReturn(payload: any): SaleReturn {
    if (payload.sale_id && payload.items) {
      return SalesReturnService.createSaleReturn(payload);
    }
    // Backward compatibility with older payload structure
    const mappedPayload: CreateSaleReturnPayload = {
      sale_id: payload.original_sale_id || '',
      settlement_method: payload.settlement_method || 'cash',
      cashbox_id: payload.cashbox_id,
      return_reason: payload.return_reason || 'طلب العميل',
      userId: payload.user_id,
      items: (payload.items || []).map((it: any) => ({
        sale_item_id: it.original_sale_item_id,
        returned_quantity: it.quantity,
        allocations: it.batch_id ? [{ batch_id: it.batch_id, returned_base_quantity: it.quantity * (it.unit_factor || 1) }] : undefined
      }))
    };
    return SalesReturnService.createSaleReturn(mappedPayload);
  }

  // Process Purchase Return
  static createPurchaseReturn(payload: any) {
    return PurchaseReturnService.createPurchaseReturn(payload);
  }
}

