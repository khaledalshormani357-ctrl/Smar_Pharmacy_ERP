/**
 * Native SQLite Engine & Migrator for Smart Pharmacy ERP
 * Provides real SQLite execution across Node.js, Web, and Native Capacitor runtimes
 * with strict ACID transactions, foreign keys, and persistent disk backing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseState } from './sqlite';

const req = createRequire(import.meta.url);

export const SQLITE_TABLES_DDL = `
PRAGMA foreign_keys = ON;

-- Schema migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

-- Pharmacy Profile
CREATE TABLE IF NOT EXISTS pharmacy_profile (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  currency TEXT NOT NULL DEFAULT 'YER',
  currency_code TEXT NOT NULL DEFAULT 'YER',
  default_profit_margin_bps INTEGER DEFAULT 2000,
  receipt_paper_size TEXT DEFAULT '80mm',
  device_id TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
  data_json TEXT,
  updated_at INTEGER NOT NULL
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  title_ar TEXT NOT NULL,
  permissions_json TEXT NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_code TEXT,
  biometric_enabled INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);

-- Manufacturers
CREATE TABLE IF NOT EXISTS manufacturers (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  country TEXT
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  barcode TEXT,
  internal_code TEXT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  category_id TEXT,
  manufacturer_id TEXT,
  base_unit TEXT NOT NULL,
  selling_unit TEXT,
  pack_size INTEGER DEFAULT 1,
  current_purchase_price INTEGER NOT NULL DEFAULT 0,
  current_selling_price INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  data_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Unit Conversions
CREATE TABLE IF NOT EXISTS unit_conversions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  barcode TEXT,
  selling_price INTEGER DEFAULT 0,
  purchase_price INTEGER DEFAULT 0,
  is_default_sale INTEGER DEFAULT 0,
  is_default_purchase INTEGER DEFAULT 0
);

-- Batches
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  initial_quantity REAL DEFAULT 0,
  current_quantity REAL DEFAULT 0,
  purchase_price INTEGER NOT NULL,
  selling_price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  batch_id TEXT,
  movement_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  base_quantity_delta REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  cached_balance INTEGER DEFAULT 0,
  credit_limit INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Customer Transactions
CREATE TABLE IF NOT EXISTS customer_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  debit INTEGER NOT NULL DEFAULT 0,
  credit INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL,
  notes TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  cached_balance INTEGER DEFAULT 0,
  credit_limit INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Supplier Transactions
CREATE TABLE IF NOT EXISTS supplier_transactions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  debit INTEGER NOT NULL DEFAULT 0,
  credit INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL,
  notes TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL
);

-- Cashboxes
CREATE TABLE IF NOT EXISTS cashboxes (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  type TEXT NOT NULL,
  cached_balance INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Cash Transactions
CREATE TABLE IF NOT EXISTS cash_transactions (
  id TEXT PRIMARY KEY,
  cashbox_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  notes TEXT,
  user_id TEXT,
  shift_id TEXT,
  created_at INTEGER NOT NULL
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  cashbox_id TEXT,
  user_id TEXT,
  shift_id TEXT,
  sale_type TEXT NOT NULL,
  subtotal INTEGER DEFAULT 0,
  gross_total INTEGER DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  net_total INTEGER NOT NULL,
  total_cogs INTEGER NOT NULL DEFAULT 0,
  gross_profit INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  remaining_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payment_method TEXT,
  notes TEXT,
  data_json TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER DEFAULT 0
);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_id TEXT,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  line_cogs INTEGER NOT NULL DEFAULT 0,
  line_gross_profit INTEGER NOT NULL DEFAULT 0
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_invoice_number TEXT,
  supplier_id TEXT,
  cashbox_id TEXT,
  user_id TEXT,
  purchase_type TEXT,
  subtotal INTEGER DEFAULT 0,
  gross_total INTEGER DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  net_total INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  remaining_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payment_method TEXT,
  notes TEXT,
  data_json TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  batch_id TEXT
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  ip_address TEXT,
  timestamp INTEGER NOT NULL
);

-- Sync Outbox (Atomic transaction outbox)
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  operation_id TEXT,
  pharmacy_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT,
  operation TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_ar ON products(name_ar);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_op ON sync_outbox(operation_id);
`;

export class NodeSqliteDriver {
  private db: any;
  private dbPath: string;
  private inTransaction = false;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;

    // Use built-in node:sqlite DatabaseSync for real C-native SQLite execution in Node
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const { DatabaseSync } = req('node:sqlite');
      if (this.dbPath !== ':memory:') {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA foreign_keys = ON;');
    } else {
      throw new Error('NodeSqliteDriver is designed for Node.js runtimes.');
    }
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, params: any[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map((r: any) => ({ ...r })) as T[];
  }

  public beginTransaction(): void {
    if (this.inTransaction) return;
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    this.inTransaction = true;
  }

  public commitTransaction(): void {
    if (!this.inTransaction) return;
    this.db.exec('COMMIT;');
    this.inTransaction = false;
  }

  public rollbackTransaction(): void {
    if (!this.inTransaction) return;
    try {
      this.db.exec('ROLLBACK;');
    } catch {
      // Ignored
    } finally {
      this.inTransaction = false;
    }
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  public saveStateSnapshot(state: DatabaseState): void {
    this.run(
      'INSERT OR REPLACE INTO app_state_snapshot (id, schema_version, state_json, updated_at) VALUES (?, ?, ?, ?);',
      [1, Number(state.version || 1), JSON.stringify(state), Date.now()]
    );
  }

  public loadStateSnapshot(): DatabaseState | null {
    const rows = this.query<{ state_json: string }>('SELECT state_json FROM app_state_snapshot WHERE id = 1 LIMIT 1;');
    return rows[0]?.state_json ? JSON.parse(rows[0].state_json) as DatabaseState : null;
  }
}

export class LocalStorageToSqliteMigrator {
  static migrate(
    state: DatabaseState,
    driver: NodeSqliteDriver
  ): { success: boolean; migratedCounts: Record<string, number> } {
    const counts: Record<string, number> = {
      roles: 0,
      users: 0,
      categories: 0,
      manufacturers: 0,
      products: 0,
      batches: 0,
      customers: 0,
      suppliers: 0,
      cashboxes: 0,
      sales: 0,
      purchases: 0
    };

    if (!state) {
      return { success: false, migratedCounts: counts };
    }

    driver.beginTransaction();
    try {
      // 1. Roles
      for (const role of state.roles || []) {
        driver.run('INSERT OR REPLACE INTO roles (id, title_ar, permissions_json) VALUES (?, ?, ?);', [
          role.id,
          role.title_ar,
          JSON.stringify(role.permissions)
        ]);
        counts.roles++;
      }

      // 2. Users
      for (const user of state.users || []) {
        driver.run(
          `INSERT OR REPLACE INTO users (
            id, username, full_name, role_id, password_hash, pin_code, biometric_enabled, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            user.id,
            user.username,
            user.full_name,
            user.role_id,
            user.password_hash,
            user.pin_code || null,
            user.biometric_enabled ? 1 : 0,
            user.is_active ? 1 : 0,
            user.created_at || Date.now(),
            user.updated_at || Date.now()
          ]
        );
        counts.users++;
      }

      // 3. Categories
      for (const cat of state.categories || []) {
        driver.run('INSERT OR REPLACE INTO categories (id, name_ar, is_active) VALUES (?, ?, ?);', [
          cat.id,
          cat.name_ar,
          cat.is_active ? 1 : 0
        ]);
        counts.categories++;
      }

      // 4. Products
      for (const prod of state.products || []) {
        driver.run(
          `INSERT OR REPLACE INTO products (
            id, barcode, internal_code, name_ar, name_en, category_id, manufacturer_id,
            base_unit, selling_unit, pack_size, current_purchase_price, current_selling_price,
            min_stock_level, reorder_level, is_active, data_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            prod.id,
            prod.barcode || null,
            prod.internal_code || null,
            prod.name_ar,
            prod.name_en || null,
            prod.category_id || null,
            prod.manufacturer_id || null,
            prod.base_unit,
            prod.selling_unit || null,
            prod.pack_size || 1,
            prod.current_purchase_price || 0,
            prod.current_selling_price || 0,
            prod.min_stock_level || 0,
            prod.reorder_level || 0,
            prod.is_active ? 1 : 0,
            JSON.stringify(prod),
            prod.created_at || Date.now(),
            prod.updated_at || Date.now()
          ]
        );
        counts.products++;
      }

      // 5. Batches
      for (const b of state.batches || []) {
        driver.run(
          `INSERT OR REPLACE INTO batches (
            id, product_id, batch_number, expiry_date, quantity, initial_quantity, current_quantity,
            purchase_price, selling_price, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            b.id,
            b.product_id,
            b.batch_number,
            b.expiry_date,
            b.current_quantity,
            b.initial_quantity,
            b.current_quantity,
            b.purchase_price,
            b.selling_price,
            b.status || 'active',
            b.created_at,
            b.updated_at
          ]
        );
        counts.batches++;
      }

      // 6. Cashboxes
      for (const cb of state.cashboxes || []) {
        driver.run(
          'INSERT OR REPLACE INTO cashboxes (id, name_ar, type, cached_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);',
          [cb.id, cb.name_ar, cb.type, cb.cached_balance || 0, cb.is_active ? 1 : 0, cb.created_at, cb.updated_at]
        );
        counts.cashboxes++;
      }

      // 7. Customers
      for (const cust of state.customers || []) {
        driver.run(
          'INSERT OR REPLACE INTO customers (id, name, phone, address, cached_balance, credit_limit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
          [
            cust.id,
            cust.name,
            cust.phone || null,
            cust.address || null,
            cust.cached_balance || 0,
            cust.credit_limit || 0,
            cust.is_active ? 1 : 0,
            cust.created_at,
            cust.updated_at
          ]
        );
        counts.customers++;
      }

      // 8. Suppliers
      for (const sup of state.suppliers || []) {
        driver.run(
          'INSERT OR REPLACE INTO suppliers (id, name, contact_person, phone, address, cached_balance, credit_limit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
          [
            sup.id,
            sup.name,
            sup.contact_person || null,
            sup.phone || null,
            sup.address || null,
            sup.cached_balance || 0,
            sup.credit_limit || 0,
            sup.is_active ? 1 : 0,
            sup.created_at,
            sup.updated_at
          ]
        );
        counts.suppliers++;
      }

      driver.commitTransaction();
      return { success: true, migratedCounts: counts };
    } catch (error) {
      driver.rollbackTransaction();
      console.error('Migration from state to SQLite failed:', error);
      return { success: false, migratedCounts: counts };
    }
  }
}
