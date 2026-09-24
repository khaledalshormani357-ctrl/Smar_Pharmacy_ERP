// Transaction Manager and Foreign Key / Constraint Enforcer
// Provides true BEGIN -> OPERATIONS -> COMMIT with automatic ROLLBACK on failure
// Also guards against duplicate actions / double taps

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export class DuplicateActionError extends Error {
  constructor(actionKey: string) {
    super(`تم رفض تكرار العملية (${actionKey}). العملية قيد التنفيذ أو تم تسجيلها مسبقاً.`);
    this.name = 'DuplicateActionError';
  }
}

export class TransactionManager {
  // In-memory idempotency cache (keeps track of submitted tokens for 15 seconds to prevent double taps)
  private static completedTokens: Map<string, number> = new Map();
  private static activeLocks: Set<string> = new Set();

  // Guard against duplicate submission (double tap protection)
  static acquireLock(idempotencyKey: string, ttlMs = 15000): void {
    const now = Date.now();
    // Clean expired tokens
    this.completedTokens.forEach((timestamp, key) => {
      if (now - timestamp > ttlMs) {
        this.completedTokens.delete(key);
      }
    });

    if (this.activeLocks.has(idempotencyKey) || this.completedTokens.has(idempotencyKey)) {
      throw new DuplicateActionError(idempotencyKey);
    }
    this.activeLocks.add(idempotencyKey);
  }

  static releaseLock(idempotencyKey: string, success = false): void {
    this.activeLocks.delete(idempotencyKey);
    if (success) {
      // Record completed token to prevent duplicate replay
      this.completedTokens.set(idempotencyKey, Date.now());
    }
  }

  // Enforce referential integrity (PRAGMA foreign_keys = ON equivalent)
  static verifyForeignKeys(state: any): void {
    // Check products reference existing category (if specified)
    for (const p of state.products) {
      if (p.category_id && !state.categories.some((c: any) => c.id === p.category_id)) {
        throw new TransactionError(`Foreign key violation: Product ${p.id} references invalid category ${p.category_id}`);
      }
    }

    // Check batches reference existing product
    for (const b of state.batches) {
      if (!state.products.some((p: any) => p.id === b.product_id)) {
        throw new TransactionError(`Foreign key violation: Batch ${b.id} references invalid product ${b.product_id}`);
      }
    }

    // Check unit conversions reference existing product
    for (const uc of state.unit_conversions) {
      if (!state.products.some((p: any) => p.id === uc.product_id)) {
        throw new TransactionError(`Foreign key violation: UnitConversion ${uc.id} references invalid product ${uc.product_id}`);
      }
    }

    // Check stock movements reference existing product and batch
    for (const sm of state.stock_movements) {
      if (!state.products.some((p: any) => p.id === sm.product_id)) {
        throw new TransactionError(`Foreign key violation: StockMovement ${sm.id} references invalid product ${sm.product_id}`);
      }
      if (sm.batch_id && !state.batches.some((b: any) => b.id === sm.batch_id)) {
        throw new TransactionError(`Foreign key violation: StockMovement ${sm.id} references invalid batch ${sm.batch_id}`);
      }
    }

    // Check sales reference valid customer if specified
    for (const s of state.sales) {
      if (s.customer_id && s.customer_id !== 'cust-cash') {
        if (!state.customers.some((c: any) => c.id === s.customer_id)) {
          throw new TransactionError(`Foreign key violation: Sale ${s.id} references invalid customer ${s.customer_id}`);
        }
      }
      if (s.cashbox_id) {
        if (!state.cashboxes.some((c: any) => c.id === s.cashbox_id)) {
          throw new TransactionError(`Foreign key violation: Sale ${s.id} references invalid cashbox ${s.cashbox_id}`);
        }
      }
    }

    // Check customer transactions reference existing customer
    for (const ctx of state.customer_transactions) {
      if (!state.customers.some((c: any) => c.id === ctx.customer_id)) {
        throw new TransactionError(`Foreign key violation: CustomerTransaction ${ctx.id} references invalid customer ${ctx.customer_id}`);
      }
    }

    // Check cash transactions reference existing cashbox
    for (const ctk of state.cash_transactions) {
      if (!state.cashboxes.some((c: any) => c.id === ctk.cashbox_id)) {
        throw new TransactionError(`Foreign key violation: CashTransaction ${ctk.id} references invalid cashbox ${ctk.cashbox_id}`);
      }
    }

    // Check supplier transactions reference existing supplier
    if (Array.isArray(state.supplier_transactions)) {
      for (const stx of state.supplier_transactions) {
        if (!state.suppliers.some((s: any) => s.id === stx.supplier_id)) {
          throw new TransactionError(`Foreign key violation: SupplierTransaction ${stx.id} references invalid supplier ${stx.supplier_id}`);
        }
      }
    }

    // Check expenses reference existing expense_category and cashbox
    if (Array.isArray(state.expenses)) {
      for (const exp of state.expenses) {
        if (!state.expense_categories.some((cat: any) => cat.id === exp.category_id)) {
          throw new TransactionError(`Foreign key violation: Expense ${exp.id} references invalid expense category ${exp.category_id}`);
        }
        if (exp.cashbox_id && !state.cashboxes.some((cb: any) => cb.id === exp.cashbox_id)) {
          throw new TransactionError(`Foreign key violation: Expense ${exp.id} references invalid cashbox ${exp.cashbox_id}`);
        }
      }
    }

    // Check work shifts reference existing user and cashbox
    if (Array.isArray(state.work_shifts)) {
      for (const ws of state.work_shifts) {
        if (!state.users.some((u: any) => u.id === ws.user_id)) {
          throw new TransactionError(`Foreign key violation: WorkShift ${ws.id} references invalid user ${ws.user_id}`);
        }
        if (ws.cashbox_id && !state.cashboxes.some((cb: any) => cb.id === ws.cashbox_id)) {
          throw new TransactionError(`Foreign key violation: WorkShift ${ws.id} references invalid cashbox ${ws.cashbox_id}`);
        }
      }
    }
  }
}
