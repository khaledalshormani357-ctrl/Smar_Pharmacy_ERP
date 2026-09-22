import { runFirebaseIntegrityMatrix } from './firebase_sync_audit';

console.log('=================================================================');
console.log('  PHASE 8.3 — FIREBASE SYNC INTEGRITY & REAL TEST MATRIX RUN');
console.log('=================================================================');

const results = runFirebaseIntegrityMatrix();
let passed = 0;
let failed = 0;

results.forEach((r) => {
  const icon = r.status === 'PASSED' ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`\n${icon} ${r.testId} — ${r.name}`);
  console.log(`   الفئة: ${r.category}`);
  console.log(`   النتيجة: ${r.details}`);
  if (r.status === 'PASSED') passed++;
  else failed++;
});

console.log('\n=================================================================');
console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
console.log('=================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
