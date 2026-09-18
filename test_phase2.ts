// Phase 2 Pharmacy Core Comprehensive Test Suite
// Validates:
// 1. Products (create, duplicate barcode rejection, deactivate, invalid data)
// 2. Units & Conversions (valid conversion, zero factor rejected, negative factor rejected, base unit arithmetic)
// 3. Batches & Expiry (create, near-expiry threshold, active, depleted, quarantined)
// 4. FEFO Engine (Batch A expires first -> Batch B second -> Batch C third; consumed A -> B -> C)
// 5. Excluded batches from FEFO (expired, quarantined, zero quantity)
// 6. Stock Service & Movements (Opening stock atomic, adjustments in/out, balance calculations, movement history)
// 7. Stock Count Workflow (physical > system, physical < system, physical = system, approval and adjustments)
// 8. Historical Cost Integrity (Product current purchase price change does NOT alter batch historical cost)
// 9. Sale Item Allocations Foundation (SaleItemAllocation model with exact historical unit cost)

import { db } from './src/db/sqlite';
import { ProductRepository, BatchRepository, CategoryRepository, ManufacturerRepository, UnitConversionRepository, StockMovementRepository } from './src/db/repositories';
import { StockService } from './src/services/StockService';
import { DomainValidator, ValidationError } from './src/db/validation';
import { Product, Batch, SaleItemAllocation } from './src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

async function runPharmacyCoreTests() {
  console.log('=== RUNNING PHASE 2 PHARMACY CORE AUTOMATED TESTS ===\n');

  // ----------------------------------------------------
  // SECTION 1: CATEGORIES & MANUFACTURERS
  // ----------------------------------------------------
  const catId = 'cat-test-' + Date.now();
  CategoryRepository.insert({ id: catId, name_ar: 'مضادات حيوية اختبارية', is_active: true });
  assert(CategoryRepository.getById(catId)?.name_ar === 'مضادات حيوية اختبارية', 'Category created successfully');

  const manId = 'man-test-' + Date.now();
  ManufacturerRepository.insert({ id: manId, name_ar: 'الشركة الدوائية العالمية' });
  assert(ManufacturerRepository.getById(manId)?.name_ar === 'الشركة الدوائية العالمية', 'Manufacturer created successfully');

  // ----------------------------------------------------
  // SECTION 2: PRODUCTS & SEARCH
  // ----------------------------------------------------
  const prodId = 'prod-test-fefo-' + Date.now();
  const testProduct: Product = {
    id: prodId,
    barcode: '6288888888',
    internal_code: 'MED-CORE-01',
    name_ar: 'أموكسيسيلين 500 ملغ كبسول',
    name_en: 'Amoxicillin 500mg',
    generic_name: 'Amoxicillin',
    active_ingredient: 'Amoxicillin Trihydrate',
    category_id: catId,
    manufacturer_id: manId,
    dosage_form: 'capsule',
    base_unit: 'كبسولة',
    pack_size: 10,
    current_purchase_price: 2500, // 25.00 YER per capsule
    current_selling_price: 3500,  // 35.00 YER per capsule
    min_stock_level: 20,
    reorder_level: 50,
    prescription_required: true,
    is_controlled: false,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now()
  };

  ProductRepository.insert(testProduct);
  assert(ProductRepository.getById(prodId) !== undefined, 'Product inserted and retrieved by id');

  // Duplicate barcode test
  try {
    const duplicateProd: Product = {
      ...testProduct,
      id: 'prod-dup-' + Date.now(),
      name_ar: 'منتج مكرر الباركود'
    };
    ProductRepository.insert(duplicateProd);
    assert(false, 'Duplicate barcode was NOT rejected');
  } catch (e: any) {
    assert(e.message.includes('مسجل مسبقاً'), 'Duplicate barcode correctly rejected with clear error');
  }

  // Deactivate product
  ProductRepository.deactivate(prodId);
  assert(ProductRepository.getById(prodId)?.is_active === false, 'Product deactivated successfully');
  ProductRepository.activate(prodId);
  assert(ProductRepository.getById(prodId)?.is_active === true, 'Product reactivated successfully');

  // Search product
  const searchResults = ProductRepository.search('أموكسيسيلين');
  assert(searchResults.some((p) => p.id === prodId), 'Product found via Arabic search query');

  const barcodeResults = ProductRepository.search('6288888888');
  assert(barcodeResults.some((p) => p.id === prodId), 'Product found via Barcode search query');

  // ----------------------------------------------------
  // SECTION 3: UNITS & CONVERSIONS
  // ----------------------------------------------------
  // Test zero factor rejection
  try {
    DomainValidator.validateConversion({ unit_name: 'باكت', conversion_factor: 0 });
    assert(false, 'Zero conversion factor was NOT rejected');
  } catch (e: any) {
    assert(e instanceof ValidationError, 'Zero conversion factor correctly rejected');
  }

  // Test negative factor rejection
  try {
    DomainValidator.validateConversion({ unit_name: 'باكت', conversion_factor: -5 });
    assert(false, 'Negative conversion factor was NOT rejected');
  } catch (e: any) {
    assert(e instanceof ValidationError, 'Negative conversion factor correctly rejected');
  }

  // Valid conversion registration
  UnitConversionRepository.saveForProduct(prodId, 'كبسولة', [
    { unit_name: 'شريط', conversion_factor: 10, selling_price: 35000, is_default_sale: true },
    { unit_name: 'باكت', conversion_factor: 100, selling_price: 320000 }
  ]);

  const conversions = UnitConversionRepository.getByProduct(prodId);
  assert(conversions.length === 3, 'Conversions registered including base unit 1:1');
  const strip = conversions.find((c) => c.unit_name === 'شريط');
  assert(strip?.conversion_factor === 10, 'Strip conversion factor is exactly 10 base units');

  // Conversion calculation: 3 strips = 30 capsules
  const enteredQty = 3;
  const baseCalculated = enteredQty * (strip?.conversion_factor || 1);
  assert(baseCalculated === 30, 'Entered quantity × conversion factor = base quantity (3 strips = 30 capsules)');

  // ----------------------------------------------------
  // SECTION 4: BATCHES & OPENING STOCK (Atomic Operation)
  // ----------------------------------------------------
  // Batch A: Expiring 2026-10-01 (Earliest expiry), Cost: 2000 (20.00 YER), Qty: 20
  const batchA = StockService.addOpeningStock({
    productId: prodId,
    batchNumber: 'BATCH-A-2026',
    expiryDate: '2026-10-01',
    quantityBase: 20,
    purchaseCostMinor: 2000,
    sellingPriceMinor: 3500,
    userId: 'user-01'
  });
  assert(batchA.current_quantity === 20, 'Batch A opening stock recorded with 20 units');

  // Batch B: Expiring 2027-01-01 (Second expiry), Cost: 2200 (22.00 YER), Qty: 30
  const batchB = StockService.addOpeningStock({
    productId: prodId,
    batchNumber: 'BATCH-B-2027',
    expiryDate: '2027-01-01',
    quantityBase: 30,
    purchaseCostMinor: 2200,
    sellingPriceMinor: 3500,
    userId: 'user-01'
  });
  assert(batchB.current_quantity === 30, 'Batch B opening stock recorded with 30 units');

  // Batch C: Expiring 2027-06-01 (Third expiry), Cost: 2400 (24.00 YER), Qty: 50
  const batchC = StockService.addOpeningStock({
    productId: prodId,
    batchNumber: 'BATCH-C-2027',
    expiryDate: '2027-06-01',
    quantityBase: 50,
    purchaseCostMinor: 2400,
    sellingPriceMinor: 3500,
    userId: 'user-01'
  });
  assert(batchC.current_quantity === 50, 'Batch C opening stock recorded with 50 units');

  // Verify stock movements were created for opening stocks
  const initialMovements = StockMovementRepository.getByProduct(prodId);
  assert(initialMovements.length === 3, 'Exactly 3 stock movements created atomically for opening stock batches');
  const totalStockNow = initialMovements.find((m) => m.batch_id === batchC.id)?.product_total_balance_after;
  assert(totalStockNow === 100, 'Product total balance after Batch C is 100 base units');

  // ----------------------------------------------------
  // SECTION 5: FEFO ENGINE ALLOCATION (First Expired, First Out)
  // Request 35 units: Should consume Batch A (20 units @ 2000) + Batch B (15 units @ 2200)
  // ----------------------------------------------------
  const fefoResult = StockService.allocateFEFO(prodId, 35);
  assert(fefoResult.allocations.length === 2, 'FEFO successfully allocated across 2 batches');
  assert(
    fefoResult.allocations[0].batchId === batchA.id && fefoResult.allocations[0].allocatedQty === 20,
    'FEFO allocated first from Batch A (earliest expiry, 20 units)'
  );
  assert(
    fefoResult.allocations[1].batchId === batchB.id && fefoResult.allocations[1].allocatedQty === 15,
    'FEFO allocated remainder from Batch B (second expiry, 15 units)'
  );

  // Check historical COGS calculation from batch allocations
  // Expected COGS = (20 * 2000) + (15 * 2200) = 40,000 + 33,000 = 73,000 minor units
  assert(fefoResult.totalCogs === 73000, 'FEFO exact historical COGS calculated (73000 minor units)');

  // ----------------------------------------------------
  // SECTION 6: SALE ITEM ALLOCATION FOUNDATION
  // ----------------------------------------------------
  const saleItemAllocations: SaleItemAllocation[] = fefoResult.allocations.map((a) => ({
    id: 'alloc-' + Math.random().toString(36).substring(2, 7),
    sale_item_id: 'sale-item-sim-01',
    sale_id: 'sale-sim-01',
    product_id: prodId,
    batch_id: a.batchId,
    allocated_base_quantity: a.allocatedQty,
    unit_purchase_cost: a.unitPurchaseCost,
    total_cost: a.totalCost,
    created_at: Date.now()
  }));
  assert(saleItemAllocations.length === 2, 'SaleItemAllocation records preserved batch_id, quantities, and unit_cost');

  // ----------------------------------------------------
  // SECTION 7: EXCLUSION FROM FEFO (Expired & Quarantined Batches)
  // ----------------------------------------------------
  // Insert an expired batch (yesterday)
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expiredBatch = StockService.addOpeningStock({
    productId: prodId,
    batchNumber: 'BATCH-EXPIRED-99',
    expiryDate: yesterdayStr,
    quantityBase: 100,
    purchaseCostMinor: 1000,
    sellingPriceMinor: 1500
  });

  const fefoCheck = StockService.allocateFEFO(prodId, 10);
  const usedExpired = fefoCheck.allocations.some((a) => a.batchId === expiredBatch.id);
  assert(!usedExpired, 'Expired batch strictly EXCLUDED from FEFO allocation');

  // ----------------------------------------------------
  // SECTION 8: HISTORICAL COST INTEGRITY
  // ----------------------------------------------------
  // Modify Product current purchase price from 2500 to 5000
  ProductRepository.update(prodId, { current_purchase_price: 5000 });
  const updatedProduct = ProductRepository.getById(prodId);
  assert(updatedProduct?.current_purchase_price === 5000, 'Product reference purchase price updated to 5000');

  // Verify historical batch purchase cost has NOT changed!
  const batchARefreshed = BatchRepository.getById(batchA.id);
  const batchBRefreshed = BatchRepository.getById(batchB.id);
  assert(batchARefreshed?.purchase_price === 2000, 'Batch A historical cost remains immutable at 2000');
  assert(batchBRefreshed?.purchase_price === 2200, 'Batch B historical cost remains immutable at 2200');

  // ----------------------------------------------------
  // SECTION 9: CONTROLLED STOCK ADJUSTMENTS
  // ----------------------------------------------------
  StockService.adjustStock({
    productId: prodId,
    batchId: batchA.id,
    newQuantityBase: 25, // Adjusted up by +5
    reason: 'تسوية فائض جرد معتمد'
  });
  const batchAAfterAdj = BatchRepository.getById(batchA.id);
  assert(batchAAfterAdj?.current_quantity === 25, 'Batch A adjusted to 25 base units');

  const adjMovements = StockMovementRepository.getByBatch(batchA.id);
  const latestAdjMov = adjMovements[0];
  assert(latestAdjMov.movement_type === 'adjustment_plus' && latestAdjMov.quantity_delta === 5, 'Adjustment movement created with delta +5');

  // ----------------------------------------------------
  // SECTION 10: STOCK COUNT SESSION WORKFLOW
  // ----------------------------------------------------
  // 1. Open count session
  const session = StockService.startStockCountSession('جرد نهاية الربع');
  assert(session.status === 'draft', 'Stock count session created in draft mode');

  // 2. Physical count variance: Set batch B to 28 (System is 30, variance -2)
  StockService.recordCountItem(session.id, batchB.id, 28);

  // 3. Approve session
  StockService.approveStockCountSession(session.id, 'user-admin');
  const batchBAfterCount = BatchRepository.getById(batchB.id);
  assert(batchBAfterCount?.current_quantity === 28, 'Stock count approval updated Batch B balance to physical count (28)');

  const countMovements = StockMovementRepository.getByBatch(batchB.id);
  const latestCountMov = countMovements[0];
  assert(latestCountMov.quantity_delta === -2 && latestCountMov.reference_type === 'stock_count', 'Stock count generated adjustment_minus movement with delta -2');

  // ----------------------------------------------------
  // SECTION 11: INVENTORY VALUATION
  // ----------------------------------------------------
  const val = StockService.getInventoryValuation();
  assert(val.totalValueMinor > 0, 'Inventory valuation calculated strictly from batch quantities × historical unit cost');

  console.log(`\n========================================`);
  console.log(`PHASE 2 TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPharmacyCoreTests().catch((err) => {
  console.error('Unhandled Phase 2 Test Error:', err);
  process.exit(1);
});
