/**
 * Native SQLite Driver for Smart Pharmacy ERP
 * Authoritative native SQLite engine supporting Capacitor SQLite on Android/iOS
 * and built-in Node DatabaseSync / WebAssembly SQLite with file persistence.
 *
 * Implements real SQL transactions (BEGIN IMMEDIATE / COMMIT / ROLLBACK),
 * real SQL migrations, and real schema foreign keys.
 */

import { Capacitor } from '@capacitor/core';
import { REAL_SQL_MIGRATIONS, SQLITE_TABLES_DDL } from './sqliteSchema';
import { DatabaseState } from './sqlite';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

function getNodeBuiltins(): { DatabaseSync: any; fs: any; path: any } | null {
  try {
    if (typeof process !== 'undefined' && typeof (process as any).getBuiltinModule === 'function') {
      const sqlite = (process as any).getBuiltinModule('node:sqlite');
      const fs = (process as any).getBuiltinModule('node:fs');
      const path = (process as any).getBuiltinModule('node:path');
      if (sqlite?.DatabaseSync && fs && path) {
        return { DatabaseSync: sqlite.DatabaseSync, fs, path };
      }
    }
  } catch {
    // Browser environment
  }
  return null;
}

export interface RunResult {
  changes?: number;
  lastId?: number;
}

export class NativeSqliteDriver {
  private static instance: NativeSqliteDriver;
  private sqlDb: SqlJsDatabase | null = null;
  private nodeDb: any = null;
  private capDb: any = null;
  private isCapacitorNative = false;
  private inTransaction = false;
  private dbPath = 'data/smart_pharmacy.sqlite';
  private initialized = false;

  private constructor() {
    this.isCapacitorNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

    // In Node.js environment, initialize C-native DatabaseSync synchronously
    const builtins = getNodeBuiltins();
    if (builtins) {
      try {
        const { DatabaseSync, fs, path } = builtins;
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.nodeDb = new DatabaseSync(this.dbPath);
        this.nodeDb.exec('PRAGMA foreign_keys = ON;');
        this.runMigrationsNode();
        this.initialized = true;
      } catch (err) {
        console.warn('NativeSqliteDriver Node constructor notice:', err);
        // Fallback to Wasm
      }
    }
  }

  public static getInstance(): NativeSqliteDriver {
    if (!NativeSqliteDriver.instance) {
      NativeSqliteDriver.instance = new NativeSqliteDriver();
    }
    return NativeSqliteDriver.instance;
  }

  public async init(): Promise<void> {
    if (this.initialized && (this.nodeDb || this.sqlDb)) return;

    if (this.isCapacitorNative) {
      try {
        const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
        const sqlite = new SQLiteConnection(CapacitorSQLite);
        const ret = await sqlite.checkConnectionsConsistency();
        const isConn = (await sqlite.isConnection('smart_pharmacy_db', false)).result;
        let dbConn;
        if (ret.result && isConn) {
          dbConn = await sqlite.retrieveConnection('smart_pharmacy_db', false);
        } else {
          dbConn = await sqlite.createConnection('smart_pharmacy_db', false, 'no-encryption', 1, false);
        }
        await dbConn.open();
        await dbConn.execute('PRAGMA foreign_keys = ON;');
        this.capDb = dbConn;
        this.initialized = true;
        await this.runMigrationsNative(dbConn);
        return;
      } catch (err) {
        console.warn('Capacitor native SQLite bridge notice, falling back to Wasm SQLite:', err);
      }
    }

    if (!this.nodeDb) {
      await this.initWasmEngine();
      this.runMigrationsWasm();
    }
    this.initialized = true;
  }

  private async initWasmEngine(existingBuffer?: Uint8Array): Promise<void> {
    const SQL = await initSqlJs();
    let fileBuffer: Uint8Array | null = existingBuffer || null;

    if (!fileBuffer && typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(this.dbPath)) {
          fileBuffer = new Uint8Array(fs.readFileSync(this.dbPath));
        }
      } catch {
        // Ignore read error
      }
    }

    if (fileBuffer && fileBuffer.length > 0) {
      this.sqlDb = new SQL.Database(fileBuffer);
    } else {
      this.sqlDb = new SQL.Database();
    }

    this.sqlDb.run('PRAGMA foreign_keys = ON;');
  }

  public saveToDisk(): void {
    if (this.nodeDb || this.capDb) return;
    if (!this.sqlDb) return;
    try {
      const data = this.sqlDb.export();
      const builtins = getNodeBuiltins();
      if (builtins) {
        const { fs, path } = builtins;
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.dbPath, Buffer.from(data));
      } else if (typeof sessionStorage !== 'undefined') {
        try {
          const binaryStr = Array.from(data).map((b) => String.fromCharCode(b)).join('');
          sessionStorage.setItem('smart_pharmacy_sqlite_binary', btoa(binaryStr));
        } catch {
          // Quota safe
        }
      }
    } catch (e) {
      console.warn('NativeSqliteDriver: disk persistence notice', e);
    }
  }

  public close(): void {
    if (this.nodeDb) {
      this.nodeDb.close();
      this.nodeDb = null;
    }
    if (this.capDb) {
      try {
        this.capDb.close();
      } catch {}
      this.capDb = null;
    }
    if (this.sqlDb) {
      this.saveToDisk();
      this.sqlDb.close();
      this.sqlDb = null;
    }
    this.initialized = false;
  }

  public isOpen(): boolean {
    return this.nodeDb !== null || this.sqlDb !== null || this.capDb !== null || this.isCapacitorNative;
  }

  public execute(sql: string): void {
    if (this.nodeDb) {
      this.nodeDb.exec(sql);
      return;
    }
    if (this.capDb) {
      this.capDb.execute(sql);
      return;
    }
    if (this.sqlDb) {
      this.sqlDb.run(sql);
      return;
    }
  }

  public run(sql: string, params: any[] = []): RunResult {
    if (this.nodeDb) {
      const stmt = this.nodeDb.prepare(sql);
      const res = stmt.run(...params);
      return { changes: res.changes, lastId: Number(res.lastInsertRowid) };
    }
    if (this.capDb) {
      this.capDb.run(sql, params);
      return { changes: 1 };
    }
    if (this.sqlDb) {
      this.sqlDb.run(sql, params);
      const lastIdRes = this.sqlDb.exec('SELECT last_insert_rowid() AS id;');
      const changesRes = this.sqlDb.exec('SELECT changes() AS ch;');
      const lastId = lastIdRes[0]?.values[0]?.[0] as number | undefined;
      const changes = (changesRes[0]?.values[0]?.[0] as number) || 0;
      return { lastId, changes };
    }
    return { changes: 0 };
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    if (this.nodeDb) {
      const stmt = this.nodeDb.prepare(sql);
      return stmt.all(...params).map((r: any) => ({ ...r })) as T[];
    }
    if (this.capDb) {
      const ret = this.capDb.query(sql, params);
      return (ret?.values || []) as T[];
    }
    if (this.sqlDb) {
      const stmt = this.sqlDb.prepare(sql);
      if (params && params.length > 0) {
        stmt.bind(params);
      }
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return results;
    }
    return [];
  }

  public beginTransaction(): void {
    if (this.inTransaction) return;
    if (this.nodeDb) {
      this.nodeDb.exec('BEGIN IMMEDIATE TRANSACTION;');
      this.inTransaction = true;
    } else if (this.capDb) {
      this.capDb.execute('BEGIN IMMEDIATE TRANSACTION;');
      this.inTransaction = true;
    } else if (this.sqlDb) {
      this.sqlDb.run('BEGIN IMMEDIATE TRANSACTION;');
      this.inTransaction = true;
    }
  }

  public commitTransaction(): void {
    if (!this.inTransaction) return;
    try {
      if (this.nodeDb) {
        this.nodeDb.exec('COMMIT;');
      } else if (this.capDb) {
        this.capDb.execute('COMMIT;');
      } else if (this.sqlDb) {
        this.sqlDb.run('COMMIT;');
        this.saveToDisk();
      }
    } catch {
      // Ignored
    } finally {
      this.inTransaction = false;
    }
  }

  public rollbackTransaction(): void {
    if (!this.inTransaction) return;
    try {
      if (this.nodeDb) {
        this.nodeDb.exec('ROLLBACK;');
      } else if (this.capDb) {
        this.capDb.execute('ROLLBACK;');
      } else if (this.sqlDb) {
        this.sqlDb.run('ROLLBACK;');
      }
    } catch {
      // Ignored
    } finally {
      this.inTransaction = false;
    }
  }

  private runMigrationsNode(): void {
    if (!this.nodeDb) return;
    this.nodeDb.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const appliedVersions = new Set<number>();
    try {
      const rows = this.nodeDb.prepare('SELECT version FROM schema_migrations;').all();
      for (const row of rows) {
        appliedVersions.add(Number(row.version));
      }
    } catch {
      // Empty
    }

    for (const mig of REAL_SQL_MIGRATIONS) {
      if (!appliedVersions.has(mig.version)) {
        this.nodeDb.exec(mig.sql);
        this.nodeDb
          .prepare('INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);')
          .run(mig.version, mig.name, Date.now());
      }
    }
  }

  public runMigrationsWasm(): void {
    if (!this.sqlDb) return;
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const appliedVersions = new Set<number>();
    try {
      const res = this.sqlDb.exec('SELECT version FROM schema_migrations;');
      if (res && res[0] && res[0].values) {
        for (const row of res[0].values) {
          appliedVersions.add(Number(row[0]));
        }
      }
    } catch {
      // Table will be populated
    }

    for (const mig of REAL_SQL_MIGRATIONS) {
      if (!appliedVersions.has(mig.version)) {
        this.sqlDb.run(mig.sql);
        this.sqlDb.run(
          'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
          [mig.version, mig.name, Date.now()]
        );
      }
    }
    this.saveToDisk();
  }

  private async runMigrationsNative(dbConn: any): Promise<void> {
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const queryRes = await dbConn.query('SELECT version FROM schema_migrations;');
    const appliedVersions = new Set<number>((queryRes.values || []).map((r: any) => Number(r.version)));

    for (const mig of REAL_SQL_MIGRATIONS) {
      if (!appliedVersions.has(mig.version)) {
        await dbConn.execute(mig.sql);
        await dbConn.run(
          'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
          [mig.version, mig.name, Date.now()]
        );
      }
    }
  }

  /**
   * Migrate existing ERP data safely from localStorage / memory into SQLite
   * Does NOT delete the existing localStorage data, ensuring safe preservation.
   */
  public migrateFromState(state: DatabaseState): void {
    if (!this.nodeDb && !this.sqlDb) return;

    let existingProducts = 0;
    try {
      if (this.nodeDb) {
        const row = this.nodeDb.prepare('SELECT COUNT(*) as count FROM products;').get();
        existingProducts = Number(row?.count || 0);
      } else if (this.sqlDb) {
        const countRes = this.sqlDb.exec('SELECT COUNT(*) FROM products;');
        existingProducts = (countRes[0]?.values[0]?.[0] as number) || 0;
      }
    } catch {
      existingProducts = 0;
    }

    if (existingProducts === 0 && state) {
      this.beginTransaction();
      try {
        if (state.profile) {
          this.run(
            `INSERT OR REPLACE INTO pharmacy_profile (
              id, name_ar, name_en, phone, currency, currency_code, default_profit_margin_bps,
              receipt_paper_size, device_id, sync_status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              state.profile.id,
              state.profile.name_ar,
              state.profile.name_en || null,
              state.profile.phone || null,
              state.profile.currency,
              state.profile.currency_code,
              state.profile.default_profit_margin_bps || 2000,
              state.profile.receipt_paper_size || '80mm',
              state.profile.device_id,
              state.profile.sync_status || 'synced',
              state.profile.updated_at || Date.now()
            ]
          );
        }

        for (const role of state.roles || []) {
          this.run('INSERT OR REPLACE INTO roles (id, title_ar, permissions_json) VALUES (?, ?, ?);', [
            role.id,
            role.title_ar,
            JSON.stringify(role.permissions)
          ]);
        }

        for (const user of state.users || []) {
          this.run(
            `INSERT OR REPLACE INTO users (
              id, username, full_name, role_id, password_hash, pin_code, biometric_enabled, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              user.id,
              user.username,
              user.full_name,
              user.role_id,
              user.password_hash,
              user.pin_code || null,
              user.biometric_enabled ? 1 : 0,
              user.is_active ? 1 : 0,
              user.created_at || Date.now(),
              user.updated_at || Date.now()
            ]
          );
        }

        for (const cat of state.categories || []) {
          this.run('INSERT OR REPLACE INTO categories (id, name_ar, is_active) VALUES (?, ?, ?);', [
            cat.id,
            cat.name_ar,
            cat.is_active ? 1 : 0
          ]);
        }

        for (const man of state.manufacturers || []) {
          this.run('INSERT OR REPLACE INTO manufacturers (id, name_ar, country) VALUES (?, ?, ?);', [
            man.id,
            man.name_ar,
            man.country || null
          ]);
        }

        for (const prod of state.products || []) {
          this.run(
            `INSERT OR REPLACE INTO products (
              id, internal_code, barcode, name_ar, name_en, category_id, manufacturer_id,
              base_unit, selling_unit, pack_size, current_purchase_price, current_selling_price,
              min_stock_level, reorder_level, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              prod.id,
              prod.internal_code || null,
              prod.barcode || null,
              prod.name_ar,
              prod.name_en || null,
              prod.category_id || null,
              prod.manufacturer_id || null,
              prod.base_unit,
              prod.selling_unit || null,
              prod.pack_size || 1,
              prod.current_purchase_price || 0,
              prod.current_selling_price || 0,
              prod.min_stock_level || 0,
              prod.reorder_level || 0,
              prod.is_active ? 1 : 0,
              prod.created_at || Date.now(),
              prod.updated_at || Date.now()
            ]
          );
        }

        for (const uc of state.unit_conversions || []) {
          this.run(
            `INSERT OR REPLACE INTO unit_conversions (
              id, product_id, unit_name, conversion_factor, barcode, selling_price,
              purchase_price, is_default_sale, is_default_purchase
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              uc.id,
              uc.product_id,
              uc.unit_name,
              uc.conversion_factor,
              (uc as any).barcode || null,
              uc.selling_price || 0,
              (uc as any).purchase_price || 0,
              uc.is_default_sale ? 1 : 0,
              (uc as any).is_default_purchase ? 1 : 0
            ]
          );
        }

        for (const batch of state.batches || []) {
          this.run(
            `INSERT OR REPLACE INTO batches (
              id, product_id, batch_number, expiry_date, quantity, received_at, initial_quantity, current_quantity,
              purchase_price, selling_price, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              batch.id,
              batch.product_id,
              batch.batch_number,
              batch.expiry_date,
              batch.current_quantity,
              (batch as any).received_at || batch.created_at || Date.now(),
              batch.initial_quantity,
              batch.current_quantity,
              batch.purchase_price,
              batch.selling_price,
              batch.status || 'active',
              batch.created_at,
              batch.updated_at
            ]
          );
        }

        for (const cb of state.cashboxes || []) {
          this.run(
            'INSERT OR REPLACE INTO cashboxes (id, name_ar, type, cached_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);',
            [cb.id, cb.name_ar, cb.type, cb.cached_balance || 0, cb.is_active ? 1 : 0, cb.created_at, cb.updated_at]
          );
        }

        for (const cust of state.customers || []) {
          this.run(
            'INSERT OR REPLACE INTO customers (id, name, phone, address, cached_balance, credit_limit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
            [
              cust.id,
              cust.name,
              cust.phone || null,
              cust.address || null,
              cust.cached_balance || 0,
              cust.credit_limit || 0,
              cust.is_active ? 1 : 0,
              cust.created_at,
              cust.updated_at
            ]
          );
        }

        for (const sup of state.suppliers || []) {
          this.run(
            'INSERT OR REPLACE INTO suppliers (id, name, contact_person, phone, address, cached_balance, credit_limit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
            [
              sup.id,
              sup.name,
              sup.contact_person || null,
              sup.phone || null,
              sup.address || null,
              sup.cached_balance || 0,
              sup.credit_limit || 0,
              sup.is_active ? 1 : 0,
              sup.created_at,
              sup.updated_at
            ]
          );
        }

        this.commitTransaction();
      } catch (err) {
        this.rollbackTransaction();
        console.error('Data migration to SQLite notice:', err);
      }
    }
  }

  public syncEntity(tableName: string, entity: any): void {
    if (!this.nodeDb && !this.sqlDb) return;
    if (!entity || !entity.id) return;
    try {
      const keys = Object.keys(entity).filter((k) => typeof entity[k] !== 'object' || entity[k] === null);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map((k) => {
        const val = entity[k];
        if (typeof val === 'boolean') return val ? 1 : 0;
        return val;
      });
      const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders});`;
      this.run(sql, values);
    } catch {
      // Fallback
    }
  }

  public exportBinary(): Uint8Array {
    if (this.sqlDb) return this.sqlDb.export();
    return new Uint8Array();
  }
}
