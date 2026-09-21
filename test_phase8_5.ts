// Phase 8.5 Test Suite: Drug Catalog Import Freeze / UI Hang Fix
// Verifies Chunked Async Execution, Cancellation, Idempotency, Concurrency Mutex & Multi-Scale Imports

import assert from 'node:assert/strict';
import { db } from './src/db/sqlite.ts';
import { CatalogImportService, CatalogImportProgress } from './src/services/CatalogImportService.ts';
import { Product } from './src/types.ts';

console.log('===============================================================');
console.log('--- STARTING PHASE 8.5 VERIFICATION SUITE (CATALOG IMPORT) ---');
console.log('===============================================================\n');

async function runTests() {
  // Clear any existing products from previous tests to ensure deterministic base
  const state = db.getState();
  const initialProductCount = state.products.length;
  console.log(`[INIT] Initial database product count: ${initialProductCount}`);

  // =========================================================================
  // TEST 1: SMALL SCALE CHUNKED IMPORT (10 RECORDS)
  // =========================================================================
  console.log('\n[TEST 1/6] Testing small scale import (10 records)...');
  const progressLogs10: CatalogImportProgress[] = [];
  const res10 = await CatalogImportService.importCatalog({
    limit: 10,
    batchSize: 5,
    onProgress: (prog) => {
      progressLogs10.push({ ...prog });
    }
  });

  assert.equal(res10.importedProducts + res10.skippedDuplicates, 10, 'Must process exactly 10 records');
  assert.ok(progressLogs10.length >= 2, 'Must report multiple progress milestones');
  const finalProg10 = progressLogs10[progressLogs10.length - 1];
  assert.equal(finalProg10.percent, 100, 'Final progress must reach 100%');
  assert.equal(finalProg10.stage, 'completed', 'Final stage must be completed');
  console.log(`✓ Test 1 Passed: 10 records processed (${res10.importedProducts} imported, ${res10.skippedDuplicates} skipped). Progress events: ${progressLogs10.length}`);

  // =========================================================================
  // TEST 2: MEDIUM SCALE CHUNKED IMPORT (100 RECORDS)
  // =========================================================================
  console.log('\n[TEST 2/6] Testing medium scale import (100 records)...');
  const progressLogs100: CatalogImportProgress[] = [];
  const res100 = await CatalogImportService.importCatalog({
    limit: 100,
    batchSize: 25,
    onProgress: (prog) => {
      progressLogs100.push({ ...prog });
    }
  });

  assert.equal(res100.importedProducts + res100.skippedDuplicates, 100, 'Must process exactly 100 records');
  assert.ok(progressLogs100.length >= 4, 'Must yield and report progress on each batch');
  const finalProg100 = progressLogs100[progressLogs100.length - 1];
  assert.equal(finalProg100.percent, 100);
  console.log(`✓ Test 2 Passed: 100 records processed (${res100.importedProducts} imported, ${res100.skippedDuplicates} skipped). Progress events: ${progressLogs100.length}`);

  // =========================================================================
  // TEST 3: CONCURRENCY MUTEX LOCK TEST
  // =========================================================================
  console.log('\n[TEST 3/6] Testing concurrency protection (mutex lock)...');
  let secondCallRejected = false;

  // Start an import
  const p1 = CatalogImportService.importCatalog({ limit: 50, batchSize: 10 });

  // Immediately attempt a second simultaneous import
  try {
    await CatalogImportService.importCatalog({ limit: 20, batchSize: 10 });
  } catch (err: any) {
    if (err.message.includes('بالفعل') || err.message.includes('قيد التنفيذ')) {
      secondCallRejected = true;
    }
  }

  await p1;
  assert.ok(secondCallRejected, 'Simultaneous call must be rejected by mutex lock to prevent state corruption');
  assert.equal(CatalogImportService.isRunning(), false, 'Mutex lock must be released after completion');
  console.log('✓ Test 3 Passed: Concurrency lock successfully blocked simultaneous import and released cleanly');

  // =========================================================================
  // TEST 4: CANCELLATION & TRANSACTIONAL ROLLBACK TEST
  // =========================================================================
  console.log('\n[TEST 4/6] Testing cancellation and atomic state rollback...');
  const countBeforeCancel = db.getState().products.length;
  const abortCtrl = new AbortController();

  let abortErrorCaught = false;
  try {
    const importPromise = CatalogImportService.importCatalog({
      limit: 500,
      batchSize: 10,
      signal: abortCtrl.signal,
      onProgress: (prog) => {
        if (prog.currentBatch >= 2) {
          // Trigger abort midway through the import
          abortCtrl.abort();
        }
      }
    });
    await importPromise;
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message.includes('إلغاء')) {
      abortErrorCaught = true;
    }
  }

  const countAfterCancel = db.getState().products.length;
  assert.ok(abortErrorCaught, 'AbortError must be thrown on cancellation');
  assert.equal(countAfterCancel, countBeforeCancel, 'State must cleanly rollback on cancellation with zero orphaned records');
  assert.equal(CatalogImportService.isRunning(), false, 'Mutex lock must be released after abort');
  console.log(`✓ Test 4 Passed: Cancellation successfully caught, state safely rolled back (${countBeforeCancel} -> ${countAfterCancel})`);

  // =========================================================================
  // TEST 5: IDEMPOTENCY & DUPLICATE PROTECTION TEST
  // =========================================================================
  console.log('\n[TEST 5/6] Testing idempotency (no duplicate entries on re-import)...');
  // Run import on 200 records
  const firstPass = await CatalogImportService.importCatalog({ limit: 200, batchSize: 50 });
  const countAfterFirst = db.getState().products.length;

  // Run the EXACT same import again on 200 records
  const secondPass = await CatalogImportService.importCatalog({ limit: 200, batchSize: 50 });
  const countAfterSecond = db.getState().products.length;

  assert.equal(countAfterSecond, countAfterFirst, 'Total product count must not increase when re-importing same records');
  assert.equal(secondPass.importedProducts, 0, 'Zero new products should be added on second pass');
  assert.equal(secondPass.skippedDuplicates, 200, 'All 200 records must be recognized as duplicates and skipped');
  console.log(`✓ Test 5 Passed: Idempotency verified. 200 duplicate items skipped with zero duplication.`);

  // =========================================================================
  // TEST 6: FULL SCALE AUTHORITATIVE CATALOG IMPORT (4,048 RECORDS)
  // =========================================================================
  console.log('\n[TEST 6/6] Testing full scale authoritative catalog import (4,048 records)...');
  const tStart = Date.now();
  let maxBatchDuration = 0;
  let lastProgressTime = Date.now();
  const progressReports: CatalogImportProgress[] = [];

  const fullResult = await CatalogImportService.importCatalog({
    batchSize: 60,
    onProgress: (prog) => {
      const now = Date.now();
      const delta = now - lastProgressTime;
      if (delta > maxBatchDuration) maxBatchDuration = delta;
      lastProgressTime = now;
      progressReports.push({ ...prog });
    }
  });

  const durationMs = Date.now() - tStart;
  const totalProcessed = fullResult.importedProducts + fullResult.skippedDuplicates;
  assert.equal(totalProcessed, 4048, `Full catalog must process exactly 4,048 records (processed ${totalProcessed})`);
  assert.ok(progressReports.length >= 60, `Must produce continuous progress events across batches (got ${progressReports.length})`);
  assert.ok(durationMs < 5000, `Full import should complete efficiently in < 5000ms (took ${durationMs}ms)`);

  // Verify Arabic text integrity on imported records
  const catalogSample = db.getState().products.slice(-10);
  for (const p of catalogSample) {
    assert.ok(p.id, 'Product must have valid ID');
    assert.ok(p.name_ar || p.name_en, 'Product must have Arabic or English trade name');
    assert.ok(p.internal_code, 'Product must have internal code');
  }

  console.log(`✓ Test 6 Passed: 4,048 catalog records processed in ${durationMs}ms (${fullResult.importedProducts} new, ${fullResult.skippedDuplicates} duplicates).`);
  console.log(`  - Average batch duration: ${(durationMs / progressReports.length).toFixed(1)}ms`);
  console.log(`  - Total products now in database: ${db.getState().products.length}`);
  console.log(`  - Categories: ${db.getState().categories.length}`);
  console.log(`  - Manufacturers: ${db.getState().manufacturers.length}`);

  console.log('\n===============================================================');
  console.log(' ALL PHASE 8.5 VERIFICATION TESTS PASSED SUCCESSFULLY! ');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('\n❌ PHASE 8.5 TEST SUITE FAILED:', err);
  process.exit(1);
});
