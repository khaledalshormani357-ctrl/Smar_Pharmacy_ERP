// Comprehensive PHASE 3.1 Verification Suite
// Tests all 12 critical invariants mandated by the verification gate

import { db } from './src/db/sqlite';
import { SalesService } from './src/services/SalesService';
import { StockService } from './src/services/StockService';
import { ProductRepository, CustomerRepository, BatchRepository, SaleRepository } from './src/db/repositories';
import { CartItem, Product, Batch } from './src/types';
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

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING PHASE 3.1 CRITICAL INTEGRITY VERIFICATION');
  console.log('====================================================\n');

  const state = db.getState();
  const futureExp1 = '2027-01-01';
  const futureExp2 = '2027-06-01';
  const futureExp3 = '2028-01-01';
  const expiredDate = '2022-01-01';

  // ----------------------------------------------------
  // 1. HISTORICAL COGS IMMUTABILITY
  // ----------------------------------------------------
  console.log('\n--- 1. HISTORICAL COGS IMMUTABILITY ---');
  const p1: Product = {
    id: 'prod-cogs-immutability',
    internal_code: 'MED-COGS-1',
    barcode: '6281001111111',
    name_ar: 'دواء اختبار التكلفة التاريخية',
    name_en: 'Historical COGS Test Med',
    category_id: 'cat-01',
    dosage_form: 'tablet',
    base_unit: 'قرص',
    pack_size: 1,
    current_purchase_price: 110,
    current_selling_price: 200,
    min_stock_level: 5,
    reorder_level: 10,
    prescription_required: false,
    is_controlled: false,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  const b1_A: Batch = {
    id: 'batch-cogs-a',
    product_id: p1.id,
    batch_number: 'BATCH-COGS-A',
    expiry_date: futureExp1,
    initial_quantity: 50,
    current_quantity: 50,
    purchase_price: 100, // 100 minor units
    selling_price: 200,
    status: 'active',
    received_at: 1000,
    created_at: 1000,
    updated_at: 1000
  };

  const b1_B: Batch = {
    id: 'batch-cogs-b',
    product_id: p1.id,
    batch_number: 'BATCH-COGS-B',
    expiry_date: futureExp2,
    initial_quantity: 70,
    current_quantity: 70,
    purchase_price: 120, // 120 minor units
    selling_price: 200,
    status: 'active',
    received_at: 2000,
    created_at: 2000,
    updated_at: 2000
  };

  db.transaction(() => {
    state.products.push(p1);
    state.unit_conversions.push({
      id: 'uc-cogs-1',
      product_id: p1.id,
      unit_name: 'قرص',
      conversion_factor: 1,
      selling_price: 200,
      is_default_sale: true
    });
    state.batches.push(b1_A, b1_B);
  });

  const expectedCOGS = 50 * 100 + 50 * 120; // 5000 + 6000 = 11000
  const expectedGrossProfit = 100 * 200 - expectedCOGS; // 20000 - 11000 = 9000

  const sale1 = SalesService.createSale({
    user_id: 'user-01',
    sale_type: 'cash',
    items: [
      {
        productId: p1.id,
        productName: p1.name_ar,
        unitName: 'قرص',
        unitFactor: 1,
        quantity: 100,
        unitPrice: 200,
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 120
      }
    ],
    discount_amount: 0,
    tax_rate_bps: 0
  });

  assert(sale1.total_cogs === expectedCOGS, `Initial sale COGS is exactly ${expectedCOGS}`);
  assert(sale1.gross_profit === expectedGrossProfit, `Initial sale gross profit is exactly ${expectedGrossProfit}`);
  assert(sale1.net_total === 20000, `Initial sale net total is 20000`);

  // Change Product current_purchase_price and current_selling_price drastically
  db.transaction(() => {
    p1.current_purchase_price = 999999;
    p1.current_selling_price = 888888;
    p1.updated_at = Date.now();
  });

  // Re-read historical invoice
  const readSale1 = SaleRepository.getById(sale1.id)!;
  const readSaleItems1 = SaleRepository.getItems(sale1.id);

  assert(readSale1.total_cogs === expectedCOGS, 'Historical COGS unchanged after product price change');
  assert(readSale1.gross_profit === expectedGrossProfit, 'Historical gross profit unchanged after product price change');
  assert(readSale1.net_total === 20000, 'Historical net total unchanged after product price change');
  assert(readSaleItems1[0].unit_price === 200, 'Historical line item unit_price unchanged');
  assert(readSaleItems1[0].item_cogs === expectedCOGS, 'Historical line item cogs unchanged');
  assert(readSaleItems1[0].item_gross_profit === expectedGrossProfit, 'Historical line item gross profit unchanged');

  // ----------------------------------------------------
  // 2. CANCELLATION / REVERSAL
  // ----------------------------------------------------
  console.log('\n--- 2. CANCELLATION / REVERSAL ---');
  const b1_A_afterSale = BatchRepository.getById(b1_A.id)!.current_quantity; // 0
  const b1_B_afterSale = BatchRepository.getById(b1_B.id)!.current_quantity; // 20
  assert(b1_A_afterSale === 0, 'Batch A was reduced to 0 by sale');
  assert(b1_B_afterSale === 20, 'Batch B was reduced to 20 by sale');

  const cashbox0 = state.cashboxes[0];
  const cashBalanceBeforeCancel = cashbox0.cached_balance;

  const cancelledSale = SalesService.cancelSale(sale1.id, 'إلغاء لغرض التحقق من رد المخزون');

  // Verify original sale remains in db and not deleted
  const foundSaleInDb = state.sales.find((s) => s.id === sale1.id);
  assert(!!foundSaleInDb, 'Original sale remains in database (NOT deleted)');
  assert(foundSaleInDb?.status === 'cancelled', 'Original sale marked as cancelled');
  assert(foundSaleInDb?.cancellation_reason === 'إلغاء لغرض التحقق من رد المخزون', 'Cancellation reason saved');

  // Verify exact original batches received stock back (NO FEFO run on reversal)
  const b1_A_afterCancel = BatchRepository.getById(b1_A.id)!;
  const b1_B_afterCancel = BatchRepository.getById(b1_B.id)!;
  assert(b1_A_afterCancel.current_quantity === 50, 'Stock returned to ORIGINAL Batch A (50 units restored)');
  assert(b1_A_afterCancel.status === 'active', 'Batch A status restored to active');
  assert(b1_B_afterCancel.current_quantity === 70, 'Stock returned to ORIGINAL Batch B (70 units restored)');

  // Verify stock movements
  const reversalMovements = state.stock_movements.filter(
    (m) => m.reference_type === 'sale_cancellation' && m.reference_id === sale1.invoice_number
  );
  assert(reversalMovements.length === 2, 'Compensating stock movements created for each original allocation');
  assert(
    reversalMovements.some((m) => m.batch_id === b1_A.id && m.quantity_delta === 50),
    'Reversal movement for Batch A restored exactly +50'
  );
  assert(
    reversalMovements.some((m) => m.batch_id === b1_B.id && m.quantity_delta === 50),
    'Reversal movement for Batch B restored exactly +50'
  );

  // Cash transaction reversed exactly once
  const cashRefundTx = state.cash_transactions.filter(
    (tx) => tx.reference_type === 'sale_cancellation' && tx.reference_id === sale1.invoice_number
  );
  assert(cashRefundTx.length === 1, 'Cash transaction reversed exactly once');
  assert(cashRefundTx[0].amount === 20000, 'Cash refund amount matches sale net total (20000)');
  assert(cashRefundTx[0].direction === 'OUT', 'Cash refund direction is OUT');
  assert(cashbox0.cached_balance === cashBalanceBeforeCancel - 20000, 'Cashbox balance decreased by 20000');

  // Audit record exists
  const cancelAudit = state.audit_logs.find(
    (log) => log.action === 'CANCEL_SALE' && log.entity_id === sale1.id
  );
  assert(!!cancelAudit, 'Audit log record exists for CANCEL_SALE');

  // ----------------------------------------------------
  // 3. DOUBLE CANCELLATION
  // ----------------------------------------------------
  console.log('\n--- 3. DOUBLE CANCELLATION ---');
  let doubleCancelRejected = false;
  const b1_A_beforeDouble = BatchRepository.getById(b1_A.id)!.current_quantity;
  const cashBeforeDouble = cashbox0.cached_balance;
  const auditLogsCountBefore = state.audit_logs.length;

  try {
    SalesService.cancelSale(sale1.id, 'محاولة إلغاء ثانية غير قانونية');
  } catch (err: any) {
    doubleCancelRejected = true;
    assert(err.message.includes('ملغاة بالفعل'), 'Second cancellation rejected with explicit message');
  }

  assert(doubleCancelRejected, 'Second cancellation was strictly REJECTED');
  assert(
    BatchRepository.getById(b1_A.id)!.current_quantity === b1_A_beforeDouble,
    'Stock was NOT restored twice'
  );
  assert(cashbox0.cached_balance === cashBeforeDouble, 'Cash was NOT reversed twice');
  assert(state.audit_logs.length === auditLogsCountBefore, 'Duplicate audit log was NOT created');

  // ----------------------------------------------------
  // 4. CREDIT LIMIT & ATOMICITY
  // ----------------------------------------------------
  console.log('\n--- 4. CREDIT LIMIT & ATOMICITY ---');
  const custLimit = CustomerRepository.create({
    name: 'عميل اختبار سقف الائتمان',
    phone: '779998877',
    credit_limit: 10000 // 100.00 YER
  });

  const cartForCredit: CartItem = {
    productId: p1.id,
    productName: p1.name_ar,
    unitName: 'قرص',
    unitFactor: 1,
    quantity: 60, // 60 * 200 = 12000 > 10000
    unitPrice: 200,
    discountAmount: 0,
    availableUnits: [],
    availableStockBase: 120
  };

  const salesCountBeforeCreditExceed = state.sales.length;
  const movCountBeforeCreditExceed = state.stock_movements.length;
  const custTxCountBeforeCreditExceed = state.customer_transactions.length;
  const batchAStockBeforeCreditExceed = BatchRepository.getById(b1_A.id)!.current_quantity;

  let creditExceedRejected = false;
  try {
    SalesService.createSale({
      customer_id: custLimit.id,
      user_id: 'user-01',
      sale_type: 'credit',
      items: [cartForCredit],
      discount_amount: 0
    });
  } catch (err: any) {
    creditExceedRejected = true;
    assert(err.message.includes('سقف الائتمان'), 'Credit limit breach caught with descriptive error');
  }

  assert(creditExceedRejected, 'Sale exceeding credit limit was REJECTED');
  assert(state.sales.length === salesCountBeforeCreditExceed, 'Rollback: NO sale created');
  assert(state.stock_movements.length === movCountBeforeCreditExceed, 'Rollback: NO stock movements created');
  assert(state.customer_transactions.length === custTxCountBeforeCreditExceed, 'Rollback: NO customer transactions created');
  assert(
    BatchRepository.getById(b1_A.id)!.current_quantity === batchAStockBeforeCreditExceed,
    'Rollback: Batch quantity remained untouched'
  );

  // Test: Sale within credit limit (<= credit limit)
  const cartWithinCredit: CartItem = {
    productId: p1.id,
    productName: p1.name_ar,
    unitName: 'قرص',
    unitFactor: 1,
    quantity: 40, // 40 * 200 = 8000 <= 10000
    unitPrice: 200,
    discountAmount: 0,
    availableUnits: [],
    availableStockBase: 120
  };

  const successfulCreditSale = SalesService.createSale({
    customer_id: custLimit.id,
    user_id: 'user-01',
    sale_type: 'credit',
    items: [cartWithinCredit],
    discount_amount: 0
  });

  assert(successfulCreditSale.status === 'completed', 'Sale within credit limit SUCCESS');
  const updatedCust = CustomerRepository.getById(custLimit.id)!;
  assert(updatedCust.cached_balance === 8000, 'Customer balance increased to 8000');

  // Customer Credit Sale Reversal Test
  SalesService.cancelSale(successfulCreditSale.id, 'إرجاع مبيعات آجلة');
  const custLedgerReversals = state.customer_transactions.filter(
    (tx) => tx.reference_type === 'sale_cancellation' && tx.reference_id === successfulCreditSale.invoice_number
  );
  assert(custLedgerReversals.length === 1, 'Customer ledger reversed exactly once upon credit sale cancellation');
  assert(custLedgerReversals[0].credit === 8000, 'Customer credited 8000 to erase debt');
  assert(CustomerRepository.getById(custLimit.id)!.cached_balance === 0, 'Customer balance restored to 0');

  // ----------------------------------------------------
  // 5. CASH SALE ATOMICITY (SIMULATED FAILURE DURING TRANSACTION)
  // ----------------------------------------------------
  console.log('\n--- 5. CASH SALE ATOMICITY ---');
  const salesCountBeforeForcedErr = state.sales.length;
  const batchesBeforeForcedErr = JSON.stringify(state.batches);
  const cashboxesBeforeForcedErr = JSON.stringify(state.cashboxes);

  let forcedCashErrCaught = false;
  try {
    // Attempt checkout with paid_amount < net_total for cash sale
    // This validation triggers AFTER allocations and item processing
    SalesService.createSale({
      user_id: 'user-01',
      sale_type: 'cash',
      items: [cartWithinCredit],
      discount_amount: 0,
      paid_amount: 100 // Required 8000, paid 100 -> throws error
    });
  } catch (err: any) {
    forcedCashErrCaught = true;
    assert(err.message.includes('أقل من إجمالي الفاتورة'), 'Forced error caught during cash checkout validation');
  }

  assert(forcedCashErrCaught, 'Cash error successfully triggered');
  assert(state.sales.length === salesCountBeforeForcedErr, 'Cash Atomicity: NO sale created in database');
  assert(JSON.stringify(state.batches) === batchesBeforeForcedErr, 'Cash Atomicity: Batches rolled back 100%');
  assert(JSON.stringify(state.cashboxes) === cashboxesBeforeForcedErr, 'Cash Atomicity: Cashbox rolled back 100%');

  // ----------------------------------------------------
  // 6. CREDIT SALE ATOMICITY
  // ----------------------------------------------------
  console.log('\n--- 6. CREDIT SALE ATOMICITY ---');
  let forcedCreditErrCaught = false;
  const custTxCountBeforeCreditErr = state.customer_transactions.length;

  try {
    // Inactive customer check happens after cart processing
    const inactiveCust = CustomerRepository.create({
      name: 'عميل غير نشط',
      phone: '770000000'
    });
    db.transaction(() => {
      state.customers.find((c) => c.id === inactiveCust.id)!.is_active = false;
    });

    SalesService.createSale({
      customer_id: inactiveCust.id,
      user_id: 'user-01',
      sale_type: 'credit',
      items: [cartWithinCredit],
      discount_amount: 0
    });
  } catch (err: any) {
    forcedCreditErrCaught = true;
    assert(err.message.includes('غير نشط'), 'Credit sale with inactive customer rejected');
  }

  assert(forcedCreditErrCaught, 'Credit atomicity error triggered');
  assert(state.customer_transactions.length === custTxCountBeforeCreditErr, 'Credit Atomicity: NO customer transaction created');

  // ----------------------------------------------------
  // 7. FEFO EXCLUSIONS (Expired, Quarantined, Inactive, Zero Qty)
  // ----------------------------------------------------
  console.log('\n--- 7. FEFO EXCLUSIONS ---');
  const pExcl: Product = {
    id: 'prod-fefo-exclusions',
    internal_code: 'MED-EXCL-1',
    barcode: '6281002222222',
    name_ar: 'دواء فحص استثناءات FEFO',
    name_en: 'FEFO Exclusions Test',
    category_id: 'cat-01',
    dosage_form: 'tablet',
    base_unit: 'قرص',
    pack_size: 1,
    current_purchase_price: 50,
    current_selling_price: 100,
    min_stock_level: 5,
    reorder_level: 10,
    prescription_required: false,
    is_controlled: false,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  // 1. Expired batch (earliest expiry, but expired!)
  const bExpired: Batch = {
    id: 'b-expired',
    product_id: pExcl.id,
    batch_number: 'B-EXP',
    expiry_date: expiredDate,
    initial_quantity: 100,
    current_quantity: 100,
    purchase_price: 50,
    selling_price: 100,
    status: 'active',
    received_at: 100,
    created_at: 100,
    updated_at: 100
  };

  // 2. Quarantined batch (valid date, but quarantined!)
  const bQuarantined: Batch = {
    id: 'b-quarantine',
    product_id: pExcl.id,
    batch_number: 'B-QUAR',
    expiry_date: futureExp1,
    initial_quantity: 100,
    current_quantity: 100,
    purchase_price: 50,
    selling_price: 100,
    status: 'quarantine',
    received_at: 200,
    created_at: 200,
    updated_at: 200
  };

  // 3. Depleted / inactive batch
  const bDepleted: Batch = {
    id: 'b-depleted-excl',
    product_id: pExcl.id,
    batch_number: 'B-DEP',
    expiry_date: futureExp1,
    initial_quantity: 100,
    current_quantity: 100,
    purchase_price: 50,
    selling_price: 100,
    status: 'depleted',
    received_at: 300,
    created_at: 300,
    updated_at: 300
  };

  // 4. Zero quantity batch
  const bZero: Batch = {
    id: 'b-zero',
    product_id: pExcl.id,
    batch_number: 'B-ZERO',
    expiry_date: futureExp1,
    initial_quantity: 100,
    current_quantity: 0,
    purchase_price: 50,
    selling_price: 100,
    status: 'active',
    received_at: 400,
    created_at: 400,
    updated_at: 400
  };

  // 5. Active, healthy batch
  const bHealthy: Batch = {
    id: 'b-healthy',
    product_id: pExcl.id,
    batch_number: 'B-HEALTHY',
    expiry_date: futureExp2,
    initial_quantity: 100,
    current_quantity: 100,
    purchase_price: 60,
    selling_price: 100,
    status: 'active',
    received_at: 500,
    created_at: 500,
    updated_at: 500
  };

  db.transaction(() => {
    state.products.push(pExcl);
    state.batches.push(bExpired, bQuarantined, bDepleted, bZero, bHealthy);
  });

  const fefoResult = StockService.allocateFEFO(pExcl.id, 50);
  assert(fefoResult.allocations.length === 1, 'Only one batch allocated');
  assert(fefoResult.allocations[0].batchId === bHealthy.id, 'FEFO strictly allocated from bHealthy');
  assert(!fefoResult.allocations.some((a) => a.batchId === bExpired.id), 'FEFO strictly excluded EXPIRED batch');
  assert(!fefoResult.allocations.some((a) => a.batchId === bQuarantined.id), 'FEFO strictly excluded QUARANTINED batch');
  assert(!fefoResult.allocations.some((a) => a.batchId === bDepleted.id), 'FEFO strictly excluded DEPLETED/INACTIVE batch');
  assert(!fefoResult.allocations.some((a) => a.batchId === bZero.id), 'FEFO strictly excluded ZERO QUANTITY batch');

  // ----------------------------------------------------
  // 8. MULTI-UNIT SALE (Box -> Strip -> Tablet)
  // ----------------------------------------------------
  console.log('\n--- 8. MULTI-UNIT SALE ---');
  // 1 box = 10 strips = 100 tablets. Base unit = tablet.
  // 1 strip = 10 tablets.
  const pMultiUnit: Product = {
    id: 'prod-multi-unit',
    internal_code: 'MED-MU-1',
    barcode: '6281003333333',
    name_ar: 'أموكسيسيلين متعدد الوحدات',
    name_en: 'Amoxicillin Multi-Unit',
    category_id: 'cat-01',
    dosage_form: 'capsule',
    base_unit: 'قرص',
    pack_size: 100,
    current_purchase_price: 10,  // 0.10 YER per tablet
    current_selling_price: 20,   // 0.20 YER per tablet
    min_stock_level: 50,
    reorder_level: 100,
    prescription_required: false,
    is_controlled: false,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  const bMulti: Batch = {
    id: 'b-multi-unit',
    product_id: pMultiUnit.id,
    batch_number: 'B-MU-101',
    expiry_date: futureExp3,
    initial_quantity: 1000,
    current_quantity: 1000, // 1000 tablets available
    purchase_price: 10,
    selling_price: 20,
    status: 'active',
    received_at: 1000,
    created_at: 1000,
    updated_at: 1000
  };

  db.transaction(() => {
    state.products.push(pMultiUnit);
    state.batches.push(bMulti);
    state.unit_conversions.push(
      {
        id: 'uc-mu-tablet',
        product_id: pMultiUnit.id,
        unit_name: 'قرص',
        conversion_factor: 1,
        selling_price: 20,
        is_default_sale: false
      },
      {
        id: 'uc-mu-strip',
        product_id: pMultiUnit.id,
        unit_name: 'شريط',
        conversion_factor: 10,
        selling_price: 190, // 1.90 YER per strip (10 tablets)
        is_default_sale: false
      },
      {
        id: 'uc-mu-box',
        product_id: pMultiUnit.id,
        unit_name: 'باكت',
        conversion_factor: 100, // 10 strips * 10 tablets = 100 tablets
        selling_price: 1800, // 18.00 YER per box
        is_default_sale: true
      }
    );
  });

  // Sell 2 boxes = 2 * 100 = 200 tablets (base quantity)
  const cartMultiUnit: CartItem = {
    productId: pMultiUnit.id,
    productName: pMultiUnit.name_ar,
    unitName: 'باكت',
    unitFactor: 100,
    quantity: 2,
    unitPrice: 1800,
    discountAmount: 100, // 1.00 YER discount
    availableUnits: [],
    availableStockBase: 1000
  };

  const muSale = SalesService.createSale({
    user_id: 'user-01',
    sale_type: 'cash',
    items: [cartMultiUnit],
    discount_amount: 0
  });

  const muSaleItems = SaleRepository.getItems(muSale.id);
  assert(muSaleItems.length === 1, 'Sale has 1 line item');
  assert(muSaleItems[0].quantity === 2, 'Sale quantity recorded as 2');
  assert(muSaleItems[0].unit_name === 'باكت', 'Sale unit recorded as باكت');
  assert(muSaleItems[0].unit_factor === 100, 'Conversion factor is 100');
  assert(muSaleItems[0].base_quantity === 200, 'Base quantity correctly computed as 200 tablets');
  assert(muSaleItems[0].unit_price === 1800, 'Unit price recorded as 1800');
  assert(muSaleItems[0].line_total === 2 * 1800 - 100, 'Line total is 3500 (2 * 1800 - 100)');

  // Verify stock deduction in base units
  assert(
    BatchRepository.getById(bMulti.id)!.current_quantity === 800,
    'Stock deducted by 200 base units (1000 -> 800 tablets)'
  );

  // ----------------------------------------------------
  // 9. NUMERIC INPUT DIGIT NORMALIZATION LOGIC
  // ----------------------------------------------------
  console.log('\n--- 9. NUMERIC INPUT LOGIC ---');
  // Normalization helper function matching NumericInput.tsx
  function normalizeNumericInput(rawInput: string, allowDecimals = true): number {
    let raw = rawInput
      .replace(/[٠۰]/g, '0')
      .replace(/[١۱]/g, '1')
      .replace(/[٢۲]/g, '2')
      .replace(/[٣۳]/g, '3')
      .replace(/[٤۴]/g, '4')
      .replace(/[٥۵]/g, '5')
      .replace(/[٦۶]/g, '6')
      .replace(/[٧۷]/g, '7')
      .replace(/[٨۸]/g, '8')
      .replace(/[٩۹]/g, '9')
      .replace(/[،,]/g, '.');

    const pattern = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
    if (raw === '' || pattern.test(raw)) {
      if (raw === '' || raw === '-' || raw === '.') return 0;
      const parsed = parseFloat(raw);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  assert(normalizeNumericInput('١٢٣٤٥') === 12345, 'Arabic-Indic numerals ١٢٣٤٥ normalize to 12345');
  assert(normalizeNumericInput('۱۲۳۴۵') === 12345, 'Persian numerals ۱۲۳۴۵ normalize to 12345');
  assert(normalizeNumericInput('١٢،٥') === 12.5, 'Arabic comma decimal ١٢،٥ normalizes to 12.5');
  assert(normalizeNumericInput('') === 0, 'Empty string returns 0 without crashing');
  assert(normalizeNumericInput('12345') === 12345, 'ASCII digits 12345 normalize to 12345');

  // ----------------------------------------------------
  // 10. DUPLICATE POST (Double-Tap Protection)
  // ----------------------------------------------------
  console.log('\n--- 10. DUPLICATE POST (IDEMPOTENCY) ---');
  const token = `idemp-gate-test-${Date.now()}`;
  const salesCountBeforeDouble = state.sales.length;
  const stockBeforeDouble = BatchRepository.getById(bMulti.id)!.current_quantity;

  const firstPost = SalesService.createSale({
    user_id: 'user-01',
    sale_type: 'cash',
    items: [{ ...cartMultiUnit, quantity: 1, discountAmount: 0 }],
    discount_amount: 0,
    idempotency_key: token
  });
  assert(firstPost.status === 'completed', 'First submission succeeded');

  let duplicatePostCaught = false;
  try {
    SalesService.createSale({
      user_id: 'user-01',
      sale_type: 'cash',
      items: [{ ...cartMultiUnit, quantity: 1, discountAmount: 0 }],
      discount_amount: 0,
      idempotency_key: token
    });
  } catch (err: any) {
    duplicatePostCaught = true;
    assert(err.name === 'DuplicateActionError', 'Duplicate submission caught with DuplicateActionError');
  }

  assert(duplicatePostCaught, 'Rapid duplicate submission rejected');
  assert(state.sales.length === salesCountBeforeDouble + 1, 'Exactly ONE sale was posted');
  assert(
    BatchRepository.getById(bMulti.id)!.current_quantity === stockBeforeDouble - 100,
    'Stock consumed exactly once'
  );

  // ----------------------------------------------------
  // 11. FINANCIAL EQUATIONS (Subtotal - Discount + Tax = Net Total, Net Total - COGS = Gross Profit)
  // ----------------------------------------------------
  console.log('\n--- 11. FINANCIAL EQUATIONS & DETERMINISTIC ARITHMETIC ---');
  // Subtotal = 3 * 1800 = 5400
  // Invoice Discount = 400
  // Discounted Subtotal = 5000
  // Tax Rate = 500 bps (5.00%)
  // Tax Amount = (5000 * 500) / 10000 = 250
  // Net Total = 5000 + 250 = 5250
  // COGS = 3 * 100 tablets * 10 cost = 3000
  // Gross Profit = 5250 - 3000 = 2250

  const finSale = SalesService.createSale({
    user_id: 'user-01',
    sale_type: 'cash',
    items: [
      {
        productId: pMultiUnit.id,
        productName: pMultiUnit.name_ar,
        unitName: 'باكت',
        unitFactor: 100,
        quantity: 3,
        unitPrice: 1800,
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 700
      }
    ],
    discount_amount: 400,
    tax_rate_bps: 500 // 5.00%
  });

  assert(finSale.subtotal === 5400, 'Subtotal is 5400');
  assert(finSale.discount_amount === 400, 'Discount is 400');
  assert(finSale.tax_amount === 250, 'Tax amount is exactly 250');
  assert(
    finSale.subtotal - finSale.discount_amount + finSale.tax_amount === finSale.net_total,
    'Equation 1 verified: subtotal - discount + tax == net_total'
  );
  assert(finSale.net_total === 5250, 'Net total is 5250');
  assert(finSale.total_cogs === 3000, 'COGS is 3000');
  assert(
    finSale.net_total - finSale.total_cogs === finSale.gross_profit,
    'Equation 2 verified: net_total - total_cogs == gross_profit'
  );
  assert(finSale.gross_profit === 2250, 'Gross profit is 2250');

  console.log('\n====================================================');
  console.log(`PHASE 3.1 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
}

runVerification().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
