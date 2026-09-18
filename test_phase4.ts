// Comprehensive PHASE 4 Automated Verification Suite
// Validates Supplier Management, Purchase Invoices, Batch Cost Immutability,
// Stock Safety on Reversals, Multi-unit conversions, and Financial Ledgers.

import { db } from './src/db/sqlite';
import { PurchaseService } from './src/services/PurchaseService';
import { SalesService } from './src/services/SalesService';
import { SupplierRepository, ProductRepository, PurchaseRepository } from './src/db/repositories';
import { Product, Supplier, Purchase, Batch } from './src/types';
import { Money } from './src/utils/money';
import { TransactionManager, DuplicateActionError } from './src/db/transaction';

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

async function runPhase4Verification() {
  console.log('====================================================');
  console.log('STARTING PHASE 4 — PURCHASES & RECEIVING VERIFICATION');
  console.log('====================================================\n');

  const state = db.getState();
  const validFutureExp1 = '2027-10-15';
  const validFutureExp2 = '2028-04-20';
  const expiredDate = '2022-01-01';

  // ----------------------------------------------------
  // SECTION 1: COMPLETE SUPPLIER MANAGEMENT
  // ----------------------------------------------------
  console.log('\n--- 1. SUPPLIER MANAGEMENT & LIFECYCLE ---');

  // 1.1 Create Supplier with all fields & opening balance
  const sup1 = SupplierRepository.create({
    name_ar: 'شركة الأمل للأدوية والتوريدات',
    name_en: 'Al-Amal Pharma Supplies Ltd',
    phone: '012345678',
    address: 'صنعاء - شارع الزبيري',
    tax_number: 'TAX-998877',
    contact_person: 'د. خالد العمري',
    opening_balance: 50000, // 500.00 debt payable
    credit_limit: 500000 // 5,000.00 max credit
  });

  assert(!!sup1.id, 'Supplier created with unique ID');
  assert(sup1.name_ar === 'شركة الأمل للأدوية والتوريدات', 'Supplier Arabic name stored');
  assert(sup1.name_en === 'Al-Amal Pharma Supplies Ltd', 'Supplier English name stored');
  assert(sup1.cached_balance === 50000, 'Supplier opening balance set in cached_balance');
  assert(sup1.is_active === true, 'Supplier initialized as active');

  // Verify opening balance created an opening_balance transaction
  const sup1TxList = SupplierRepository.getTransactions(sup1.id);
  assert(sup1TxList.length === 1, 'Supplier opening balance generated ledger transaction');
  assert(sup1TxList[0].transaction_type === 'opening_balance', 'Transaction type is opening_balance');
  assert(sup1TxList[0].credit === 50000, 'Opening balance credited to payable');
  assert(sup1TxList[0].balance_after === 50000, 'Ledger balance after is correct');

  // 1.2 Edit Supplier
  const updatedSup1 = SupplierRepository.update(sup1.id, {
    phone: '019876543',
    contact_person: 'د. أحمد الصالح',
    credit_limit: 600000
  });
  assert(updatedSup1.phone === '019876543', 'Supplier phone updated');
  assert(updatedSup1.contact_person === 'د. أحمد الصالح', 'Contact person updated');
  assert(updatedSup1.credit_limit === 600000, 'Credit limit updated');

  // 1.3 Search Supplier
  const searchAr = SupplierRepository.search('الأمل');
  assert(searchAr.some((s) => s.id === sup1.id), 'Supplier found by Arabic name search');

  const searchEn = SupplierRepository.search('al-amal');
  assert(searchEn.some((s) => s.id === sup1.id), 'Supplier found by English name search');

  const searchTax = SupplierRepository.search('998877');
  assert(searchTax.some((s) => s.id === sup1.id), 'Supplier found by Tax number search');

  // 1.4 Deactivate & Reactivate
  SupplierRepository.deactivate(sup1.id);
  const deactivatedSup = SupplierRepository.getById(sup1.id)!;
  assert(deactivatedSup.is_active === false, 'Supplier successfully deactivated');

  SupplierRepository.reactivate(sup1.id);
  const reactivatedSup = SupplierRepository.getById(sup1.id)!;
  assert(reactivatedSup.is_active === true, 'Supplier successfully reactivated');

  // 1.5 Deletion Safety
  let deleteBlocked = false;
  try {
    SupplierRepository.delete(sup1.id);
  } catch (err: any) {
    deleteBlocked = true;
    assert(err.message.includes('لا يمكن حذف مورد'), 'Cannot delete supplier referenced by transactions');
  }
  assert(deleteBlocked, 'Physical deletion of supplier with historical ledger is strictly blocked');

  // ----------------------------------------------------
  // SECTION 2: TEST PRODUCT SETUP
  // ----------------------------------------------------
  console.log('\n--- 2. PRODUCT SETUP FOR PURCHASING ---');

  const prodA: Product = {
    id: 'prod-pur-a',
    internal_code: 'MED-PUR-01',
    barcode: '6282001111111',
    name_ar: 'أموكسيسيلين 500 مجم كبسول',
    name_en: 'Amoxicillin 500mg Capsules',
    category_id: 'cat-01',
    dosage_form: 'capsule',
    base_unit: 'كبسولة',
    pack_size: 20, // 20 capsules per box
    current_purchase_price: 1500, // 15.00 per box or unit
    current_selling_price: 2500,
    is_active: true,
    min_stock_level: 0,
    reorder_level: 0,
    prescription_required: true,
    is_controlled: false,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  state.products.push(prodA);

  const prodB: Product = {
    id: 'prod-pur-b',
    internal_code: 'MED-PUR-02',
    barcode: '6282002222222',
    name_ar: 'باراسيتامول 500 مجم أقراص',
    name_en: 'Paracetamol 500mg Tablets',
    category_id: 'cat-01',
    dosage_form: 'tablet',
    base_unit: 'قرص',
    pack_size: 10,
    current_purchase_price: 500,
    current_selling_price: 1000,
    is_active: true,
    min_stock_level: 0,
    reorder_level: 0,
    prescription_required: false,
    is_controlled: false,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  state.products.push(prodB);

  assert(true, 'Test products created');

  // ----------------------------------------------------
  // SECTION 3: PURCHASE INVOICE VALIDATIONS & ATOMICITY
  // ----------------------------------------------------
  console.log('\n--- 3. PURCHASE INVOICE VALIDATIONS & ATOMICITY ---');

  // 3.1 Validation: Rejects empty items
  let emptyItemsFailed = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-TEST-001',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: []
    });
  } catch (err: any) {
    emptyItemsFailed = true;
    assert(err.message.includes('إضافة أصناف'), 'Rejects purchase with empty items');
  }
  assert(emptyItemsFailed, 'Empty items purchase strictly rejected');

  // 3.2 Validation: Rejects inactive supplier
  SupplierRepository.deactivate(sup1.id);
  let inactiveSupFailed = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-TEST-002',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodA.id,
          batch_number: 'BATCH-001',
          expiry_date: validFutureExp1,
          unit_name: 'شريط',
          unit_factor: 10,
          quantity: 5,
          unit_purchase_price: 1000,
          unit_selling_price: 1500
        }
      ]
    });
  } catch (err: any) {
    inactiveSupFailed = true;
    assert(err.message.includes('غير نشط'), 'Rejects purchase for inactive supplier');
  }
  assert(inactiveSupFailed, 'Inactive supplier purchase strictly rejected');
  SupplierRepository.reactivate(sup1.id);

  // 3.3 Validation: Expiry date format and impossibility
  let invalidExpiryFormat = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-TEST-EXP1',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodA.id,
          batch_number: 'B-EXP-ERR',
          expiry_date: '31-12-2027', // Wrong format, should be YYYY-MM-DD
          unit_name: 'قرص',
          unit_factor: 1,
          quantity: 10,
          unit_purchase_price: 100,
          unit_selling_price: 150
        }
      ]
    });
  } catch (err: any) {
    invalidExpiryFormat = true;
    assert(err.message.includes('الصيغة المطلوبة'), 'Rejects invalid date format');
  }
  assert(invalidExpiryFormat, 'Invalid date format rejected');

  // 3.4 Validation: Rejects expired batch receiving
  let expiredBatchFailed = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-TEST-EXP2',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodA.id,
          batch_number: 'B-EXPIRED',
          expiry_date: expiredDate,
          unit_name: 'قرص',
          unit_factor: 1,
          quantity: 10,
          unit_purchase_price: 100,
          unit_selling_price: 150
        }
      ]
    });
  } catch (err: any) {
    expiredBatchFailed = true;
    assert(err.message.includes('منتهية الصلاحية'), 'Rejects receiving expired batch');
  }
  assert(expiredBatchFailed, 'Expired batch receiving rejected');

  // ----------------------------------------------------
  // SECTION 4: MULTI-UNIT PURCHASE & SNAPSHOT INTEGRITY
  // ----------------------------------------------------
  console.log('\n--- 4. MULTI-UNIT PURCHASE & SNAPSHOTS ---');

  // Buy 10 boxes of prodA (each box factor = 20 capsules, price = 2000 minor per box)
  // Total base quantity = 10 * 20 = 200 capsules.
  // Base unit cost = 2000 / 20 = 100 minor per capsule.
  const purchase1 = PurchaseService.createPurchase({
    supplier_id: sup1.id,
    invoice_number: 'INV-SUP1-001',
    purchase_date: '2026-09-15',
    payment_type: 'credit',
    cashbox_id: 'cash-01',
    user_id: 'user-01',
    discount_amount: 1000, // 10.00 discount
    items: [
      {
        product_id: prodA.id,
        batch_number: 'AMX-2027A',
        expiry_date: validFutureExp1,
        unit_name: 'باكت',
        unit_factor: 20,
        quantity: 10,
        unit_purchase_price: 2000, // 20.00 per box
        unit_selling_price: 3000   // 30.00 per box
      }
    ]
  });

  assert(purchase1.status === 'posted', 'Purchase invoice 1 posted successfully');
  assert(purchase1.subtotal === 20000, 'Subtotal is exactly 20000 (10 * 2000)');
  assert(purchase1.discount_amount === 1000, 'Discount is exactly 1000');
  assert(purchase1.net_total === 19000, 'Net total is 19000');
  assert(purchase1.remaining_amount === 19000, 'Remaining debt is 19000 for credit invoice');
  assert(purchase1.paid_amount === 0, 'Paid amount is 0 for credit invoice');

  // Verify Purchase Item snapshots
  const p1Items = PurchaseRepository.getItems(purchase1.id);
  assert(p1Items.length === 1, 'Purchase 1 has 1 item');
  const p1Item = p1Items[0];
  assert(p1Item.product_name_snapshot === prodA.name_ar, 'Product name snapshot stored');
  assert(p1Item.product_code_snapshot === prodA.internal_code, 'Product code snapshot stored');
  assert(p1Item.unit_factor === 20, 'Unit conversion factor stored');
  assert(p1Item.base_quantity === 200, 'Base quantity converted to 200 capsules');
  assert(p1Item.unit_cost_base === 100, 'Base unit cost correctly calculated as 100 minor (2000 / 20)');

  // Verify Batch created in Stock
  const batch1 = state.batches.find((b) => b.id === p1Item.batch_id)!;
  assert(!!batch1, 'Batch created in batches collection');
  assert(batch1.batch_number === 'AMX-2027A', 'Batch number matches');
  assert(batch1.current_quantity === 200, 'Batch current quantity is 200 base units');
  assert(batch1.purchase_price === 100, 'Batch purchase cost is exactly 100 base units');
  assert(batch1.supplier_id === sup1.id, 'Batch associated with supplier');

  // Verify StockMovement
  const movements = state.stock_movements.filter((m) => m.reference_id === purchase1.internal_number);
  assert(movements.length === 1, 'Stock movement created for purchase');
  assert(movements[0].movement_type === 'purchase', 'Movement type is purchase');
  assert(movements[0].quantity_delta === 200, 'Movement quantity delta is +200');
  assert(movements[0].unit_cost === 100, 'Movement unit cost recorded');

  // Verify Supplier Ledger
  const sup1After = SupplierRepository.getById(sup1.id)!;
  assert(sup1After.cached_balance === 50000 + 19000, 'Supplier balance increased by credit amount (50000 + 19000 = 69000)');

  // ----------------------------------------------------
  // SECTION 5: BATCH COST IMMUTABILITY & REUSE RULES
  // ----------------------------------------------------
  console.log('\n--- 5. BATCH COST IMMUTABILITY & REUSE RULES ---');

  // 5.1 Same batch number with DIFFERENT expiry date MUST be rejected
  let diffExpFailed = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-SUP1-002',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodA.id,
          batch_number: 'AMX-2027A',
          expiry_date: validFutureExp2, // Different date!
          unit_name: 'باكت',
          unit_factor: 20,
          quantity: 5,
          unit_purchase_price: 2000,
          unit_selling_price: 3000
        }
      ]
    });
  } catch (err: any) {
    diffExpFailed = true;
    assert(err.message.includes('تواريخ مختلفة'), 'Rejects reusing batch number with different expiry date');
  }
  assert(diffExpFailed, 'Different expiry on same batch number rejected');

  // 5.2 Same batch number with DIFFERENT purchase cost MUST be rejected (Historical Cost Corruption Guard)
  let diffCostFailed = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-SUP1-003',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodA.id,
          batch_number: 'AMX-2027A',
          expiry_date: validFutureExp1,
          unit_name: 'باكت',
          unit_factor: 20,
          quantity: 5,
          unit_purchase_price: 2500, // 125 base cost vs original 100!
          unit_selling_price: 3000
        }
      ]
    });
  } catch (err: any) {
    diffCostFailed = true;
    assert(err.message.includes('سعر تكلفة مختلف'), 'Rejects reusing batch number with different cost');
  }
  assert(diffCostFailed, 'Different cost on same batch number rejected');

  // 5.3 Same batch number with EXACT same expiry and EXACT same cost should safely increment batch
  const purchase2 = PurchaseService.createPurchase({
    supplier_id: sup1.id,
    invoice_number: 'INV-SUP1-004',
    payment_type: 'credit',
    cashbox_id: 'cash-01',
    user_id: 'user-01',
    items: [
      {
        product_id: prodA.id,
        batch_number: 'AMX-2027A',
        expiry_date: validFutureExp1,
        unit_name: 'باكت',
        unit_factor: 20,
        quantity: 5,
        unit_purchase_price: 2000, // exact match (100 minor base cost)
        unit_selling_price: 3000
      }
    ]
  });
  assert(purchase2.status === 'posted', 'Batch append purchase posted');
  const batch1AfterAppend = state.batches.find((b) => b.id === batch1.id)!;
  assert(batch1AfterAppend.current_quantity === 300, 'Batch quantity cleanly incremented (200 + 100 = 300)');
  assert(batch1AfterAppend.purchase_price === 100, 'Batch purchase cost preserved exactly at 100');

  // ----------------------------------------------------
  // SECTION 6: CASH PURCHASE & CASHBOX ATOMICITY
  // ----------------------------------------------------
  console.log('\n--- 6. CASH PURCHASE & CASHBOX ATOMICITY ---');

  // 6.1 Insufficient Cashbox Balance rollback test
  const initialCashboxBal = db.getState().cashboxes[0].cached_balance;
  db.getState().cashboxes[0].cached_balance = 500; // Only 5.00 available
  let cashboxInsufficientFailed = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-SUP1-CASH-FAIL',
      payment_type: 'cash',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodB.id,
          batch_number: 'PARA-2028X',
          expiry_date: validFutureExp2,
          unit_name: 'قرص',
          unit_factor: 1,
          quantity: 100,
          unit_purchase_price: 50, // total 5000 (50.00)
          unit_selling_price: 100
        }
      ]
    });
  } catch (err: any) {
    cashboxInsufficientFailed = true;
    assert(err.message.includes('غير كافٍ'), 'Rejects cash purchase when cashbox has insufficient funds');
  }
  assert(cashboxInsufficientFailed, 'Insufficient cashbox rejected');
  assert(db.getState().cashboxes[0].cached_balance === 500, 'Cashbox balance untouched after failure');
  assert(!db.getState().purchases.some((p) => p.invoice_number === 'INV-SUP1-CASH-FAIL'), 'No purchase invoice persisted on failure');

  // Restore cashbox funds
  db.getState().cashboxes[0].cached_balance = initialCashboxBal + 100000; // 1,000.00 added
  const cashboxBeforeSuccess = db.getState().cashboxes[0].cached_balance;

  // 6.2 Valid Cash Purchase
  const cashPurchase = PurchaseService.createPurchase({
    supplier_id: sup1.id,
    invoice_number: 'INV-SUP1-CASH-OK',
    payment_type: 'cash',
    cashbox_id: 'cash-01',
    user_id: 'user-01',
    items: [
      {
        product_id: prodB.id,
        batch_number: 'PARA-CASH-1',
        expiry_date: validFutureExp2,
        unit_name: 'قرص',
        unit_factor: 1,
        quantity: 50,
        unit_purchase_price: 60, // 3000 total
        unit_selling_price: 120
      }
    ]
  });

  assert(cashPurchase.net_total === 3000, 'Cash purchase net total is 3000');
  assert(cashPurchase.paid_amount === 3000, 'Cash purchase paid amount is 3000');
  assert(cashPurchase.remaining_amount === 0, 'Cash purchase remaining amount is 0');
  assert(db.getState().cashboxes[0].cached_balance === cashboxBeforeSuccess - 3000, 'Cashbox deducted exactly 3000');

  const cashTx = state.cash_transactions.find((tx) => tx.reference_id === cashPurchase.internal_number);
  assert(!!cashTx, 'Cash transaction recorded');
  assert(cashTx?.type === 'purchase_cash', 'Cash transaction type is purchase_cash');
  assert(cashTx?.direction === 'OUT', 'Cash transaction direction is OUT');
  assert(cashTx?.amount === 3000, 'Cash transaction amount is 3000');

  // ----------------------------------------------------
  // SECTION 7: SUPPLIER CREDIT LIMIT ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n--- 7. SUPPLIER CREDIT LIMIT ENFORCEMENT ---');

  const supStrict = SupplierRepository.create({
    name_ar: 'مورد مقيد الائتمان',
    phone: '055555555',
    credit_limit: 10000, // 100.00 max credit
    opening_balance: 8000 // already 80.00 debt
  });

  // Current room for credit = 10000 - 8000 = 2000 (20.00)
  // Attempting purchase with debt 2500 should trigger credit limit exception
  let creditLimitBreached = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: supStrict.id,
      invoice_number: 'INV-CREDIT-BREACH',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodB.id,
          batch_number: 'PARA-LIMIT-FAIL',
          expiry_date: validFutureExp2,
          unit_name: 'قرص',
          unit_factor: 1,
          quantity: 25,
          unit_purchase_price: 100, // 2500 debt
          unit_selling_price: 200
        }
      ]
    });
  } catch (err: any) {
    creditLimitBreached = true;
    assert(err.message.includes('تجاوز سقف الائتمان'), 'Rejects purchase exceeding supplier credit limit');
  }
  assert(creditLimitBreached, 'Supplier credit limit breach caught');
  assert(supStrict.cached_balance === 8000, 'Supplier balance preserved at 8000 on rollback');
  assert(!state.batches.some((b) => b.batch_number === 'PARA-LIMIT-FAIL'), 'No batch created on rollback');

  // ----------------------------------------------------
  // SECTION 8: IDEMPOTENCY & DUPLICATE SUBMISSION
  // ----------------------------------------------------
  console.log('\n--- 8. IDEMPOTENCY & DUPLICATE SUBMISSION ---');

  const idemKey = 'idem-purchase-xyz-123';
  const idemPurchase1 = PurchaseService.createPurchase({
    supplier_id: sup1.id,
    invoice_number: 'INV-IDEM-001',
    payment_type: 'credit',
    cashbox_id: 'cash-01',
    user_id: 'user-01',
    idempotency_key: idemKey,
    items: [
      {
        product_id: prodB.id,
        batch_number: 'PARA-IDEM-1',
        expiry_date: validFutureExp2,
        unit_name: 'قرص',
        unit_factor: 1,
        quantity: 10,
        unit_purchase_price: 50,
        unit_selling_price: 100
      }
    ]
  });
  assert(idemPurchase1.status === 'posted', 'First idempotent purchase succeeded');

  let idemDuplicateCaught = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-IDEM-001',
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      idempotency_key: idemKey,
      items: [
        {
          product_id: prodB.id,
          batch_number: 'PARA-IDEM-1',
          expiry_date: validFutureExp2,
          unit_name: 'قرص',
          unit_factor: 1,
          quantity: 10,
          unit_purchase_price: 50,
          unit_selling_price: 100
        }
      ]
    });
  } catch (err: any) {
    idemDuplicateCaught = true;
    assert(err instanceof DuplicateActionError || err.message.includes('جارية') || err.message.includes('مسجل مسبقاً'), 'Duplicate action rejected cleanly');
  }
  assert(idemDuplicateCaught, 'Idempotent duplicate submission rejected');

  // Duplicate supplier invoice number check
  let dupInvCaught = false;
  try {
    PurchaseService.createPurchase({
      supplier_id: sup1.id,
      invoice_number: 'INV-IDEM-001', // Same supplier & same invoice number
      payment_type: 'credit',
      cashbox_id: 'cash-01',
      user_id: 'user-01',
      items: [
        {
          product_id: prodB.id,
          batch_number: 'PARA-IDEM-2',
          expiry_date: validFutureExp2,
          unit_name: 'قرص',
          unit_factor: 1,
          quantity: 10,
          unit_purchase_price: 50,
          unit_selling_price: 100
        }
      ]
    });
  } catch (err: any) {
    dupInvCaught = true;
    assert(err.message.includes('مسجل مسبقاً لنفس المورد'), 'Duplicate supplier invoice number rejected');
  }
  assert(dupInvCaught, 'Duplicate supplier invoice number caught');

  // ----------------------------------------------------
  // SECTION 9: HISTORICAL COGS IMMUTABILITY (PURCHASE -> SALE)
  // ----------------------------------------------------
  console.log('\n--- 9. HISTORICAL COGS IMMUTABILITY ---');

  // Product C
  const prodC: Product = {
    id: 'prod-pur-cogs',
    internal_code: 'MED-PUR-COGS',
    name_ar: 'دواء فحص التكلفة التاريخية للمشتريات',
    name_en: 'Historical COGS Verification Drug',
    category_id: 'cat-01',
    dosage_form: 'tablet',
    base_unit: 'قرص',
    pack_size: 1,
    current_purchase_price: 100, // 1.00
    current_selling_price: 200,  // 2.00
    is_active: true,
    min_stock_level: 0,
    reorder_level: 0,
    prescription_required: false,
    is_controlled: false,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  state.products.push(prodC);

  // Buy 100 units at unit cost = 120 (1.20)
  const cogsPur = PurchaseService.createPurchase({
    supplier_id: sup1.id,
    invoice_number: 'INV-COGS-TEST-1',
    payment_type: 'credit',
    cashbox_id: 'cash-01',
    user_id: 'user-01',
    update_product_purchase_price: false, // ensure product price unchanged
    items: [
      {
        product_id: prodC.id,
        batch_number: 'COGS-BATCH-1',
        expiry_date: validFutureExp1,
        unit_name: 'قرص',
        unit_factor: 1,
        quantity: 100,
        unit_purchase_price: 120, // 1.20 cost
        unit_selling_price: 220
      }
    ]
  });

  const cogsBatch = state.batches.find((b) => b.batch_number === 'COGS-BATCH-1')!;
  assert(cogsBatch.purchase_price === 120, 'Batch created with cost 120');

  // Change product current_purchase_price to 300 and selling price to 500
  prodC.current_purchase_price = 300;
  prodC.current_selling_price = 500;

  // Make a sale of 40 units from prodC
  const saleFromPur = SalesService.createSale({
    user_id: 'user-01',
    sale_type: 'cash',
    cashbox_id: 'cash-01',
    discount_amount: 0,
    items: [
      {
        productId: prodC.id,
        productName: prodC.name_ar,
        unitName: 'قرص',
        unitFactor: 1,
        quantity: 40,
        unitPrice: 220,
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 100
      }
    ]
  });

  // Expected COGS: 40 * 120 = 4800 (NOT 40 * 300 = 12000!)
  assert(saleFromPur.total_cogs === 4800, 'Sale COGS uses purchased batch cost (40 * 120 = 4800), immune to product price change');
  assert(saleFromPur.gross_profit === (40 * 220) - 4800, 'Gross profit accurately calculated from immutable batch cost');

  // ----------------------------------------------------
  // SECTION 10: PURCHASE CANCELLATION & STOCK SAFETY
  // ----------------------------------------------------
  console.log('\n--- 10. PURCHASE CANCELLATION & STOCK SAFETY ---');

  // 10.1 STOCK SAFETY: Cannot cancel purchase if stock already consumed/sold
  // For cogsPur, 40 out of 100 units were already sold! Only 60 remain.
  let stockSafetyBlocked = false;
  try {
    PurchaseService.cancelPurchase(cogsPur.id, 'محاولة إلغاء فاتورة مباع منها');
  } catch (err: any) {
    stockSafetyBlocked = true;
    assert(err.message.includes('تم بالفعل صرف أو بيع 40 وحدة'), 'Strict stock safety check caught consumed stock');
  }
  assert(stockSafetyBlocked, 'Cancellation of consumed purchase is strictly BLOCKED');
  assert(cogsPur.status === 'posted', 'Purchase remains posted after failed cancellation');
  assert(cogsBatch.current_quantity === 60, 'Batch quantity untouched after failed cancellation');

  // 10.2 CLEAN CANCELLATION & REVERSAL OF INTACT PURCHASE
  // Create a new fresh purchase with intact stock
  const freshSup = SupplierRepository.create({
    name_ar: 'مورد فحص الإلغاء',
    phone: '099999999',
    opening_balance: 0
  });

  const cashboxBeforeFresh = db.getState().cashboxes[0].cached_balance;

  const cancelTestPur = PurchaseService.createPurchase({
    supplier_id: freshSup.id,
    invoice_number: 'INV-CANCEL-TEST-01',
    payment_type: 'partial',
    cashbox_id: 'cash-01',
    user_id: 'user-01',
    paid_amount: 4000,     // 40.00 paid cash
    items: [
      {
        product_id: prodB.id,
        batch_number: 'PARA-CAN-01',
        expiry_date: validFutureExp2,
        unit_name: 'قرص',
        unit_factor: 1,
        quantity: 100,
        unit_purchase_price: 100, // 10000 total
        unit_selling_price: 150
      }
    ]
  });

  // Verify state before cancellation
  assert(cancelTestPur.net_total === 10000, 'Purchase total 10000');
  assert(cancelTestPur.paid_amount === 4000, 'Paid 4000');
  assert(cancelTestPur.remaining_amount === 6000, 'Remaining 6000');
  assert(freshSup.cached_balance === 6000, 'Supplier debt 6000');
  assert(db.getState().cashboxes[0].cached_balance === cashboxBeforeFresh - 4000, 'Cashbox deducted 4000');

  const canBatch = state.batches.find((b) => b.batch_number === 'PARA-CAN-01')!;
  assert(canBatch.current_quantity === 100, 'Batch has 100 units before cancellation');

  // Execute Cancellation
  const cancelledDoc = PurchaseService.cancelPurchase(
    cancelTestPur.id,
    'خطأ في استلام البضاعة من المندوب',
    'user-01'
  );

  // Assertions on Cancelled Document
  assert(cancelledDoc.status === 'cancelled', 'Purchase marked as cancelled');
  assert(cancelledDoc.cancellation_reason === 'خطأ في استلام البضاعة من المندوب', 'Cancellation reason recorded');
  assert(!!cancelledDoc.cancelled_at, 'Cancellation timestamp recorded');
  assert(cancelledDoc.cancelled_by === 'user-01', 'Cancelled by user recorded');

  // Assertions on Original Batch Reversal (Requirement 16: targets ORIGINAL batch, NO FEFO)
  assert(canBatch.current_quantity === 0, 'Original batch stock reduced to 0');
  assert(canBatch.status === 'depleted', 'Original batch marked as depleted');

  // Assertions on Stock Movement
  const canMov = state.stock_movements.find(
    (m) => m.reference_id === cancelTestPur.internal_number && m.movement_type === 'purchase_return'
  );
  assert(!!canMov, 'Compensating purchase_return stock movement created');
  assert(canMov?.quantity_delta === -100, 'Stock movement quantity delta is exactly -100');
  assert(canMov?.batch_id === canBatch.id, 'Stock movement explicitly targets original batch ID');

  // Assertions on Cashbox Reversal
  assert(db.getState().cashboxes[0].cached_balance === cashboxBeforeFresh, 'Cashbox balance completely restored (paid_amount 4000 refunded)');
  const canCashTx = state.cash_transactions.find(
    (tx) => tx.reference_id === cancelTestPur.internal_number && tx.direction === 'IN'
  );
  assert(!!canCashTx, 'Cashbox refund transaction recorded');
  assert(canCashTx?.amount === 4000, 'Refund transaction amount is 4000');
  assert(canCashTx?.type === 'purchase_return_cash', 'Cash transaction type is purchase_return_cash');

  // Assertions on Supplier Ledger Reversal
  const freshSupAfter = SupplierRepository.getById(freshSup.id)!;
  assert(freshSupAfter.cached_balance === 0, 'Supplier debt completely erased (6000 - 6000 = 0)');
  const canSuppTx = state.supplier_transactions.find(
    (tx) => tx.reference_id === cancelTestPur.internal_number && tx.transaction_type === 'purchase_cancellation'
  );
  assert(!!canSuppTx, 'Supplier ledger cancellation transaction recorded');
  assert(canSuppTx?.debit === 6000, 'Supplier debited 6000 to erase debt');
  assert(canSuppTx?.balance_after === 0, 'Supplier balance after is 0');

  // Double Cancellation Guard
  let doubleCancelBlocked = false;
  try {
    PurchaseService.cancelPurchase(cancelTestPur.id, 'محاولة إلغاء ثانية');
  } catch (err: any) {
    doubleCancelBlocked = true;
    assert(err.message.includes('ملغاة بالفعل'), 'Double cancellation strictly rejected');
  }
  assert(doubleCancelBlocked, 'Double cancellation guard operational');

  console.log('\n====================================================');
  console.log(`PHASE 4 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
}

runPhase4Verification().catch((err) => {
  console.error('Fatal error in Phase 4 verification:', err);
  process.exit(1);
});
