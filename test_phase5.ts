// ============================================================================
// PHASE 5 — RETURNS INTEGRITY AUTOMATED VERIFICATION SUITE
// Sales Returns + Purchase Returns + Provenance + Atomic Financial Reversal
// ============================================================================

import { db } from './src/db/sqlite';
import { SalesService } from './src/services/SalesService';
import { PurchaseService } from './src/services/PurchaseService';
import { SalesReturnService } from './src/services/SalesReturnService';
import { PurchaseReturnService } from './src/services/PurchaseReturnService';
import {
  CustomerRepository,
  SupplierRepository,
  SaleRepository,
  PurchaseRepository,
  SaleReturnRepository,
  PurchaseReturnRepository
} from './src/db/repositories';
import { Product, Batch } from './src/types';
import { Money } from './src/utils/money';

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

function createTestProduct(p: {
  id: string;
  internal_code: string;
  name_ar: string;
  purchase_price: number;
  selling_price: number;
  base_unit: string;
}): Product {
  const prod: Product = {
    id: p.id,
    internal_code: p.internal_code,
    barcode: 'BAR-' + p.id,
    name_ar: p.name_ar,
    name_en: p.name_ar,
    category_id: 'cat-01',
    dosage_form: 'tablet',
    base_unit: p.base_unit,
    pack_size: 1,
    current_purchase_price: p.purchase_price,
    current_selling_price: p.selling_price,
    is_active: true,
    min_stock_level: 0,
    reorder_level: 0,
    prescription_required: false,
    is_controlled: false,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  db.getState().products.push(prod);
  return prod;
}

function createTestBatch(b: {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  current_quantity: number;
  purchase_price: number;
  selling_price: number;
}): Batch {
  const batch: Batch = {
    id: b.id,
    product_id: b.product_id,
    batch_number: b.batch_number,
    expiry_date: b.expiry_date,
    received_at: Date.now(),
    purchase_price: b.purchase_price,
    selling_price: b.selling_price,
    initial_quantity: b.current_quantity,
    current_quantity: b.current_quantity,
    status: 'active',
    created_at: Date.now(),
    updated_at: Date.now()
  };
  db.getState().batches.push(batch);
  return batch;
}

async function runPhase5Verification() {
  console.log('====================================================');
  console.log('STARTING PHASE 5 — RETURNS INTEGRITY VERIFICATION');
  console.log('====================================================\n');

  const state = db.getState();
  const userId = state.users[0].id;

  // --------------------------------------------------------------------------
  // SECTION 1: SALES RETURN - SINGLE ITEM, CASH REFUND & PROVENANCE
  // --------------------------------------------------------------------------
  console.log('--- 1. SALES RETURN - SINGLE ITEM, CASH REFUND & PROVENANCE ---');

  // 1.1 Create product & batch
  const prod1 = createTestProduct({
    id: 'prod-ret-01',
    internal_code: 'RET-PROD-01',
    name_ar: 'بانادول مايجرين 24 قرص',
    base_unit: 'قرص',
    purchase_price: 1000, // 10.00
    selling_price: 1500 // 15.00
  });

  // Create Batch 1 with 100 units at cost 10.00
  const b1Id = 'batch-ret-01';
  createTestBatch({
    id: b1Id,
    product_id: prod1.id,
    batch_number: 'BN-RET-01',
    expiry_date: '2028-06-30',
    current_quantity: 100,
    purchase_price: 1000,
    selling_price: 1500
  });

  // Ensure cashbox has sufficient funds
  const cashbox = state.cashboxes[0];
  cashbox.cached_balance = 500000; // 5,000.00

  // 1.2 Perform cash sale: 10 units at 15.00 = 150.00 (15,000 minor)
  const initialCashBalance = cashbox.cached_balance;
  const initialBatchStock = state.batches.find((b) => b.id === b1Id)!.current_quantity;

  const sale1 = SalesService.createSale({
    customer_id: 'cust-cash',
    user_id: userId,
    sale_type: 'cash',
    cashbox_id: cashbox.id,
    items: [
      {
        productId: prod1.id,
        productName: prod1.name_ar,
        quantity: 10,
        unitName: 'قرص',
        unitFactor: 1,
        unitPrice: 1500,
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 100
      }
    ],
    discount_amount: 0,
    tax_rate_bps: 0
  });

  assert(sale1.status === 'completed', 'Sale 1 completed successfully');
  assert(sale1.net_total === 15000, 'Sale 1 net total is 15000');
  assert(cashbox.cached_balance === initialCashBalance + 15000, 'Cashbox received 15000');
  assert(
    state.batches.find((b) => b.id === b1Id)!.current_quantity === initialBatchStock - 10,
    'Batch stock deducted by 10 units'
  );

  const sale1Items = SaleRepository.getItems(sale1.id);
  assert(sale1Items.length === 1, 'Sale 1 has 1 line item');
  const sItem1 = sale1Items[0];

  // 1.3 Perform Partial Sales Return: Return 3 units (resellable)
  const cashBeforeReturn = cashbox.cached_balance;
  const batchStockBeforeReturn = state.batches.find((b) => b.id === b1Id)!.current_quantity;

  const ret1 = SalesReturnService.createSaleReturn({
    sale_id: sale1.id,
    items: [
      {
        sale_item_id: sItem1.id,
        returned_quantity: 3,
        item_condition: 'resellable',
        item_reason: 'طلب العميل'
      }
    ],
    settlement_method: 'cash',
    cashbox_id: cashbox.id,
    return_reason: 'إرجاع جزئي نقدي',
    userId
  });

  assert(ret1.status === 'completed', 'Sale return 1 created with status completed');
  assert(ret1.total_refund_amount === 4500, 'Total refund amount is 3 * 1500 = 4500');
  assert(ret1.total_cogs_reversed === 3000, 'Total COGS reversed is 3 * 1000 = 3000');

  // Verify Cashbox deduction
  assert(
    cashbox.cached_balance === cashBeforeReturn - 4500,
    'Cashbox balance deducted exactly by 4500 for refund'
  );

  // Verify Cash Transaction
  const lastCashTx = state.cash_transactions[state.cash_transactions.length - 1];
  assert(lastCashTx.type === 'sale_return_cash', 'Cash transaction type is sale_return_cash');
  assert(lastCashTx.direction === 'OUT', 'Cash transaction direction is OUT');
  assert(lastCashTx.amount === 4500, 'Cash transaction amount is 4500');
  assert(lastCashTx.balance_after === cashbox.cached_balance, 'Cash transaction balance_after is accurate');

  // Verify Batch Stock restored to original batch (NOT via FEFO)
  const batchStockAfterReturn = state.batches.find((b) => b.id === b1Id)!.current_quantity;
  assert(
    batchStockAfterReturn === batchStockBeforeReturn + 3,
    'Stock restored directly to original batch (+3)'
  );

  // Verify Stock Movement
  const lastStockMove = state.stock_movements[state.stock_movements.length - 1];
  assert(lastStockMove.movement_type === 'sale_return', 'Stock movement type is sale_return');
  assert(lastStockMove.quantity_delta === 3, 'Stock movement quantity_delta is +3');
  assert(lastStockMove.batch_id === b1Id, 'Stock movement targets original batch ID');

  // Verify Original Sale status updated to returned_partially
  const updatedSale1 = SaleRepository.getById(sale1.id)!;
  assert(
    updatedSale1.status === 'returned_partially',
    'Original sale status updated to returned_partially'
  );

  // 1.4 Perform Second Return: Return remaining 7 units to fully return sale
  const ret2 = SalesReturnService.createSaleReturn({
    sale_id: sale1.id,
    items: [
      {
        sale_item_id: sItem1.id,
        returned_quantity: 7,
        item_condition: 'resellable'
      }
    ],
    settlement_method: 'cash',
    cashbox_id: cashbox.id,
    userId
  });

  assert(ret2.status === 'completed', 'Sale return 2 completed');
  assert(ret2.total_refund_amount === 10500, 'Total refund amount is 7 * 1500 = 10500');

  const fullyReturnedSale1 = SaleRepository.getById(sale1.id)!;
  assert(
    fullyReturnedSale1.status === 'returned_fully',
    'Original sale status updated to returned_fully when all items returned'
  );

  // 1.5 Attempting return beyond purchased quantity -> MUST FAIL
  let overReturnFailed = false;
  try {
    SalesReturnService.createSaleReturn({
      sale_id: sale1.id,
      items: [
        {
          sale_item_id: sItem1.id,
          returned_quantity: 1,
          item_condition: 'resellable'
        }
      ],
      settlement_method: 'cash',
      userId
    });
  } catch (err: any) {
    overReturnFailed = true;
    assert(
      (err?.message || '').includes('تتجاوز') || (err?.message || '').includes('القابلة للإرجاع'),
      'Over-return rejected with clear descriptive message'
    );
  }
  assert(overReturnFailed, 'Attempting to return more than purchased was strictly REJECTED');

  // --------------------------------------------------------------------------
  // SECTION 2: MULTI-BATCH PROVENANCE & DAMAGED / QUARANTINED CONDITION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. MULTI-BATCH PROVENANCE & DAMAGED CONDITION ---');

  const prod2 = createTestProduct({
    id: 'prod-ret-02',
    internal_code: 'RET-PROD-02',
    name_ar: 'أموكسيسيلين 500 مجم كبسولات',
    base_unit: 'كبسولة',
    purchase_price: 200,
    selling_price: 350
  });

  // Batch A: 30 units at cost 200, expiry 2027-01-01
  const bAId = 'batch-ret-amox-a';
  createTestBatch({
    id: bAId,
    product_id: prod2.id,
    batch_number: 'AMX-A',
    expiry_date: '2027-01-01',
    current_quantity: 30,
    purchase_price: 200,
    selling_price: 350
  });

  // Batch B: 50 units at cost 250, expiry 2027-06-01
  const bBId = 'batch-ret-amox-b';
  createTestBatch({
    id: bBId,
    product_id: prod2.id,
    batch_number: 'AMX-B',
    expiry_date: '2027-06-01',
    current_quantity: 50,
    purchase_price: 250,
    selling_price: 350
  });

  // Sale spanning both batches: 40 units (30 from A, 10 from B)
  const sale2 = SalesService.createSale({
    customer_id: 'cust-cash',
    user_id: userId,
    sale_type: 'cash',
    cashbox_id: cashbox.id,
    items: [
      {
        productId: prod2.id,
        productName: prod2.name_ar,
        quantity: 40,
        unitName: 'كبسولة',
        unitFactor: 1,
        unitPrice: 350,
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 100
      }
    ],
    discount_amount: 0,
    tax_rate_bps: 0
  });

  assert(sale2.status === 'completed', 'Sale 2 completed across 2 batches');
  const bAAfterSale = state.batches.find((b) => b.id === bAId)!;
  const bBAfterSale = state.batches.find((b) => b.id === bBId)!;
  assert(bAAfterSale.current_quantity === 0, 'Batch A depleted to 0');
  assert(bAAfterSale.status === 'depleted', 'Batch A status marked as depleted');
  assert(bBAfterSale.current_quantity === 40, 'Batch B reduced to 40');

  const sale2Item = SaleRepository.getItems(sale2.id)[0];
  const sale2Allocs = SaleRepository.getAllocations(sale2.id);
  assert(sale2Allocs.length === 2, 'Sale 2 has 2 allocations across batches');

  // Return 15 units of this item with condition 'damaged' (تالف)
  const retDamaged = SalesReturnService.createSaleReturn({
    sale_id: sale2.id,
    items: [
      {
        sale_item_id: sale2Item.id,
        returned_quantity: 15,
        item_condition: 'damaged',
        item_reason: 'تلف كيميائي'
      }
    ],
    settlement_method: 'cash',
    cashbox_id: cashbox.id,
    userId
  });

  assert(retDamaged.status === 'completed', 'Damaged return processed');

  // Damaged items must be quarantined!
  // Find quarantine batch created or updated
  const quarantinedBatches = state.batches.filter(
    (b) => b.product_id === prod2.id && b.status === 'quarantine'
  );
  assert(quarantinedBatches.length > 0, 'Quarantined batch exists for damaged returned product');
  const totalQuarantineQty = quarantinedBatches.reduce((sum, b) => sum + b.current_quantity, 0);
  assert(
    totalQuarantineQty === 15,
    'Quarantine batches hold exactly 15 damaged units, sequestered from active stock'
  );

  // Active batches should NOT include quarantined damaged inventory!
  const bANow = state.batches.find((b) => b.id === bAId)!;
  const bBNow = state.batches.find((b) => b.id === bBId)!;
  assert(bANow.status === 'quarantine', 'Batch A status marked as quarantine due to damage');
  assert(bANow.current_quantity === 15, 'Batch A holds 15 returned units');
  assert(bBNow.current_quantity === 40, 'Sellable batch B unchanged at 40');
  const activeSellableStock = state.batches
    .filter((b) => b.product_id === prod2.id && b.status === 'active')
    .reduce((sum, b) => sum + b.current_quantity, 0);
  assert(activeSellableStock === 40, 'Active sellable stock strictly excludes quarantined units (40)');

  // --------------------------------------------------------------------------
  // SECTION 3: CREDIT SALES RETURN & CUSTOMER LEDGER ADJUSTMENT
  // --------------------------------------------------------------------------
  console.log('\n--- 3. CREDIT SALES RETURN & CUSTOMER LEDGER ADJUSTMENT ---');

  const customer1 = CustomerRepository.create({
    name: 'صالح عبد الله الأحمدي',
    phone: '771234567',
    credit_limit: 100000
  });

  // Credit sale: 20 units of prod2 at 350 = 7000 minor
  const saleCredit = SalesService.createSale({
    customer_id: customer1.id,
    user_id: userId,
    sale_type: 'credit',
    items: [
      {
        productId: prod2.id,
        productName: prod2.name_ar,
        quantity: 20,
        unitName: 'كبسولة',
        unitFactor: 1,
        unitPrice: 350,
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 100
      }
    ],
    discount_amount: 0,
    tax_rate_bps: 0
  });

  const custAfterSale = CustomerRepository.getById(customer1.id)!;
  assert(custAfterSale.cached_balance === 7000, 'Customer debt is 7000 after credit sale');

  // Return 5 units as credit settlement (should reduce customer balance by 5 * 350 = 1750)
  const creditSaleItem = SaleRepository.getItems(saleCredit.id)[0];
  const retCredit = SalesReturnService.createSaleReturn({
    sale_id: saleCredit.id,
    items: [
      {
        sale_item_id: creditSaleItem.id,
        returned_quantity: 5,
        item_condition: 'resellable',
        item_reason: 'فائض عن الحاجة'
      }
    ],
    settlement_method: 'credit',
    userId
  });

  assert(retCredit.status === 'completed', 'Credit return processed');
  assert(retCredit.total_refund_amount === 1750, 'Total refund amount is 1750');

  // Customer debt should be reduced from 7000 to 5250
  const custAfterReturn = CustomerRepository.getById(customer1.id)!;
  assert(
    custAfterReturn.cached_balance === 5250,
    'Customer balance reduced by 1750 (7000 - 1750 = 5250)'
  );

  // Verify Customer Transaction
  const lastCustTx = state.customer_transactions[state.customer_transactions.length - 1];
  assert(lastCustTx.customer_id === customer1.id, 'Customer transaction created for correct customer');
  assert(lastCustTx.credit === 1750, 'Customer credited with 1750 to reduce debt');
  assert(lastCustTx.debit === 0, 'Customer debit is 0');
  assert(lastCustTx.balance_after === 5250, 'Customer balance_after recorded accurately');
  assert(
    lastCustTx.transaction_type === 'sale_return_credit',
    'Customer transaction type is sale_return_credit'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: PURCHASE RETURN - RETURN GOODS TO SUPPLIER
  // --------------------------------------------------------------------------
  console.log('\n--- 4. PURCHASE RETURN - RETURN GOODS TO SUPPLIER ---');

  const supplier1 = SupplierRepository.create({
    name_ar: 'الشركة المتحدة للمستلزمات الطبية',
    name_en: 'United Medical Supplies',
    phone: '012345678',
    opening_balance: 0,
    credit_limit: 200000
  });

  const prod3 = createTestProduct({
    id: 'prod-ret-03',
    internal_code: 'RET-PROD-03',
    name_ar: 'فيتامين سي 1000 فوار',
    base_unit: 'أنبوب',
    purchase_price: 800,
    selling_price: 1200
  });

  // 4.1 Create credit purchase: 50 units at 800 = 40,000 minor
  const purchase1 = PurchaseService.createPurchase({
    supplier_id: supplier1.id,
    user_id: userId,
    invoice_number: 'SUP-INV-RET-01',
    purchase_date: '2025-09-15',
    payment_type: 'credit',
    items: [
      {
        product_id: prod3.id,
        batch_number: 'VITC-01',
        expiry_date: '2028-12-31',
        unit_name: 'أنبوب',
        unit_factor: 1,
        quantity: 50,
        unit_purchase_price: 800,
        unit_selling_price: 1200
      }
    ]
  });

  assert(purchase1.status === 'posted', 'Purchase 1 posted successfully');
  const suppAfterPurchase = SupplierRepository.getById(supplier1.id)!;
  assert(suppAfterPurchase.cached_balance === 40000, 'Supplier balance is 40,000 (debt owed)');

  const p1Items = PurchaseRepository.getItems(purchase1.id);
  const pItem1 = p1Items[0];
  const pBatch = state.batches.find((b) => b.id === pItem1.batch_id)!;
  assert(pBatch.current_quantity === 50, 'Batch created with 50 units');

  // 4.2 Return 10 units to supplier (Credit settlement -> reduces debt)
  const pret1 = PurchaseReturnService.createPurchaseReturn({
    purchase_id: purchase1.id,
    items: [
      {
        purchase_item_id: pItem1.id,
        returned_quantity: 10,
        batch_id: pBatch.id,
        item_reason: 'تاريخ الصلاحية أقصر من المتفق عليه'
      }
    ],
    settlement_method: 'credit',
    return_reason: 'إرجاع جزء من الشحنة للمورد',
    userId
  });

  assert(pret1.status === 'completed', 'Purchase return 1 completed');
  assert(pret1.total_refund_amount === 8000, 'Refund amount is 10 * 800 = 8000');

  // Supplier debt should be reduced from 40,000 to 32,000
  const suppAfterReturn = SupplierRepository.getById(supplier1.id)!;
  assert(
    suppAfterReturn.cached_balance === 32000,
    'Supplier balance reduced by 8000 (40,000 - 8000 = 32,000)'
  );

  // Verify Supplier Transaction
  const lastSuppTx = state.supplier_transactions[state.supplier_transactions.length - 1];
  assert(lastSuppTx.supplier_id === supplier1.id, 'Supplier transaction created');
  assert(lastSuppTx.debit === 8000, 'Supplier debited with 8000 to erase debt');
  assert(lastSuppTx.credit === 0, 'Supplier credit is 0');
  assert(lastSuppTx.balance_after === 32000, 'Supplier balance_after recorded accurately');
  assert(
    lastSuppTx.transaction_type === 'purchase_return_credit',
    'Supplier transaction type is purchase_return_credit'
  );

  // Batch stock should be deducted from 50 to 40
  const pBatchAfterReturn = state.batches.find((b) => b.id === pBatch.id)!;
  assert(
    pBatchAfterReturn.current_quantity === 40,
    'Batch stock safely deducted from 50 to 40'
  );

  // Stock movement verified
  const pStockMove = state.stock_movements[state.stock_movements.length - 1];
  assert(pStockMove.movement_type === 'purchase_return', 'Stock movement type is purchase_return');
  assert(pStockMove.quantity_delta === -10, 'Stock movement quantity_delta is -10');
  assert(pStockMove.batch_id === pBatch.id, 'Stock movement targets purchase batch ID');

  // Original Purchase status updated to returned_partially
  const updatedPurch1 = PurchaseRepository.getById(purchase1.id)!;
  assert(
    updatedPurch1.status === 'returned_partially',
    'Purchase status updated to returned_partially'
  );

  // 4.3 Cash purchase return: Receive cash into cashbox
  const getCashbox = () => state.cashboxes[0];
  const getPBatch = () => state.batches.find((b) => b.id === pItem1.batch_id)!;

  const cashBeforePurchReturn = getCashbox().cached_balance;
  const pret2 = PurchaseReturnService.createPurchaseReturn({
    purchase_id: purchase1.id,
    items: [
      {
        purchase_item_id: pItem1.id,
        returned_quantity: 5,
        batch_id: getPBatch().id
      }
    ],
    settlement_method: 'cash',
    cashbox_id: getCashbox().id,
    userId
  });

  assert(pret2.status === 'completed', 'Purchase return 2 (cash) completed');
  assert(pret2.total_refund_amount === 4000, 'Refund amount is 5 * 800 = 4000');
  assert(
    getCashbox().cached_balance === cashBeforePurchReturn + 4000,
    'Cashbox received cash refund from supplier (+4000)'
  );

  const lastCashPurchTx = state.cash_transactions[state.cash_transactions.length - 1];
  assert(
    lastCashPurchTx.type === 'purchase_return_cash',
    'Cash transaction type is purchase_return_cash'
  );
  assert(lastCashPurchTx.direction === 'IN', 'Cash transaction direction is IN');
  assert(lastCashPurchTx.amount === 4000, 'Cash transaction amount is 4000');

  // 4.4 Prevent returning stock that has already been sold/consumed
  // Consume units out of the remaining in batch
  getPBatch().current_quantity = 2; // only 2 units left physically
  let stockSafetyFailed = false;
  try {
    PurchaseReturnService.createPurchaseReturn({
      purchase_id: purchase1.id,
      items: [
        {
          purchase_item_id: pItem1.id,
          returned_quantity: 10, // wants to return 10, but only 2 exist physically
          batch_id: getPBatch().id
        }
      ],
      settlement_method: 'credit',
      userId
    });
  } catch (err: any) {
    stockSafetyFailed = true;
    assert(
      err.message.includes('غير كافٍ') && err.message.includes('لإرجاع الكمية المطلوبة'),
      'Physical stock shortage caught and blocked'
    );
  }
  assert(stockSafetyFailed, 'Attempting to return more than physical batch stock strictly REJECTED');

  // --------------------------------------------------------------------------
  // SECTION 5: CANCELLATION OF RETURNS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. CANCELLATION OF RETURNS (REVERSING A RETURN) ---');

  // 5.1 Cancel pret2 (Purchase Return 2)
  const cashBeforeCancelPR = getCashbox().cached_balance;
  const pBatchQtyBeforeCancel = getPBatch().current_quantity;

  PurchaseReturnService.cancelPurchaseReturn(
    pret2.id,
    'تم إلغاء المردود واستبقاء البضاعة بالاتفاق مع المندوب',
    userId
  );

  const cancelledPR = PurchaseReturnRepository.getById(pret2.id)!;
  assert(cancelledPR.status === 'cancelled', 'Purchase return marked as cancelled');
  assert(
    getCashbox().cached_balance === cashBeforeCancelPR - 4000,
    'Cashbox refunded the supplier cash (reversal) (-4000)'
  );
  assert(
    getPBatch().current_quantity === pBatchQtyBeforeCancel + 5,
    'Batch stock re-credited (+5) upon purchase return cancellation'
  );

  // 5.2 Prevent double cancellation
  let doubleCancelPRFailed = false;
  try {
    PurchaseReturnService.cancelPurchaseReturn(pret2.id, 'محاولة إلغاء ثانية', userId);
  } catch (err: any) {
    doubleCancelPRFailed = true;
    assert(
      err.message.includes('ملغى بالفعل مسبقاً'),
      'Double cancellation rejected with clear error'
    );
  }
  assert(doubleCancelPRFailed, 'Double cancellation of purchase return is BLOCKED');

  // 5.3 Cancel ret1 (Sale Return 1)
  const b1StockBeforeCancelSR = state.batches.find((b) => b.id === b1Id)!.current_quantity;
  const cashBeforeCancelSR = getCashbox().cached_balance;

  SalesReturnService.cancelSaleReturn(
    ret1.id,
    'خطأ في إدخال المردود - الزبون احتفظ بالدواء',
    userId
  );

  const cancelledSR = SaleReturnRepository.getById(ret1.id)!;
  assert(cancelledSR.status === 'cancelled', 'Sale return marked as cancelled');
  assert(
    getCashbox().cached_balance === cashBeforeCancelSR + 4500,
    'Cash recovered into cashbox upon sale return cancellation (+4500)'
  );
  assert(
    state.batches.find((b) => b.id === b1Id)!.current_quantity === b1StockBeforeCancelSR - 3,
    'Stock re-deducted (-3) upon sale return cancellation'
  );

  // --------------------------------------------------------------------------
  // SECTION 6: ATOMIC ROLLBACK ON INSUFFICIENT CASHBOX FUNDS
  // --------------------------------------------------------------------------
  console.log('\n--- 6. ATOMIC ROLLBACK ON INSUFFICIENT CASHBOX FUNDS ---');

  // Set cashbox balance to very low amount
  getCashbox().cached_balance = 100; // only 1.00

  let cashboxShortageCaught = false;
  try {
    SalesReturnService.createSaleReturn({
      sale_id: sale2.id,
      items: [
        {
          sale_item_id: sale2Item.id,
          returned_quantity: 5,
          item_condition: 'resellable'
        }
      ],
      settlement_method: 'cash',
      cashbox_id: getCashbox().id,
      userId
    });
  } catch (err: any) {
    cashboxShortageCaught = true;
    assert(
      err.message.includes('غير كافٍ لسداد قيمة المردود'),
      'Insufficient cashbox error caught'
    );
  }
  assert(cashboxShortageCaught, 'Cash refund exceeding cashbox balance strictly REJECTED');
  assert(getCashbox().cached_balance === 100, 'Cashbox balance untouched on transaction rollback');

  // --------------------------------------------------------------------------
  // SECTION 7: AUDIT LOG VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. AUDIT LOG INTEGRITY ---');

  const auditLogs = state.audit_logs;
  const saleReturnLogs = auditLogs.filter((l) => l.entity === 'sale_return');
  const purchaseReturnLogs = auditLogs.filter((l) => l.entity === 'purchase_return');

  assert(saleReturnLogs.length > 0, 'Audit logs recorded for sale_return actions');
  assert(purchaseReturnLogs.length > 0, 'Audit logs recorded for purchase_return actions');
  assert(
    saleReturnLogs.some((l) => l.action === 'CREATE'),
    'Audit log exists for CREATE sale_return'
  );
  assert(
    saleReturnLogs.some((l) => l.action === 'CANCEL'),
    'Audit log exists for CANCEL sale_return'
  );
  assert(
    purchaseReturnLogs.some((l) => l.action === 'CREATE'),
    'Audit log exists for CREATE purchase_return'
  );
  assert(
    purchaseReturnLogs.some((l) => l.action === 'CANCEL'),
    'Audit log exists for CANCEL purchase_return'
  );

  console.log('\n====================================================');
  console.log(`PHASE 5 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
}

runPhase5Verification().catch((err) => {
  console.error('Fatal error in Phase 5 verification:', err);
  process.exit(1);
});
