import assert from 'node:assert/strict';
import { db } from './src/db/sqlite.ts';
import { PurchaseService } from './src/services/PurchaseService.ts';
import { CatalogImportService } from './src/services/CatalogImportService.ts';
import { DomainValidator } from './src/db/validation.ts';
import {
  normalizeInputText,
  cleanNumericDraft,
  parseSafeNumber,
  normalizeArabicSearchText
} from './src/utils/inputSafety.ts';
import { Money } from './src/utils/money.ts';
import { Product, Purchase } from './src/types.ts';

console.log('--- STARTING PHASE 8.4 VERIFICATION SUITE ---');

// =========================================================================
// SECTION 1: NUMERIC INPUT & BACKSPACE RUNTIME VERIFICATION
// =========================================================================
console.log('[1/5] Testing NumericInput & InputSafety normalization & backspace...');

// 1.1 Arabic and Persian numerals conversion
assert.equal(normalizeInputText('٠١٢٣٤٥٦٧٨٩'), '0123456789', 'Arabic numerals must map to Latin');
assert.equal(normalizeInputText('۰۱۲۳۴۵۶۷۸۹'), '0123456789', 'Persian numerals must map to Latin');
assert.equal(normalizeInputText('١٢٫٥'), '12.5', 'Arabic decimal mark ٫ must map to period .');
assert.equal(normalizeInputText('١٢،٥'), '12.5', 'Arabic comma ، must map to period .');

// 1.2 Backspace simulation & draft cleanup
let draft = '123.45';
// User presses Backspace 3 times
draft = draft.slice(0, -1); // '123.4'
assert.equal(cleanNumericDraft(draft), '123.4');
draft = draft.slice(0, -1); // '123.'
assert.equal(cleanNumericDraft(draft), '123.');
draft = draft.slice(0, -1); // '123'
assert.equal(cleanNumericDraft(draft), '123');
// Backspace to empty
draft = '';
assert.equal(cleanNumericDraft(draft), '', 'Empty draft should remain empty string during editing');
assert.equal(parseSafeNumber(draft, 0), 0, 'Empty draft safely parses to fallback');

// 1.3 Decimals disabled vs enabled
assert.equal(cleanNumericDraft('12.34', false), '1234', 'Decimals disabled strips periods');
assert.equal(cleanNumericDraft('12.34', true), '12.34', 'Decimals enabled preserves single period');
assert.equal(cleanNumericDraft('12.3.4.5', true), '12.345', 'Multiple periods stripped to single');

// 1.4 Arabic numerals in draft
assert.equal(cleanNumericDraft('٤٥٫٧٥'), '45.75', 'Arabic numeral draft cleans properly');

console.log('✓ NumericInput & InputSafety tests passed');

// =========================================================================
// SECTION 2: PURCHASE SEARCH MULTI-CRITERIA & BARCODE VERIFICATION
// =========================================================================
console.log('[2/5] Testing Purchase Search (Trade, Generic, Active Ingredient, Manufacturer, Barcode, Code)...');

const testProduct1: Product = {
  id: 'prod-test-search-01',
  internal_code: 'MED-PAN-500',
  barcode: '6281001234567',
  name_ar: 'بانادول إكسترا أقراص',
  name_en: 'Panadol Extra Tablets',
  generic_name: 'Paracetamol + Caffeine',
  active_ingredient: 'باراسيتامول وكافيين',
  dosage_form: 'tablet',
  pack_size: 24,
  base_unit: 'قرص',
  category_id: db.getState().categories[0]?.id || 'cat-01',
  current_purchase_price: 1500, // 15.00
  current_selling_price: 2000,  // 20.00
  min_stock_level: 10,
  reorder_level: 20,
  prescription_required: false,
  is_controlled: false,
  is_active: true,
  manufacturer_id: 'mfg-gsk',
  created_at: Date.now(),
  updated_at: Date.now()
};

// Add to db if not present
const state = db.getState();
if (!state.products.some(p => p.id === testProduct1.id)) {
  state.products.push(testProduct1);
}
if (!state.manufacturers.some(m => m.id === 'mfg-gsk')) {
  state.manufacturers.push({
    id: 'mfg-gsk',
    name_ar: 'شركة جلاكسو سميث كلاين',
    country: 'GlaxoSmithKline'
  });
}

const mfgMap = new Map(state.manufacturers.map(m => [m.id, m.name_ar]));

function searchProducts(rawQuery: string, productList: Product[]) {
  const norm = normalizeArabicSearchText(rawQuery);
  const lower = rawQuery.toLowerCase().trim();

  return productList.filter((p) => {
    const nAr = normalizeArabicSearchText(p.name_ar || '');
    const nEn = (p.name_en || '').toLowerCase();
    const nGen = normalizeArabicSearchText(p.generic_name || '');
    const nAct = normalizeArabicSearchText(p.active_ingredient || '');
    const nCode = (p.internal_code || '').toLowerCase();
    const nBar = (p.barcode || '').toLowerCase();
    const nMan = p.manufacturer_id ? normalizeArabicSearchText(mfgMap.get(p.manufacturer_id) || '') : '';

    return (
      nAr.includes(norm) ||
      nEn.includes(lower) ||
      nGen.includes(norm) ||
      nAct.includes(norm) ||
      nCode.includes(lower) ||
      nBar.includes(lower) ||
      nMan.includes(norm)
    );
  });
}

// 2.1 Arabic Trade Name search (with Alif normalization: إكسترا vs اكسترا)
let res = searchProducts('اكسترا', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'Arabic Trade Name search must find product');

// 2.2 English Trade Name search
res = searchProducts('panadol', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'English Trade Name search must find product');

// 2.3 Generic Name search
res = searchProducts('caffeine', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'Generic Name search must find product');

// 2.4 Active Ingredient search
res = searchProducts('باراسيتامول', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'Active Ingredient search must find product');

// 2.5 Manufacturer Name search
res = searchProducts('جلاكسو', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'Manufacturer search must find product');

// 2.6 Exact Barcode search
res = searchProducts('6281001234567', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'Exact Barcode search must find product');

// 2.7 Internal Code search
res = searchProducts('PAN-500', state.products);
assert.ok(res.some(p => p.id === testProduct1.id), 'Internal Code search must find product');

// 2.8 No results search
res = searchProducts('non_existent_random_xyz_query_999', state.products);
assert.equal(res.length, 0, 'Non-existent search returns empty array');

console.log('✓ Purchase Search multi-criteria tests passed');

// =========================================================================
// SECTION 3: PURCHASE POSTING & CORRECTION AUDIT INTEGRITY
// =========================================================================
console.log('[3/5] Testing Purchase Correction Accounting & Audit Integrity...');

// Ensure test supplier and cashbox exist
const testSupplierId = 'supp-test-01';
if (!state.suppliers.some(s => s.id === testSupplierId)) {
  state.suppliers.push({
    id: testSupplierId,
    name: 'مورد الاختبارات المعتمد',
    phone: '0500000000',
    contact_person: 'مدير التوريدات',
    cached_balance: 0,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now()
  });
}
const testCashbox = state.cashboxes[0] || {
  id: 'cash-01',
  name: 'الخزينة الرئيسية',
  cached_balance: 1000000,
  is_active: true,
  updated_at: Date.now()
};
const initialCash = testCashbox.cached_balance;
const supplier = state.suppliers.find(s => s.id === testSupplierId)!;
const initialSupplierBalance = supplier.cached_balance;

const invoiceNum = 'INV-TEST-' + Math.floor(Math.random() * 100000);

// Step 1: Create a purchase invoice (Credit, 10 units at 15.00 = 150.00 minor 15000)
const createdPurchase = PurchaseService.createPurchase({
  supplier_id: testSupplierId,
  invoice_number: invoiceNum,
  payment_type: 'credit',
  cashbox_id: testCashbox.id,
  user_id: 'user-audit-test',
  discount_amount: 0,
  notes: 'فاتورة أولية للاختبار',
  items: [
    {
      product_id: testProduct1.id,
      batch_number: 'BATCH-CORR-01',
      expiry_date: '2028-12-31',
      unit_name: testProduct1.base_unit,
      unit_factor: 1,
      quantity: 10,
      unit_purchase_price: 1500,
      unit_selling_price: 2000
    }
  ]
});

assert.equal(createdPurchase.status, 'posted');
assert.equal(createdPurchase.net_total, 15000);
assert.equal(supplier.cached_balance, initialSupplierBalance + 15000, 'Supplier debt increased by 150.00');

// Verify batch created
const createdBatch = state.batches.find(b => b.product_id === testProduct1.id && b.batch_number === 'BATCH-CORR-01');
assert.ok(createdBatch, 'Batch created');
assert.equal(createdBatch.current_quantity, 10, 'Batch quantity is 10');

// Step 2: Perform Accounting Correction (Cancel original purchase to reverse its effects)
const cancellationReason = 'إلغاء لغرض التعديل والتصحيح - استبدال بفاتورة معدلة';
const cancelledPurchase = PurchaseService.cancelPurchase(
  createdPurchase.id,
  cancellationReason,
  'user-audit-test'
);

// Assert Reversal Integrity:
assert.equal(cancelledPurchase.status, 'cancelled', 'Original purchase marked as cancelled');
assert.equal(cancelledPurchase.cancellation_reason, cancellationReason);
assert.equal(supplier.cached_balance, initialSupplierBalance, 'Supplier debt successfully reversed back to initial');
assert.equal(createdBatch.current_quantity, 0, 'Stock successfully deducted and batch quantity returned to 0');

// Assert Historical Preservation:
const preservedOriginal = state.purchases.find(p => p.id === createdPurchase.id);
assert.ok(preservedOriginal, 'Original invoice is NOT deleted or lost; preserved historically');
assert.equal(preservedOriginal.status, 'cancelled');

// Assert Audit Trail:
const cancelAudit = state.audit_logs.find(
  a => a.entity === 'purchases' && a.entity_id === createdPurchase.id && a.action === 'CANCEL_PURCHASE'
);
assert.ok(cancelAudit, 'Audit log created for cancellation');

// Step 3: Post Corrected Invoice (with corrected quantity = 8 units at 15.00 = 12000)
const correctedInvoiceNum = invoiceNum + '-CORR';
const correctedPurchase = PurchaseService.createPurchase({
  supplier_id: testSupplierId,
  invoice_number: correctedInvoiceNum,
  payment_type: 'credit',
  cashbox_id: testCashbox.id,
  user_id: 'user-audit-test',
  discount_amount: 0,
  notes: `فاتورة مصححة بديلة عن الفاتورة الملغاة ${invoiceNum}`,
  items: [
    {
      product_id: testProduct1.id,
      batch_number: 'BATCH-CORR-01',
      expiry_date: '2028-12-31',
      unit_name: testProduct1.base_unit,
      unit_factor: 1,
      quantity: 8,
      unit_purchase_price: 1500,
      unit_selling_price: 2000
    }
  ]
});

assert.equal(correctedPurchase.status, 'posted');
assert.equal(supplier.cached_balance, initialSupplierBalance + 12000, 'Supplier debt reflects strictly corrected amount');
assert.equal(createdBatch.current_quantity, 8, 'Batch stock reflects strictly corrected quantity (no duplicate stock)');

console.log('✓ Purchase Correction Accounting & Audit Integrity tests passed');

// =========================================================================
// SECTION 4: DRUG CATALOG IMPORT RUNTIME & DEDUPLICATION VERIFICATION
// =========================================================================
console.log('[4/5] Testing Drug Catalog Import (Parsing, Chunking, Deduplication, Persistence)...');

async function testDrugCatalogImport() {
  const seed = await CatalogImportService.loadSeedData();
  assert.ok(seed, 'Seed catalog must load successfully');
  assert.ok(seed.products.length > 0, `Catalog contains ${seed.products.length} products`);
  assert.ok(seed.categories.length > 0, `Catalog contains ${seed.categories.length} categories`);
  assert.ok(seed.manufacturers.length > 0, `Catalog contains ${seed.manufacturers.length} manufacturers`);

  let progressCalled = false;
  let finalPercent = 0;

  const result = await CatalogImportService.importCatalog({
    batchSize: 100,
    onProgress: (prog) => {
      progressCalled = true;
      finalPercent = prog.percent;
    }
  });

  console.log('Import result:', result);
  const currentState = db.getState();
  console.log('Current state products:', currentState.products.length, 'categories:', currentState.categories.length);

  assert.ok(progressCalled, 'Progress callback was triggered during chunked import');
  assert.ok(finalPercent >= 99, 'Import reached completion');
  assert.ok(result.importedProducts > 0 || result.skippedDuplicates > 0, 'Products processed');
  assert.ok(currentState.products.length > 0, 'Imported products exist in database state');
  assert.ok(currentState.categories.length > 0, 'Categories exist in database state');

  // Test Deduplication: running import again must skip all duplicates without throwing errors
  const rerunResult = await CatalogImportService.importCatalog({
    batchSize: 100
  });

  assert.equal(rerunResult.importedProducts, 0, 'Re-running import should import 0 new products');
  assert.ok(rerunResult.skippedDuplicates > 0, 'Re-running import must skip duplicates idempotently');
}

await testDrugCatalogImport();
console.log('✓ Drug Catalog Import runtime tests passed');

// =========================================================================
// SECTION 5: AI ASSISTANT ENDPOINT & PROVIDER CONTRACT
// =========================================================================
console.log('[5/5] Testing AI Assistant Model & Provider Configuration...');

// Verify server.ts uses gemini-3.6-flash
import * as fs from 'node:fs';
const serverCode = fs.readFileSync('./server.ts', 'utf-8');
assert.ok(serverCode.includes("model: 'gemini-3.6-flash'"), 'server.ts must use gemini-3.6-flash model');
assert.ok(!serverCode.includes("gemini-2.5-flash"), 'Deprecated gemini-2.5-flash must be completely removed');

console.log('✓ AI Assistant Model configuration verified');

console.log('--- ALL PHASE 8.4 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
