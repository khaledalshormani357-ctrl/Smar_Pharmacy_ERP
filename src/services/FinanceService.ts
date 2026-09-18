// Authoritative Cashbox, Expenses, Settlements & Financial Integrity Service for Smart Pharmacy ERP
// Strict integer minor units math, transaction atomicity, no negative cashbox, and complete audit trail

import { db } from '../db/sqlite';
import { TransactionManager } from '../db/transaction';
import { AuditManager } from '../db/audit';
import { Money } from '../utils/money';
import {
  Cashbox,
  CashTransaction,
  CustomerTransaction,
  SupplierTransaction,
  Expense,
  WorkShift
} from '../types';

export interface CustomerReceiptPayload {
  customer_id: string;
  cashbox_id?: string;
  amount: number; // in integer minor units
  notes?: string;
  statement?: string;
  user_id: string;
  business_date?: string;
  idempotency_key?: string;
}

export interface SupplierPaymentPayload {
  supplier_id: string;
  cashbox_id?: string;
  amount: number; // in integer minor units
  notes?: string;
  statement?: string;
  user_id: string;
  business_date?: string;
  idempotency_key?: string;
}

export interface CreateExpensePayload {
  category_id: string;
  cashbox_id?: string;
  amount: number; // in integer minor units
  statement: string;
  recipient?: string;
  payment_method?: 'cash' | 'bank' | 'other';
  user_id: string;
  business_date?: string;
  idempotency_key?: string;
}

export interface CancelExpensePayload {
  expense_id: string;
  reason: string;
  user_id: string;
  idempotency_key?: string;
}

export interface CashAdjustmentPayload {
  cashbox_id: string;
  amount: number; // in integer minor units
  direction: 'IN' | 'OUT';
  reason: string;
  user_id: string;
  business_date?: string;
  idempotency_key?: string;
}

export interface OpeningCashPayload {
  cashbox_id: string;
  amount: number; // in integer minor units
  reason?: string;
  user_id: string;
  business_date?: string;
  idempotency_key?: string;
}

export interface OpenShiftPayload {
  cashbox_id: string;
  opening_cash: number; // in integer minor units
  user_id: string;
  business_date?: string;
  idempotency_key?: string;
}

export interface CloseShiftPayload {
  shift_id: string;
  actual_cash: number; // counted cash in minor units
  closing_notes?: string;
  user_id: string;
  idempotency_key?: string;
}

export class FinanceService {
  /**
   * Generates a collision-safe, deterministic, offline-safe document number.
   */
  static generateReceiptNumber(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `REC-${yy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
  }

  static generatePaymentNumber(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PAY-${yy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
  }

  static generateExpenseNumber(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `EXP-${yy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
  }

  static generateAdjustmentNumber(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ADJ-${yy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
  }

  static generateShiftNumber(): string {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SFT-${yy}${mm}${dd}-${hh}${min}${ss}-${rand}`;
  }

  /**
   * Domain-level permission assertion
   */
  static assertPermission(userId: string, requiredPermissions: string[], actionName: string): void {
    const state = db.getState();
    const user = state.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error(`المستخدم غير موجود (${userId}).`);
    }
    if (!user.is_active) {
      throw new Error(`حساب المستخدم (${user.full_name}) معطل.`);
    }

    const role = state.roles.find((r) => r.id === user.role_id);
    if (!role) {
      throw new Error(`الدور الوظيفي للمستخدم غير معرف (${user.role_id}).`);
    }

    const hasPermission =
      role.permissions.includes('all') ||
      requiredPermissions.some((perm) => role.permissions.includes(perm));

    if (!hasPermission) {
      throw new Error(`ليس لديك صلاحية لإجراء ${actionName}. يتطلب الصلاحيات: [${requiredPermissions.join(', ')}].`);
    }
  }

  /**
   * Source of Truth: Calculates true cashbox balance from all CashTransaction records.
   */
  static getCashboxBalance(cashboxId: string): number {
    const state = db.getState();
    return state.cash_transactions
      .filter((tx) => tx.cashbox_id === cashboxId)
      .reduce((bal, tx) => {
        return tx.direction === 'IN' ? bal + tx.amount : bal - tx.amount;
      }, 0);
  }

  /**
   * Source of Truth: Calculates true customer debt balance from CustomerTransaction records.
   */
  static getCustomerBalance(customerId: string): number {
    const state = db.getState();
    return state.customer_transactions
      .filter((tx) => tx.customer_id === customerId)
      .reduce((bal, tx) => bal + (tx.debit - tx.credit), 0);
  }

  /**
   * Source of Truth: Calculates true supplier payable debt from SupplierTransaction records.
   */
  static getSupplierBalance(supplierId: string): number {
    const state = db.getState();
    return state.supplier_transactions
      .filter((tx) => tx.supplier_id === supplierId)
      .reduce((bal, tx) => bal + (tx.credit - tx.debit), 0);
  }

  /**
   * Aliases for ergonomic modal integration
   */
  static recordReceipt(
    payloadOrCustomerId: CustomerReceiptPayload | string,
    cashboxIdArg?: string,
    amountArg?: number,
    notesArg?: string,
    userIdArg?: string
  ) {
    return this.addCustomerReceipt(payloadOrCustomerId, cashboxIdArg, amountArg, notesArg, userIdArg);
  }

  static recordSupplierPayment(
    payloadOrSupplierId: SupplierPaymentPayload | string,
    cashboxIdArg?: string,
    amountArg?: number,
    notesArg?: string,
    userIdArg?: string
  ) {
    return this.addSupplierPayment(payloadOrSupplierId, cashboxIdArg, amountArg, notesArg, userIdArg);
  }

  static recordExpense(
    payloadOrCategoryId: CreateExpensePayload | string,
    cashboxIdArg?: string,
    amountArg?: number,
    statementArg?: string,
    recipientArg?: string,
    userIdArg?: string
  ) {
    return this.addExpense(payloadOrCategoryId, cashboxIdArg, amountArg, statementArg, recipientArg, userIdArg);
  }

  /**
   * Customer Collection / Receipt Voucher (سند قبض من عميل)
   * Supports both object payload and backward-compatible positional arguments.
   */
  static addCustomerReceipt(
    payloadOrCustomerId: CustomerReceiptPayload | string,
    cashboxIdArg?: string,
    amountArg?: number,
    notesArg?: string,
    userIdArg?: string
  ): { receipt_number: string; customer_transaction: CustomerTransaction; cash_transaction: CashTransaction } {
    let payload: CustomerReceiptPayload;
    if (typeof payloadOrCustomerId === 'object') {
      payload = payloadOrCustomerId;
    } else {
      payload = {
        customer_id: payloadOrCustomerId,
        cashbox_id: cashboxIdArg,
        amount: amountArg || 0,
        notes: notesArg,
        user_id: userIdArg || 'user-01'
      };
    }

    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      throw new Error(`مبلغ سند القبض يجب أن يكون عدداً صحيحاً أكبر من الصفر. القيمة المدخلة: ${payload.amount}`);
    }

    const lockKey = payload.idempotency_key || `rec-lock-${payload.customer_id}-${Date.now()}-${Math.random()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const customer = state.customers.find((c) => c.id === payload.customer_id);
        if (!customer) throw new Error(`العميل غير موجود (${payload.customer_id}).`);
        if (!customer.is_active) throw new Error(`حساب العميل (${customer.name}) معطل.`);

        const cashboxId = payload.cashbox_id || state.cashboxes[0]?.id;
        const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
        if (!cashbox) throw new Error(`الصندوق المحدد غير موجود (${cashboxId}).`);
        if (!cashbox.is_active) throw new Error(`الصندوق (${cashbox.name_ar}) معطل.`);

        // Source of truth customer debt check
        const currentDebt = this.getCustomerBalance(customer.id);
        if (payload.amount > currentDebt) {
          throw new Error(
            `مبلغ التحصيل (${Money.format(payload.amount)}) يتجاوز مديونية العميل الحالية (${Money.format(currentDebt)}). لا يُسمح بتوليد رصيد دائن غير مصرح به.`
          );
        }

        const receiptNo = this.generateReceiptNumber();
        const newCustomerBalance = currentDebt - payload.amount;
        customer.cached_balance = newCustomerBalance;
        customer.updated_at = now;

        const custTx: CustomerTransaction = {
          id: 'ctrx-' + Math.random().toString(36).substring(2, 9),
          customer_id: customer.id,
          transaction_type: 'payment_receipt',
          reference_type: 'receipt_voucher',
          reference_id: receiptNo,
          debit: 0,
          credit: payload.amount,
          balance_after: newCustomerBalance,
          notes: payload.notes || `تحصيل دفعة نقدية سند رقم ${receiptNo}`,
          created_by: payload.user_id,
          created_at: now,
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.customer_transactions.push(custTx);

        // Update Cashbox
        const currentCash = this.getCashboxBalance(cashbox.id);
        const newCashBalance = currentCash + payload.amount;
        cashbox.cached_balance = newCashBalance;
        cashbox.updated_at = now;

        const cashTx: CashTransaction = {
          id: 'ctx-' + Math.random().toString(36).substring(2, 9),
          cashbox_id: cashbox.id,
          type: 'customer_payment',
          direction: 'IN',
          amount: payload.amount,
          balance_after: newCashBalance,
          reference_type: 'receipt_voucher',
          reference_id: receiptNo,
          statement: `قبض دفعة من العميل: ${customer.name} - سند رقم ${receiptNo}`,
          created_by: payload.user_id,
          created_at: now,
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.cash_transactions.push(cashTx);

        // Audit Log
        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'CREATE',
            'customer_receipt',
            receiptNo,
            state.profile.device_id,
            {
              reason: `قبض دفعة من ${customer.name} بمبلغ ${payload.amount}`,
              payloadAfter: { customer_id: customer.id, amount: payload.amount, receiptNo }
            }
          )
        );

        return { receipt_number: receiptNo, customer_transaction: custTx, cash_transaction: cashTx };
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Supplier Payment Voucher (سند صرف لمورد)
   * Supports both object payload and backward-compatible positional arguments.
   */
  static addSupplierPayment(
    payloadOrSupplierId: SupplierPaymentPayload | string,
    cashboxIdArg?: string,
    amountArg?: number,
    notesArg?: string,
    userIdArg?: string
  ): { voucher_number: string; supplier_transaction: SupplierTransaction; cash_transaction: CashTransaction } {
    let payload: SupplierPaymentPayload;
    if (typeof payloadOrSupplierId === 'object') {
      payload = payloadOrSupplierId;
    } else {
      payload = {
        supplier_id: payloadOrSupplierId,
        cashbox_id: cashboxIdArg,
        amount: amountArg || 0,
        notes: notesArg,
        user_id: userIdArg || 'user-01'
      };
    }

    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      throw new Error(`مبلغ سند الصرف يجب أن يكون عدداً صحيحاً أكبر من الصفر. القيمة المدخلة: ${payload.amount}`);
    }

    const lockKey = payload.idempotency_key || `pay-lock-${payload.supplier_id}-${Date.now()}-${Math.random()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const supplier = state.suppliers.find((s) => s.id === payload.supplier_id);
        if (!supplier) throw new Error(`المورد غير موجود (${payload.supplier_id}).`);
        if (!supplier.is_active) throw new Error(`حساب المورد (${supplier.name}) معطل.`);

        const cashboxId = payload.cashbox_id || state.cashboxes[0]?.id;
        const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
        if (!cashbox) throw new Error(`الصندوق المحدد غير موجود (${cashboxId}).`);
        if (!cashbox.is_active) throw new Error(`الصندوق (${cashbox.name_ar}) معطل.`);

        // 1. Strict Non-Negative Cashbox check against Source of Truth
        const currentCash = this.getCashboxBalance(cashbox.id);
        if (currentCash < payload.amount) {
          throw new Error(
            `رصيد الصندوق (${cashbox.name_ar}) غير كافٍ لسداد هذا المبلغ. الرصيد الحالي: ${Money.format(
              currentCash
            )}، المطلوب صرفه: ${Money.format(payload.amount)}.`
          );
        }

        // 2. Strict Supplier Payable Overpayment check against Source of Truth
        const currentPayable = this.getSupplierBalance(supplier.id);
        if (payload.amount > currentPayable) {
          throw new Error(
            `مبلغ السداد (${Money.format(payload.amount)}) يتجاوز إجمالي مستحقات المورد الحالية (${Money.format(
              currentPayable
            )}). لا يُسمح بصرف مبالغ تفوق الاستحقاق.`
          );
        }

        const voucherNo = this.generatePaymentNumber();
        const newSupplierBalance = currentPayable - payload.amount;
        supplier.cached_balance = newSupplierBalance;
        supplier.updated_at = now;

        const suppTx: SupplierTransaction = {
          id: 'strx-' + Math.random().toString(36).substring(2, 9),
          supplier_id: supplier.id,
          transaction_type: 'payment_voucher',
          reference_type: 'payment_voucher',
          reference_id: voucherNo,
          debit: payload.amount,
          credit: 0,
          balance_after: newSupplierBalance,
          notes: payload.notes || `سداد دفعة للمورد سند رقم ${voucherNo}`,
          created_by: payload.user_id,
          created_at: now,
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.supplier_transactions.push(suppTx);

        // Update Cashbox
        const newCashBalance = currentCash - payload.amount;
        cashbox.cached_balance = newCashBalance;
        cashbox.updated_at = now;

        const cashTx: CashTransaction = {
          id: 'ctx-' + Math.random().toString(36).substring(2, 9),
          cashbox_id: cashbox.id,
          type: 'supplier_payment',
          direction: 'OUT',
          amount: payload.amount,
          balance_after: newCashBalance,
          reference_type: 'payment_voucher',
          reference_id: voucherNo,
          statement: `سند صرف للمورد: ${supplier.name} - سند رقم ${voucherNo}`,
          created_by: payload.user_id,
          created_at: now,
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.cash_transactions.push(cashTx);

        // Audit Log
        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'CREATE',
            'supplier_payment',
            voucherNo,
            state.profile.device_id,
            {
              reason: `صرف دفعة للمورد ${supplier.name} بمبلغ ${payload.amount}`,
              payloadAfter: { supplier_id: supplier.id, amount: payload.amount, voucherNo }
            }
          )
        );

        return { voucher_number: voucherNo, supplier_transaction: suppTx, cash_transaction: cashTx };
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Operational Expense (تسجيل مصروف تشغيلي للصيدلية)
   * Supports both object payload and backward-compatible positional arguments.
   */
  static addExpense(
    payloadOrCategoryId: CreateExpensePayload | string,
    cashboxIdArg?: string,
    amountArg?: number,
    statementArg?: string,
    recipientArg?: string,
    userIdArg?: string
  ): { expense: Expense; cash_transaction?: CashTransaction } {
    let payload: CreateExpensePayload;
    if (typeof payloadOrCategoryId === 'object') {
      payload = payloadOrCategoryId;
    } else {
      payload = {
        category_id: payloadOrCategoryId,
        cashbox_id: cashboxIdArg,
        amount: amountArg || 0,
        statement: statementArg || '',
        recipient: recipientArg,
        payment_method: 'cash',
        user_id: userIdArg || 'user-01'
      };
    }

    if (!payload.statement || !payload.statement.trim()) {
      throw new Error('بيان المصروف إجباري ولا يمكن تركه فارغاً.');
    }

    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      throw new Error(`مبلغ المصروف يجب أن يكون عدداً صحيحاً أكبر من الصفر. القيمة المدخلة: ${payload.amount}`);
    }

    const lockKey = payload.idempotency_key || `exp-lock-${Date.now()}-${Math.random()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const cat = state.expense_categories.find((c) => c.id === payload.category_id);
        if (!cat) throw new Error(`بند المصروف غير موجود (${payload.category_id}).`);
        if (!cat.is_active) throw new Error(`بند المصروف (${cat.name_ar}) غير مفعل.`);

        const cashboxId = payload.cashbox_id || state.cashboxes[0]?.id;
        const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
        if (!cashbox) throw new Error(`الصندوق المحدد غير موجود (${cashboxId}).`);
        if (!cashbox.is_active) throw new Error(`الصندوق (${cashbox.name_ar}) معطل.`);

        const paymentMethod = payload.payment_method || 'cash';
        let cashTx: CashTransaction | undefined;

        if (paymentMethod === 'cash') {
          // Strict Non-Negative Cashbox check
          const currentCash = this.getCashboxBalance(cashbox.id);
          if (currentCash < payload.amount) {
            throw new Error(
              `رصيد الصندوق (${cashbox.name_ar}) غير كافٍ لصرف هذا المصروف. الرصيد الحالي: ${Money.format(
                currentCash
              )}، المطلوب صرفه: ${Money.format(payload.amount)}.`
            );
          }

          const newCashBalance = currentCash - payload.amount;
          cashbox.cached_balance = newCashBalance;
          cashbox.updated_at = now;

          const docNo = this.generateExpenseNumber();

          cashTx = {
            id: 'ctx-' + Math.random().toString(36).substring(2, 9),
            cashbox_id: cashbox.id,
            type: 'expense',
            direction: 'OUT',
            amount: payload.amount,
            balance_after: newCashBalance,
            reference_type: 'expense',
            reference_id: docNo,
            statement: `مصروف (${cat.name_ar}): ${payload.statement.trim()}`,
            created_by: payload.user_id,
            created_at: now,
            business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
          };
          state.cash_transactions.push(cashTx);
        }

        const expId = 'exp-' + Math.random().toString(36).substring(2, 9);
        const docNo = cashTx ? cashTx.reference_id : this.generateExpenseNumber();

        const expense: Expense = {
          id: expId,
          expense_number: docNo,
          category_id: cat.id,
          cashbox_id: cashbox.id,
          amount: payload.amount,
          statement: payload.statement.trim(),
          recipient: payload.recipient?.trim(),
          payment_method: paymentMethod,
          status: 'completed',
          created_by: payload.user_id,
          created_at: now,
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.expenses.push(expense);

        // Audit Log
        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'CREATE',
            'expense',
            expense.id,
            state.profile.device_id,
            {
              reason: `تسجيل مصروف (${cat.name_ar}) بمبلغ ${payload.amount}`,
              payloadAfter: { expense_id: expense.id, amount: payload.amount, statement: payload.statement }
            }
          )
        );

        return { expense, cash_transaction: cashTx };
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Expense Cancellation (إلغاء مصروف تشغيلي مع عكس أثره المالي)
   * Strictly reversal, never physical deletion!
   */
  static cancelExpense(
    payload: CancelExpensePayload
  ): { expense: Expense; reversing_cash_transaction?: CashTransaction } {
    if (!payload.reason || !payload.reason.trim()) {
      throw new Error('يرجى كتابة سبب إلغاء المصروف.');
    }

    this.assertPermission(payload.user_id, ['admin', 'reports'], 'إلغاء مصروف تشغيلي');

    const lockKey = payload.idempotency_key || `exp-cancel-lock-${payload.expense_id}-${Date.now()}-${Math.random()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const expense = state.expenses.find((e) => e.id === payload.expense_id);
        if (!expense) throw new Error(`المصروف غير موجود (${payload.expense_id}).`);

        if (expense.status === 'cancelled') {
          throw new Error('هذا المصروف ملغى مسبقاً ولا يمكن إلغاؤه مرة أخرى.');
        }

        expense.status = 'cancelled';
        expense.cancellation_reason = payload.reason.trim();
        expense.cancelled_at = now;
        expense.cancelled_by = payload.user_id;

        let revTx: CashTransaction | undefined;

        if (expense.payment_method !== 'bank' && expense.cashbox_id) {
          const cashbox = state.cashboxes.find((c) => c.id === expense.cashbox_id);
          if (cashbox) {
            const currentCash = this.getCashboxBalance(cashbox.id);
            const newCashBalance = currentCash + expense.amount;
            cashbox.cached_balance = newCashBalance;
            cashbox.updated_at = now;

            revTx = {
              id: 'ctx-' + Math.random().toString(36).substring(2, 9),
              cashbox_id: cashbox.id,
              type: 'expense',
              direction: 'IN',
              amount: expense.amount,
              balance_after: newCashBalance,
              reference_type: 'expense_cancellation',
              reference_id: expense.expense_number || expense.id,
              statement: `إلغاء مصروف (${expense.expense_number || expense.id}): ${payload.reason.trim()}`,
              created_by: payload.user_id,
              created_at: now
            };
            state.cash_transactions.push(revTx);
          }
        }

        // Audit Log
        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'CANCEL',
            'expense',
            expense.id,
            state.profile.device_id,
            {
              reason: payload.reason.trim(),
              payloadBefore: { status: 'completed' },
              payloadAfter: { status: 'cancelled', reversed_amount: expense.amount }
            }
          )
        );

        return { expense, reversing_cash_transaction: revTx };
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Manual Cash Adjustment (تعديل يدوي لرصيد الصندوق - إيداع أو سحب بتسوية معتمدة)
   * Strict permissions: admin only. Non-negative cashbox enforced.
   */
  static adjustCash(payload: CashAdjustmentPayload): { adjustment_number: string; cash_transaction: CashTransaction } {
    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      throw new Error(`مبلغ التسوية يجب أن يكون عدداً صحيحاً أكبر من الصفر. القيمة المدخلة: ${payload.amount}`);
    }
    if (!payload.reason || !payload.reason.trim()) {
      throw new Error('يرجى تدوين سبب التعديل اليدوي للصندوق.');
    }

    this.assertPermission(payload.user_id, ['admin'], 'تعديل رصيد الصندوق يدوياً');

    const lockKey = payload.idempotency_key || `adj-lock-${payload.cashbox_id}-${Date.now()}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const cashbox = state.cashboxes.find((c) => c.id === payload.cashbox_id);
        if (!cashbox) throw new Error(`الصندوق غير موجود (${payload.cashbox_id}).`);

        const currentCash = this.getCashboxBalance(cashbox.id);
        if (payload.direction === 'OUT' && currentCash < payload.amount) {
          throw new Error(
            `رصيد الصندوق (${cashbox.name_ar}) غير كافٍ لإجراء سحب تسوية. الرصيد الحالي: ${Money.format(
              currentCash
            )}، المطلوب سحبه: ${Money.format(payload.amount)}.`
          );
        }

        const newCashBalance = payload.direction === 'IN' ? currentCash + payload.amount : currentCash - payload.amount;
        cashbox.cached_balance = newCashBalance;
        cashbox.updated_at = now;

        const adjNo = this.generateAdjustmentNumber();

        const cashTx: CashTransaction = {
          id: 'ctx-' + Math.random().toString(36).substring(2, 9),
          cashbox_id: cashbox.id,
          type: 'adjustment',
          direction: payload.direction,
          amount: payload.amount,
          balance_after: newCashBalance,
          reference_type: 'cash_adjustment',
          reference_id: adjNo,
          statement: `تسوية رصيد الصندوق (${payload.direction === 'IN' ? 'إيداع' : 'سحب'}): ${payload.reason.trim()}`,
          created_by: payload.user_id,
          created_at: now,
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.cash_transactions.push(cashTx);

        // Audit Log
        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'ADJUST',
            'cashbox',
            cashbox.id,
            state.profile.device_id,
            {
              reason: payload.reason.trim(),
              payloadBefore: { balance: currentCash },
              payloadAfter: { balance: newCashBalance, direction: payload.direction, amount: payload.amount }
            }
          )
        );

        return { adjustment_number: adjNo, cash_transaction: cashTx };
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Set Initial / Opening Balance for a Cashbox
   */
  static setOpeningBalance(payload: OpeningCashPayload): CashTransaction {
    if (!Number.isInteger(payload.amount) || payload.amount < 0) {
      throw new Error(`مبلغ الرصيد الافتتاحي يجب أن يكون عدداً صحيحاً غير سالب. القيمة المدخلة: ${payload.amount}`);
    }

    this.assertPermission(payload.user_id, ['admin'], 'تحديد الرصيد الافتتاحي للصندوق');

    return db.transaction(() => {
      const state = db.getState();
      const now = Date.now();

      const cashbox = state.cashboxes.find((c) => c.id === payload.cashbox_id);
      if (!cashbox) throw new Error(`الصندوق غير موجود (${payload.cashbox_id}).`);

      const currentCash = this.getCashboxBalance(cashbox.id);
      const newCashBalance = currentCash + payload.amount;
      cashbox.cached_balance = newCashBalance;
      cashbox.updated_at = now;

      const cashTx: CashTransaction = {
        id: 'ctx-' + Math.random().toString(36).substring(2, 9),
        cashbox_id: cashbox.id,
        type: 'opening_balance',
        direction: 'IN',
        amount: payload.amount,
        balance_after: newCashBalance,
        reference_type: 'opening_balance',
        reference_id: cashbox.id,
        statement: payload.reason || 'إيداع رصيد افتتاحي للصندوق',
        created_by: payload.user_id,
        created_at: now,
        business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
      };
      state.cash_transactions.push(cashTx);

      state.audit_logs.push(
        AuditManager.createLog(
          payload.user_id,
          'SET_OPENING_BALANCE',
          'cashbox',
          cashbox.id,
          state.profile.device_id,
          {
            reason: payload.reason || 'رصيد افتتاحي',
            payloadAfter: { balance: newCashBalance, opening_amount: payload.amount }
          }
        )
      );

      return cashTx;
    });
  }

  /**
   * Transfer Funds between Cashboxes or Bank Accounts
   * Atomically debits source cashbox and credits destination cashbox
   */
  static transferCash(payload: {
    from_cashbox_id: string;
    to_cashbox_id: string;
    amount: number;
    notes: string;
    user_id: string;
    business_date?: string;
  }): { transfer_number: string; out_tx: CashTransaction; in_tx: CashTransaction } {
    if (payload.from_cashbox_id === payload.to_cashbox_id) {
      throw new Error('لا يمكن التحويل لنفس الصندوق أو الحساب.');
    }
    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      throw new Error('مبلغ التحويل يجب أن يكون أكبر من الصفر.');
    }
    if (!payload.notes || !payload.notes.trim()) {
      throw new Error('يرجى كتابة سبب أو بيان التحويل المالي.');
    }

    this.assertPermission(payload.user_id, ['admin', 'manager', 'cashier'], 'تحويل مالي بين الصناديق');

    return db.transaction(() => {
      const state = db.getState();
      const now = Date.now();
      const bDate = payload.business_date || new Date(now).toISOString().slice(0, 10);

      const fromBox = state.cashboxes.find((c) => c.id === payload.from_cashbox_id);
      if (!fromBox) throw new Error('صندوق المصدر غير موجود.');

      const toBox = state.cashboxes.find((c) => c.id === payload.to_cashbox_id);
      if (!toBox) throw new Error('صندوق الوجهة غير موجود.');

      const fromBalance = this.getCashboxBalance(fromBox.id);
      if (fromBalance < payload.amount) {
        throw new Error(
          `رصيد صندوق المصدر (${fromBox.name_ar}) لا يكفي لإتمام التحويل. الرصيد: ${Money.format(
            fromBalance
          )}، المطلوب: ${Money.format(payload.amount)}.`
        );
      }

      const transferNo = 'TRF-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

      // Debit source
      const newFromBalance = fromBalance - payload.amount;
      fromBox.cached_balance = newFromBalance;
      fromBox.updated_at = now;

      const outTx: CashTransaction = {
        id: 'ctx-' + Math.random().toString(36).substring(2, 9),
        cashbox_id: fromBox.id,
        type: 'transfer_out',
        direction: 'OUT',
        amount: payload.amount,
        balance_after: newFromBalance,
        reference_type: 'cash_transfer',
        reference_id: transferNo,
        statement: `تحويل مالي صادر إلى (${toBox.name_ar}): ${payload.notes.trim()}`,
        created_by: payload.user_id,
        created_at: now,
        business_date: bDate
      };
      state.cash_transactions.push(outTx);

      // Credit destination
      const toBalance = this.getCashboxBalance(toBox.id);
      const newToBalance = toBalance + payload.amount;
      toBox.cached_balance = newToBalance;
      toBox.updated_at = now;

      const inTx: CashTransaction = {
        id: 'ctx-' + Math.random().toString(36).substring(2, 9),
        cashbox_id: toBox.id,
        type: 'transfer_in',
        direction: 'IN',
        amount: payload.amount,
        balance_after: newToBalance,
        reference_type: 'cash_transfer',
        reference_id: transferNo,
        statement: `تحويل مالي وارد من (${fromBox.name_ar}): ${payload.notes.trim()}`,
        created_by: payload.user_id,
        created_at: now,
        business_date: bDate
      };
      state.cash_transactions.push(inTx);

      state.audit_logs.push(
        AuditManager.createLog(
          payload.user_id,
          'TRANSFER_FUNDS',
          'cashbox',
          fromBox.id,
          state.profile.device_id,
          {
            reason: `تحويل مالي: ${payload.notes.trim()}`,
            payloadAfter: {
              transferNumber: transferNo,
              fromBox: fromBox.name_ar,
              toBox: toBox.name_ar,
              amount: payload.amount,
              notes: payload.notes.trim()
            }
          }
        )
      );

      return { transfer_number: transferNo, out_tx: outTx, in_tx: inTx };
    });
  }

  /**
   * Create New Cashbox or Bank Account
   */
  static createCashbox(payload: {
    name_ar: string;
    type: 'daily' | 'main' | 'bank';
    initial_balance?: number;
    user_id: string;
  }): Cashbox {
    if (!payload.name_ar || !payload.name_ar.trim()) {
      throw new Error('اسم الصندوق أو الحساب البنكي إلزامي.');
    }
    this.assertPermission(payload.user_id, ['admin'], 'إنشاء صندوق جديد');

    return db.transaction(() => {
      const state = db.getState();
      const now = Date.now();
      const newCashbox: Cashbox = {
        id: 'box-' + Math.random().toString(36).substring(2, 8),
        name_ar: payload.name_ar.trim(),
        type: payload.type,
        cached_balance: 0,
        is_active: true,
        created_at: now,
        updated_at: now
      };
      state.cashboxes.push(newCashbox);

      if (payload.initial_balance && payload.initial_balance > 0) {
        this.setOpeningBalance({
          cashbox_id: newCashbox.id,
          amount: payload.initial_balance,
          reason: 'رصيد افتتاحي عند التأسيس',
          user_id: payload.user_id
        });
      }

      return newCashbox;
    });
  }

  /**
   * Open WorkShift / Cashbox Shift
   */
  static openShift(payload: OpenShiftPayload): WorkShift {
    if (!Number.isInteger(payload.opening_cash) || payload.opening_cash < 0) {
      throw new Error(`عهدة بداية الوردية يجب أن تكون عدداً صحيحاً غير سالب. المدخل: ${payload.opening_cash}`);
    }

    const lockKey = payload.idempotency_key || `shift-open-lock-${payload.user_id}-${payload.cashbox_id}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        // Check if user already has an active open shift on this cashbox
        const existingOpenShift = state.work_shifts.find(
          (s) => s.user_id === payload.user_id && s.cashbox_id === payload.cashbox_id && s.status === 'open'
        );
        if (existingOpenShift) {
          throw new Error(`يوجد وردية عمل مفتوحة بالفعل لهذا المستخدم على هذا الصندوق (رقم الوردية: ${existingOpenShift.shift_number || existingOpenShift.id}).`);
        }

        const cashbox = state.cashboxes.find((c) => c.id === payload.cashbox_id);
        if (!cashbox) throw new Error(`الصندوق غير موجود (${payload.cashbox_id}).`);

        const shiftNumber = this.generateShiftNumber();

        const shift: WorkShift = {
          id: 'ws-' + Math.random().toString(36).substring(2, 9),
          shift_number: shiftNumber,
          user_id: payload.user_id,
          cashbox_id: payload.cashbox_id,
          started_at: now,
          opening_cash: payload.opening_cash,
          expected_cash: payload.opening_cash,
          actual_cash: 0,
          cash_difference: 0,
          total_sales_cash: 0,
          total_sales_credit: 0,
          total_returns_cash: 0,
          total_expenses: 0,
          total_customer_collections: 0,
          total_supplier_payments: 0,
          total_purchase_cash: 0,
          total_purchase_return_cash: 0,
          status: 'open',
          business_date: payload.business_date || new Date(now).toISOString().slice(0, 10)
        };
        state.work_shifts.push(shift);

        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'OPEN_SHIFT',
            'work_shift',
            shift.id,
            state.profile.device_id,
            {
              reason: `فتح وردية عمل جديدة برصيد افتتاحي ${payload.opening_cash}`,
              payloadAfter: { shift_id: shift.id, opening_cash: payload.opening_cash }
            }
          )
        );

        return shift;
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Dynamically calculates shift statistics and expected cash from CashTransaction records.
   */
  static getShiftSummary(shiftId: string): {
    shift: WorkShift;
    opening_cash: number;
    sales_cash: number;
    sales_credit: number;
    returns_cash: number;
    customer_collections: number;
    supplier_payments: number;
    expenses: number;
    purchase_cash: number;
    purchase_return_cash: number;
    adjustments_in: number;
    adjustments_out: number;
    total_in: number;
    total_out: number;
    expected_cash: number;
  } {
    const state = db.getState();
    const shift = state.work_shifts.find((s) => s.id === shiftId);
    if (!shift) throw new Error(`الوردية غير موجودة (${shiftId}).`);

    const shiftStart = shift.started_at;
    const shiftEnd = shift.closed_at || Date.now();

    // Transactions associated with this shift or happening on this cashbox during this period
    const txs = state.cash_transactions.filter((tx) => {
      if (tx.cashbox_id !== shift.cashbox_id) return false;
      if (tx.shift_id) return tx.shift_id === shift.id;
      return tx.created_at >= shiftStart && tx.created_at <= shiftEnd;
    });

    let sales_cash = 0;
    let returns_cash = 0;
    let customer_collections = 0;
    let supplier_payments = 0;
    let expenses = 0;
    let purchase_cash = 0;
    let purchase_return_cash = 0;
    let adjustments_in = 0;
    let adjustments_out = 0;

    for (const tx of txs) {
      if (tx.type === 'sale_cash') sales_cash += tx.amount;
      else if (tx.type === 'sale_return_cash') returns_cash += tx.amount;
      else if (tx.type === 'customer_payment') customer_collections += tx.amount;
      else if (tx.type === 'supplier_payment') supplier_payments += tx.amount;
      else if (tx.type === 'expense') {
        if (tx.direction === 'OUT') expenses += tx.amount;
        else if (tx.direction === 'IN') expenses -= tx.amount; // cancelled expense reversal
      } else if (tx.type === 'purchase_cash') purchase_cash += tx.amount;
      else if (tx.type === 'purchase_return_cash') purchase_return_cash += tx.amount;
      else if (tx.type === 'adjustment') {
        if (tx.direction === 'IN') adjustments_in += tx.amount;
        else adjustments_out += tx.amount;
      }
    }

    // Sales credit in shift period
    const sales_credit = state.sales
      .filter((s) => s.user_id === shift.user_id && s.created_at >= shiftStart && s.created_at <= shiftEnd && s.sale_type === 'credit')
      .reduce((sum, s) => sum + s.net_total, 0);

    const total_in = sales_cash + customer_collections + purchase_return_cash + adjustments_in;
    const total_out = returns_cash + supplier_payments + expenses + purchase_cash + adjustments_out;
    const expected_cash = shift.opening_cash + total_in - total_out;

    return {
      shift,
      opening_cash: shift.opening_cash,
      sales_cash,
      sales_credit,
      returns_cash,
      customer_collections,
      supplier_payments,
      expenses,
      purchase_cash,
      purchase_return_cash,
      adjustments_in,
      adjustments_out,
      total_in,
      total_out,
      expected_cash
    };
  }

  /**
   * Close WorkShift / Cashbox Shift with Counted Cash and Variance Audit
   */
  static closeShift(payload: CloseShiftPayload): WorkShift {
    if (!Number.isInteger(payload.actual_cash) || payload.actual_cash < 0) {
      throw new Error(`المبلغ الفعلي في الصندوق يجب أن يكون عدداً صحيحاً غير سالب. المدخل: ${payload.actual_cash}`);
    }

    const lockKey = payload.idempotency_key || `shift-close-lock-${payload.shift_id}`;
    TransactionManager.acquireLock(lockKey);

    let isSuccess = false;
    try {
      const result = db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        const shift = state.work_shifts.find((s) => s.id === payload.shift_id);
        if (!shift) throw new Error(`الوردية غير موجودة (${payload.shift_id}).`);
        if (shift.status === 'closed') throw new Error('تم إغلاق هذه الوردية مسبقاً.');

        // Compute expected cash dynamically from true movements
        const summary = this.getShiftSummary(shift.id);
        const variance = payload.actual_cash - summary.expected_cash;

        // If variance != 0, closing notes / explanation is mandatory
        if (variance !== 0 && (!payload.closing_notes || !payload.closing_notes.trim())) {
          throw new Error(
            `يوجد فارق نقدي بين المحسوب والفعلي بمقدار (${Money.format(variance)}). يرجى تدوين سبب الفارق في الملاحظات قبل الإغلاق.`
          );
        }

        shift.status = 'closed';
        shift.closed_at = now;
        shift.expected_cash = summary.expected_cash;
        shift.actual_cash = payload.actual_cash;
        shift.cash_difference = variance;
        shift.total_sales_cash = summary.sales_cash;
        shift.total_sales_credit = summary.sales_credit;
        shift.total_returns_cash = summary.returns_cash;
        shift.total_expenses = summary.expenses;
        shift.total_customer_collections = summary.customer_collections;
        shift.total_supplier_payments = summary.supplier_payments;
        shift.total_purchase_cash = summary.purchase_cash;
        shift.total_purchase_return_cash = summary.purchase_return_cash;
        shift.closing_notes = payload.closing_notes?.trim();

        state.audit_logs.push(
          AuditManager.createLog(
            payload.user_id,
            'CLOSE_SHIFT',
            'work_shift',
            shift.id,
            state.profile.device_id,
            {
              reason: `إغلاق الوردية. المتوقع: ${summary.expected_cash}، الفعلي: ${payload.actual_cash}، الفارق: ${variance}`,
              payloadAfter: {
                shift_id: shift.id,
                expected_cash: summary.expected_cash,
                actual_cash: payload.actual_cash,
                variance
              }
            }
          )
        );

        return shift;
      });

      isSuccess = true;
      return result;
    } finally {
      TransactionManager.releaseLock(lockKey, isSuccess);
    }
  }

  /**
   * Cashbox Reconciliation Check (مطابقة الصندوق مع سجل الحركات)
   */
  static reconcileCashbox(cashboxId: string): { cashbox_id: string; previous_cached: number; true_balance: number; reconciled: boolean } {
    return db.transaction(() => {
      const state = db.getState();
      const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
      if (!cashbox) throw new Error(`الصندوق غير موجود (${cashboxId}).`);

      const prev = cashbox.cached_balance;
      const trueBal = this.getCashboxBalance(cashbox.id);
      cashbox.cached_balance = trueBal;
      cashbox.updated_at = Date.now();

      return {
        cashbox_id: cashbox.id,
        previous_cached: prev,
        true_balance: trueBal,
        reconciled: prev === trueBal
      };
    });
  }

  /**
   * Customer Ledger Reconciliation Check (مطابقة حساب العميل مع سجل الحركات)
   */
  static reconcileCustomer(customerId: string): { customer_id: string; previous_cached: number; true_balance: number; reconciled: boolean } {
    return db.transaction(() => {
      const state = db.getState();
      const customer = state.customers.find((c) => c.id === customerId);
      if (!customer) throw new Error(`العميل غير موجود (${customerId}).`);

      const prev = customer.cached_balance;
      const trueBal = this.getCustomerBalance(customer.id);
      customer.cached_balance = trueBal;
      customer.updated_at = Date.now();

      return {
        customer_id: customer.id,
        previous_cached: prev,
        true_balance: trueBal,
        reconciled: prev === trueBal
      };
    });
  }

  /**
   * Supplier Ledger Reconciliation Check (مطابقة حساب المورد مع سجل الحركات)
   */
  static reconcileSupplier(supplierId: string): { supplier_id: string; previous_cached: number; true_balance: number; reconciled: boolean } {
    return db.transaction(() => {
      const state = db.getState();
      const supplier = state.suppliers.find((s) => s.id === supplierId);
      if (!supplier) throw new Error(`المورد غير موجود (${supplierId}).`);

      const prev = supplier.cached_balance;
      const trueBal = this.getSupplierBalance(supplier.id);
      supplier.cached_balance = trueBal;
      supplier.updated_at = Date.now();

      return {
        supplier_id: supplier.id,
        previous_cached: prev,
        true_balance: trueBal,
        reconciled: prev === trueBal
      };
    });
  }

  /**
   * Full Ledger Reconciliation (مطابقة شاملة لكافة الصناديق والعملاء والموردين)
   */
  static reconcileAll(): { cashboxes: number; customers: number; suppliers: number } {
    return db.transaction(() => {
      const state = db.getState();

      let cbCount = 0;
      for (const box of state.cashboxes) {
        box.cached_balance = this.getCashboxBalance(box.id);
        cbCount++;
      }

      let custCount = 0;
      for (const cust of state.customers) {
        cust.cached_balance = this.getCustomerBalance(cust.id);
        custCount++;
      }

      let suppCount = 0;
      for (const supp of state.suppliers) {
        supp.cached_balance = this.getSupplierBalance(supp.id);
        suppCount++;
      }

      return { cashboxes: cbCount, customers: custCount, suppliers: suppCount };
    });
  }

  /**
   * Cashbox Statement / Movement Report
   */
  static getCashboxReport(cashboxId: string, startDate?: number, endDate?: number): {
    cashbox: Cashbox;
    opening_balance: number;
    inflows: { sales: number; customer_collections: number; purchase_returns: number; adjustments: number; opening: number; total: number };
    outflows: { purchases: number; supplier_payments: number; expenses: number; sales_returns: number; adjustments: number; total: number };
    net_change: number;
    closing_balance: number;
    transactions: CashTransaction[];
  } {
    const state = db.getState();
    const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
    if (!cashbox) throw new Error(`الصندوق غير موجود (${cashboxId}).`);

    const sDate = startDate !== undefined ? startDate : 0;
    const eDate = endDate !== undefined ? endDate : Date.now();

    // Opening balance before startDate
    const opening_balance = state.cash_transactions
      .filter((tx) => tx.cashbox_id === cashbox.id && tx.created_at < sDate)
      .reduce((bal, tx) => (tx.direction === 'IN' ? bal + tx.amount : bal - tx.amount), 0);

    const periodTxs = state.cash_transactions
      .filter((tx) => tx.cashbox_id === cashbox.id && tx.created_at >= sDate && tx.created_at <= eDate)
      .sort((a, b) => a.created_at - b.created_at);

    let salesIn = 0;
    let collectionsIn = 0;
    let purchaseReturnsIn = 0;
    let adjustmentsIn = 0;
    let openingIn = 0;

    let purchasesOut = 0;
    let supplierPaymentsOut = 0;
    let expensesOut = 0;
    let salesReturnsOut = 0;
    let adjustmentsOut = 0;

    for (const tx of periodTxs) {
      if (tx.direction === 'IN') {
        if (tx.type === 'sale_cash') salesIn += tx.amount;
        else if (tx.type === 'customer_payment') collectionsIn += tx.amount;
        else if (tx.type === 'purchase_return_cash') purchaseReturnsIn += tx.amount;
        else if (tx.type === 'adjustment') adjustmentsIn += tx.amount;
        else if (tx.type === 'opening_balance') openingIn += tx.amount;
        else if (tx.type === 'expense') expensesOut -= tx.amount; // expense reversal
      } else {
        if (tx.type === 'purchase_cash') purchasesOut += tx.amount;
        else if (tx.type === 'supplier_payment') supplierPaymentsOut += tx.amount;
        else if (tx.type === 'expense') expensesOut += tx.amount;
        else if (tx.type === 'sale_return_cash') salesReturnsOut += tx.amount;
        else if (tx.type === 'adjustment') adjustmentsOut += tx.amount;
      }
    }

    const totalIn = salesIn + collectionsIn + purchaseReturnsIn + adjustmentsIn + openingIn;
    const totalOut = purchasesOut + supplierPaymentsOut + expensesOut + salesReturnsOut + adjustmentsOut;
    const net_change = totalIn - totalOut;
    const closing_balance = opening_balance + net_change;

    return {
      cashbox,
      opening_balance,
      inflows: {
        sales: salesIn,
        customer_collections: collectionsIn,
        purchase_returns: purchaseReturnsIn,
        adjustments: adjustmentsIn,
        opening: openingIn,
        total: totalIn
      },
      outflows: {
        purchases: purchasesOut,
        supplier_payments: supplierPaymentsOut,
        expenses: expensesOut,
        sales_returns: salesReturnsOut,
        adjustments: adjustmentsOut,
        total: totalOut
      },
      net_change,
      closing_balance,
      transactions: periodTxs
    };
  }

  /**
   * Customer Statement (كشف حساب عميل تفصيلي)
   */
  static getCustomerStatement(customerId: string, startDate?: number, endDate?: number): {
    customer: any;
    opening_balance: number;
    total_debits: number;
    total_credits: number;
    closing_balance: number;
    items: Array<CustomerTransaction & { running_balance: number }>;
  } {
    const state = db.getState();
    const customer = state.customers.find((c) => c.id === customerId);
    if (!customer) throw new Error(`العميل غير موجود (${customerId}).`);

    const sDate = startDate !== undefined ? startDate : 0;
    const eDate = endDate !== undefined ? endDate : Date.now();

    const opening_balance = state.customer_transactions
      .filter((tx) => tx.customer_id === customer.id && tx.created_at < sDate)
      .reduce((bal, tx) => bal + (tx.debit - tx.credit), 0);

    const periodTxs = state.customer_transactions
      .filter((tx) => tx.customer_id === customer.id && tx.created_at >= sDate && tx.created_at <= eDate)
      .sort((a, b) => a.created_at - b.created_at);

    let running = opening_balance;
    let totalDebits = 0;
    let totalCredits = 0;

    const items = periodTxs.map((tx) => {
      running = running + (tx.debit - tx.credit);
      totalDebits += tx.debit;
      totalCredits += tx.credit;
      return {
        ...tx,
        running_balance: running
      };
    });

    return {
      customer,
      opening_balance,
      total_debits: totalDebits,
      total_credits: totalCredits,
      closing_balance: running,
      items
    };
  }

  /**
   * Supplier Statement (كشف حساب مورد تفصيلي)
   */
  static getSupplierStatement(supplierId: string, startDate?: number, endDate?: number): {
    supplier: any;
    opening_balance: number;
    total_credits: number;
    total_debits: number;
    closing_balance: number;
    items: Array<SupplierTransaction & { running_balance: number }>;
  } {
    const state = db.getState();
    const supplier = state.suppliers.find((s) => s.id === supplierId);
    if (!supplier) throw new Error(`المورد غير موجود (${supplierId}).`);

    const sDate = startDate !== undefined ? startDate : 0;
    const eDate = endDate !== undefined ? endDate : Date.now();

    const opening_balance = state.supplier_transactions
      .filter((tx) => tx.supplier_id === supplier.id && tx.created_at < sDate)
      .reduce((bal, tx) => bal + (tx.credit - tx.debit), 0);

    const periodTxs = state.supplier_transactions
      .filter((tx) => tx.supplier_id === supplier.id && tx.created_at >= sDate && tx.created_at <= eDate)
      .sort((a, b) => a.created_at - b.created_at);

    let running = opening_balance;
    let totalCredits = 0;
    let totalDebits = 0;

    const items = periodTxs.map((tx) => {
      running = running + (tx.credit - tx.debit);
      totalCredits += tx.credit;
      totalDebits += tx.debit;
      return {
        ...tx,
        running_balance: running
      };
    });

    return {
      supplier,
      opening_balance,
      total_credits: totalCredits,
      total_debits: totalDebits,
      closing_balance: running,
      items
    };
  }

  /**
   * Expense Report (تقرير المصروفات التشغيلية مصنف حسب البنود)
   */
  static getExpenseReport(startDate?: number, endDate?: number, categoryId?: string): {
    total_amount: number;
    total_cancelled_amount: number;
    count_active: number;
    count_cancelled: number;
    by_category: Array<{ category_id: string; category_name: string; total: number; percentage: number }>;
    expenses: Expense[];
  } {
    const state = db.getState();
    const sDate = startDate !== undefined ? startDate : 0;
    const eDate = endDate !== undefined ? endDate : Date.now();

    const filtered = state.expenses.filter((e) => {
      if (e.created_at < sDate || e.created_at > eDate) return false;
      if (categoryId && e.category_id !== categoryId) return false;
      return true;
    });

    let totalActive = 0;
    let totalCancelled = 0;
    let countActive = 0;
    let countCancelled = 0;
    const catMap: Record<string, number> = {};

    for (const exp of filtered) {
      if (exp.status === 'cancelled') {
        totalCancelled += exp.amount;
        countCancelled++;
      } else {
        totalActive += exp.amount;
        countActive++;
        catMap[exp.category_id] = (catMap[exp.category_id] || 0) + exp.amount;
      }
    }

    const by_category = Object.entries(catMap).map(([catId, sum]) => {
      const cat = state.expense_categories.find((c) => c.id === catId);
      return {
        category_id: catId,
        category_name: cat?.name_ar || 'أخرى',
        total: sum,
        percentage: totalActive > 0 ? Math.round((sum / totalActive) * 10000) / 100 : 0
      };
    });

    return {
      total_amount: totalActive,
      total_cancelled_amount: totalCancelled,
      count_active: countActive,
      count_cancelled: countCancelled,
      by_category,
      expenses: filtered
    };
  }
}
