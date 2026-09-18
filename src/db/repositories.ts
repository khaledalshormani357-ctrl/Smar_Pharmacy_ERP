// Comprehensive Repositories for Smart Pharmacy ERP
// Encapsulates data access and ensures queries go through verified methods and audit trails

import { db } from './sqlite';
import {
  Product,
  Batch,
  Category,
  Manufacturer,
  UnitConversion,
  StockMovement,
  Customer,
  CustomerTransaction,
  Cashbox,
  CashTransaction,
  Sale,
  SaleItem,
  SaleItemAllocation,
  Supplier,
  SupplierTransaction,
  Purchase,
  PurchaseItem,
  SaleReturn,
  SaleReturnItem,
  SaleReturnAllocation,
  PurchaseReturn,
  PurchaseReturnItem,
  PurchaseReturnAllocation
} from '../types';
import { DomainValidator } from './validation';
import { AuditManager } from './audit';

export class ProductRepository {
  static getAll(includeInactive = false): Product[] {
    return db.getState().products.filter((p) => (includeInactive ? !p.deleted_at : p.is_active && !p.deleted_at));
  }

  static getById(id: string): Product | undefined {
    return db.getState().products.find((p) => p.id === id && !p.deleted_at);
  }

  static getByBarcode(barcode: string): Product | undefined {
    if (!barcode) return undefined;
    const clean = barcode.trim();
    return db.getState().products.find((p) => p.barcode === clean && !p.deleted_at);
  }

  static search(term: string, categoryId?: string, manufacturerId?: string): Product[] {
    const norm = term ? DomainValidator.normalizeArabic(term.toLowerCase().trim()) : '';
    const state = db.getState();
    const manufacturersMap = new Map(state.manufacturers.map((m) => [m.id, m.name_ar.toLowerCase()]));

    return state.products.filter((p) => {
      if (p.deleted_at) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (manufacturerId && p.manufacturer_id !== manufacturerId) return false;

      if (!norm) return true;

      const nAr = DomainValidator.normalizeArabic(p.name_ar.toLowerCase());
      const nEn = (p.name_en || '').toLowerCase();
      const nGen = DomainValidator.normalizeArabic((p.generic_name || '').toLowerCase());
      const nAct = DomainValidator.normalizeArabic((p.active_ingredient || '').toLowerCase());
      const nCode = (p.internal_code || '').toLowerCase();
      const nBar = (p.barcode || '').toLowerCase();
      const nMan = p.manufacturer_id ? DomainValidator.normalizeArabic(manufacturersMap.get(p.manufacturer_id) || '') : '';

      return (
        nAr.includes(norm) ||
        nEn.includes(norm) ||
        nGen.includes(norm) ||
        nAct.includes(norm) ||
        nCode.includes(norm) ||
        nBar.includes(norm) ||
        nMan.includes(norm)
      );
    });
  }

  static insert(product: Product, userId = 'user-01'): void {
    DomainValidator.validateProduct(product);
    // Check barcode uniqueness
    if (product.barcode && product.barcode.trim()) {
      const existing = this.getByBarcode(product.barcode);
      if (existing && existing.id !== product.id) {
        throw new Error(`الباركود (${product.barcode}) مسجل مسبقاً لصنف آخر (${existing.name_ar}).`);
      }
    }

    db.transaction(() => {
      const state = db.getState();
      state.products.push(product);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'product', product.id, state.profile.device_id, {
          payloadAfter: product
        })
      );
    });
  }

  static update(id: string, updates: Partial<Product>, userId = 'user-01'): void {
    DomainValidator.validateProduct(updates, true);
    if (updates.barcode && updates.barcode.trim()) {
      const existing = this.getByBarcode(updates.barcode);
      if (existing && existing.id !== id) {
        throw new Error(`الباركود (${updates.barcode}) مسجل مسبقاً لصنف آخر (${existing.name_ar}).`);
      }
    }

    db.transaction(() => {
      const state = db.getState();
      const idx = state.products.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('الصنف غير موجود.');

      const before = { ...state.products[idx] };
      state.products[idx] = {
        ...state.products[idx],
        ...updates,
        updated_at: Date.now()
      };

      state.audit_logs.push(
        AuditManager.createLog(userId, 'UPDATE', 'product', id, state.profile.device_id, {
          payloadBefore: before,
          payloadAfter: state.products[idx]
        })
      );
    });
  }

  static deactivate(id: string, userId = 'user-01'): void {
    db.transaction(() => {
      const state = db.getState();
      const product = state.products.find((p) => p.id === id);
      if (!product) throw new Error('الصنف غير موجود.');

      product.is_active = false;
      product.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'DEACTIVATE', 'product', id, state.profile.device_id, {
          reason: 'تعطيل الصنف ' + product.name_ar
        })
      );
    });
  }

  static activate(id: string, userId = 'user-01'): void {
    db.transaction(() => {
      const state = db.getState();
      const product = state.products.find((p) => p.id === id);
      if (!product) throw new Error('الصنف غير موجود.');

      product.is_active = true;
      product.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'ACTIVATE', 'product', id, state.profile.device_id, {
          reason: 'تنشيط الصنف ' + product.name_ar
        })
      );
    });
  }
}

export class CategoryRepository {
  static getAll(): Category[] {
    return db.getState().categories;
  }

  static getById(id: string): Category | undefined {
    return db.getState().categories.find((c) => c.id === id);
  }

  static insert(cat: Category, userId = 'user-01'): void {
    if (!cat.name_ar || !cat.name_ar.trim()) {
      throw new Error('اسم التصنيف بالعربية إلزامي.');
    }
    db.transaction(() => {
      const state = db.getState();
      state.categories.push(cat);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'category', cat.id, state.profile.device_id, {
          payloadAfter: cat
        })
      );
    });
  }

  static update(id: string, nameAr: string, nameEn?: string, userId = 'user-01'): void {
    if (!nameAr || !nameAr.trim()) {
      throw new Error('اسم التصنيف بالعربية إلزامي.');
    }
    db.transaction(() => {
      const state = db.getState();
      const cat = state.categories.find((c) => c.id === id);
      if (!cat) throw new Error('التصنيف غير موجود.');

      cat.name_ar = nameAr.trim();
      cat.name_en = nameEn?.trim();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'UPDATE', 'category', id, state.profile.device_id, {
          payloadAfter: cat
        })
      );
    });
  }

  static delete(id: string, userId = 'user-01'): void {
    // Prevent deletion when referenced by products
    const state = db.getState();
    const isReferenced = state.products.some((p) => p.category_id === id && !p.deleted_at);
    if (isReferenced) {
      throw new Error('لا يمكن حذف هذا التصنيف لوجود أدوية وأصناف مرتبطة به. يمكنك تعطيله بدلاً من ذلك.');
    }

    db.transaction(() => {
      state.categories = state.categories.filter((c) => c.id !== id);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'DELETE', 'category', id, state.profile.device_id, {
          reason: 'حذف تصنيف غير مستخدم'
        })
      );
    });
  }
}

export class ManufacturerRepository {
  static getAll(): Manufacturer[] {
    return db.getState().manufacturers;
  }

  static getById(id: string): Manufacturer | undefined {
    return db.getState().manufacturers.find((m) => m.id === id);
  }

  static insert(man: Manufacturer, userId = 'user-01'): void {
    if (!man.name_ar || !man.name_ar.trim()) {
      throw new Error('اسم الشركة المصنعة بالعربية إلزامي.');
    }
    db.transaction(() => {
      const state = db.getState();
      state.manufacturers.push(man);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'manufacturer', man.id, state.profile.device_id, {
          payloadAfter: man
        })
      );
    });
  }

  static update(id: string, nameAr: string, country?: string, userId = 'user-01'): void {
    if (!nameAr || !nameAr.trim()) {
      throw new Error('اسم الشركة المصنعة بالعربية إلزامي.');
    }
    db.transaction(() => {
      const state = db.getState();
      const man = state.manufacturers.find((m) => m.id === id);
      if (!man) throw new Error('الشركة المصنعة غير موجودة.');

      man.name_ar = nameAr.trim();
      man.country = country?.trim();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'UPDATE', 'manufacturer', id, state.profile.device_id, {
          payloadAfter: man
        })
      );
    });
  }

  static delete(id: string, userId = 'user-01'): void {
    // Prevent deletion when referenced by products
    const state = db.getState();
    const isReferenced = state.products.some((p) => p.manufacturer_id === id && !p.deleted_at);
    if (isReferenced) {
      throw new Error('لا يمكن حذف الشركة المصنعة لوجود أدوية وأصناف مرتبطة بها.');
    }

    db.transaction(() => {
      state.manufacturers = state.manufacturers.filter((m) => m.id !== id);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'DELETE', 'manufacturer', id, state.profile.device_id, {
          reason: 'حذف شركة مصنعة غير مستخدمة'
        })
      );
    });
  }
}

export class BatchRepository {
  static getByProduct(productId: string): Batch[] {
    return db.getState().batches.filter((b) => b.product_id === productId);
  }

  static getById(id: string): Batch | undefined {
    return db.getState().batches.find((b) => b.id === id);
  }

  static getActiveByProduct(productId: string): Batch[] {
    const today = new Date().toISOString().slice(0, 10);
    return db
      .getState()
      .batches.filter((b) => b.product_id === productId && b.status === 'active' && b.current_quantity > 0 && b.expiry_date >= today)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  }
}

export class UnitConversionRepository {
  static getByProduct(productId: string): UnitConversion[] {
    return db.getState().unit_conversions.filter((uc) => uc.product_id === productId);
  }

  static saveForProduct(
    productId: string,
    baseUnit: string,
    conversions: Array<{ unit_name: string; conversion_factor: number; selling_price: number; is_default_sale?: boolean }>,
    userId = 'user-01'
  ): void {
    // Validate each conversion
    for (const c of conversions) {
      DomainValidator.validateConversion(c);
    }

    db.transaction(() => {
      const state = db.getState();
      state.unit_conversions = state.unit_conversions.filter((uc) => uc.product_id !== productId);

      // Always add base unit 1:1
      state.unit_conversions.push({
        id: 'uc-' + Math.random().toString(36).substring(2, 9),
        product_id: productId,
        unit_name: baseUnit.trim(),
        conversion_factor: 1,
        selling_price: 0,
        is_default_sale: conversions.length === 0
      });

      // Add other units
      for (let i = 0; i < conversions.length; i++) {
        const c = conversions[i];
        if (c.unit_name.trim() !== baseUnit.trim()) {
          state.unit_conversions.push({
            id: 'uc-' + Math.random().toString(36).substring(2, 9),
            product_id: productId,
            unit_name: c.unit_name.trim(),
            conversion_factor: c.conversion_factor,
            selling_price: c.selling_price,
            is_default_sale: !!c.is_default_sale
          });
        }
      }

      state.audit_logs.push(
        AuditManager.createLog(userId, 'UPDATE_UNITS', 'unit_conversion', productId, state.profile.device_id, {
          reason: `تحديث وحدات القياس للصنف ${productId}`
        })
      );
    });
  }
}

export class StockMovementRepository {
  static getByProduct(productId: string): StockMovement[] {
    return db
      .getState()
      .stock_movements.filter((m) => m.product_id === productId)
      .sort((a, b) => b.created_at - a.created_at);
  }

  static getByBatch(batchId: string): StockMovement[] {
    return db
      .getState()
      .stock_movements.filter((m) => m.batch_id === batchId)
      .sort((a, b) => b.created_at - a.created_at);
  }
}

export class CustomerRepository {
  static getAll(includeInactive = false): Customer[] {
    return db.getState().customers.filter((c) => (includeInactive ? true : c.is_active));
  }

  static getById(id: string): Customer | undefined {
    return db.getState().customers.find((c) => c.id === id);
  }

  static search(query: string): Customer[] {
    const q = DomainValidator.normalizeArabic(query.toLowerCase().trim());
    if (!q) return this.getAll();
    return db.getState().customers.filter((c) => {
      const nameNorm = DomainValidator.normalizeArabic(c.name.toLowerCase());
      const phoneNorm = (c.phone || '').trim();
      return nameNorm.includes(q) || phoneNorm.includes(q);
    });
  }

  static create(data: { name: string; phone?: string; address?: string; credit_limit?: number }, userId = 'user-01'): Customer {
    if (!data.name || !data.name.trim()) {
      throw new Error('اسم العميل إلزامي.');
    }
    return db.transaction(() => {
      const state = db.getState();
      const customer: Customer = {
        id: 'cust-' + Math.random().toString(36).substring(2, 9),
        name: data.name.trim(),
        phone: data.phone?.trim() || '',
        address: data.address?.trim() || '',
        cached_balance: 0,
        credit_limit: data.credit_limit || 0,
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      state.customers.push(customer);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'customer', customer.id, state.profile.device_id, {
          payloadAfter: customer
        })
      );
      return customer;
    });
  }

  static getLedger(customerId: string): CustomerTransaction[] {
    return db
      .getState()
      .customer_transactions.filter((tx) => tx.customer_id === customerId)
      .sort((a, b) => b.created_at - a.created_at);
  }
}

export class CashboxRepository {
  static getAll(): Cashbox[] {
    return db.getState().cashboxes.filter((c) => c.is_active);
  }

  static getById(id: string): Cashbox | undefined {
    return db.getState().cashboxes.find((c) => c.id === id);
  }

  static getTransactions(cashboxId: string): CashTransaction[] {
    return db
      .getState()
      .cash_transactions.filter((tx) => tx.cashbox_id === cashboxId)
      .sort((a, b) => b.created_at - a.created_at);
  }
}

export class SaleRepository {
  static getAll(): Sale[] {
    return db
      .getState()
      .sales.slice()
      .sort((a, b) => b.created_at - a.created_at);
  }

  static getById(id: string): Sale | undefined {
    return db.getState().sales.find((s) => s.id === id);
  }

  static getByInvoiceNumber(invoiceNumber: string): Sale | undefined {
    return db.getState().sales.find((s) => s.invoice_number === invoiceNumber);
  }

  static getItems(saleId: string): SaleItem[] {
    return db.getState().sale_items.filter((item) => item.sale_id === saleId);
  }

  static getAllocations(saleId: string): SaleItemAllocation[] {
    return db.getState().sale_item_allocations.filter((a) => a.sale_id === saleId);
  }
}

export class SupplierRepository {
  static getAll(includeInactive = false): Supplier[] {
    return db
      .getState()
      .suppliers.filter((s) => (includeInactive ? true : s.is_active))
      .slice()
      .sort((a, b) => b.created_at - a.created_at);
  }

  static getById(id: string): Supplier | undefined {
    return db.getState().suppliers.find((s) => s.id === id);
  }

  static search(query: string): Supplier[] {
    const q = DomainValidator.normalizeArabic((query || '').toLowerCase().trim());
    if (!q) return this.getAll();
    return db.getState().suppliers.filter((s) => {
      const nameAr = DomainValidator.normalizeArabic((s.name_ar || s.name || '').toLowerCase());
      const nameEn = (s.name_en || '').toLowerCase();
      const phone = (s.phone || '').trim();
      const taxNo = (s.tax_number || '').trim();
      return nameAr.includes(q) || nameEn.includes(q) || phone.includes(q) || taxNo.includes(q);
    });
  }

  static create(
    data: {
      name_ar: string;
      name_en?: string;
      phone: string;
      address?: string;
      tax_number?: string;
      opening_balance?: number;
      credit_limit?: number;
      contact_person?: string;
    },
    userId = 'user-01'
  ): Supplier {
    if (!data.name_ar || !data.name_ar.trim()) {
      throw new Error('اسم المورد بالعربية إلزامي.');
    }
    if (!data.phone || !data.phone.trim()) {
      throw new Error('رقم هاتف المورد إلزامي.');
    }

    return db.transaction(() => {
      const state = db.getState();
      const now = Date.now();
      const openingBal = Math.max(0, data.opening_balance || 0);

      const supplier: Supplier = {
        id: 'sup-' + Math.random().toString(36).substring(2, 9),
        name: data.name_ar.trim(),
        name_ar: data.name_ar.trim(),
        name_en: data.name_en?.trim() || '',
        contact_person: data.contact_person?.trim() || '',
        phone: data.phone.trim(),
        address: data.address?.trim() || '',
        tax_number: data.tax_number?.trim() || '',
        opening_balance: openingBal,
        credit_limit: Math.max(0, data.credit_limit || 0),
        cached_balance: openingBal,
        is_active: true,
        created_at: now,
        updated_at: now
      };

      state.suppliers.push(supplier);

      // Record opening balance transaction if > 0
      if (openingBal > 0) {
        const tx: SupplierTransaction = {
          id: 'strx-' + Math.random().toString(36).substring(2, 9),
          supplier_id: supplier.id,
          transaction_type: 'opening_balance',
          reference_type: 'opening_balance',
          reference_id: supplier.id,
          debit: 0,
          credit: openingBal,
          balance_after: openingBal,
          notes: 'رصيد افتتاحي للمورد عند الإنشاء',
          created_by: userId,
          created_at: now
        };
        state.supplier_transactions.push(tx);
      }

      state.audit_logs.push(
        AuditManager.createLog(userId, 'CREATE', 'supplier', supplier.id, state.profile.device_id, {
          payloadAfter: supplier
        })
      );

      return supplier;
    });
  }

  static update(
    id: string,
    data: {
      name_ar?: string;
      name_en?: string;
      phone?: string;
      address?: string;
      tax_number?: string;
      credit_limit?: number;
      contact_person?: string;
    },
    userId = 'user-01'
  ): Supplier {
    return db.transaction(() => {
      const state = db.getState();
      const supp = state.suppliers.find((s) => s.id === id);
      if (!supp) throw new Error('المورد المحدد غير موجود.');

      const before = { ...supp };

      if (data.name_ar !== undefined) {
        if (!data.name_ar.trim()) throw new Error('اسم المورد بالعربية إلزامي.');
        supp.name_ar = data.name_ar.trim();
        supp.name = data.name_ar.trim();
      }
      if (data.name_en !== undefined) supp.name_en = data.name_en.trim();
      if (data.phone !== undefined) {
        if (!data.phone.trim()) throw new Error('رقم هاتف المورد إلزامي.');
        supp.phone = data.phone.trim();
      }
      if (data.address !== undefined) supp.address = data.address.trim();
      if (data.tax_number !== undefined) supp.tax_number = data.tax_number.trim();
      if (data.contact_person !== undefined) supp.contact_person = data.contact_person.trim();
      if (data.credit_limit !== undefined) supp.credit_limit = Math.max(0, data.credit_limit);

      supp.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'UPDATE', 'supplier', id, state.profile.device_id, {
          payloadBefore: before,
          payloadAfter: supp
        })
      );

      return supp;
    });
  }

  static deactivate(id: string, userId = 'user-01'): void {
    db.transaction(() => {
      const state = db.getState();
      const supp = state.suppliers.find((s) => s.id === id);
      if (!supp) throw new Error('المورد المحدد غير موجود.');
      supp.is_active = false;
      supp.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'DEACTIVATE', 'supplier', id, state.profile.device_id, {
          reason: 'تعطيل حساب المورد'
        })
      );
    });
  }

  static reactivate(id: string, userId = 'user-01'): void {
    db.transaction(() => {
      const state = db.getState();
      const supp = state.suppliers.find((s) => s.id === id);
      if (!supp) throw new Error('المورد المحدد غير موجود.');
      supp.is_active = true;
      supp.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'REACTIVATE', 'supplier', id, state.profile.device_id, {
          reason: 'إعادة تفعيل حساب المورد'
        })
      );
    });
  }

  static delete(id: string, userId = 'user-01'): void {
    const state = db.getState();
    const hasPurchases = state.purchases.some((p) => p.supplier_id === id);
    const hasBatches = state.batches.some((b) => b.supplier_id === id);
    const hasTransactions = state.supplier_transactions.some((t) => t.supplier_id === id);

    if (hasPurchases || hasBatches || hasTransactions) {
      throw new Error('لا يمكن حذف مورد مسجل عليه فواتير أو حركات حسابية سابقة. يمكنك إلغاء تنشيطه بدلاً من ذلك.');
    }

    db.transaction(() => {
      state.suppliers = state.suppliers.filter((s) => s.id !== id);
      state.audit_logs.push(
        AuditManager.createLog(userId, 'DELETE', 'supplier', id, state.profile.device_id, {
          reason: 'حذف مورد غير مرتبط بأي معاملات تاريخية'
        })
      );
    });
  }

  static getTransactions(supplierId: string): SupplierTransaction[] {
    return db
      .getState()
      .supplier_transactions.filter((tx) => tx.supplier_id === supplierId)
      .sort((a, b) => b.created_at - a.created_at);
  }
}

export class PurchaseRepository {
  static getAll(): Purchase[] {
    return db
      .getState()
      .purchases.slice()
      .sort((a, b) => b.created_at - a.created_at);
  }

  static getById(id: string): Purchase | undefined {
    return db.getState().purchases.find((p) => p.id === id);
  }

  static getByInvoiceNumber(invoiceNumber: string): Purchase | undefined {
    return db.getState().purchases.find((p) => p.invoice_number === invoiceNumber);
  }

  static getItems(purchaseId: string): PurchaseItem[] {
    return db.getState().purchase_items.filter((item) => item.purchase_id === purchaseId);
  }

  static search(query: string, status?: string): Purchase[] {
    const q = DomainValidator.normalizeArabic((query || '').toLowerCase().trim());
    const state = db.getState();
    return state.purchases
      .filter((p) => {
        if (status && p.status !== status) return false;
        if (!q) return true;
        const inv = (p.invoice_number || '').toLowerCase();
        const internal = (p.internal_number || '').toLowerCase();
        const supp = state.suppliers.find((s) => s.id === p.supplier_id);
        const suppName = supp ? DomainValidator.normalizeArabic((supp.name_ar || supp.name || '').toLowerCase()) : '';
        return inv.includes(q) || internal.includes(q) || suppName.includes(q);
      })
      .sort((a, b) => b.created_at - a.created_at);
  }
}

export class SaleReturnRepository {
  static getAll(): SaleReturn[] {
    return (db.getState().sale_returns || [])
      .slice()
      .sort((a, b) => b.created_at - a.created_at);
  }

  static getById(id: string): SaleReturn | undefined {
    return (db.getState().sale_returns || []).find((r) => r.id === id);
  }

  static getByReturnNumber(returnNumber: string): SaleReturn | undefined {
    return (db.getState().sale_returns || []).find((r) => r.return_number === returnNumber);
  }

  static getByOriginalSaleId(saleId: string): SaleReturn[] {
    return (db.getState().sale_returns || []).filter((r) => r.original_sale_id === saleId);
  }

  static getItems(returnId: string): SaleReturnItem[] {
    return (db.getState().sale_return_items || []).filter((item) => item.return_id === returnId);
  }

  static getAllocations(returnId: string): SaleReturnAllocation[] {
    return (db.getState().sale_return_allocations || []).filter((alloc) => alloc.return_id === returnId);
  }
}

export class PurchaseReturnRepository {
  static getAll(): PurchaseReturn[] {
    return (db.getState().purchase_returns || [])
      .slice()
      .sort((a, b) => b.created_at - a.created_at);
  }

  static getById(id: string): PurchaseReturn | undefined {
    return (db.getState().purchase_returns || []).find((r) => r.id === id);
  }

  static getByReturnNumber(returnNumber: string): PurchaseReturn | undefined {
    return (db.getState().purchase_returns || []).find((r) => r.return_number === returnNumber);
  }

  static getByOriginalPurchaseId(purchaseId: string): PurchaseReturn[] {
    return (db.getState().purchase_returns || []).filter((r) => r.original_purchase_id === purchaseId);
  }

  static getItems(returnId: string): PurchaseReturnItem[] {
    return (db.getState().purchase_return_items || []).filter((item) => item.return_id === returnId);
  }

  static getAllocations(returnId: string): PurchaseReturnAllocation[] {
    return (db.getState().purchase_return_allocations || []).filter((alloc) => alloc.return_id === returnId);
  }
}


