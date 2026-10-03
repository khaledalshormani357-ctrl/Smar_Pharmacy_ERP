// Phase 8.8 Automated Verification Suite
// Flexible Pharmacy Transaction Units, Arabic Phonetic Transliteration & Vision Invoice Scanner Resiliency

import assert from 'node:assert/strict';
import { db } from './src/db/sqlite.ts';
import { PurchaseService } from './src/services/PurchaseService.ts';
import { SalesService } from './src/services/SalesService.ts';
import {
  transliterateDrugTradeName,
  migrateArabicTradeNames,
} from './src/utils/arabicPhoneticTransliteration.ts';

console.log('================================================================');
console.log('--- STARTING PHASE 8.8 AUTOMATED TEST SUITE ---');
console.log('================================================================\n');

async function runPhase88Tests() {
  // =========================================================================
  // 1. ARABIC PHONETIC TRANSLITERATION ENGINE
  // =========================================================================
  console.log('[SECTION 1/4] Testing Arabic Phonetic Transliteration Engine...');
  const sample1 = transliterateDrugTradeName('Trazol Plus');
  assert.ok(sample1.includes('ترازول') && sample1.includes('بلس'), `Phonetic transliteration of 'Trazol Plus' failed, got: ${sample1}`);

  const sample2 = transliterateDrugTradeName('Panadol Extra');
  assert.ok(sample2.includes('بانادول') || sample2.includes('بنادول'), `Phonetic transliteration of 'Panadol' failed, got: ${sample2}`);
  assert.ok(sample2.includes('إكسترا') || sample2.includes('اكسترا'), `Phonetic transliteration of 'Extra' failed, got: ${sample2}`);

  const sample3 = transliterateDrugTradeName('Amoxicillin 500mg');
  assert.ok(sample3.includes('أموكسيسيلين') || sample3.includes('اموكسيسيلين'), `Phonetic transliteration of 'Amoxicillin' failed, got: ${sample3}`);
  assert.ok(sample3.includes('500'), `Dosage numbers must be preserved, got: ${sample3}`);

  const sample4 = transliterateDrugTradeName('Augmentin 1g');
  assert.ok(sample4.includes('أوجمنتين') || sample4.includes('اوجمنتين'), `Phonetic transliteration of 'Augmentin' failed, got: ${sample4}`);

  console.log(`[PASS] Arabic phonetic transliterations verified:
    - "Trazol Plus" -> "${sample1}"
    - "Panadol Extra" -> "${sample2}"
    - "Amoxicillin 500mg" -> "${sample3}"
    - "Augmentin 1g" -> "${sample4}"`);

  // =========================================================================
  // 2. SAFE NON-DESTRUCTIVE CATALOG ARABIC MIGRATION UTILITY
  // =========================================================================
  console.log('\n[SECTION 2/4] Testing Catalog Arabic Migration Utility...');
  const catalogFixture = [
    {
      id: 'p-fix-1',
      trade_name_en: 'Trazol Plus 50mg',
      name_en: 'Trazol Plus 50mg',
      trade_name_ar: '',
      name_ar: '',
    },
    {
      id: 'p-fix-2',
      trade_name_en: 'Panadol Advance',
      name_en: 'Panadol Advance',
      trade_name_ar: 'بنادول أدفانس أصلي', // Must NEVER be overwritten
      name_ar: 'بنادول أدفانس أصلي',
    },
    {
      id: 'p-fix-3',
      trade_name_en: '',
      trade_name_ar: '',
    },
  ];

  const report = migrateArabicTradeNames(catalogFixture);
  assert.equal(report.productsScanned, 3, 'Must scan 3 products');
  assert.equal(report.arabicNamesGenerated, 1, 'Must generate exactly 1 Arabic name');
  assert.equal(report.existingArabicNamesPreserved, 1, 'Must preserve existing Arabic name');
  assert.equal(report.skipped, 1, 'Must skip product with no English or Arabic name');

  assert.ok(catalogFixture[0].trade_name_ar.includes('ترازول'), 'Product 1 trade_name_ar must be backfilled');
  assert.equal(catalogFixture[1].trade_name_ar, 'بنادول أدفانس أصلي', 'Product 2 existing trade_name_ar must NOT be changed');
  assert.equal(catalogFixture[1].trade_name_en, 'Panadol Advance', 'English trade name must remain untouched');

  console.log(`[PASS] Catalog migration report verified: generated=${report.arabicNamesGenerated}, preserved=${report.existingArabicNamesPreserved}, skipped=${report.skipped}`);

  // =========================================================================
  // 3. FLEXIBLE PHARMACY TRANSACTION UNITS IN PURCHASES
  // =========================================================================
  console.log('\n[SECTION 3/4] Testing Purchases with Multi-Unit Conversions...');
  const state = db.getState();

  // Find or create an active supplier
  let supplier = state.suppliers.find((s) => s.is_active);
  if (!supplier) {
    supplier = {
      id: 'sup_p88_' + Date.now(),
      name: 'شركة الأمل للتوريد الدوائي',
      name_ar: 'شركة الأمل للتوريد الدوائي',
      phone: '777123456',
      cached_balance: 0,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    state.suppliers.push(supplier);
  }

  // Ensure cashbox has funds
  let cashbox = state.cashboxes.find((c) => c.is_active);
  if (!cashbox) {
    cashbox = {
      id: 'cash_p88_' + Date.now(),
      name_ar: 'الصندوق المالي للفرع',
      type: 'main',
      cached_balance: 50000000,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    state.cashboxes.push(cashbox);
  } else {
    cashbox.cached_balance = 50000000;
  }

  // Create product with units: base_unit = 'حبة', conversion unit 'علبة' = factor 30
  const prodId = 'prod_p88_' + Date.now();
  const testProduct: any = {
    id: prodId,
    internal_code: 'MED-P88-01',
    trade_name_ar: 'ترازول بلس 50 مجم',
    trade_name_en: 'Trazol Plus 50mg',
    name_ar: 'ترازول بلس 50 مجم',
    name_en: 'Trazol Plus 50mg',
    dosage_form: 'capsule',
    base_unit: 'حبة',
    pack_size: 30,
    current_purchase_price: 1000, // 10.00 YER per pill
    current_selling_price: 1500,  // 15.00 YER per pill
    min_stock_level: 10,
    reorder_level: 30,
    prescription_required: false,
    is_controlled: false,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  state.products.push(testProduct);

  const unitBox: any = {
    id: 'uc_box_' + Date.now(),
    product_id: prodId,
    unit_name: 'علبة',
    conversion_factor: 30,
    selling_price: 45000, // 450.00 YER per box
    purchase_price: 30000, // 300.00 YER per box
    is_default_sale: true,
    is_active: true,
  };
  state.unit_conversions.push(unitBox);

  // Buy 5 boxes ('علبة')
  // Quantity = 5, factor = 30 -> base_quantity must equal 150
  // Unit purchase price = 30000 -> line total = 150000 (1500.00 YER)
  const purchaseRes = await PurchaseService.createPurchase({
    invoice_number: 'INV-P88-' + Math.floor(Math.random() * 100000),
    supplier_id: supplier.id,
    user_id: 'user-01',
    purchase_date: new Date().toISOString().split('T')[0],
    payment_type: 'cash',
    cashbox_id: cashbox.id,
    items: [
      {
        product_id: prodId,
        batch_number: 'BATCH-P88-X1',
        expiry_date: '2028-06-30',
        unit_name: 'علبة',
        unit_factor: 30,
        quantity: 5,
        unit_purchase_price: 30000,
        unit_selling_price: 45000,
      },
    ],
  });

  assert.equal(purchaseRes.status, 'posted', 'Purchase must be posted');
  const purchaseItem = db.getState().purchase_items.find((pi) => pi.purchase_id === purchaseRes.id);
  assert.ok(purchaseItem, 'Purchase item must exist');
  assert.equal(purchaseItem.unit_name, 'علبة', 'Must snapshot transaction unit name');
  assert.equal(purchaseItem.unit_factor, 30, 'Must snapshot unit conversion factor');
  assert.equal(purchaseItem.quantity, 5, 'Must record entered quantity');
  assert.equal(purchaseItem.base_quantity, 150, 'Must accurately compute base quantity: 5 * 30 = 150');
  assert.equal(purchaseItem.line_total, 150000, 'Must accurately compute line total: 5 * 30000 = 150000');
  assert.equal(purchaseItem.unit_cost_base, 1000, 'Must compute base unit cost: 30000 / 30 = 1000');
  assert.ok(purchaseItem.product_name_snapshot, 'Must snapshot product name');

  // Verify batch stock in base units
  const batch = db.getState().batches.find((b) => b.id === purchaseItem.batch_id);
  assert.ok(batch, 'Batch record must be created');
  assert.equal(batch.current_quantity, 150, 'Batch current quantity must reflect 150 base units (حبة)');
  assert.equal(batch.purchase_price, 1000, 'Batch unit purchase price must be 1000 per base unit');

  console.log(`[PASS] Multi-unit purchase verified: 5 ${purchaseItem.unit_name} = ${purchaseItem.base_quantity} ${testProduct.base_unit}, batch stock=${batch.current_quantity}`);

  // =========================================================================
  // 4. POS SALES IN TRANSACTION UNITS & HISTORICAL SNAPSHOTS
  // =========================================================================
  console.log('\n[SECTION 4/4] Testing POS Sales in Transaction Units & Historical Snapshots...');
  // Sell 20 individual pills ('حبة')
  // Initial stock: 150 -> Remaining stock must be 130
  // Selling price per pill: 1500 -> total: 30000 (300.00 YER)
  // COGS: 20 * 1000 = 20000 -> Gross Profit: 30000 - 20000 = 10000
  const saleRes = await SalesService.createSale({
    user_id: 'user-01',
    customer_id: undefined,
    sale_type: 'cash',
    cashbox_id: cashbox.id,
    discount_amount: 0,
    items: [
      {
        product_id: prodId,
        unit_name: 'حبة',
        unit_factor: 1,
        quantity: 20,
        unit_price: 1500,
        discount_amount: 0,
      } as any,
    ],
  });

  assert.equal(saleRes.status, 'completed', 'Sale must be completed');
  const saleItem = db.getState().sale_items.find((si) => si.sale_id === saleRes.id);
  assert.ok(saleItem, 'Sale item must exist in database');
  assert.equal(saleItem.unit_name, 'حبة', 'Sale item unit must be snapshotted');
  assert.equal(saleItem.unit_factor, 1, 'Sale item factor must be 1');
  assert.equal(saleItem.quantity, 20, 'Quantity must be 20');
  assert.equal(saleItem.base_quantity, 20, 'Base quantity must be 20');
  assert.equal(saleItem.line_total, 30000, 'Line total must be 30000');
  assert.equal(saleItem.item_cogs, 20000, 'COGS must be exactly 20 * 1000 = 20000');
  assert.equal(saleItem.item_gross_profit, 10000, 'Gross profit must be 30000 - 20000 = 10000');
  assert.ok(saleItem.product_name_snapshot, 'Product name must be snapshotted in sale item');

  // Verify remaining stock in batch
  const updatedBatch = db.getState().batches.find((b) => b.id === batch.id);
  assert.equal(updatedBatch?.current_quantity, 130, 'Batch stock must decrease from 150 to 130 base units');

  console.log(`[PASS] POS sale with historical snapshots verified:
    - Sold: ${saleItem.quantity} ${saleItem.unit_name}
    - Line Total: ${saleItem.line_total / 100} YER
    - COGS: ${saleItem.item_cogs / 100} YER, Gross Profit: ${saleItem.item_gross_profit / 100} YER
    - Batch Stock remaining: ${updatedBatch?.current_quantity} ${testProduct.base_unit}`);

  console.log('\n================================================================');
  console.log('=== ALL PHASE 8.8 TESTS PASSED SUCCESSFULLY (4/4) ===');
  console.log('================================================================\n');
}

runPhase88Tests().catch((err) => {
  console.error('\n❌ PHASE 8.8 TEST FAILED:', err);
  process.exit(1);
});
