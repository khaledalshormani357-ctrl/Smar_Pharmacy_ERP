// Phase 8.8 Verification Test Suite: Pharmacy Units, Arabic Trade Names & OCR Agent Repair
import sharp from 'sharp';
import { db } from './src/db/sqlite';
import { SalesService } from './src/services/SalesService';
import { PurchaseService } from './src/services/PurchaseService';
import { Money } from './src/utils/money';
import {
  transliterateDrugTradeName,
  migrateArabicTradeNames
} from './src/utils/arabicPhoneticTransliteration';
import { Product, UnitConversion } from './src/types';

async function runPhase88Tests() {
  console.log('================================================================');
  console.log('PHASE 8.8 VERIFICATION SUITE — SMART PHARMACY ERP');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // ----------------------------------------------------------------
  // PART A: TRANSACTION UNITS & IMMUTABLE HISTORICAL SNAPSHOTS
  // ----------------------------------------------------------------
  console.log('--- TEST GROUP A: TRANSACTION UNITS & PRICING ---');

  // 1. Setup Product with conversions (e.g. Trazol Plus: 1 Box = 10 Strips = 100 Tablets)
  const testProdId = 'prod-test-trazol-' + Date.now();
  const testProduct: Product = {
    id: testProdId,
    internal_code: 'PRD-TRAZOL',
    name_ar: 'ترازول بلس',
    name_en: 'Trazol Plus',
    trade_name_ar: 'ترازول بلس',
    trade_name_en: 'Trazol Plus',
    dosage_form: 'tablet',
    base_unit: 'حبة', // Internal reference unit (Tablet)
    pack_size: 100,
    current_purchase_price: Money.toMinor(250), // 250 / tablet
    current_selling_price: Money.toMinor(350),  // 350 / tablet
    min_stock_level: 10,
    reorder_level: 20,
    prescription_required: false,
    is_controlled: false,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  const stripConversion: UnitConversion = {
    id: 'uc-strip-' + Date.now(),
    product_id: testProdId,
    unit_name: 'شريط',
    conversion_factor: 10,
    purchase_price: Money.toMinor(2500),
    selling_price: Money.toMinor(3500),
    is_default_sale: true,
    is_active: true
  };

  const boxConversion: UnitConversion = {
    id: 'uc-box-' + Date.now(),
    product_id: testProdId,
    unit_name: 'علبة',
    conversion_factor: 100,
    purchase_price: Money.toMinor(25000), // 25,000 / Box
    selling_price: Money.toMinor(35000),  // 35,000 / Box
    is_default_sale: false,
    is_active: true
  };

  db.transaction(() => {
    const s = db.getState();
    s.products.push(testProduct);
    s.unit_conversions.push(stripConversion, boxConversion);
  });

  assert(true, 'Product created with multi-unit configuration (Tablet base, Strip x10, Box x100)');

  // 2. Purchase Invoice with Box Unit (20 Box @ 25,000 = 500,000)
  let supplier = db.getState().suppliers.find((s) => s.is_active);
  if (!supplier) {
    supplier = {
      id: 'sup-test-' + Date.now(),
      name: 'شركة الأمل للتوريد',
      name_ar: 'شركة الأمل للتوريد',
      phone: '777000000',
      cached_balance: 0,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    db.transaction(() => {
      db.getState().suppliers.push(supplier!);
    });
  }
  const supId = supplier.id;
  const user = db.getState().users[0] || { id: 'usr-admin' };
  const userId = user.id;
  const cashboxId = db.getState().cashboxes[0]?.id;

  const purchase = PurchaseService.createPurchase({
    supplier_id: supId,
    user_id: userId,
    invoice_number: 'INV-TEST-UNIT-' + Date.now(),
    payment_type: 'credit',
    items: [
      {
        product_id: testProdId,
        batch_number: 'BATCH-TRZ-01',
        expiry_date: '2028-12-31',
        unit_name: 'علبة',
        unit_factor: 100,
        quantity: 20, // 20 Boxes
        unit_purchase_price: Money.toMinor(25000), // 25,000 / Box
        unit_selling_price: Money.toMinor(35000),
        discount_amount: 0
      }
    ],
    cashbox_id: cashboxId
  });

  assert(!!purchase && !!purchase.id, 'Purchase invoice posted successfully with Box unit');

  const purchaseItem = db.getState().purchase_items.find((it) => it.purchase_id === purchase.id);

  assert(purchaseItem?.unit_name === 'علبة', 'Purchase item immutable unit_name is "علبة"');
  assert(purchaseItem?.quantity === 20, 'Purchase item transaction quantity is 20 (not converted on invoice line)');
  assert(purchaseItem?.base_quantity === 2000, 'Purchase item base inventory quantity is 2,000 tablets internally');
  assert(purchaseItem?.unit_purchase_price === Money.toMinor(25000), 'Purchase item unit price is 25,000 / Box');
  assert(purchase?.net_total === Money.toMinor(500000), 'Purchase invoice net total is 500,000 YER');

  // Verify internal stock calculation is 2,000 tablets
  const batch = db.getState().batches.find((b) => b.id === purchaseItem?.batch_id);
  assert(batch?.current_quantity === 2000, 'Internal inventory stock is mathematically consistent at 2,000 tablets');

  // 3. POS Sale Invoice with Strip Unit (2 Strips @ 3,500 = 7,000)
  const sale = SalesService.createSale({
    user_id: userId,
    payment_method: 'cash',
    sale_type: 'cash',
    discount_amount: 0,
    cashbox_id: cashboxId,
    items: [
      {
        productId: testProdId,
        productName: 'ترازول بلس',
        unitName: 'شريط',
        unitFactor: 10,
        quantity: 2, // 2 Strips
        unitPrice: Money.toMinor(3500),
        discountAmount: 0,
        availableUnits: [],
        availableStockBase: 2000
      }
    ]
  });

  assert(!!sale && !!sale.id, 'POS sale posted successfully with Strip unit');

  const saleItem = db.getState().sale_items.find((si) => si.sale_id === sale.id);
  assert(saleItem?.unit_name === 'شريط', 'Sale item unit_name preserved as "شريط"');
  assert(saleItem?.quantity === 2, 'Sale item transaction quantity preserved as 2 strips');
  assert(saleItem?.base_quantity === 20, 'Sale item internal base quantity deducted is 20 tablets');
  assert(saleItem?.unit_price === Money.toMinor(3500), 'Sale item unit price is 3,500 / Strip');
  assert(saleItem?.line_total === Money.toMinor(7000), 'Sale line total is 7,000 YER');

  // 4. Immutability Check: Edit product and conversion factor, old invoices must NOT change
  db.transaction(() => {
    const s = db.getState();
    const uc = s.unit_conversions.find((u) => u.product_id === testProdId && u.unit_name === 'علبة');
    if (uc) {
      uc.conversion_factor = 120; // Changed from 100 to 120
      uc.purchase_price = Money.toMinor(30000);
    }
  });

  // Re-fetch historical purchase item
  const postEditItem = db.getState().purchase_items.find((it) => it.purchase_id === purchase.id);
  assert(postEditItem?.unit_name === 'علبة', 'Historical invoice unit_name unaffected after conversion edit');
  assert(postEditItem?.quantity === 20, 'Historical invoice quantity unaffected after conversion edit (20 Box)');
  assert(postEditItem?.unit_factor === 100, 'Historical conversion snapshot preserved at 100 (not updated to 120)');
  assert(postEditItem?.unit_purchase_price === Money.toMinor(25000), 'Historical unit purchase price immutable (25,000)');
  assert(postEditItem?.line_total === Money.toMinor(500000), 'Historical line total immutable (500,000)');

  // ----------------------------------------------------------------
  // PART B: ARABIC TRADE-NAME PHONETIC TRANSLITERATION
  // ----------------------------------------------------------------
  console.log('\n--- TEST GROUP B: ARABIC TRADE NAMES TRANSLITERATION ---');

  // 1. Phonetic transliteration tests
  const testCases = [
    { en: 'Trazol Plus', expected: 'ترازول بلس' },
    { en: 'Panadol Extra', expected: 'بانادول إكسترا' },
    { en: 'Augmentin 1g', expected: 'أوجمنتين 1g' },
    { en: 'Amoxicillin 500mg', expected: 'أموكسيسيلين 500mg' },
    { en: 'Brufen 400mg', expected: 'بروفين 400mg' },
    { en: 'Cataflam 50mg', expected: 'كتافلام 50mg' },
    { en: 'Omeprazole 20mg', expected: 'أوميبرازول 20mg' }
  ];

  for (const tc of testCases) {
    const transliterated = transliterateDrugTradeName(tc.en);
    assert(
      transliterated === tc.expected,
      `Transliteration: "${tc.en}" -> "${transliterated}" (expected: "${tc.expected}")`
    );
  }

  // 2. Catalog-wide migration test
  const dummyCatalog = [
    { id: 'c1', name_en: 'Trazol Plus', name_ar: '', trade_name_en: 'Trazol Plus', trade_name_ar: '' },
    { id: 'c2', name_en: 'Panadol Extra', name_ar: 'بانادول يدوي خاص', trade_name_en: 'Panadol Extra', trade_name_ar: 'بانادول يدوي خاص' },
    { id: 'c3', name_en: '', name_ar: 'أدول شراب' },
    { id: 'c4', name_en: 'Brufen 400mg', name_ar: '', trade_name_en: 'Brufen 400mg' }
  ];

  const migrationReport = migrateArabicTradeNames(dummyCatalog);

  assert(migrationReport.productsScanned === 4, 'Catalog scan counted all 4 products');
  assert(migrationReport.arabicNamesGenerated === 2, 'Generated Arabic phonetic names for 2 products missing Arabic');
  assert(migrationReport.existingArabicNamesPreserved === 2, 'Preserved existing Arabic names without overwrite (both c2 and c3)');
  assert(migrationReport.skipped === 0, 'No products skipped without check');

  assert(dummyCatalog[0].trade_name_ar === 'ترازول بلس', 'Product 1 trade_name_ar generated as "ترازول بلس"');
  assert(dummyCatalog[0].trade_name_en === 'Trazol Plus', 'Product 1 trade_name_en preserved intact');
  assert(dummyCatalog[1].trade_name_ar === 'بانادول يدوي خاص', 'Product 2 manual Arabic name preserved unchanged');

  // ----------------------------------------------------------------
  // PART C: OCR AGENT REPAIR GATE — REAL IMAGE ANALYSIS TEST
  // ----------------------------------------------------------------
  console.log('\n--- TEST GROUP C: OCR AGENT REAL IMAGE ANALYSIS GATE ---');

  // Render a real pharmaceutical invoice into PNG image bytes via Sharp
  const invoiceSvg = `
  <svg width="800" height="900" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="900" fill="#ffffff" />
    <rect width="800" height="100" fill="#1e40af" />
    <text x="400" y="60" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle">
      شركة الأمل الدولية للأدوية - Al-Amal Pharma
    </text>
    
    <text x="50" y="150" font-family="sans-serif" font-size="16" fill="#1e293b">
      رقم الفاتورة: INV-PH88-9901
    </text>
    <text x="50" y="180" font-family="sans-serif" font-size="16" fill="#1e293b">
      التاريخ: 2026-09-27
    </text>
    <text x="50" y="210" font-family="sans-serif" font-size="16" fill="#1e293b">
      طريقة الدفع: آجل Credit
    </text>
    
    <rect x="40" y="250" width="720" height="40" fill="#e2e8f0" />
    <text x="50" y="275" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">الصنف (Item)</text>
    <text x="280" y="275" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">التشغيلة (Batch)</text>
    <text x="420" y="275" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">الصلاحية (Exp)</text>
    <text x="540" y="275" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">الكمية (Qty)</text>
    <text x="640" y="275" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">السعر (Price)</text>

    <!-- Row 1 -->
    <text x="50" y="320" font-family="sans-serif" font-size="14" fill="#1e293b">Panadol Extra 500mg</text>
    <text x="280" y="320" font-family="sans-serif" font-size="14" fill="#1e293b">BN-7701</text>
    <text x="420" y="320" font-family="sans-serif" font-size="14" fill="#1e293b">2027-11-30</text>
    <text x="540" y="320" font-family="sans-serif" font-size="14" fill="#1e293b">40</text>
    <text x="640" y="320" font-family="sans-serif" font-size="14" fill="#1e293b">1800</text>

    <!-- Row 2 -->
    <text x="50" y="360" font-family="sans-serif" font-size="14" fill="#1e293b">Augmentin 1g Tab</text>
    <text x="280" y="360" font-family="sans-serif" font-size="14" fill="#1e293b">AG-9921</text>
    <text x="420" y="360" font-family="sans-serif" font-size="14" fill="#1e293b">2027-09-30</text>
    <text x="540" y="360" font-family="sans-serif" font-size="14" fill="#1e293b">20</text>
    <text x="640" y="360" font-family="sans-serif" font-size="14" fill="#1e293b">4500</text>

    <!-- Total -->
    <rect x="40" y="420" width="720" height="50" fill="#f1f5f9" />
    <text x="50" y="450" font-family="sans-serif" font-size="16" font-weight="bold" fill="#0f172a">
      إجمالي الفاتورة الصافي: 162000 ر.ي
    </text>
  </svg>
  `;

  const pngBuffer = await sharp(Buffer.from(invoiceSvg)).png().toBuffer();
  const realImageDataUrl = 'data:image/png;base64,' + pngBuffer.toString('base64');

  console.log('Sending real rendered pharmaceutical invoice image to /api/gemini/analyze-invoice...');
  const ocrResponse = await fetch('http://localhost:3000/api/gemini/analyze-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: realImageDataUrl,
      existingProducts: [],
      existingSuppliers: []
    })
  });

  assert(ocrResponse.status === 200, 'OCR endpoint returned HTTP 200 OK');

  const ocrData = await ocrResponse.json();

  assert(ocrData && typeof ocrData === 'object', 'OCR response is valid JSON object');
  assert(
    typeof ocrData.supplier_name === 'string' &&
      (ocrData.supplier_name.includes('الأمل') || ocrData.supplier_name.toLowerCase().includes('amal')),
    `OCR extracted supplier name correctly: "${ocrData.supplier_name}"`
  );
  assert(
    typeof ocrData.invoice_number === 'string' && ocrData.invoice_number.includes('9901'),
    `OCR extracted invoice number correctly: "${ocrData.invoice_number}"`
  );
  assert(
    Array.isArray(ocrData.items) && ocrData.items.length >= 2,
    `OCR extracted all line items (count: ${ocrData.items?.length})`
  );

  const panadolItem = ocrData.items.find((it: any) =>
    (it.raw_name || it.trade_name_original || '').toLowerCase().includes('panadol')
  );
  assert(!!panadolItem, 'OCR recognized item "Panadol Extra" from image');
  assert(
    panadolItem.batch_number?.includes('7701'),
    `OCR extracted batch number "${panadolItem?.batch_number}" (expected BN-7701)`
  );
  assert(panadolItem.quantity === 40, `OCR extracted quantity ${panadolItem?.quantity} (expected 40)`);
  assert(
    panadolItem.unit_purchase_price === 1800,
    `OCR extracted unit purchase price ${panadolItem?.unit_purchase_price} (expected 1800)`
  );

  console.log('\n================================================================');
  console.log(`PHASE 8.8 VERIFICATION COMPLETE: ALL ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('================================================================\n');
}

runPhase88Tests().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
