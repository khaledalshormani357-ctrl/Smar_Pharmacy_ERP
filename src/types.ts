// Types & Interfaces for Smart Pharmacy ERP
// Strict Money-in-Minor-Units and Exact FEFO Allocations

export type ID = string;

export interface PharmacyProfile {
  id: ID;
  name_ar: string;
  name_en?: string;
  owner_name?: string;
  phone: string;
  phone_en?: string;
  address_ar?: string;
  address_en?: string;
  currency: string;
  currency_code: string;
  tax_number?: string;
  license_number?: string;
  logo_data_url?: string;
  default_profit_margin_bps: number; // e.g. 2000 = 20.00%
  receipt_paper_size: '80mm' | 'A4' | '58mm';
  receipt_footer_text?: string;
  tax_rate_bps?: number; // e.g. 500 = 5.00%, 0 = exempt/disabled (configurable VAT)
  near_expiry_days?: number; // Configurable expiry alert threshold in days (e.g. 30, 60, 90)
  device_id: string;
  sync_status: 'synced' | 'pending';
  updated_at: number;
}

export type RoleId = 'admin' | 'pharmacist' | 'cashier' | 'storekeeper' | 'manager';

export interface Role {
  id: RoleId;
  title_ar: string;
  permissions: string[];
}

export interface User {
  id: ID;
  username: string;
  full_name: string;
  password_hash: string;
  pin_code?: string;
  role_id: RoleId;
  biometric_enabled: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface Category {
  id: ID;
  name_ar: string;
  name_en?: string;
  is_active: boolean;
}

export interface Manufacturer {
  id: ID;
  name_ar: string;
  name_en?: string;
  country?: string;
}

export type DosageForm = 'tablet' | 'capsule' | 'syrup' | 'suspension' | 'injection' | 'ointment' | 'drops' | 'cream' | 'spray' | 'other';

export interface Product {
  id: ID;
  barcode?: string;
  internal_code: string;
  code?: string;
  name_ar: string;
  name_en?: string;
  generic_name?: string;
  active_ingredient?: string;
  strength?: string;
  country?: string;
  country_of_origin?: string;
  description?: string;
  category_id?: ID;
  manufacturer_id?: ID;
  dosage_form: DosageForm;
  base_unit: string; // e.g. 'حبة', 'مل', 'أمبولة'
  selling_unit?: string;
  pack_size: number;
  current_purchase_price: number; // In minor units (e.g. 10000 = 100.00 YER)
  current_selling_price: number;  // In minor units
  min_stock_level: number;        // in base unit
  reorder_level: number;          // in base unit
  prescription_required: boolean;
  is_controlled: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
  deleted_at?: number;
}

export interface UnitConversion {
  id: ID;
  product_id: ID;
  unit_name: string;      // e.g. 'علبة', 'شريط'
  conversion_factor: number; // how many base units (e.g. 10)
  selling_price: number;     // in minor units
  purchase_price?: number;   // in minor units
  is_default_sale: boolean;
  is_active?: boolean;
}

export interface Batch {
  id: ID;
  product_id: ID;
  batch_number: string;
  expiry_date: string; // YYYY-MM-DD
  received_at: number; // epoch
  purchase_price: number; // per base unit in minor units
  selling_price: number;  // per base unit in minor units
  initial_quantity: number; // base unit
  current_quantity: number; // base unit
  supplier_id?: ID;
  status: 'active' | 'expired' | 'depleted' | 'quarantine';
  created_at: number;
  updated_at: number;
}

export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'purchase_return'
  | 'sale_return'
  | 'opening_balance'
  | 'adjustment_plus'
  | 'adjustment_minus'
  | 'expired_writeoff';

export interface StockMovement {
  id: ID;
  product_id: ID;
  batch_id: ID;
  movement_type: StockMovementType;
  reference_type: string;
  reference_id: string;
  quantity_delta: number; // base units (+ or -)
  balance_after: number;
  product_total_balance_after: number;
  unit_cost: number; // in minor units
  reason?: string;
  created_by: ID;
  created_at: number;
}

export interface Customer {
  id: ID;
  name: string;
  phone?: string;
  address?: string;
  tax_number?: string;
  cached_balance: number; // In minor units (positive = debt on customer)
  balance?: number;
  current_balance?: number;
  credit_limit: number;
  max_debt_limit?: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface CustomerTransaction {
  id: ID;
  customer_id: ID;
  transaction_type: 'sale_credit' | 'payment_receipt' | 'sale_return_credit' | 'opening_balance' | 'adjustment' | 'reversal';
  reference_type: string;
  reference_id: string;
  debit: number;  // increases customer debt
  credit: number; // decreases customer debt
  balance_after: number;
  notes?: string;
  created_by: ID;
  created_at: number;
  business_date?: string;
}

export interface Supplier {
  id: ID;
  name: string; // for backwards compatibility
  name_ar?: string;
  name_en?: string;
  contact_person?: string;
  phone: string;
  address?: string;
  tax_number?: string;
  opening_balance?: number; // In minor units
  credit_limit?: number; // In minor units
  cached_balance: number; // In minor units (positive = payable to supplier)
  balance?: number;
  current_balance?: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SupplierTransaction {
  id: ID;
  supplier_id: ID;
  transaction_type: 'purchase_credit' | 'payment_voucher' | 'purchase_return_credit' | 'purchase_cancellation' | 'opening_balance' | 'adjustment' | 'reversal';
  reference_type: string;
  reference_id: string;
  debit: number;  // decreases supplier payable
  credit: number; // increases supplier payable
  balance_after: number;
  notes?: string;
  created_by: ID;
  created_at: number;
  business_date?: string;
}

export interface Cashbox {
  id: ID;
  name_ar: string;
  type: 'daily' | 'main' | 'bank';
  cached_balance: number; // in minor units
  balance?: number;
  current_balance?: number;
  is_default?: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export type CashTransactionType =
  | 'sale_cash'
  | 'customer_payment'
  | 'supplier_payment'
  | 'expense'
  | 'purchase_cash'
  | 'sale_return_cash'
  | 'purchase_return_cash'
  | 'transfer_in'
  | 'transfer_out'
  | 'opening_balance'
  | 'adjustment'
  | 'reversal';

export interface CashTransaction {
  id: ID;
  cashbox_id: ID;
  type: CashTransactionType;
  direction: 'IN' | 'OUT';
  amount: number; // always positive in minor units
  balance_after: number;
  reference_type: string;
  reference_id: string;
  statement: string;
  created_by: ID;
  created_at: number;
  shift_id?: ID;
  business_date?: string;
}

export interface ExpenseCategory {
  id: ID;
  name_ar: string;
  name_en?: string;
  is_active: boolean;
}

export interface Expense {
  id: ID;
  expense_number?: string;
  category_id: ID;
  cashbox_id: ID;
  amount: number; // in minor units
  statement: string;
  recipient?: string;
  payment_method?: 'cash' | 'bank' | 'other';
  status?: 'completed' | 'cancelled';
  cancellation_reason?: string;
  cancelled_at?: number;
  cancelled_by?: ID;
  created_by: ID;
  created_at: number;
  business_date?: string;
}

export interface Sale {
  id: ID;
  invoice_number: string;
  customer_id?: ID;
  user_id: ID;
  shift_id?: ID;
  sale_type: 'cash' | 'credit';
  payment_method: string;
  cashbox_id?: ID;
  subtotal: number;        // in minor units
  discount_amount: number; // in minor units
  tax_amount: number;      // in minor units
  net_total: number;       // subtotal - discount + tax
  paid_amount: number;     // in minor units
  remaining_amount: number;// in minor units
  total_cogs: number;      // Historical purchase cost (minor units)
  gross_profit: number;    // net_total - total_cogs (minor units)
  status: 'completed' | 'cancelled' | 'returned_partially' | 'returned_fully';
  cancellation_reason?: string;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface SaleItem {
  id: ID;
  sale_id: ID;
  product_id: ID;
  unit_name: string;
  unit_factor: number;
  quantity: number;
  base_quantity: number;
  unit_price: number; // minor units
  discount_amount: number;
  line_total: number; // minor units
  item_cogs: number;  // historical cost sum from allocations
  item_gross_profit: number;
  returned_quantity?: number; // for sales returns tracking provenance
  product_name_snapshot?: string;
}

export interface SaleItemAllocation {
  id: ID;
  sale_item_id: ID;
  sale_id: ID;
  product_id: ID;
  batch_id: ID;
  allocated_base_quantity: number;
  returned_base_quantity?: number; // quantity returned from this specific allocation
  unit_purchase_cost: number; // exact historical unit cost
  total_cost: number; // allocated_base_quantity * unit_purchase_cost
  created_at: number;
}

export type ReturnReason =
  | 'damaged'
  | 'expired'
  | 'wrong_item'
  | 'customer_request'
  | 'supplier_rejection'
  | 'recall'
  | 'quality_issue'
  | 'other';

export type ItemCondition = 'resellable' | 'damaged' | 'expired' | 'quarantine';

export interface SaleReturn {
  id: ID;
  return_number: string;
  original_sale_id?: ID;
  customer_id?: ID;
  return_type: 'by_invoice' | 'direct';
  settlement_method: 'cash' | 'credit';
  cashbox_id?: ID;
  subtotal: number;
  tax_amount?: number;
  discount_amount?: number;
  total_refund_amount: number;
  total_cogs_reversed: number;
  gross_profit_reversed: number;
  return_reason: string;
  item_condition?: ItemCondition;
  status: 'completed' | 'cancelled';
  cancellation_reason?: string;
  cancelled_at?: number;
  cancelled_by?: ID;
  created_by: ID;
  created_at: number;
  updated_at?: number;
}

export interface SaleReturnItem {
  id: ID;
  return_id: ID;
  original_sale_item_id?: ID;
  product_id: ID;
  target_batch_id: ID;
  unit_name: string;
  unit_factor: number;
  returned_quantity: number;
  returned_base_quantity: number;
  refund_unit_price: number;
  line_refund_total: number;
  reversed_unit_cost: number;
  reversed_line_cogs: number;
  item_condition?: ItemCondition;
  item_reason?: string;
}

export interface SaleReturnAllocation {
  id: ID;
  return_id: ID;
  return_item_id: ID;
  sale_item_id?: ID;
  sale_item_allocation_id?: ID;
  batch_id: ID;
  returned_base_quantity: number;
  unit_purchase_cost: number;
  total_cogs_reversed: number;
  created_at: number;
}

export interface Purchase {
  id: ID;
  invoice_number: string; // Supplier's invoice number
  internal_number: string;
  supplier_id: ID;
  user_id: ID;
  purchase_date: string;
  payment_type: 'cash' | 'credit' | 'partial';
  cashbox_id?: ID;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  net_total: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'posted' | 'cancelled' | 'returned_partially' | 'returned_fully';
  cancellation_reason?: string;
  cancelled_at?: number;
  cancelled_by?: ID;
  notes?: string;
  created_at: number;
  updated_at?: number;
}

export interface PurchaseItem {
  id: ID;
  purchase_id: ID;
  product_id: ID;
  product_name_snapshot?: string;
  product_code_snapshot?: string;
  batch_id: ID;
  batch_number: string;
  expiry_date: string;
  unit_name: string;
  unit_factor: number;
  quantity: number;
  base_quantity: number;
  unit_purchase_price: number;
  unit_cost_base: number;
  unit_selling_price: number;
  discount_amount?: number;
  tax_amount?: number;
  line_total: number;
  returned_quantity?: number; // for purchase returns tracking provenance
  created_at: number;
}

export interface PurchaseReturn {
  id: ID;
  return_number: string;
  original_purchase_id?: ID;
  supplier_id: ID;
  return_type: 'by_invoice' | 'direct';
  settlement_method: 'cash' | 'credit';
  cashbox_id?: ID;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  total_refund_amount: number;
  return_reason: string;
  status: 'completed' | 'cancelled';
  cancellation_reason?: string;
  cancelled_at?: number;
  cancelled_by?: ID;
  created_by: ID;
  created_at: number;
  updated_at?: number;
}

export interface PurchaseReturnItem {
  id: ID;
  return_id: ID;
  original_purchase_item_id?: ID;
  product_id: ID;
  batch_id: ID;
  unit_name?: string;
  unit_factor?: number;
  returned_quantity: number;
  returned_base_quantity: number;
  unit_refund_price: number;
  unit_cost_base?: number;
  line_total: number;
  item_reason?: string;
}

export interface PurchaseReturnAllocation {
  id: ID;
  return_id: ID;
  return_item_id: ID;
  original_purchase_item_id: ID;
  batch_id: ID;
  returned_base_quantity: number;
  unit_cost_base: number;
  line_cost: number;
  created_at: number;
}

export interface WorkShift {
  id: ID;
  shift_number?: string;
  user_id: ID;
  cashbox_id: ID;
  started_at: number;
  closed_at?: number;
  opening_cash: number;
  expected_cash: number;
  actual_cash: number;
  cash_difference: number;
  total_sales_cash: number;
  total_sales_credit: number;
  total_returns_cash: number;
  total_expenses: number;
  total_customer_collections?: number;
  total_supplier_payments?: number;
  total_purchase_cash?: number;
  total_purchase_return_cash?: number;
  status: 'open' | 'closed';
  closing_notes?: string;
  business_date?: string;
}

export interface AuditLog {
  id: ID;
  user_id: ID;
  action: string;
  entity: string;
  entity_id: string;
  payload_before?: string;
  payload_after?: string;
  reason?: string;
  device_id: string;
  created_at: number;
}

export interface StockCountSession {
  id: ID;
  session_number: string;
  title: string;
  status: 'draft' | 'in_progress' | 'approved' | 'cancelled';
  notes?: string;
  created_by: ID;
  approved_by?: ID;
  created_at: number;
  approved_at?: number;
}

export interface StockCountItem {
  id: ID;
  session_id: ID;
  product_id: ID;
  batch_id: ID;
  system_quantity_base: number;
  physical_quantity_base: number;
  variance_base: number; // physical - system
  unit_cost: number;     // historical unit cost from batch
  variance_cost: number; // variance_base * unit_cost
  counted_at: number;
}

// Cart Item in POS View
export interface CartItem {
  productId: ID;
  productName: string;
  genericName?: string;
  barcode?: string;
  unitName: string;
  unitFactor: number;
  quantity: number;
  unitPrice: number; // in minor units
  discountAmount: number;
  availableUnits: { unitName: string; factor: number; price: number }[];
  selectedBatchId?: ID; // if pharmacist manually overrode FEFO
  availableStockBase: number;
}

// ==========================================
// PHASE 7: REPORTING & DOCUMENT MODELS
// ==========================================

export interface ReportFilter {
  date_from?: number; // timestamp in ms
  date_to?: number;   // timestamp in ms
  business_date_from?: string; // YYYY-MM-DD
  business_date_to?: string;   // YYYY-MM-DD
  product_id?: ID;
  category_id?: ID;
  manufacturer_id?: ID;
  customer_id?: ID;
  supplier_id?: ID;
  user_id?: ID;
  cashier_id?: ID;
  shift_id?: ID;
  warehouse_id?: ID;
  document_type?: string;
  payment_type?: string;
  status?: string;
  expiry_threshold_days?: number; // 30, 60, 90 etc.
}

// 1. Sales Reports
export interface SalesSummaryReport {
  gross_sales: number;
  discounts: number;
  net_sales: number;
  cash_sales: number;
  credit_sales: number;
  returned_sales: number;
  net_sales_after_returns: number;
  cogs: number; // Historical purchase cost reversed for returns
  gross_profit: number; // net_sales_after_returns - cogs
  invoice_count: number;
  returned_invoice_count: number;
}

export interface SalesByProductItem {
  product_id: ID;
  product_name: string;
  product_code: string;
  category_name?: string;
  quantity_sold: number;
  base_quantity: number;
  selling_unit: string;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
}

export interface SalesByProductReport {
  total_quantity_sold: number;
  total_net_sales: number;
  total_cogs: number;
  total_gross_profit: number;
  items: SalesByProductItem[];
}

export interface SalesByCustomerItem {
  customer_id: ID;
  customer_name: string;
  phone?: string;
  invoices_count: number;
  total_sales: number;
  payments: number;
  returns: number;
  outstanding_balance: number; // derived from CustomerTransaction ledger
}

export interface SalesByCustomerReport {
  total_sales: number;
  total_payments: number;
  total_returns: number;
  total_outstanding: number;
  customers: SalesByCustomerItem[];
}

export interface SalesByUserItem {
  user_id: ID;
  username: string;
  full_name: string;
  invoice_count: number;
  sales_total: number;
  returns: number;
  net_sales: number;
  cash_collected: number;
}

export interface SalesByUserReport {
  total_invoices: number;
  total_net_sales: number;
  total_cash_collected: number;
  users: SalesByUserItem[];
}

// 2. Purchase Reports
export interface PurchaseSummaryReport {
  total_purchases: number;
  cash_purchases: number;
  credit_purchases: number;
  purchase_returns: number;
  net_purchases: number;
  purchase_count: number;
  returned_count: number;
}

export interface PurchasesBySupplierItem {
  supplier_id: ID;
  supplier_name: string;
  phone: string;
  purchase_count: number;
  purchases: number;
  payments: number;
  returns: number;
  outstanding_payable: number; // derived from SupplierTransaction ledger
}

export interface PurchasesBySupplierReport {
  total_purchases: number;
  total_payments: number;
  total_returns: number;
  total_outstanding_payable: number;
  suppliers: PurchasesBySupplierItem[];
}

export interface PurchasesByProductItem {
  product_id: ID;
  product_name: string;
  quantity_purchased: number;
  base_quantity: number;
  purchase_cost_unit: number; // immutable unit cost base
  total_cost: number;
  batches: Array<{ batch_number: string; expiry_date: string; quantity: number }>;
}

export interface PurchasesByProductReport {
  total_base_quantity: number;
  total_cost: number;
  products: PurchasesByProductItem[];
}

// 3. Inventory Reports
export interface CurrentStockItem {
  product_id: ID;
  product_name: string;
  code: string;
  base_unit: string;
  current_quantity: number;
  available_quantity: number;
  quarantined_quantity: number;
  estimated_inventory_value: number; // sum(batch.balance * batch.purchase_cost)
}

export interface CurrentStockReport {
  total_products_count: number;
  total_base_units: number;
  total_available_units: number;
  total_quarantined_units: number;
  total_inventory_value: number;
  items: CurrentStockItem[];
}

export interface BatchReportItem {
  product_id: ID;
  product_name: string;
  batch_id: ID;
  batch_number: string;
  expiry_date: string;
  received_date: number;
  remaining_quantity: number;
  unit_cost: number;
  stock_status: 'active' | 'expired' | 'depleted' | 'quarantine';
  total_batch_value: number;
  current_quantity?: number;
  total_cost_value?: number;
}

export interface BatchReport {
  total_batches: number;
  total_stock_units: number;
  total_valuation: number;
  batches: BatchReportItem[];
}

export interface NearExpiryItem {
  product_id: ID;
  product_name: string;
  batch_id: ID;
  batch_number: string;
  expiry_date: string;
  days_remaining: number;
  remaining_quantity: number;
  unit_cost: number;
  total_value: number;
  status_category: 'expired' | 'near_expiry' | 'valid';
}

export interface NearExpiryReport {
  threshold_days: number;
  total_expired_batches: number;
  total_near_expiry_batches: number;
  total_expired_value: number;
  total_near_expiry_value: number;
  items: NearExpiryItem[];
}

export interface ExpiredStockItem {
  product_id: ID;
  product_name: string;
  batch_id: ID;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  value: number;
  status: string;
  days_expired?: number;
  total_loss_value?: number;
}

export interface ExpiredStockReport {
  total_expired_units: number;
  total_expired_value: number;
  items: ExpiredStockItem[];
}

export interface StockMovementReportItem {
  id?: ID;
  date: number;
  business_date?: string;
  product_id: ID;
  product_name: string;
  movement_type: StockMovementType;
  quantity_delta: number;
  balance_after: number;
  reference_document: string;
  user_name: string;
  batch_number: string;
  unit_cost: number;
}

export interface StockMovementReport {
  total_movements: number;
  movements: StockMovementReportItem[];
}

// 4. Cashbox Reports
export interface CashFlowReport {
  cashbox_id: ID;
  cashbox_name: string;
  opening_balance: number;
  total_in: number;
  total_out: number;
  closing_balance: number;
  net_cash_flow?: number;
  inflows_breakdown: {
    sales_cash: number;
    customer_payments: number;
    purchase_returns: number;
    adjustments_in: number;
    transfers_in: number;
  };
  outflows_breakdown: {
    purchases_cash: number;
    supplier_payments: number;
    expenses: number;
    sales_returns: number;
    adjustments_out: number;
    transfers_out: number;
  };
  inflows?: {
    sales: number;
    customer_payments: number;
    purchase_returns: number;
    adjustments_in: number;
    transfers_in: number;
    total: number;
  };
  outflows?: {
    purchases: number;
    supplier_payments: number;
    expenses: number;
    sales_returns: number;
    adjustments_out: number;
    transfers_out: number;
    total: number;
  };
}

export interface CashTransactionsStatementReport {
  cashbox_id: ID;
  cashbox_name: string;
  opening_balance: number;
  closing_balance: number;
  items: Array<{
    id: ID;
    date: number;
    business_date?: string;
    reference: string;
    transaction_type: CashTransactionType;
    description: string;
    in_amount: number;
    out_amount: number;
    running_balance: number;
    user_name: string;
    shift_id?: ID;
  }>;
}

// 5. Profitability Report
export interface ProfitabilityReport {
  gross_sales: number;
  discounts: number;
  net_sales: number;
  sales_returns: number;
  net_sales_after_returns: number;
  historical_cogs: number;
  cogs_reversed: number;
  net_cogs: number;
  gross_profit: number; // Net Sales After Returns - Net COGS
  operating_expenses: number;
  operating_margin: number; // Gross Profit - Operating Expenses
}

// 6. Generic Document Engine Models
export type DocumentType =
  | 'sale_invoice'
  | 'purchase_bill'
  | 'sale_return'
  | 'purchase_return'
  | 'customer_statement'
  | 'supplier_statement'
  | 'report_summary';

export interface DocumentLineItem {
  id: string;
  name: string;
  code?: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  batch_number?: string;
  expiry_date?: string;
  reason?: string;
}

export interface DocumentData {
  document_type: DocumentType;
  document_number: string;
  business_date: string;
  created_at: number;
  pharmacy: PharmacyProfile;
  party_name?: string; // customer or supplier name
  party_phone?: string;
  party_address?: string;
  party_tax_number?: string;
  responsible_user: string;
  lines: DocumentLineItem[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  net_total: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
  payment_method: string;
  status: string;
  notes?: string;
  original_reference?: string; // for returns
  financial_summary?: Record<string, number>;
}

// 7. Print & Share Models
export interface PrintOptions {
  paper_size?: '80mm' | '58mm' | 'A4';
  copies?: number;
  silent?: boolean;
}

export interface PrintResult {
  success: boolean;
  message?: string;
  method: 'browser_print' | 'native_android' | 'thermal_escpos' | 'pdf_download';
}

export interface ShareOptions {
  title?: string;
  text?: string;
  file_name?: string;
  mime_type?: string;
}

export interface ShareResult {
  success: boolean;
  method: 'native_share' | 'web_share' | 'file_download' | 'whatsapp';
  message?: string;
}

// 8. Multi-Tenant Cloud Sync & Outbox Models
export type SyncOutboxStatus = 'pending' | 'processing' | 'synced' | 'failed' | 'retry';

export interface SyncOutboxEntry {
  id: string;
  operation_id: string;
  pharmacy_id: string;
  entity_type:
    | 'pharmacy_profile'
    | 'product'
    | 'batch'
    | 'sale'
    | 'sale_item'
    | 'purchase'
    | 'cash_transaction'
    | 'customer'
    | 'supplier'
    | 'stock_movement'
    | 'audit_log'
    | 'shift';
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload: any;
  status: SyncOutboxStatus;
  retry_count: number;
  max_retries: number;
  last_attempt_at?: number;
  next_retry_at?: number;
  last_error?: string;
  created_at: number;
  synced_at?: number;
}

export interface SyncSummary {
  total_queued: number;
  pending_count: number;
  synced_count: number;
  failed_count: number;
  last_sync_time?: number;
  in_progress: boolean;
}

export interface PharmacyMember {
  user_id: string;
  pharmacy_id: string;
  role: 'admin' | 'pharmacist' | 'cashier' | 'storekeeper';
  is_active: boolean;
  created_at: number;
}

