// Database Migrations & Version Tracking for Smart Pharmacy ERP
// Strict versioned, deterministic, idempotent schema upgrades

export interface SchemaMigration {
  version: number;
  name: string;
  applied_at?: number;
  up: (state: any) => void;
}

export class MigrationManager {
  private static migrations: SchemaMigration[] = [
    {
      version: 1,
      name: '001_initial_core_schema',
      up: (state) => {
        // Ensure all core collection arrays exist
        const requiredArrays = [
          'roles', 'users', 'categories', 'manufacturers', 'products',
          'unit_conversions', 'batches', 'stock_movements', 'customers',
          'customer_transactions', 'suppliers', 'supplier_transactions',
          'cashboxes', 'cash_transactions', 'expense_categories', 'expenses',
          'sales', 'sale_items', 'sale_item_allocations', 'sale_returns',
          'sale_return_items', 'purchases', 'purchase_items', 'purchase_returns',
          'purchase_return_items', 'work_shifts', 'audit_logs', 'schema_migrations'
        ];

        for (const key of requiredArrays) {
          if (!Array.isArray(state[key])) {
            state[key] = [];
          }
        }

        if (!state.profile) {
          state.profile = {
            id: 'prof-01',
            name_ar: 'صيدلية الشفاء الحديثة',
            name_en: 'Al-Shifa Modern Pharmacy',
            owner_name: 'د. خالد الشرماني',
            phone: '772722134',
            currency: 'ر.ي',
            currency_code: 'YER',
            default_profit_margin_bps: 2000,
            receipt_paper_size: '80mm',
            device_id: 'DEV-INIT',
            sync_status: 'synced',
            updated_at: Date.now()
          };
        }
      }
    },
    {
      version: 2,
      name: '002_audit_trail_and_indices_support',
      up: (state) => {
        // Ensure audit log entity tracking
        if (!Array.isArray(state.audit_logs)) {
          state.audit_logs = [];
        }
        // Ensure schema_migrations table exists for version auditing
        if (!Array.isArray(state.schema_migrations)) {
          state.schema_migrations = [];
        }
      }
    },
    {
      version: 3,
      name: '003_secure_passwords_and_pins',
      up: (state) => {
        // Hash any unhashed legacy passwords
        if (Array.isArray(state.users)) {
          for (const user of state.users) {
            if (user.password_hash && !user.password_hash.includes(':')) {
              // Upgrade to deterministic hash representation
              let h = 5381;
              const combined = user.password_hash + ':pharmacy_default_salt_2026';
              for (let i = 0; i < combined.length; i++) {
                h = ((h << 5) + h) + combined.charCodeAt(i);
                h = h & h;
              }
              user.password_hash = `hashsync:pharmacy_default_salt_2026:${Math.abs(h).toString(16)}`;
            }
          }
        }
      }
    },
    {
      version: 4,
      name: '004_pharmacy_core_stock_counts_and_expiry',
      up: (state) => {
        if (!Array.isArray(state.stock_count_sessions)) {
          state.stock_count_sessions = [];
        }
        if (!Array.isArray(state.stock_count_items)) {
          state.stock_count_items = [];
        }
        if (state.profile && !state.profile.near_expiry_days) {
          state.profile.near_expiry_days = 90; // Default 90 days policy
        }
      }
    },
    {
      version: 5,
      name: '005_returns_integrity_schema',
      up: (state) => {
        if (!Array.isArray(state.sale_returns)) state.sale_returns = [];
        if (!Array.isArray(state.sale_return_items)) state.sale_return_items = [];
        if (!Array.isArray(state.sale_return_allocations)) state.sale_return_allocations = [];
        if (!Array.isArray(state.purchase_returns)) state.purchase_returns = [];
        if (!Array.isArray(state.purchase_return_items)) state.purchase_return_items = [];
        if (!Array.isArray(state.purchase_return_allocations)) state.purchase_return_allocations = [];
      }
    },
    {
      version: 6,
      name: '006_financial_operations_and_cashbox_integrity',
      up: (state) => {
        if (!Array.isArray(state.cashboxes)) state.cashboxes = [];
        if (!Array.isArray(state.cash_transactions)) state.cash_transactions = [];
        if (!Array.isArray(state.customer_transactions)) state.customer_transactions = [];
        if (!Array.isArray(state.supplier_transactions)) state.supplier_transactions = [];
        if (!Array.isArray(state.expenses)) state.expenses = [];
        if (!Array.isArray(state.expense_categories)) state.expense_categories = [];
        if (!Array.isArray(state.work_shifts)) state.work_shifts = [];

        // Backfill / normalize existing expenses
        for (const exp of state.expenses) {
          if (!exp.status) exp.status = 'completed';
          if (!exp.expense_number) exp.expense_number = 'EXP-' + (exp.created_at ? new Date(exp.created_at).getTime().toString().slice(-6) : Math.random().toString(36).slice(2, 8));
        }

        // Ensure cashbox cached balances are numeric
        for (const cb of state.cashboxes) {
          if (typeof cb.cached_balance !== 'number') {
            cb.cached_balance = 0;
          }
        }
      }
    }
  ];

  static runMigrations(state: any): void {
    if (!state.schema_migrations) {
      state.schema_migrations = [];
    }

    const currentVersion = state.version || 0;
    const sorted = [...this.migrations].sort((a, b) => a.version - b.version);

    for (const m of sorted) {
      const alreadyApplied = state.schema_migrations.some((sm: any) => sm.version === m.version);
      if (m.version > currentVersion || !alreadyApplied) {
        try {
          m.up(state);
          state.version = Math.max(state.version || 0, m.version);
          state.schema_migrations.push({
            version: m.version,
            name: m.name,
            applied_at: Date.now()
          });
        } catch (err) {
          console.error(`Migration ${m.name} failed:`, err);
          throw new Error(`Migration ${m.name} failed: ${err}`);
        }
      }
    }
  }

  static getMigrationsList(): SchemaMigration[] {
    return this.migrations;
  }
}
