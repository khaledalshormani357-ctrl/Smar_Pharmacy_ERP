// ============================================================================
// PHASE 7 — REPORTS, DOCUMENTS, PDF, PRINT & SHARE TEST SUITE
// Verifies Report Integrity, Real PDF Generation, Arabic Shaping, and Export
// ============================================================================

import { db } from './src/db/sqlite';
import { ReportService } from './src/services/ReportService';
import { DocumentService } from './src/services/DocumentService';
import { PdfService } from './src/services/PdfService';
import { ExportService } from './src/services/ExportService';
import { PrintService } from './src/services/PrintService';
import { ShareService } from './src/services/ShareService';
import { ArabicShaper } from './src/utils/arabicShaper';
import { Money } from './src/utils/money';
import {
  Product,
  Batch,
  Sale,
  SaleItem,
  SaleItemAllocation,
  SaleReturn,
  SaleReturnItem,
  Purchase,
  PurchaseItem,
  Cashbox,
  CashTransaction,
  Expense,
  Customer,
  Supplier,
  User,
  StockMovement
} from './src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    failed++;
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    passed++;
    console.log(`✅ PASS: ${msg}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 7 VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // --------------------------------------------------------------------------
  // 1. SETUP CLEAN ISOLATED TEST DATA ENVIRONMENT
  // --------------------------------------------------------------------------
  console.log('--- 1. Setting up Isolated Transactional Ledger Data ---');

  const adminUser: User = {
    id: 'usr-p7-admin',
    username: 'admin_p7',
    full_name: 'د. أحمد الصيدلي',
    role_id: 'admin',
    password_hash: 'hash',
    pin_code: '1234',
    biometric_enabled: false,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const cashierUser: User = {
    id: 'usr-p7-cashier',
    username: 'cashier_p7',
    full_name: 'محمد الكاشير',
    role_id: 'cashier',
    password_hash: 'hash',
    pin_code: '1234',
    biometric_enabled: false,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const customer1: any = {
    id: 'cust-p7-01',
    name: 'خالد عبدالله',
    phone: '777111222',
    address: 'شارع الزبيري، صنعاء',
    balance: 1300,
    cached_balance: 1300,
    max_debt_limit: 50000,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const supplier1: any = {
    id: 'supp-p7-01',
    name: 'شركة الرازي للأدوية',
    name_ar: 'شركة الرازي للأدوية والمستلزمات',
    phone: '01-445566',
    address: 'شارع تعز، صنعاء',
    balance: 40000,
    cached_balance: 40000,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const cashbox1: any = {
    id: 'cb-p7-01',
    name_ar: 'صندوق البيع الرئيسي',
    balance: 100000, // 1000.00 YER
    is_default: true,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const product1: any = {
    id: 'prod-p7-01',
    code: 'MED-001',
    internal_code: 'MED-001',
    name_ar: 'بنادول إكسترا أقراص',
    name_en: 'Panadol Extra Tablets',
    generic_name: 'Paracetamol + Caffeine',
    category_id: 'cat-01',
    base_unit: 'قرص',
    selling_unit: 'شريط',
    conversions: [
      { unit_name: 'شريط', conversion_factor: 10, selling_price: 1500, is_default_sale: true },
      { unit_name: 'قرص', conversion_factor: 1, selling_price: 150 }
    ],
    purchase_unit: 'باكت',
    purchase_to_base_factor: 20,
    current_cost_price: 1000, // 10.00 YER per base unit
    current_selling_price: 1500,
    min_stock_limit: 10,
    max_stock_limit: 100,
    reorder_level: 20,
    tax_rate_bps: 0,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const product2: any = {
    id: 'prod-p7-02',
    code: 'MED-002',
    internal_code: 'MED-002',
    name_ar: 'أموكسيسيلين 500 ملجم كبسولات',
    name_en: 'Amoxicillin 500mg Caps',
    generic_name: 'Amoxicillin',
    category_id: 'cat-01',
    base_unit: 'كبسولة',
    selling_unit: 'شريط',
    conversions: [
      { unit_name: 'شريط', conversion_factor: 10, selling_price: 2000, is_default_sale: true },
      { unit_name: 'كبسولة', conversion_factor: 1, selling_price: 200 }
    ],
    purchase_unit: 'باكت',
    purchase_to_base_factor: 20,
    current_cost_price: 1200,
    current_selling_price: 2000,
    min_stock_limit: 10,
    max_stock_limit: 100,
    reorder_level: 20,
    tax_rate_bps: 0,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  // Batches:
  // Batch 1: Panadol - normal, 50 units remaining, cost 1000 (10.00 YER)
  const batch1: any = {
    id: 'batch-p7-01',
    product_id: product1.id,
    batch_number: 'B-PAND-001',
    expiry_date: '2027-12-31',
    purchase_price: 1000,
    selling_price: 1500,
    initial_quantity: 100,
    current_quantity: 50,
    status: 'available',
    created_at: now - 30 * dayMs,
    updated_at: now
  };

  // Batch 2: Panadol - near expiry (expires in 20 days), 20 units, cost 1000
  const nearExpiryDate = new Date(now + 20 * dayMs).toISOString().split('T')[0];
  const batch2: any = {
    id: 'batch-p7-02',
    product_id: product1.id,
    batch_number: 'B-PAND-002-EXP',
    expiry_date: nearExpiryDate,
    purchase_price: 1000,
    selling_price: 1500,
    initial_quantity: 50,
    current_quantity: 20,
    status: 'available',
    created_at: now - 60 * dayMs,
    updated_at: now
  };

  // Batch 3: Amoxicillin - expired 5 days ago, 15 units, cost 1200
  const expiredDate = new Date(now - 5 * dayMs).toISOString().split('T')[0];
  const batch3: any = {
    id: 'batch-p7-03',
    product_id: product2.id,
    batch_number: 'B-AMOX-OLD',
    expiry_date: expiredDate,
    purchase_price: 1200,
    selling_price: 2000,
    initial_quantity: 30,
    current_quantity: 15,
    status: 'expired',
    created_at: now - 180 * dayMs,
    updated_at: now
  };

  // 2. Add Historical Transactions: Sales, Purchases, Returns, CashTransactions
  // Sale 1: Cash sale of Panadol (20 units base @ 150 = 3000 gross, discount 0, COGS 20 * 1000 = 20000)
  const sale1: any = {
    id: 'sale-p7-01',
    invoice_number: 'INV-2026-0001',
    customer_id: 'cust-cash',
    user_id: cashierUser.id,
    shift_id: 'shift-01',
    cashbox_id: cashbox1.id,
    sale_type: 'cash',
    payment_method: 'cash',
    subtotal: 3000,
    discount_amount: 0,
    tax_amount: 0,
    net_total: 3000,
    paid_amount: 3000,
    remaining_amount: 0,
    status: 'completed',
    created_at: now - 2 * dayMs,
    updated_at: now - 2 * dayMs
  };

  const saleItem1: any = {
    id: 'si-p7-01',
    sale_id: sale1.id,
    product_id: product1.id,
    unit_name: 'شريط',
    conversion_factor: 10,
    quantity: 2,
    base_quantity: 20,
    unit_price: 1500,
    discount_amount: 0,
    tax_rate_bps: 0,
    tax_amount: 0,
    line_total: 3000,
    created_at: sale1.created_at
  };

  const saleAlloc1: any = {
    id: 'alloc-p7-01',
    sale_item_id: saleItem1.id,
    batch_id: batch1.id,
    quantity: 20,
    unit_cost: 1000 // Historical COGS = 20 * 1000 = 20,000 (note: in minor units)
  };

  // Sale 2: Credit sale to Khalid (10 units Amox @ 200 = 2000, discount 200, net 1800, paid 500, remaining 1300)
  const sale2: any = {
    id: 'sale-p7-02',
    invoice_number: 'INV-2026-0002',
    customer_id: customer1.id,
    user_id: cashierUser.id,
    shift_id: 'shift-01',
    cashbox_id: cashbox1.id,
    sale_type: 'credit',
    payment_method: 'credit',
    subtotal: 2000,
    discount_amount: 200,
    tax_amount: 0,
    net_total: 1800,
    paid_amount: 500,
    remaining_amount: 1300,
    status: 'completed',
    created_at: now - 1 * dayMs,
    updated_at: now - 1 * dayMs
  };

  const saleItem2: any = {
    id: 'si-p7-02',
    sale_id: sale2.id,
    product_id: product2.id,
    unit_name: 'شريط',
    conversion_factor: 10,
    quantity: 1,
    base_quantity: 10,
    unit_price: 2000,
    discount_amount: 200,
    tax_rate_bps: 0,
    tax_amount: 0,
    line_total: 1800,
    created_at: sale2.created_at
  };

  const saleAlloc2: any = {
    id: 'alloc-p7-02',
    sale_item_id: saleItem2.id,
    batch_id: batch3.id,
    quantity: 10,
    unit_cost: 1200 // Historical COGS = 10 * 1200 = 12000
  };

  // Sale Return 1: Return 5 units Panadol from Sale 1 (refund = 750, restored COGS = 5 * 1000 = 5000)
  const saleReturn1: any = {
    id: 'sret-p7-01',
    return_number: 'RET-2026-0001',
    original_sale_id: sale1.id,
    customer_id: 'cust-cash',
    total_refund_amount: 750,
    settlement_method: 'cash',
    cashbox_id: cashbox1.id,
    return_reason: 'أقراص غير مستخدمة بناء على استشارة الطبيب',
    status: 'completed',
    created_by: cashierUser.id,
    created_at: now - 12 * 60 * 60 * 1000
  };

  const saleReturnItem1: any = {
    id: 'sret-it-p7-01',
    return_id: saleReturn1.id,
    original_sale_item_id: saleItem1.id,
    product_id: product1.id,
    unit_name: 'قرص',
    conversion_factor: 1,
    returned_quantity: 5,
    returned_base_quantity: 5,
    refund_unit_price: 150,
    line_refund_total: 750,
    action_type: 'restock',
    target_batch_id: batch1.id,
    cogs_unit_cost: 1000 // Returned COGS = 5 * 1000 = 5000
  };

  // Purchase 1: From Al-Razi (100 units Panadol @ 1000 = 100000, paid 60000, remaining 40000)
  const purchase1: any = {
    id: 'purch-p7-01',
    invoice_number: 'BILL-RAZI-99',
    supplier_id: supplier1.id,
    user_id: adminUser.id,
    cashbox_id: cashbox1.id,
    purchase_date: '2026-09-01',
    payment_type: 'credit',
    subtotal: 100000,
    discount_amount: 0,
    tax_amount: 0,
    net_total: 100000,
    paid_amount: 60000,
    remaining_amount: 40000,
    status: 'received',
    created_at: now - 10 * dayMs,
    updated_at: now - 10 * dayMs
  };

  const purchaseItem1: any = {
    id: 'purch-it-p7-01',
    purchase_id: purchase1.id,
    product_id: product1.id,
    product_name_snapshot: product1.name_ar,
    batch_number: 'B-PAND-001',
    expiry_date: '2027-12-31',
    unit_name: 'باكت',
    quantity: 5,
    conversion_factor: 20,
    base_quantity: 100,
    unit_purchase_price: 20000,
    base_purchase_price: 1000,
    line_total: 100000,
    created_at: purchase1.created_at
  };

  // Operating Expenses: Electricity (1500) and Packaging (500) = 2000 total
  const expense1: any = {
    id: 'exp-p7-01',
    category_id: 'exp-cat-bills',
    cashbox_id: cashbox1.id,
    user_id: adminUser.id,
    amount: 1500,
    statement: 'سداد فاتورة الكهرباء الشهرية',
    recipient_name: 'المؤسسة العامة للكهرباء',
    created_at: now - 5 * dayMs
  };

  const expense2: any = {
    id: 'exp-p7-02',
    category_id: 'exp-cat-supplies',
    cashbox_id: cashbox1.id,
    user_id: adminUser.id,
    amount: 500,
    statement: 'أكياس ومستلزمات تغليف الصيدلية',
    created_at: now - 3 * dayMs
  };

  // Cash Transactions for Cashbox 1:
  // IN: Sale 1 (3000), Sale 2 (500)
  // OUT: Return 1 (750), Purchase 1 (60000), Expense 1 (1500), Expense 2 (500)
  const cashTx1: any = {
    id: 'ctx-p7-01',
    cashbox_id: cashbox1.id,
    user_id: cashierUser.id,
    direction: 'IN',
    category: 'sale',
    amount: 3000,
    running_balance: 103000,
    reference_type: 'sale',
    reference_id: sale1.id,
    description: 'مبيعات نقدية فاتورة INV-2026-0001',
    created_at: sale1.created_at
  };

  const cashTx2: any = {
    id: 'ctx-p7-02',
    cashbox_id: cashbox1.id,
    user_id: cashierUser.id,
    direction: 'IN',
    category: 'sale',
    amount: 500,
    running_balance: 103500,
    reference_type: 'sale',
    reference_id: sale2.id,
    description: 'دفعة نقدية لفاتورة آجل INV-2026-0002',
    created_at: sale2.created_at
  };

  const cashTx3: any = {
    id: 'ctx-p7-03',
    cashbox_id: cashbox1.id,
    user_id: cashierUser.id,
    direction: 'OUT',
    category: 'sale_return',
    amount: 750,
    running_balance: 102750,
    reference_type: 'sale_return',
    reference_id: saleReturn1.id,
    description: 'رد نقدي لمردود مبيعات RET-2026-0001',
    created_at: saleReturn1.created_at
  };

  const cashTx4: any = {
    id: 'ctx-p7-04',
    cashbox_id: cashbox1.id,
    user_id: adminUser.id,
    direction: 'OUT',
    category: 'supplier_payment',
    amount: 60000,
    running_balance: 42750,
    reference_type: 'purchase',
    reference_id: purchase1.id,
    description: 'دفعة نقدية لمشتريات BILL-RAZI-99',
    created_at: purchase1.created_at
  };

  const cashTx5: any = {
    id: 'ctx-p7-05',
    cashbox_id: cashbox1.id,
    user_id: adminUser.id,
    direction: 'OUT',
    category: 'expense',
    amount: 1500,
    running_balance: 41250,
    reference_type: 'expense',
    reference_id: expense1.id,
    description: 'سداد كهرباء',
    created_at: expense1.created_at
  };

  const cashTx6: any = {
    id: 'ctx-p7-06',
    cashbox_id: cashbox1.id,
    user_id: adminUser.id,
    direction: 'OUT',
    category: 'expense',
    amount: 500,
    running_balance: 40750,
    reference_type: 'expense',
    reference_id: expense2.id,
    description: 'أكياس ومستلزمات',
    created_at: expense2.created_at
  };

  // Stock Movement Ledger
  const sm1: any = {
    id: 'sm-p7-01',
    product_id: product1.id,
    batch_id: batch1.id,
    movement_type: 'purchase_receive',
    quantity_base: 100,
    balance_after: 100,
    unit_cost: 1000,
    reference_type: 'purchase',
    reference_id: purchase1.id,
    created_by: adminUser.id,
    created_at: purchase1.created_at
  };

  const sm2: any = {
    id: 'sm-p7-02',
    product_id: product1.id,
    batch_id: batch1.id,
    movement_type: 'sale_dispense',
    quantity_base: -20,
    balance_after: 80,
    unit_cost: 1000,
    reference_type: 'sale',
    reference_id: sale1.id,
    created_by: cashierUser.id,
    created_at: sale1.created_at
  };

  const sm3: any = {
    id: 'sm-p7-03',
    product_id: product1.id,
    batch_id: batch1.id,
    movement_type: 'sale_return',
    quantity_base: 5,
    balance_after: 85,
    unit_cost: 1000,
    reference_type: 'sale_return',
    reference_id: saleReturn1.id,
    created_by: cashierUser.id,
    created_at: saleReturn1.created_at
  };

  // Inject test data cleanly into SQLite State
  const s = db.getState();
  s.users.push(adminUser, cashierUser);
  s.customers.push(customer1);
  s.suppliers.push(supplier1);
  s.cashboxes.push(cashbox1);
  s.products.push(product1, product2);
  s.batches.push(batch1, batch2, batch3);
  s.sales.push(sale1, sale2);
  s.sale_items.push(saleItem1, saleItem2);
  s.sale_item_allocations.push(saleAlloc1, saleAlloc2);
  s.sale_returns.push(saleReturn1);
  s.sale_return_items.push(saleReturnItem1);
  s.purchases.push(purchase1);
  s.purchase_items.push(purchaseItem1);
  s.expenses.push(expense1, expense2);
  s.cash_transactions.push(cashTx1, cashTx2, cashTx3, cashTx4, cashTx5, cashTx6);
  s.stock_movements.push(sm1, sm2, sm3);
  db.saveState();

  assert(true, 'Test environment initialized with full transactional history');

  // --------------------------------------------------------------------------
  // 2. SALES REPORTS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Verifying Sales Reports ---');

  const filterAll = { date_from: now - 30 * dayMs, date_to: now + dayMs };
  const salesSummary = ReportService.getSalesSummary(filterAll);

  // Sale 1 subtotal 3000 + Sale 2 subtotal 2000 = 5000 gross sales
  assert(salesSummary.gross_sales === 5000, `Sales Summary Gross Sales is 5000 (actual: ${salesSummary.gross_sales})`);
  // Sale 1 discount 0 + Sale 2 discount 200 = 200
  assert(salesSummary.discounts === 200, `Sales Summary Discounts is 200 (actual: ${salesSummary.discounts})`);
  // Net sales = 5000 - 200 = 4800
  assert(salesSummary.net_sales === 4800, `Sales Summary Net Sales is 4800 (actual: ${salesSummary.net_sales})`);
  // Returned sales = 750
  assert(salesSummary.returned_sales === 750, `Sales Summary Returns is 750 (actual: ${salesSummary.returned_sales})`);
  // Net sales after returns = 4800 - 750 = 4050
  assert(salesSummary.net_sales_after_returns === 4050, `Net Sales After Returns is 4050 (actual: ${salesSummary.net_sales_after_returns})`);
  // COGS = Sale 1 (20 * 1000 = 20000) + Sale 2 (10 * 1200 = 12000) = 32000. Less return COGS (5 * 1000 = 5000) = 27000
  assert(salesSummary.cogs === 27000, `Net COGS matches exact historical batch cost 27000 (actual: ${salesSummary.cogs})`);
  // Gross profit = 4050 - 27000 = -22950 (or integer difference)
  assert(salesSummary.gross_profit === 4050 - 27000, `Gross profit mathematically matches net sales minus COGS`);
  assert(salesSummary.invoice_count === 2, `Invoice count is 2 (actual: ${salesSummary.invoice_count})`);
  assert(salesSummary.returned_invoice_count === 1, `Return invoice count is 1 (actual: ${salesSummary.returned_invoice_count})`);

  // Product sales breakdown
  const salesByProduct = ReportService.getSalesByProduct(filterAll);
  const panadolSale = salesByProduct.items.find((p) => p.product_id === product1.id);
  assert(!!panadolSale, 'Panadol found in sales by product report');
  assert(panadolSale!.base_quantity === 20, `Panadol base quantity sold is 20 (actual: ${panadolSale?.base_quantity})`);
  assert(panadolSale!.net_sales === 3000, `Panadol net sales is 3000 (actual: ${panadolSale?.net_sales})`);
  assert(panadolSale!.cogs === 20000, `Panadol historical COGS is 20000 (actual: ${panadolSale?.cogs})`);

  // Customer sales breakdown
  const salesByCust = ReportService.getSalesByCustomer(filterAll);
  const khalidSales = salesByCust.customers.find((c) => c.customer_id === customer1.id);
  assert(!!khalidSales, 'Customer Khalid found in sales by customer report');
  assert(khalidSales!.total_sales === 1800, `Khalid total sales is 1800 (actual: ${khalidSales?.total_sales})`);
  assert(khalidSales!.payments === 500, `Khalid payments is 500 (actual: ${khalidSales?.payments})`);
  assert(khalidSales!.outstanding_balance === 1300, `Khalid outstanding balance is 1300 (actual: ${khalidSales?.outstanding_balance})`);

  // Cashier performance
  const salesByUser = ReportService.getSalesByUser(filterAll);
  const cashierPerf = salesByUser.users.find((u) => u.user_id === cashierUser.id);
  assert(!!cashierPerf, 'Cashier performance found');
  assert(cashierPerf!.invoice_count === 2, `Cashier executed 2 invoices (actual: ${cashierPerf?.invoice_count})`);
  assert(cashierPerf!.cash_collected === 3500, `Cashier collected 3500 cash (actual: ${cashierPerf?.cash_collected})`);

  // --------------------------------------------------------------------------
  // 3. PURCHASES REPORTS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Verifying Purchases Reports ---');

  const purchSummary = ReportService.getPurchasesSummary(filterAll);
  assert(purchSummary.total_purchases === 100000, `Total purchases is 100000 (actual: ${purchSummary.total_purchases})`);
  assert(purchSummary.net_purchases === 100000, `Net purchases is 100000 (actual: ${purchSummary.net_purchases})`);
  assert(purchSummary.credit_purchases === 100000, `Credit purchases is 100000 (actual: ${purchSummary.credit_purchases})`);
  assert(purchSummary.purchase_count === 1, `Purchase bill count is 1 (actual: ${purchSummary.purchase_count})`);

  const purchBySupplier = ReportService.getPurchasesBySupplier(filterAll);
  const raziPurch = purchBySupplier.suppliers.find((s) => s.supplier_id === supplier1.id);
  assert(!!raziPurch, 'Supplier Al-Razi found in purchases by supplier');
  assert(raziPurch!.purchases === 100000, `Al-Razi purchases is 100000 (actual: ${raziPurch?.purchases})`);
  assert(raziPurch!.payments === 60000, `Al-Razi payments is 60000 (actual: ${raziPurch?.payments})`);
  assert(raziPurch!.outstanding_payable === 40000, `Al-Razi outstanding payable is 40000 (actual: ${raziPurch?.outstanding_payable})`);

  // --------------------------------------------------------------------------
  // 4. INVENTORY, VALUATION & EXPIRY REPORTS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Verifying Inventory & Expiry Reports ---');

  const stockReport = ReportService.getCurrentStockReport();
  const panadolStock = stockReport.items.find((p) => p.product_id === product1.id);
  assert(!!panadolStock, 'Panadol found in current stock report');
  // Batch 1 (50) + Batch 2 (20) = 70
  assert(panadolStock!.current_quantity === 70, `Panadol current stock is 70 (actual: ${panadolStock?.current_quantity})`);
  assert(panadolStock!.available_quantity === 70, `Panadol available stock is 70 (actual: ${panadolStock?.available_quantity})`);
  // Valuation: 70 * 1000 = 70000
  assert(panadolStock!.estimated_inventory_value === 70000, `Panadol stock valuation is 70000 (actual: ${panadolStock?.estimated_inventory_value})`);

  // Batch Report
  const batchRep = ReportService.getBatchReport();
  const b1 = batchRep.batches.find((b) => b.batch_id === batch1.id);
  assert(!!b1, 'Batch 1 found in batch report');
  assert(b1!.current_quantity === 50, `Batch 1 quantity is 50 (actual: ${b1?.current_quantity})`);
  assert(b1!.total_cost_value === 50000, `Batch 1 cost value is 50000 (actual: ${b1?.total_cost_value})`);

  // Near Expiry Report (threshold = 60 days)
  const nearExpReport = ReportService.getNearExpiryReport(60);
  const nearExpBatch = nearExpReport.items.find((b) => b.batch_id === batch2.id);
  assert(!!nearExpBatch, 'Batch 2 (expires in 20 days) correctly identified as near expiry');
  assert(nearExpBatch!.days_remaining <= 21 && nearExpBatch!.days_remaining >= 19, `Batch 2 days remaining is ~20 days (actual: ${nearExpBatch?.days_remaining})`);
  assert(nearExpBatch!.status_category === 'near_expiry', 'Batch 2 category is near_expiry');

  // Expired Stock Report
  const expiredRep = ReportService.getExpiredStockReport();
  const expBatch = expiredRep.items.find((b) => b.batch_id === batch3.id);
  assert(!!expBatch, 'Batch 3 correctly identified as expired stock');
  assert(expBatch!.days_expired >= 4, `Batch 3 days expired is >= 4 (actual: ${expBatch?.days_expired})`);
  assert(expBatch!.total_loss_value === 15 * 1200, `Batch 3 loss value is 18000 (actual: ${expBatch?.total_loss_value})`);

  // Stock Movement Ledger
  const smReport = ReportService.getStockMovementReport();
  assert(smReport.total_movements >= 3, `Stock movement ledger has >= 3 entries (actual: ${smReport.total_movements})`);
  const firstMove = smReport.movements.find((m) => m.id === sm1.id);
  assert(!!firstMove, 'First purchase stock movement is recorded in ledger');

  // --------------------------------------------------------------------------
  // 5. CASH FLOW & FINANCIAL STATEMENTS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Verifying Cash Flow & Financial Reports ---');

  const cashFlow = ReportService.getCashFlowReport(cashbox1.id, filterAll);
  // Opening balance = 100000 (initial state before transactions or matching first tx)
  // Inflows: 3000 (Sale 1) + 500 (Sale 2) = 3500
  assert(cashFlow.inflows.sales === 3500, `Cash Flow sales inflows is 3500 (actual: ${cashFlow.inflows.sales})`);
  assert(cashFlow.inflows.total === 3500, `Cash Flow total inflows is 3500 (actual: ${cashFlow.inflows.total})`);

  // Outflows: 750 (Sale Return) + 60000 (Purchase) + 2000 (Expenses) = 62750
  assert(cashFlow.outflows.sales_returns === 750, `Cash Flow return outflow is 750 (actual: ${cashFlow.outflows.sales_returns})`);
  assert(cashFlow.outflows.supplier_payments === 60000, `Cash Flow supplier outflow is 60000 (actual: ${cashFlow.outflows.supplier_payments})`);
  assert(cashFlow.outflows.expenses === 2000, `Cash Flow expenses outflow is 2000 (actual: ${cashFlow.outflows.expenses})`);
  assert(cashFlow.outflows.total === 62750, `Cash Flow total outflows is 62750 (actual: ${cashFlow.outflows.total})`);

  // Net Cash Flow = 3500 - 62750 = -59250
  assert(cashFlow.net_cash_flow === 3500 - 62750, `Net Cash Flow is -59250 (actual: ${cashFlow.net_cash_flow})`);

  // Expenses breakdown
  const expReport = ReportService.getExpensesReport(filterAll);
  assert(expReport.total_expenses === 2000, `Total expenses is 2000 (actual: ${expReport.total_expenses})`);
  assert(expReport.expense_count === 2, `Expense count is 2 (actual: ${expReport.expense_count})`);

  // Customer Statement
  const custStmt = ReportService.getCustomerStatement(customer1.id, filterAll);
  assert(custStmt.customer.id === customer1.id, 'Customer Statement fetched for Khalid');
  assert(custStmt.closing_balance === customer1.balance, `Closing balance is ${customer1.balance} (actual: ${custStmt.closing_balance})`);

  // Supplier Statement
  const suppStmt = ReportService.getSupplierStatement(supplier1.id, filterAll);
  assert(suppStmt.supplier.id === supplier1.id, 'Supplier Statement fetched for Al-Razi');
  assert(suppStmt.closing_balance === supplier1.balance, `Closing balance is ${supplier1.balance} (actual: ${suppStmt.closing_balance})`);

  // --------------------------------------------------------------------------
  // 6. PROFITABILITY REPORT VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Verifying Profitability & Operating Margin ---');

  const profitReport = ReportService.getProfitabilityReport(filterAll);
  assert(profitReport.gross_sales === 5000, `Gross sales is 5000 (actual: ${profitReport.gross_sales})`);
  assert(profitReport.discounts === 200, `Discounts is 200 (actual: ${profitReport.discounts})`);
  assert(profitReport.sales_returns === 750, `Returns is 750 (actual: ${profitReport.sales_returns})`);
  assert(profitReport.net_sales_after_returns === 4050, `Net sales after returns is 4050 (actual: ${profitReport.net_sales_after_returns})`);
  assert(profitReport.net_cogs === 27000, `Net COGS is 27000 (actual: ${profitReport.net_cogs})`);
  assert(profitReport.gross_profit === 4050 - 27000, `Gross Profit is 4050 - 27000`);
  assert(profitReport.operating_expenses === 2000, `Operating expenses is 2000 (actual: ${profitReport.operating_expenses})`);
  assert(
    profitReport.operating_margin === profitReport.gross_profit - 2000,
    `Operating margin matches Gross Profit - Operating Expenses (actual: ${profitReport.operating_margin})`
  );

  // --------------------------------------------------------------------------
  // 7. DOCUMENT SNAPSHOTS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Verifying Document Data Snapshots ---');

  const saleDoc = DocumentService.buildSaleInvoiceDoc(sale1.id);
  assert(saleDoc.document_type === 'sale_invoice', 'Document type is sale_invoice');
  assert(saleDoc.document_number === sale1.invoice_number, `Doc number is ${sale1.invoice_number}`);
  assert(saleDoc.net_total === sale1.net_total, `Doc net total is ${sale1.net_total}`);
  assert(saleDoc.lines.length === 1, 'Doc has 1 line item');
  assert(saleDoc.lines[0].name === product1.name_ar, 'Line item name matches product name');

  const purchDoc = DocumentService.buildPurchaseBillDoc(purchase1.id);
  assert(purchDoc.document_type === 'purchase_bill', 'Document type is purchase_bill');
  assert(purchDoc.document_number === purchase1.invoice_number, 'Purchase bill number matches');
  assert(purchDoc.party_name === supplier1.name_ar, 'Party name matches supplier name');

  const retDoc = DocumentService.buildSaleReturnDoc(saleReturn1.id);
  assert(retDoc.document_type === 'sale_return', 'Document type is sale_return');
  assert(retDoc.net_total === saleReturn1.total_refund_amount, 'Return refund matches');

  const custDoc = DocumentService.buildCustomerStatementDoc(customer1.id, filterAll);
  assert(custDoc.document_type === 'customer_statement', 'Document type is customer_statement');
  assert(custDoc.party_name === customer1.name, 'Customer statement party name matches');

  const suppDoc = DocumentService.buildSupplierStatementDoc(supplier1.id, filterAll);
  assert(suppDoc.document_type === 'supplier_statement', 'Document type is supplier_statement');
  assert(suppDoc.party_name === supplier1.name_ar, 'Supplier statement party name matches');

  // --------------------------------------------------------------------------
  // 8. ARABIC SHAPING & BIDI UTILITIES VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Verifying Arabic Shaping & BiDi Logic ---');

  const rawArabic = 'صيدلية';
  const shaped = ArabicShaper.shape(rawArabic);
  assert(shaped.length === rawArabic.length, 'Shaped Arabic has same character count');
  assert(shaped !== rawArabic, 'Shaped Arabic uses Presentation Forms characters');

  const bidiResult = ArabicShaper.processText('صيدلية الأمل 2026');
  assert(bidiResult.length > 0, 'BiDi processed text is not empty');

  // --------------------------------------------------------------------------
  // 9. REAL PDF GENERATION (pdf-lib Engine)
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Verifying Real Binary PDF Generation (pdf-lib) ---');

  // A4 Invoice PDF
  const a4PdfBytes = await PdfService.generateA4Document(saleDoc);
  assert(a4PdfBytes instanceof Uint8Array, 'A4 PDF returns Uint8Array buffer');
  assert(a4PdfBytes.length > 2000, `A4 PDF size is valid (>2000 bytes, actual: ${a4PdfBytes.length})`);
  // Verify standard PDF header "%PDF-"
  const pdfHeaderA4 = String.fromCharCode(...a4PdfBytes.slice(0, 5));
  assert(pdfHeaderA4 === '%PDF-', `A4 PDF binary header is standard %PDF- (actual: ${pdfHeaderA4})`);

  // 80mm Thermal Receipt PDF
  const thermalPdfBytes = await PdfService.generateThermalReceipt(saleDoc);
  assert(thermalPdfBytes instanceof Uint8Array, 'Thermal PDF returns Uint8Array buffer');
  assert(thermalPdfBytes.length > 2000, `Thermal PDF size is valid (>2000 bytes, actual: ${thermalPdfBytes.length})`);
  const pdfHeaderThermal = String.fromCharCode(...thermalPdfBytes.slice(0, 5));
  assert(pdfHeaderThermal === '%PDF-', `Thermal PDF binary header is standard %PDF- (actual: ${pdfHeaderThermal})`);

  // Tabular Report PDF
  const reportPdfBytes = await PdfService.generateReportPdf(
    'تقرير مبيعات الأصناف التجريبي',
    'الفترة من: 2026-09-01 إلى: 2026-09-16',
    [
      { header: 'الصنف', width: 220, align: 'right' },
      { header: 'الكمية', width: 80, align: 'center' },
      { header: 'الصافي', width: 100, align: 'right' }
    ],
    [
      { name: 'بنادول إكسترا أقراص', qty: '20', net: '3,000.00' },
      { name: 'أموكسيسيلين 500 ملجم', qty: '10', net: '1,800.00' }
    ],
    [
      { label: 'إجمالي المبيعات', value: '4,800.00 ريال' },
      { label: 'الكمية الإجمالية', value: '30 وحدة' }
    ]
  );
  assert(reportPdfBytes instanceof Uint8Array, 'Report PDF returns Uint8Array buffer');
  assert(reportPdfBytes.length > 2000, `Report PDF size is valid (actual: ${reportPdfBytes.length})`);
  const pdfHeaderReport = String.fromCharCode(...reportPdfBytes.slice(0, 5));
  assert(pdfHeaderReport === '%PDF-', `Report PDF binary header is standard %PDF- (actual: ${pdfHeaderReport})`);

  // --------------------------------------------------------------------------
  // 10. CSV EXPORT ENGINE & UTF-8 BOM VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Verifying CSV Export & UTF-8 BOM Compatibility ---');

  const csv = ExportService.generateCsv(
    [
      { key: 'id', label: 'الرقم' },
      { key: 'name', label: 'اسم الصنف' },
      { key: 'price', label: 'السعر' }
    ],
    [
      { id: '1', name: 'بنادول إكسترا', price: 1500 },
      { id: '2', name: 'أموكسيسيلين "خاص"', price: 2000 }
    ]
  );

  // Check UTF-8 BOM: \uFEFF
  assert(csv.startsWith('\uFEFF'), 'CSV string strictly starts with UTF-8 BOM for Excel Arabic compatibility');
  assert(csv.includes('"اسم الصنف"'), 'CSV headers are quoted properly');
  assert(csv.includes('"أموكسيسيلين ""خاص"""'), 'Double quotes are properly escaped in CSV');
  assert(csv.includes('1500'), 'Standard numeric representation included in CSV');

  // --------------------------------------------------------------------------
  // 11. PRINT & SHARE ABSTRACTIONS VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 11. Verifying Print and Share Abstractions ---');

  // isNativeAndroid returns boolean
  const isAndroid = ShareService.isNativeAndroid();
  assert(typeof isAndroid === 'boolean', 'ShareService.isNativeAndroid() executes safely and returns boolean');

  // PrintService handles document printing in node/headless environment gracefully
  const printRes = await PrintService.printDocument(saleDoc, { paper_size: '80mm' });
  assert(typeof printRes.success === 'boolean', 'PrintService.printDocument returns standard PrintResult');

  console.log('\n======================================================');
  console.log(`PHASE 7 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`PHASE 7 TEST SUITE FAILED with ${failed} failures`);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
