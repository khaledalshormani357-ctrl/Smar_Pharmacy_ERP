// Phase 1 Foundation Verification Suite
// Validates:
// 1. Transaction atomicity & rollback on failure
// 2. MigrationManager & schema_migrations idempotency
// 3. Foreign key constraint enforcement
// 4. Money minor unit precision & math
// 5. Domain validation layer
// 6. AuditManager logging on operations
// 7. Double-submit / idempotency locking
// 8. Password / PIN hashing security

import { db } from './src/db/sqlite';
import { MigrationManager } from './src/db/migrations';
import { TransactionManager, TransactionError, DuplicateActionError } from './src/db/transaction';
import { DomainValidator, ValidationError } from './src/db/validation';
import { AuditManager } from './src/db/audit';
import { PasswordSecurity } from './src/utils/security';
import { Money } from './src/utils/money';
import { ProductRepository, BatchRepository } from './src/db/repositories';

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

async function runVerification() {
  console.log('=== RUNNING PHASE 1 FOUNDATION VERIFICATION ===\n');

  // Test 1: Money minor unit precision
  const minor1 = Money.toMinor(12.50);
  const minor2 = Money.toMinor('1,250.75');
  assert(minor1 === 1250, 'Money.toMinor converts 12.50 to 1250');
  assert(minor2 === 125075, 'Money.toMinor converts 1,250.75 to 125075');
  assert(Money.toMajor(1250) === 12.50, 'Money.toMajor converts 1250 to 12.50');

  // Test 2: Password and PIN hashing
  const hash1 = PasswordSecurity.hashSync('123456', 'mysalt');
  assert(hash1.startsWith('hashsync:mysalt:'), 'PasswordSecurity generates salted hash');
  assert(PasswordSecurity.verifySync('123456', hash1) === true, 'PasswordSecurity verifies valid password');
  assert(PasswordSecurity.verifySync('wrong', hash1) === false, 'PasswordSecurity rejects wrong password');

  // Test 3: Domain Validation
  try {
    DomainValidator.validateProduct({ name_ar: '', base_unit: 'حبة' });
    assert(false, 'DomainValidator rejects empty product name');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'DomainValidator throws ValidationError on empty name');
  }

  try {
    DomainValidator.validateBatch({ batch_number: 'B1', expiry_date: 'invalid-date' });
    assert(false, 'DomainValidator rejects invalid expiry date');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'DomainValidator throws ValidationError on bad date');
  }

  // Test 4: Transaction Manager & Rollback on Error
  const initialProductsCount = db.getState().products.length;
  try {
    db.transaction(() => {
      db.getState().products.push({
        id: 'temp-prod-1',
        internal_code: 'MED-9999',
        name_ar: 'منتج مؤقت تجريبي',
        base_unit: 'حبة',
        pack_size: 1,
        dosage_form: 'tablet',
        current_purchase_price: 100,
        current_selling_price: 150,
        min_stock_level: 5,
        reorder_level: 10,
        prescription_required: false,
        is_controlled: false,
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now()
      });
      // Simulate crash inside transaction
      throw new Error('Simulation of unexpected failure');
    });
  } catch (e) {
    // Expected rollback
  }
  assert(db.getState().products.length === initialProductsCount, 'Transaction rolls back fully on thrown exception');

  // Test 5: Foreign Key Enforcement
  try {
    db.transaction(() => {
      db.getState().batches.push({
        id: 'orphan-batch',
        product_id: 'non-existent-product-id-999',
        batch_number: 'ORPHAN-01',
        expiry_date: '2027-01-01',
        received_at: Date.now(),
        purchase_price: 1000,
        selling_price: 1500,
        initial_quantity: 50,
        current_quantity: 50,
        status: 'active',
        created_at: Date.now(),
        updated_at: Date.now()
      });
    });
    assert(false, 'Foreign key check did not reject orphan batch');
  } catch (err: any) {
    assert(err.name === 'TransactionError', 'Foreign key check rejected orphan batch referencing non-existent product');
  }

  // Test 6: Migrations Idempotency
  const currentVer = db.getState().version;
  MigrationManager.runMigrations(db.getState());
  assert(db.getState().version >= currentVer, 'MigrationManager runs safely and idempotently');
  assert(Array.isArray(db.getState().schema_migrations), 'schema_migrations history table maintained');

  // Test 7: Duplicate Submission / Idempotency Locks
  TransactionManager.acquireLock('checkout-order-uuid-123', 5000);
  try {
    TransactionManager.acquireLock('checkout-order-uuid-123', 5000);
    assert(false, 'Idempotency lock did not prevent double-submission');
  } catch (err: any) {
    assert(err instanceof DuplicateActionError, 'Idempotency lock prevents concurrent double submit');
  }
  TransactionManager.releaseLock('checkout-order-uuid-123');

  // Test 8: Audit Log Generation
  const audit = AuditManager.createLog('user-01', 'TEST_ACTION', 'entity_test', 'e-1', 'DEV-01');
  assert(audit.action === 'TEST_ACTION' && audit.id.startsWith('aud-'), 'AuditManager generates valid audit trail record');

  console.log(`\nVerification Summary: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((e) => {
  console.error('Unhandled verification error:', e);
  process.exit(1);
});
