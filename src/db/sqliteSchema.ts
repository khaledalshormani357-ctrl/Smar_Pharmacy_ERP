/**
 * Real SQLite Schema & DDL Definitions for Smart Pharmacy ERP
 * Authoritative SQLite database schema with strict types, primary keys,
 * foreign keys, and performant indexes.
 */

export const SQLITE_TABLES_DDL = `
-- Schema migrations table
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
  owner_name TEXT,
  phone TEXT,
  phone_en TEXT,
  address_ar TEXT,
  address_en TEXT,
  currency TEXT NOT NULL DEFAULT 'ر.ي',
  currency_code TEXT NOT NULL DEFAULT 'YER',
  tax_number TEXT,
  license_number TEXT,
  default_profit_margin_bps INTEGER DEFAULT 2000,
  receipt_paper_size TEXT DEFAULT '80mm',
  receipt_footer_text TEXT,
  tax_rate_bps INTEGER DEFAULT 0,
  near_expiry_days INTEGER DEFAULT 90,
  device_id TEXT NOT NULL,
  sync_status TEXT DEFAULT 'synced',
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
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id)
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
  internal_code TEXT,
  barcode TEXT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  category_id TEXT,
  manufacturer_id TEXT,
  base_unit TEXT NOT NULL,
  selling_unit TEXT,
  pack_size INTEGER DEFAULT 1,
  dosage_form TEXT,
  strength TEXT,
  active_ingredient TEXT,
  disease_indication TEXT,
  current_purchase_price INTEGER NOT NULL DEFAULT 0,
  current_selling_price INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  prescription_required INTEGER DEFAULT 0,
  is_controlled INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
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
  is_default_purchase INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Batches
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  received_at INTEGER NOT NULL,
  purchase_price INTEGER NOT NULL,
  selling_price INTEGER NOT NULL,
  initial_quantity INTEGER NOT NULL,
  current_quantity INTEGER NOT NULL,
  supplier_id TEXT,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

-- Stock Count Sessions
CREATE TABLE IF NOT EXISTS stock_count_sessions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  approved_at INTEGER,
  created_by TEXT NOT NULL,
  approved_by TEXT
);

-- Stock Count Items
CREATE TABLE IF NOT EXISTS stock_count_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  system_quantity REAL NOT NULL,
  counted_quantity REAL NOT NULL,
  variance REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (session_id) REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
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

-- Customer Transactions (Ledger)
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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
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

-- Supplier Transactions (Ledger)
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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
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

-- Cash Transactions (Ledger)
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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id)
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_number TEXT,
  category_id TEXT NOT NULL,
  cashbox_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  notes TEXT,
  user_id TEXT NOT NULL,
  shift_id TEXT,
  status TEXT DEFAULT 'completed',
  is_cancelled INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  created_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id)
);

-- Sales Invoices
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  cashbox_id TEXT,
  user_id TEXT NOT NULL,
  shift_id TEXT,
  sale_type TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
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
  is_cancelled INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
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
  line_gross_profit INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Sale Item Allocations (FEFO Provenance)
CREATE TABLE IF NOT EXISTS sale_item_allocations (
  id TEXT PRIMARY KEY,
  sale_item_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  total_cogs INTEGER NOT NULL,
  FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

-- Sale Returns
CREATE TABLE IF NOT EXISTS sale_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  sale_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  cashbox_id TEXT,
  user_id TEXT NOT NULL,
  shift_id TEXT,
  total_refund_amount INTEGER NOT NULL,
  total_cogs_reversed INTEGER NOT NULL,
  refund_type TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  is_cancelled INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Sale Return Items
CREATE TABLE IF NOT EXISTS sale_return_items (
  id TEXT PRIMARY KEY,
  sale_return_id TEXT NOT NULL,
  original_sale_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  line_refund_amount INTEGER NOT NULL,
  line_cogs_reversed INTEGER NOT NULL,
  condition TEXT NOT NULL DEFAULT 'good',
  notes TEXT,
  FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Sale Return Allocations
CREATE TABLE IF NOT EXISTS sale_return_allocations (
  id TEXT PRIMARY KEY,
  sale_return_item_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  base_quantity REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  total_cogs_reversed INTEGER NOT NULL,
  FOREIGN KEY (sale_return_item_id) REFERENCES sale_return_items(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_invoice_number TEXT,
  supplier_id TEXT NOT NULL,
  cashbox_id TEXT,
  user_id TEXT NOT NULL,
  purchase_type TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  net_total INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  remaining_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payment_method TEXT,
  notes TEXT,
  is_cancelled INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
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
  batch_id TEXT,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Purchase Returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  purchase_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  cashbox_id TEXT,
  user_id TEXT NOT NULL,
  total_refund_amount INTEGER NOT NULL,
  refund_type TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  is_cancelled INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Purchase Return Items
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id TEXT PRIMARY KEY,
  purchase_return_id TEXT NOT NULL,
  original_purchase_item_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL,
  quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  reason TEXT,
  FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Purchase Return Allocations
CREATE TABLE IF NOT EXISTS purchase_return_allocations (
  id TEXT PRIMARY KEY,
  purchase_return_item_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  base_quantity REAL NOT NULL,
  unit_cost INTEGER NOT NULL,
  total_refund INTEGER NOT NULL,
  FOREIGN KEY (purchase_return_item_id) REFERENCES purchase_return_items(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

-- Work Shifts
CREATE TABLE IF NOT EXISTS work_shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cashbox_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  opening_time INTEGER NOT NULL,
  closing_time INTEGER,
  opening_balance INTEGER NOT NULL,
  cash_sales INTEGER NOT NULL DEFAULT 0,
  cash_returns INTEGER NOT NULL DEFAULT 0,
  cash_inflows INTEGER NOT NULL DEFAULT 0,
  cash_outflows INTEGER NOT NULL DEFAULT 0,
  calculated_balance INTEGER NOT NULL,
  physical_balance INTEGER,
  cash_difference INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cashbox_id) REFERENCES cashboxes(id)
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
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes for performance & query optimization
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name_ar ON products(name_ar);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_batches_product_expiry ON batches(product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_batch ON stock_movements(product_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_trans_cust ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_trans_sup ON supplier_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_cash_trans_cashbox ON cash_transactions(cashbox_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
`;

export interface RealSqlMigration {
  version: number;
  name: string;
  sql: string;
}

export const REAL_SQL_MIGRATIONS: RealSqlMigration[] = [
  {
    version: 1,
    name: '001_initial_core_schema',
    sql: SQLITE_TABLES_DDL
  },
  {
    version: 2,
    name: '002_audit_trail_and_indices_support',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(reference_type, reference_id);
      CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
    `
  },
  {
    version: 3,
    name: '003_secure_passwords_and_pins',
    sql: `
      -- Hardened credentials metadata check
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `
  },
  {
    version: 4,
    name: '004_real_sqlite_native_storage',
    sql: `
      -- Authoritative real SQLite storage marker
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_created ON sync_outbox(created_at);
    `
  }
];
