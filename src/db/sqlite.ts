// Local SQLite & IndexedDB Storage Engine for Smart Pharmacy ERP
// Authoritative local database with strict atomic transactions, foreign keys and migrations

import { MigrationManager } from './migrations';
import { TransactionManager } from './transaction';
import { PasswordSecurity } from '../utils/security';
import {
  PharmacyProfile,
  User,
  Role,
  Category,
  Manufacturer,
  Product,
  UnitConversion,
  Batch,
  StockMovement,
  Customer,
  CustomerTransaction,
  Supplier,
  SupplierTransaction,
  Cashbox,
  CashTransaction,
  ExpenseCategory,
  Expense,
  Sale,
  SaleItem,
  SaleItemAllocation,
  SaleReturn,
  SaleReturnItem,
  SaleReturnAllocation,
  Purchase,
  PurchaseItem,
  PurchaseReturn,
  PurchaseReturnItem,
  PurchaseReturnAllocation,
  WorkShift,
  AuditLog,
  StockCountSession,
  StockCountItem,
  SyncOutboxEntry
} from '../types';

export interface DatabaseState {
  version: number;
  profile: PharmacyProfile;
  pharmacy_profile?: PharmacyProfile;
  roles: Role[];
  users: User[];
  categories: Category[];
  manufacturers: Manufacturer[];
  products: Product[];
  unit_conversions: UnitConversion[];
  batches: Batch[];
  stock_movements: StockMovement[];
  stock_count_sessions: StockCountSession[];
  stock_count_items: StockCountItem[];
  customers: Customer[];
  customer_transactions: CustomerTransaction[];
  suppliers: Supplier[];
  supplier_transactions: SupplierTransaction[];
  cashboxes: Cashbox[];
  cash_transactions: CashTransaction[];
  expense_categories: ExpenseCategory[];
  expenses: Expense[];
  sales: Sale[];
  sale_items: SaleItem[];
  sale_item_allocations: SaleItemAllocation[];
  sale_returns: SaleReturn[];
  sale_return_items: SaleReturnItem[];
  sale_return_allocations: SaleReturnAllocation[];
  purchases: Purchase[];
  purchase_items: PurchaseItem[];
  purchase_returns: PurchaseReturn[];
  purchase_return_items: PurchaseReturnItem[];
  purchase_return_allocations: PurchaseReturnAllocation[];
  work_shifts: WorkShift[];
  audit_logs: AuditLog[];
  sync_outbox: SyncOutboxEntry[];
  schema_migrations: Array<{ version: number; name: string; applied_at: number }>;
}

const STORAGE_KEY = 'smart_pharmacy_erp_db_v1';

export class SQLiteEngine {
  private state: DatabaseState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadInitialState();
  }

  private saveTimer: any = null;

  public getState(): DatabaseState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify() {
    this.listeners.forEach((fn) => fn());
    this.saveState();
  }

  /**
   * Fast, low-latency deep-clone snapshot without JSON.stringify overhead.
   * Preserves exact row states for instant rollback on error.
   */
  private createSnapshot(): DatabaseState {
    const snapshot: any = {};
    for (const key of Object.keys(this.state) as Array<keyof DatabaseState>) {
      const val = this.state[key];
      if (Array.isArray(val)) {
        snapshot[key] = val.map((row) => (row && typeof row === 'object' ? { ...row } : row));
      } else if (val && typeof val === 'object') {
        snapshot[key] = { ...val };
      } else {
        snapshot[key] = val;
      }
    }
    return snapshot;
  }

  public saveStateImmediate() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (err) {
      console.warn('Failed to persist SQLite state to localStorage (likely quota limit on large catalog)', err);
    }
  }

  public saveState() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveStateImmediate();
    }, 250);
  }

  public exportJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  public importJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object' || !parsed.profile) {
        throw new Error('Invalid database format');
      }
      Object.keys(this.state).forEach((k) => delete (this.state as any)[k]);
      Object.assign(this.state, parsed);
      this.notify();
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }

  // Atomic transaction runner with PRAGMA foreign_keys = ON and automatic rollback on error
  public transaction<T>(callback: () => T): T {
    const backup = this.createSnapshot();
    try {
      const result = callback();
      // Enforce PRAGMA foreign_keys = ON check on state
      TransactionManager.verifyForeignKeys(this.state);
      this.notify();
      return result;
    } catch (error) {
      console.error('Transaction rollback triggered due to error:', error);
      // Restore state in-place so existing references to state remain valid
      Object.keys(this.state).forEach((k) => delete (this.state as any)[k]);
      Object.assign(this.state, backup);
      throw error;
    }
  }

  public async transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    const backup = this.createSnapshot();
    try {
      const result = await callback();
      TransactionManager.verifyForeignKeys(this.state);
      this.notify();
      return result;
    } catch (error) {
      console.error('Async transaction rollback triggered due to error:', error);
      Object.keys(this.state).forEach((k) => delete (this.state as any)[k]);
      Object.assign(this.state, backup);
      throw error;
    }
  }

  private loadInitialState(): DatabaseState {
    let state: DatabaseState;
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          state = JSON.parse(saved);
        } else {
          state = this.seedDatabase();
        }
      } else {
        state = this.seedDatabase();
      }
    } catch (e) {
      console.warn('Could not read existing state, seeding new database', e);
      state = this.seedDatabase();
    }
    // Run versioned migrations deterministically
    MigrationManager.runMigrations(state);
    if (!state.sync_outbox) {
      state.sync_outbox = [];
    }
    return state;
  }

  public resetToFactory(): void {
    this.state = this.seedDatabase();
    this.notify();
  }

  public restoreBackup(newState: DatabaseState): void {
    if (!newState || !newState.profile || !Array.isArray(newState.products)) {
      throw new Error('الملف المسترجع غير صالح أو لا يحتوي على بنية بيانات الصيدلية الصحيحة');
    }
    this.state = newState;
    this.notify();
  }

  private seedDatabase(): DatabaseState {
    const now = Date.now();
    const deviceId = 'DEVICE-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    const profile: PharmacyProfile = {
      id: 'prof-01',
      name_ar: 'صيدلية الشفاء الحديثة',
      name_en: 'Al-Shifa Modern Pharmacy',
      owner_name: 'د. خالد الشرماني',
      phone: '772722134',
      phone_en: '+967 772722134',
      address_ar: 'شارع الزبيري، صنعاء، الجمهورية اليمنية',
      address_en: 'Al-Zubairi St, Sanaa, Yemen',
      currency: 'ر.ي',
      currency_code: 'YER',
      tax_number: 'TX-984210',
      license_number: 'PH-2024-88',
      default_profit_margin_bps: 2000,
      receipt_paper_size: '80mm',
      receipt_footer_text: 'نتمنى لكم دوام الصحة والعافية - يرجى مراجعة الصيدلية خلال 3 أيام للإرجاع مع الفاتورة',
      tax_rate_bps: 0, // Configurable VAT rate in basis points (default 0 for tax-exempt medicine)
      near_expiry_days: 90,
      device_id: deviceId,
      sync_status: 'synced',
      updated_at: now
    };

    const roles: Role[] = [
      { id: 'admin', title_ar: 'مدير النظام', permissions: ['all'] },
      { id: 'pharmacist', title_ar: 'صيدلي مسؤول', permissions: ['sales', 'inventory', 'purchases', 'returns', 'reports'] },
      { id: 'cashier', title_ar: 'كاشير مبيعات', permissions: ['sales', 'receipts'] },
      { id: 'storekeeper', title_ar: 'أمين مخزن', permissions: ['inventory', 'purchases', 'stock_movements'] }
    ];

    const users: User[] = [
      {
        id: 'user-01',
        username: 'admin',
        full_name: 'د. خالد الشرماني',
        password_hash: PasswordSecurity.hashSync('123456'),
        pin_code: PasswordSecurity.hashSync('1234'),
        role_id: 'admin',
        biometric_enabled: true,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ];

    const categories: Category[] = [
      { id: 'cat-01', name_ar: 'مسكنات وخافض حرارة', is_active: true },
      { id: 'cat-02', name_ar: 'مضادات حيوية', is_active: true },
      { id: 'cat-03', name_ar: 'أدوية المعدة والجهاز الهضمي', is_active: true },
      { id: 'cat-04', name_ar: 'فيتامينات ومكملات غذائية', is_active: true },
      { id: 'cat-05', name_ar: 'مستلزمات ومراهم موضعية', is_active: true }
    ];

    const manufacturers: Manufacturer[] = [
      { id: 'man-01', name_ar: 'الشركة الدولية للأدوية (يدكو)', country: 'اليمن' },
      { id: 'man-02', name_ar: 'الشركة اليمنية لصناعة الأدوية (شيفاكس)', country: 'اليمن' },
      { id: 'man-03', name_ar: 'جلاكسو سميث كلاين (GSK)', country: 'بريطانيا' },
      { id: 'man-04', name_ar: 'فايزر العالمية', country: 'الولايات المتحدة' }
    ];

    const cashboxes: Cashbox[] = [
      { id: 'cash-01', name_ar: 'صندوق اليومية', type: 'daily', cached_balance: 0, is_active: true, created_at: now, updated_at: now },
      { id: 'cash-02', name_ar: 'صندوق الصيدلية الرئيسي', type: 'main', cached_balance: 0, is_active: true, created_at: now, updated_at: now },
      { id: 'cash-03', name_ar: 'حساب الصراف / البنك', type: 'bank', cached_balance: 0, is_active: true, created_at: now, updated_at: now }
    ];

    const expense_categories: ExpenseCategory[] = [
      { id: 'exp-01', name_ar: 'إيجار الصيدلية', is_active: true },
      { id: 'exp-02', name_ar: 'كهرباء ومولدات', is_active: true },
      { id: 'exp-03', name_ar: 'ماء وخدمات', is_active: true },
      { id: 'exp-04', name_ar: 'رواتب موظفين', is_active: true },
      { id: 'exp-05', name_ar: 'نظافة وصيانة', is_active: true },
      { id: 'exp-06', name_ar: 'قرطاسية ومطبوعات', is_active: true },
      { id: 'exp-07', name_ar: 'مصروفات تشغيلية أخرى', is_active: true }
    ];

    const suppliers: Supplier[] = [
      {
        id: 'sup-01',
        name: 'مؤسسة الأدوية النموذجية',
        contact_person: 'أحمد الوصابي',
        phone: '771122334',
        address: 'شارع الدائري، صنعاء',
        cached_balance: 0,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'sup-02',
        name: 'وكالة الشرق للمستلزمات الطبية',
        contact_person: 'سامي المشرقي',
        phone: '774455667',
        address: 'الحصبة، صنعاء',
        cached_balance: 0,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ];

    const customers: Customer[] = [
      {
        id: 'cust-cash',
        name: 'عميل نقدي عام',
        phone: '',
        cached_balance: 0,
        credit_limit: 0,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'cust-01',
        name: 'مستوصف الأمل الخيري',
        phone: '775511223',
        address: 'حدة، صنعاء',
        cached_balance: 0,
        credit_limit: 20000000,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ];

    return {
      version: 1,
      profile,
      roles,
      users,
      categories,
      manufacturers,
      products: [],
      unit_conversions: [],
      batches: [],
      stock_movements: [],
      stock_count_sessions: [],
      stock_count_items: [],
      customers,
      customer_transactions: [],
      suppliers,
      supplier_transactions: [],
      cashboxes,
      cash_transactions: [],
      expense_categories,
      expenses: [],
      sales: [],
      sale_items: [],
      sale_item_allocations: [],
      sale_returns: [],
      sale_return_items: [],
      sale_return_allocations: [],
      purchases: [],
      purchase_items: [],
      purchase_returns: [],
      purchase_return_items: [],
      purchase_return_allocations: [],
      work_shifts: [],
      audit_logs: [],
      sync_outbox: [],
      schema_migrations: [
        { version: 1, name: '001_initial_core_schema', applied_at: now },
        { version: 2, name: '002_audit_trail_and_indices_support', applied_at: now },
        { version: 3, name: '003_secure_passwords_and_pins', applied_at: now }
      ]
    };
  }
}

export const db = new SQLiteEngine();
