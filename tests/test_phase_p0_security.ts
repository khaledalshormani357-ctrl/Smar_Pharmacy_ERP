// PHASE P0 SECURITY & AUTHENTICATION TEST SUITE
// Smart Pharmacy ERP - P0 Production Release Gate Verification

import assert from 'node:assert/strict';
import { PasswordSecurity } from '../src/utils/security';
import { AuthorizationService } from '../src/services/AuthorizationService';
import { SalesService } from '../src/services/SalesService';
import { PurchaseService } from '../src/services/PurchaseService';
import { db } from '../src/db/sqlite';
import { User, Role } from '../src/types';

console.log('======================================================================');
console.log('--- STARTING PHASE P0: AUTHENTICATION, SECURITY & RBAC VERIFICATION ---');
console.log('======================================================================\n');

let passedTests = 0;
const totalTests = 12;

function markPass(name: string) {
  passedTests++;
  console.log(`[PASS ${passedTests}/${totalTests}] ${name}`);
}

async function runP0TestSuite() {
  // =========================================================================
  // 1. PIN Bypass & Legit User Verification
  // =========================================================================
  const userPin = '8492';
  const hashedUserPin = PasswordSecurity.hashSync(userPin, 'salt_p0_1');

  // Correct PIN -> PASS
  assert.equal(PasswordSecurity.verifySync(userPin, hashedUserPin), true, 'Correct PIN must verify to true');
  markPass('1. Correct PIN verification succeeds');

  // Wrong PIN -> FAIL
  assert.equal(PasswordSecurity.verifySync('9999', hashedUserPin), false, 'Wrong PIN must fail');
  markPass('2. Wrong PIN verification strictly rejected');

  // Universal bypass "1234" -> MUST FAIL because user PIN is 8492
  assert.equal(PasswordSecurity.verifySync('1234', hashedUserPin), false, '1234 universal bypass rejected');
  markPass('3. Hardcoded 1234 PIN bypass eliminated');

  // Empty PIN -> FAIL
  assert.equal(PasswordSecurity.verifySync('', hashedUserPin), false, 'Empty PIN rejected');
  assert.equal(PasswordSecurity.verifySync('   ', hashedUserPin), false, 'Whitespace PIN rejected');
  markPass('4. Empty and whitespace PIN strictly rejected');

  // Another user's PIN -> FAIL
  const user2Pin = '7719';
  const hashedUser2Pin = PasswordSecurity.hashSync(user2Pin, 'salt_p0_2');
  assert.equal(PasswordSecurity.verifySync(userPin, hashedUser2Pin), false, "User 1 PIN cannot unlock User 2's hash");
  markPass("5. Cross-user PIN isolation enforced");

  // =========================================================================
  // 2. PIN Complexity & Default Credentials Hardening
  // =========================================================================
  assert.equal(PasswordSecurity.validatePinComplexity('1234').valid, false, 'Rejects trivial PIN 1234');
  assert.equal(PasswordSecurity.validatePinComplexity('0000').valid, false, 'Rejects trivial PIN 0000');
  assert.equal(PasswordSecurity.validatePinComplexity('123').valid, false, 'Rejects short PIN < 4 digits');
  assert.equal(PasswordSecurity.validatePinComplexity('abcd').valid, false, 'Rejects non-numeric PIN');
  assert.equal(PasswordSecurity.validatePinComplexity('9284').valid, true, 'Accepts complex 4-digit PIN');
  markPass('6. PIN complexity validator blocks trivial and non-numeric pins');

  // =========================================================================
  // 3. PBKDF2 Work Factor & Zero Plaintext Tolerance
  // =========================================================================
  const standardHash = PasswordSecurity.hashSync('securePass123!');
  assert.ok(standardHash.startsWith('pbkdf2:sha256:25000:'), 'Standard hash uses PBKDF2 with >= 25,000 iterations');
  assert.equal(PasswordSecurity.verifySync('securePass123!', standardHash), true, 'PBKDF2 hash verifies correctly');
  assert.equal(PasswordSecurity.verifySync('wrongPass', standardHash), false, 'PBKDF2 rejects wrong password');

  // Zero Plaintext Tolerance
  assert.equal(PasswordSecurity.verifySync('plaintext123', 'plaintext123'), false, 'Raw plaintext rejected as stored hash');
  assert.equal(PasswordSecurity.verifySync('123456', '123456'), false, 'Plaintext comparison strictly prohibited');
  markPass('7. PBKDF2-HMAC-SHA256 with 25,000 iterations and Zero Plaintext Tolerance verified');

  // =========================================================================
  // 4. Timing-Safe Comparison & Rehash Detection
  // =========================================================================
  assert.equal(PasswordSecurity.timingSafeEqual('abcdef', 'abcdef'), true, 'Equal strings match in timing safe comparison');
  assert.equal(PasswordSecurity.timingSafeEqual('abcdef', 'abcdeg'), false, 'Different strings fail timing safe comparison');
  assert.equal(PasswordSecurity.timingSafeEqual('abcdef', 'abc'), false, 'Different length strings fail timing safe comparison');

  assert.equal(PasswordSecurity.needsRehash('hashsync:old:123456'), true, 'Legacy hash flagged for seamless rehash');
  assert.equal(PasswordSecurity.needsRehash(standardHash), false, 'Modern PBKDF2-25000 hash does not need rehash');
  markPass('8. Constant-time comparison and automatic rehash detection verified');

  // =========================================================================
  // 5. Service-Level Authorization (RBAC) Enforcement
  // =========================================================================
  // Setup isolated mock users and roles in db state
  db.transaction(() => {
    const state = db.getState();
    const testAdmin: User = {
      id: 'test-user-admin',
      username: 'test_admin',
      full_name: 'Test Administrator',
      password_hash: PasswordSecurity.hashSync('AdminP@ss1'),
      pin_code: PasswordSecurity.hashSync('9182'),
      role_id: 'admin',
      biometric_enabled: false,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    const testPharmacist: User = {
      id: 'test-user-pharmacist',
      username: 'test_pharmacist',
      full_name: 'Test Pharmacist',
      password_hash: PasswordSecurity.hashSync('PharmP@ss1'),
      pin_code: PasswordSecurity.hashSync('8273'),
      role_id: 'pharmacist',
      biometric_enabled: false,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    const testCashier: User = {
      id: 'test-user-cashier',
      username: 'test_cashier',
      full_name: 'Test Cashier',
      password_hash: PasswordSecurity.hashSync('CashierP@ss1'),
      pin_code: PasswordSecurity.hashSync('7364'),
      role_id: 'cashier',
      biometric_enabled: false,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    const testStorekeeper: User = {
      id: 'test-user-storekeeper',
      username: 'test_storekeeper',
      full_name: 'Test Storekeeper',
      password_hash: PasswordSecurity.hashSync('StoreP@ss1'),
      pin_code: PasswordSecurity.hashSync('6455'),
      role_id: 'storekeeper',
      biometric_enabled: false,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    const testInactiveUser: User = {
      id: 'test-user-inactive',
      username: 'test_inactive',
      full_name: 'Test Inactive Employee',
      password_hash: PasswordSecurity.hashSync('InactiveP@ss1'),
      pin_code: PasswordSecurity.hashSync('5546'),
      role_id: 'cashier',
      biometric_enabled: false,
      is_active: false,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    state.users = state.users.filter((u) => !u.id.startsWith('test-user-'));
    state.users.push(testAdmin, testPharmacist, testCashier, testStorekeeper, testInactiveUser);
  });

  // Admin has access to all operations
  assert.doesNotThrow(() => {
    AuthorizationService.checkPermission('test-user-admin', 'sales');
    AuthorizationService.checkPermission('test-user-admin', 'purchases');
    AuthorizationService.checkPermission('test-user-admin', 'reports');
  }, 'Admin passes all permission checks');
  markPass('9. Admin role has universal permission access');

  // Cashier has sales permission, but is BLOCKED from purchases
  assert.doesNotThrow(() => {
    AuthorizationService.checkPermission('test-user-cashier', 'sales');
  }, 'Cashier is authorized for sales');

  assert.throws(
    () => {
      AuthorizationService.checkPermission('test-user-cashier', 'purchases');
    },
    /AUTH_PERMISSION_DENIED/,
    'Cashier must be blocked from purchases'
  );
  markPass('10. Cashier permitted for sales and blocked from purchases');

  // Storekeeper has purchases permission, but is BLOCKED from sales
  assert.doesNotThrow(() => {
    AuthorizationService.checkPermission('test-user-storekeeper', 'purchases');
  }, 'Storekeeper is authorized for purchases');

  assert.throws(
    () => {
      AuthorizationService.checkPermission('test-user-storekeeper', 'sales');
    },
    /AUTH_PERMISSION_DENIED/,
    'Storekeeper must be blocked from sales'
  );
  markPass('11. Storekeeper permitted for purchases and blocked from sales');

  // Inactive user is BLOCKED from all operations
  assert.throws(
    () => {
      AuthorizationService.checkPermission('test-user-inactive', 'sales');
    },
    /AUTH_USER_INACTIVE/,
    'Inactive user cannot perform any transactions'
  );
  markPass('12. Inactive user strictly blocked at service level');

  console.log('\n======================================================================');
  console.log(`=== ALL PHASE P0 TESTS PASSED: ${passedTests}/${totalTests} (100%) ===`);
  console.log('======================================================================\n');
  process.exit(0);
}

runP0TestSuite().catch((err) => {
  console.error('\n❌ PHASE P0 TEST SUITE FAILED:', err);
  process.exit(1);
});
