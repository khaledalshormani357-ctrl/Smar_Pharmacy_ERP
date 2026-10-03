import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NodeSqliteDriver, SQLITE_TABLES_DDL } from '../src/db/nativeSqlite';
import { db } from '../src/db/sqlite';
import { AuthorizationService } from '../src/services/AuthorizationService';

const file = path.resolve('./test_production_snapshot.sqlite');
if (fs.existsSync(file)) fs.unlinkSync(file);

const first = new NodeSqliteDriver(file);
first.exec(SQLITE_TABLES_DDL);
const state = db.getState();
state.products.push({
  id: 'persist-production-001', name_ar: 'دواء اختبار الاستمرارية', name_en: 'Persistence Test Medicine',
  base_unit: 'حبة', pack_size: 1, current_purchase_price: 100, current_selling_price: 150,
  is_active: true, created_at: Date.now(), updated_at: Date.now()
} as any);
first.saveStateSnapshot(state);
first.close();

const reopened = new NodeSqliteDriver(file);
const recovered = reopened.loadStateSnapshot();
assert.ok(recovered, 'SQLite snapshot must exist after close/reopen');
assert.equal(recovered?.products.some((p) => p.id === 'persist-production-001'), true);
assert.equal(recovered?.products.find((p) => p.id === 'persist-production-001')?.name_ar, 'دواء اختبار الاستمرارية');
reopened.close();
fs.unlinkSync(file);

assert.throws(() => AuthorizationService.checkPermission(undefined, 'sales'), /AUTH_REQUIRED/);
assert.throws(() => AuthorizationService.checkRole(undefined, ['admin']), /AUTH_REQUIRED/);

console.log('Production persistence tests passed: SQLite snapshot survives reopen and missing-user authorization is rejected');
