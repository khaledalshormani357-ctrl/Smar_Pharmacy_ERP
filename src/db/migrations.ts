// Database Migrations & Version Tracking for Smart Pharmacy ERP
// Strict versioned, deterministic, idempotent schema upgrades

import { ARABIC_RECONSTRUCTION_MAP } from '../utils/arabicCatalogRepair';

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
    },
    {
      version: 7,
      name: '007_repair_arabic_catalog_and_units',
      up: (state) => {
        // 1. Repair Arabic names and disease indications in products
        if (Array.isArray(state.products)) {
          for (const p of state.products) {
            if (p.disease_indication) {
              const orig = p.disease_indication.trim();
              const fixed = ARABIC_RECONSTRUCTION_MAP[orig];
              if (fixed) {
                p.disease_indication = fixed;
                p.name_ar = `${p.name_en || p.name_ar} (${fixed})`;
              }
            }
          }
        }

        // 2. Repair categories
        if (Array.isArray(state.categories)) {
          for (const c of state.categories) {
            if (c.name_ar && ARABIC_RECONSTRUCTION_MAP[c.name_ar.trim()]) {
              c.name_ar = ARABIC_RECONSTRUCTION_MAP[c.name_ar.trim()];
            }
          }
        }

        // 3. Ensure authoritative unit conversions for all products
        if (!Array.isArray(state.unit_conversions)) {
          state.unit_conversions = [];
        }

        if (Array.isArray(state.products)) {
          for (const prod of state.products) {
            const existing = state.unit_conversions.filter((uc: any) => uc.product_id === prod.id);
            const baseUnitName = prod.base_unit || 'حبة';

            // Check if base unit conversion exists
            let baseConv = existing.find((uc: any) => uc.conversion_factor === 1);
            if (!baseConv) {
              baseConv = {
                id: 'uc-' + Math.random().toString(36).substring(2, 9),
                product_id: prod.id,
                unit_name: baseUnitName,
                conversion_factor: 1,
                selling_price: prod.current_selling_price || 0,
                is_default_sale: true
              };
              state.unit_conversions.push(baseConv);
            } else if (baseConv.selling_price === 0 && prod.current_selling_price > 0) {
              baseConv.selling_price = prod.current_selling_price;
            }

            // Check if selling_unit exists and differs from base_unit
            if (prod.selling_unit && prod.selling_unit !== baseUnitName) {
              const saleConv = existing.find((uc: any) => uc.unit_name === prod.selling_unit);
              if (!saleConv) {
                const factor = prod.pack_size && prod.pack_size > 1 ? prod.pack_size : 10;
                state.unit_conversions.push({
                  id: 'uc-' + Math.random().toString(36).substring(2, 9),
                  product_id: prod.id,
                  unit_name: prod.selling_unit,
                  conversion_factor: factor,
                  selling_price: prod.current_selling_price > 0 ? prod.current_selling_price * factor : 0,
                  is_default_sale: false
                });
              }
            }
          }
        }
      }
    },
    {
      version: 8,
      name: '008_product_editor_and_unit_lifecycle',
      up: (state) => {
        // Ensure products have is_active, updated_at
        if (Array.isArray(state.products)) {
          for (const p of state.products) {
            if (p.is_active === undefined) {
              p.is_active = true;
            }
            if (!p.updated_at) {
              p.updated_at = p.created_at || Date.now();
            }
          }
        }
        // Ensure unit_conversions have is_active
        if (Array.isArray(state.unit_conversions)) {
          for (const uc of state.unit_conversions) {
            if (uc.is_active === undefined) {
              uc.is_active = true;
            }
          }
        }
      }
    }
  ];

  static runMigrations(state: any): void {
    if (!state) return;
    if (!state.schema_migrations) {
      state.schema_migrations = [];
    }

    // Requirement 02: Take pre-migration restore point snapshot
    let snapshot: string | null = null;
    try {
      snapshot = JSON.stringify(state);
    } catch (e) {
      console.warn('Could not serialize snapshot before migrations', e);
    }

    const currentVersion = state.version || 0;
    const sorted = [...this.migrations].sort((a, b) => a.version - b.version);

    try {
      for (const m of sorted) {
        const alreadyApplied = state.schema_migrations.some((sm: any) => sm.version === m.version);
        if (m.version > currentVersion || !alreadyApplied) {
          m.up(state);
          state.version = Math.max(state.version || 0, m.version);
          state.schema_migrations.push({
            version: m.version,
            name: m.name,
            applied_at: Date.now()
          });
        }
      }

      // Validate critical tables to prevent data corruption during APK update
      this.validateCriticalTables(state);
    } catch (err) {
      console.error('Migration runner failed, executing rollback to restore point:', err);
      if (snapshot) {
        try {
          const restored = JSON.parse(snapshot);
          Object.keys(state).forEach((k) => delete state[k]);
          Object.assign(state, restored);
          console.warn('Rolled back state to pre-migration restore point successfully.');
        } catch (rbErr) {
          console.error('Rollback failed:', rbErr);
        }
      }
      throw new Error(`Migration Runner failed: ${err}`);
    }
  }

  private static validateCriticalTables(state: any): void {
    const criticalCollections = [
      'products', 'batches', 'sales', 'sale_items', 'purchases', 'purchase_items',
      'customers', 'suppliers', 'cashboxes', 'cash_transactions', 'users', 'audit_logs'
    ];
    for (const key of criticalCollections) {
      if (!Array.isArray(state[key])) {
        throw new Error(`Critical collection '${key}' is missing or corrupted after migration.`);
      }
    }
    if (!state.profile || !state.profile.id) {
      throw new Error('Pharmacy profile is missing or invalid after migration.');
    }
  }

  static getMigrationsList(): SchemaMigration[] {
    return this.migrations;
  }
}
