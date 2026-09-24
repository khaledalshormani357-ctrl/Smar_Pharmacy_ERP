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
import { normalizeArabicSearchText } from '../utils/inputSafety';

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

  // Check if a product has any historical transactions, batches, or active stock
  static hasTransactionsOrStock(productId: string): {
    hasHistory: boolean;
    reason?: string;
    stockQty: number;
    batchesCount: number;
    salesCount: number;
    purchasesCount: number;
    movementsCount: number;
  } {
    const state = db.getState();
    const productBatches = state.batches.filter((b) => b.product_id === productId);
    const stockQty = productBatches.reduce((acc, b) => acc + (b.current_quantity || 0), 0);
    const batchesCount = productBatches.length;

    const salesCount = (state.sale_items || []).filter((si) => si.product_id === productId).length;
    const purchasesCount = (state.purchase_items || []).filter((pi) => pi.product_id === productId).length;
    const movementsCount = (state.stock_movements || []).filter((sm) => sm.product_id === productId).length;

    if (stockQty > 0) {
      return {
        hasHistory: true,
        reason: `يوجد رصيد مخزني حالي (${stockQty}) في الدفعات المسجلة.`,
        stockQty,
        batchesCount,
        salesCount,
        purchasesCount,
        movementsCount
      };
    }

    if (salesCount > 0) {
      return {
        hasHistory: true,
        reason: `يوجد ${salesCount} فواتير مبيعات مسجلة سابقة تحتوي هذا الصنف.`,
        stockQty,
        batchesCount,
        salesCount,
        purchasesCount,
        movementsCount
      };
    }

    if (purchasesCount > 0) {
      return {
        hasHistory: true,
        reason: `يوجد ${purchasesCount} فواتير توريد ومشتريات مسجلة للصنف.`,
        stockQty,
        batchesCount,
        salesCount,
        purchasesCount,
        movementsCount
      };
    }

    if (movementsCount > 0) {
      return {
        hasHistory: true,
        reason: `توجد ${movementsCount} حركات مخزنية مسجلة لهذا الصنف.`,
        stockQty,
        batchesCount,
        salesCount,
        purchasesCount,
        movementsCount
      };
    }

    if (batchesCount > 0) {
      return {
        hasHistory: true,
        reason: `توجد ${batchesCount} تشغيلات سابقة مسجلة للصنف في النظام.`,
        stockQty,
        batchesCount,
        salesCount,
        purchasesCount,
        movementsCount
      };
    }

    return {
      hasHistory: false,
      stockQty,
      batchesCount,
      salesCount,
      purchasesCount,
      movementsCount
    };
  }

  static search(
    term: string,
    categoryId?: string,
    manufacturerId?: string,
    options?: { includeInactive?: boolean; limit?: number }
  ): Product[] {
    const norm = term ? normalizeArabicSearchText(term) : '';
    const state = db.getState();
    const manufacturersMap = new Map(state.manufacturers.map((m) => [m.id, normalizeArabicSearchText(m.name_ar)]));
    const limit = options?.limit || 100;
    const includeInactive = !!options?.includeInactive;

    const results: Product[] = [];

    for (const p of state.products) {
      if (p.deleted_at) continue;
      if (!includeInactive && !p.is_active) continue;
      if (categoryId && p.category_id !== categoryId) continue;
      if (manufacturerId && p.manufacturer_id !== manufacturerId) continue;

      if (!norm) {
        results.push(p);
        if (results.length >= limit) break;
        continue;
      }

      const nAr = normalizeArabicSearchText(p.name_ar);
      const nEn = (p.name_en || '').toLowerCase();
      const nGen = normalizeArabicSearchText(p.generic_name || '');
      const nAct = normalizeArabicSearchText(p.active_ingredient || '');
      const nCode = (p.internal_code || '').toLowerCase();
      const nBar = (p.barcode || '').toLowerCase();
      const nMan = p.manufacturer_id ? (manufacturersMap.get(p.manufacturer_id) || '') : '';

      if (
        nAr.includes(norm) ||
        nEn.includes(norm) ||
        nGen.includes(norm) ||
        nAct.includes(norm) ||
        nCode.includes(norm) ||
        nBar.includes(norm) ||
        nMan.includes(norm)
      ) {
        results.push(p);
        if (results.length >= limit) break;
      }
    }

    return results;
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
          reason: `إضافة صنف دوائي جديد: ${product.name_ar}`,
          payloadAfter: product
        })
      );
    });
  }

  static update(id: string, updates: Partial<Product>, userId = 'user-01'): void {
    DomainValidator.validateProduct(updates, true);

    const state = db.getState();
    const existing = state.products.find((p) => p.id === id);
    if (!existing) throw new Error('الصنف غير موجود.');

    // Requirement 01, item 5: Prevent changing base_unit if historical transactions or stock exist
    if (updates.base_unit && updates.base_unit.trim() !== existing.base_unit.trim()) {
      const historyCheck = this.hasTransactionsOrStock(id);
      if (historyCheck.hasHistory) {
        throw new Error(
          `لا يمكن تغيير الوحدة الأساسية (${existing.base_unit}) لوجود معاملات مسجلة للصنف: ${historyCheck.reason}. تغيير الوحدة الأساسية محظور للحفاظ على الأرصدة المحاسبية والتاريخية.`
        );
      }
    }

    // Barcode uniqueness check
    if (updates.barcode && updates.barcode.trim()) {
      const cleanBarcode = updates.barcode.trim();
      const duplicate = state.products.find((p) => p.barcode === cleanBarcode && p.id !== id && !p.deleted_at);
      if (duplicate) {
        throw new Error(`الباركود (${cleanBarcode}) مسجل مسبقاً لصنف آخر (${duplicate.name_ar}).`);
      }
    }

    db.transaction(() => {
      const idx = state.products.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('الصنف غير موجود.');

      const before = { ...state.products[idx] };
      state.products[idx] = {
        ...state.products[idx],
        ...updates,
        updated_at: Date.now()
      };

      // Explicit Audit Logs for specific sensitive fields
      if (updates.barcode !== undefined && updates.barcode !== before.barcode) {
        state.audit_logs.push(
          AuditManager.createLog(userId, 'BARCODE_CHANGED', 'product', id, state.profile.device_id, {
            reason: `تغيير باركود الصنف ${existing.name_ar} من [${before.barcode || 'فارغ'}] إلى [${updates.barcode || 'فارغ'}]`,
            payloadBefore: { barcode: before.barcode },
            payloadAfter: { barcode: updates.barcode }
          })
        );
      }

      if (
        updates.current_selling_price !== undefined &&
        updates.current_selling_price !== before.current_selling_price
      ) {
        state.audit_logs.push(
          AuditManager.createLog(userId, 'PRICE_CHANGED', 'product', id, state.profile.device_id, {
            reason: `تغيير سعر بيع الصنف ${existing.name_ar} من [${before.current_selling_price}] إلى [${updates.current_selling_price}]`,
            payloadBefore: { current_selling_price: before.current_selling_price },
            payloadAfter: { current_selling_price: updates.current_selling_price }
          })
        );
      }

      state.audit_logs.push(
        AuditManager.createLog(userId, 'UPDATE', 'product', id, state.profile.device_id, {
          reason: `تعديل بيانات الصنف ${existing.name_ar}`,
          payloadBefore: before,
          payloadAfter: state.products[idx]
        })
      );
    });
  }

  // Requirement 01, item 9: Safe Delete or Archive
  static deleteOrArchive(productId: string, userId = 'user-01'): { action: 'deleted' | 'archived'; message: string } {
    const historyCheck = this.hasTransactionsOrStock(productId);
    const state = db.getState();
    const product = state.products.find((p) => p.id === productId);
    if (!product) throw new Error('الصنف غير موجود.');

    if (historyCheck.hasHistory) {
      // Archive product (is_active = false) to protect audit and historical records
      db.transaction(() => {
        const before = { ...product };
        product.is_active = false;
        product.updated_at = Date.now();

        state.audit_logs.push(
          AuditManager.createLog(userId, 'PRODUCT_ARCHIVED', 'product', productId, state.profile.device_id, {
            reason: `أرشفة وتعطيل الصنف (${product.name_ar}) لوجود معاملات تاريخية: ${historyCheck.reason}`,
            payloadBefore: before,
            payloadAfter: product
          })
        );
      });
      return {
        action: 'archived',
        message: `تم أرشفة وتعطيل الصنف (${product.name_ar}) بنجاح حفاظاً على صحة الفواتير والمعاملات التاريخية المسجلة.`
      };
    } else {
      // Pristine unreferenced product: safe to hard delete
      db.transaction(() => {
        const before = { ...product };
        state.products = state.products.filter((p) => p.id !== productId);
        state.unit_conversions = state.unit_conversions.filter((uc) => uc.product_id !== productId);

        state.audit_logs.push(
          AuditManager.createLog(userId, 'PRODUCT_DELETED', 'product', productId, state.profile.device_id, {
            reason: `حذف الصنف (${before.name_ar}) نهائياً لعدم وجود أي معاملات أو رصيد مرتبط به`,
            payloadBefore: before
          })
        );
      });
      return {
        action: 'deleted',
        message: `تم حذف الصنف (${product.name_ar}) نهائياً لعدم وجود أي معاملات أو رصيد مرتبط به.`
      };
    }
  }

  static deactivate(id: string, userId = 'user-01'): void {
    this.deleteOrArchive(id, userId);
  }

  static activate(id: string, userId = 'user-01'): void {
    db.transaction(() => {
      const state = db.getState();
      const product = state.products.find((p) => p.id === id);
      if (!product) throw new Error('الصنف غير موجود.');

      const before = { ...product };
      product.is_active = true;
      product.updated_at = Date.now();

      state.audit_logs.push(
        AuditManager.createLog(userId, 'ACTIVATE', 'product', id, state.profile.device_id, {
          reason: 'إلغاء أرشفة وتنشيط الصنف ' + product.name_ar,
          payloadBefore: before,
          payloadAfter: product
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
  static getByProduct(productId: string, includeInactive = false): UnitConversion[] {
    return db
      .getState()
      .unit_conversions.filter((uc) => uc.product_id === productId && (includeInactive ? true : uc.is_active !== false));
  }

  // Requirement 01, item 4: Check if unit is referenced in any historical transactions
  static isUnitInUse(productId: string, unitName: string): {
    inUse: boolean;
    reason?: string;
    salesCount: number;
    purchasesCount: number;
  } {
    const cleanUnit = unitName.trim();
    const state = db.getState();

    const salesCount = (state.sale_items || []).filter(
      (si) => si.product_id === productId && si.unit_name?.trim() === cleanUnit
    ).length;

    const purchasesCount = (state.purchase_items || []).filter(
      (pi) => pi.product_id === productId && pi.unit_name?.trim() === cleanUnit
    ).length;

    const saleReturnsCount = (state.sale_return_items || []).filter(
      (sri) => sri.product_id === productId && sri.unit_name?.trim() === cleanUnit
    ).length;

    const purchaseReturnsCount = (state.purchase_return_items || []).filter(
      (pri) => pri.product_id === productId && pri.unit_name?.trim() === cleanUnit
    ).length;

    const totalUsage = salesCount + purchasesCount + saleReturnsCount + purchaseReturnsCount;

    if (totalUsage > 0) {
      return {
        inUse: true,
        reason: `الوحدة (${cleanUnit}) مستخدمة في (${salesCount} مبيعات، ${purchasesCount} مشتريات، ${saleReturnsCount + purchaseReturnsCount} مرتجعات).`,
        salesCount,
        purchasesCount
      };
    }

    return { inUse: false, salesCount: 0, purchasesCount: 0 };
  }

  static saveForProduct(
    productId: string,
    baseUnit: string,
    conversions: Array<{
      id?: string;
      unit_name: string;
      conversion_factor: number;
      selling_price: number;
      purchase_price?: number;
      is_default_sale?: boolean;
      is_active?: boolean;
    }>,
    userId = 'user-01',
    baseSellingPrice = 0
  ): void {
    // Validate each conversion
    for (const c of conversions) {
      DomainValidator.validateConversion(c);
    }

    db.transaction(() => {
      const state = db.getState();
      const existingConversions = state.unit_conversions.filter((uc) => uc.product_id === productId);
      const incomingNames = new Set(conversions.map((c) => c.unit_name.trim()));
      incomingNames.add(baseUnit.trim());

      // 1. Process removed units: if in use -> archive (is_active = false); if not in use -> remove
      for (const oldUc of existingConversions) {
        if (!incomingNames.has(oldUc.unit_name.trim())) {
          const usage = this.isUnitInUse(productId, oldUc.unit_name);
          if (usage.inUse) {
            // Keep unit in database marked as archived to preserve historical invoice snapshots
            oldUc.is_active = false;
            state.audit_logs.push(
              AuditManager.createLog(userId, 'UNIT_ARCHIVED', 'unit_conversion', oldUc.id, state.profile.device_id, {
                reason: `أرشفة وحدة البيع (${oldUc.unit_name}) لوجود حركات تاريخية: ${usage.reason}`,
                payloadBefore: oldUc,
                payloadAfter: { ...oldUc, is_active: false }
              })
            );
          } else {
            // Safe to completely delete unreferenced unit
            state.unit_conversions = state.unit_conversions.filter((uc) => uc.id !== oldUc.id);
            state.audit_logs.push(
              AuditManager.createLog(userId, 'UNIT_DELETED', 'unit_conversion', oldUc.id, state.profile.device_id, {
                reason: `حذف وحدة البيع غير المستخدمة (${oldUc.unit_name}) نهائياً`
              })
            );
          }
        }
      }

      // 2. Ensure base unit conversion 1:1 is always present and active
      let baseUc = state.unit_conversions.find(
        (uc) => uc.product_id === productId && uc.unit_name.trim() === baseUnit.trim()
      );
      if (!baseUc) {
        baseUc = {
          id: 'uc-base-' + Math.random().toString(36).substring(2, 9),
          product_id: productId,
          unit_name: baseUnit.trim(),
          conversion_factor: 1,
          selling_price: baseSellingPrice,
          is_default_sale: conversions.length === 0,
          is_active: true
        };
        state.unit_conversions.push(baseUc);
      } else {
        baseUc.conversion_factor = 1;
        baseUc.is_active = true;
        if (baseSellingPrice > 0 && baseUc.selling_price === 0) {
          baseUc.selling_price = baseSellingPrice;
        }
      }

      // 3. Process incoming selling units
      for (const c of conversions) {
        if (c.unit_name.trim() === baseUnit.trim()) continue; // Handled base unit above

        const cleanName = c.unit_name.trim();
        const existing = state.unit_conversions.find(
          (uc) => uc.product_id === productId && uc.unit_name.trim() === cleanName
        );

        if (existing) {
          const before = { ...existing };
          const priceChanged = existing.selling_price !== c.selling_price;
          const factorChanged = existing.conversion_factor !== c.conversion_factor;

          existing.conversion_factor = c.conversion_factor;
          existing.selling_price = c.selling_price;
          existing.purchase_price = c.purchase_price;
          existing.is_default_sale = !!c.is_default_sale;
          existing.is_active = c.is_active !== undefined ? c.is_active : true;

          if (priceChanged) {
            state.audit_logs.push(
              AuditManager.createLog(userId, 'UNIT_PRICE_CHANGED', 'unit_conversion', existing.id, state.profile.device_id, {
                reason: `تغيير سعر وحدة (${cleanName}) للصنف ${productId} من [${before.selling_price}] إلى [${c.selling_price}]`,
                payloadBefore: before,
                payloadAfter: existing
              })
            );
          }

          if (factorChanged) {
            state.audit_logs.push(
              AuditManager.createLog(userId, 'UNIT_FACTOR_CHANGED', 'unit_conversion', existing.id, state.profile.device_id, {
                reason: `تعديل معامل تحويل الوحدة (${cleanName}) للصنف ${productId} إلى ${c.conversion_factor}`,
                payloadBefore: before,
                payloadAfter: existing
              })
            );
          }
        } else {
          // New unit added
          const newUc: UnitConversion = {
            id: c.id || 'uc-' + Math.random().toString(36).substring(2, 9),
            product_id: productId,
            unit_name: cleanName,
            conversion_factor: c.conversion_factor,
            selling_price: c.selling_price,
            purchase_price: c.purchase_price,
            is_default_sale: !!c.is_default_sale,
            is_active: true
          };
          state.unit_conversions.push(newUc);

          state.audit_logs.push(
            AuditManager.createLog(userId, 'UNIT_ADDED', 'unit_conversion', newUc.id, state.profile.device_id, {
              reason: `إضافة وحدة بيع جديدة (${cleanName}) بمعامل تحويل (${c.conversion_factor}) وسعر (${c.selling_price})`,
              payloadAfter: newUc
            })
          );
        }
      }
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


