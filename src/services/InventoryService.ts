// Unified Inventory and Products Service for Smart Pharmacy ERP
// Bridges Product views, queries, and delegations to StockService

import { db } from '../db/sqlite';
import { Product, Batch, StockMovement, UnitConversion } from '../types';
import { StockService } from './StockService';
import { ProductRepository, UnitConversionRepository } from '../db/repositories';
import { DomainValidator } from '../db/validation';

export class InventoryService {
  // Get active products with aggregated inventory stock, expiry alerts, and low stock status
  static getProductsWithStock(includeInactive = false) {
    const state = db.getState();
    const todayStr = new Date().toISOString().slice(0, 10);
    const thresholdDays = state.profile?.near_expiry_days || 90;
    const thresholdDateStr = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Pre-index batches by product_id for O(1) lookups instead of O(N*M) full scan
    const batchesByProduct = new Map<string, Batch[]>();
    for (const b of state.batches) {
      if (b.status === 'active') {
        const list = batchesByProduct.get(b.product_id);
        if (list) {
          list.push(b);
        } else {
          batchesByProduct.set(b.product_id, [b]);
        }
      }
    }

    // Pre-index unit conversions by product_id
    const conversionsByProduct = new Map<string, UnitConversion[]>();
    for (const uc of state.unit_conversions) {
      const list = conversionsByProduct.get(uc.product_id);
      if (list) {
        list.push(uc);
      } else {
        conversionsByProduct.set(uc.product_id, [uc]);
      }
    }

    return state.products
      .filter((p) => (includeInactive ? !p.deleted_at : p.is_active && !p.deleted_at))
      .map((product) => {
        const productBatches = batchesByProduct.get(product.id) || [];
        const totalBaseStock = productBatches.reduce((acc, b) => acc + b.current_quantity, 0);

        // Find closest expiry batch among positive stock
        const validBatches = productBatches
          .filter((b) => b.current_quantity > 0)
          .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

        const nearestExpiry = validBatches[0]?.expiry_date || null;
        const isExpired = nearestExpiry ? nearestExpiry < todayStr : false;
        const isNearExpiry = nearestExpiry ? nearestExpiry >= todayStr && nearestExpiry <= thresholdDateStr : false;

        // Distinguish low stock vs reorder level
        const isLowStock = totalBaseStock <= product.min_stock_level;
        const isNeedsReorder = totalBaseStock <= product.reorder_level;

        const conversions = conversionsByProduct.get(product.id) || [];

        return {
          ...product,
          totalBaseStock,
          nearestExpiry,
          isExpired,
          isNearExpiry,
          isLowStock,
          isNeedsReorder,
          conversions,
          batches: validBatches
        };
      });
  }

  // Pure FEFO Batch Allocator delegation to centralized StockService
  static allocateFEFO(productId: string, requiredBaseQty: number, preferredBatchId?: string) {
    return StockService.allocateFEFO(productId, requiredBaseQty, preferredBatchId);
  }

  // Create or Update Product with units
  static saveProduct(
    data: Partial<Product>,
    units: Array<{
      id?: string;
      unitName?: string;
      unit_name?: string;
      factor?: number;
      conversion_factor?: number;
      price?: number;
      selling_price?: number;
      purchase_price?: number;
      is_default_sale?: boolean;
      is_active?: boolean;
    }>,
    userId = 'user-01'
  ): string {
    const isNew = !data.id;
    const productId = data.id || 'prod-' + Math.random().toString(36).substring(2, 9);

    if (isNew) {
      DomainValidator.validateProduct({
        name_ar: data.name_ar,
        base_unit: data.base_unit,
        current_purchase_price: data.current_purchase_price,
        current_selling_price: data.current_selling_price,
        min_stock_level: data.min_stock_level,
        barcode: data.barcode
      });

      const newProduct: Product = {
        id: productId,
        barcode: data.barcode?.trim() || undefined,
        internal_code: data.internal_code?.trim() || 'MED-' + Math.floor(1000 + Math.random() * 9000),
        name_ar: data.name_ar!.trim(),
        name_en: data.name_en?.trim(),
        generic_name: data.generic_name?.trim(),
        active_ingredient: data.active_ingredient?.trim(),
        strength: data.strength?.trim(),
        country: data.country?.trim() || data.country_of_origin?.trim(),
        description: data.description?.trim(),
        category_id: data.category_id,
        manufacturer_id: data.manufacturer_id,
        dosage_form: data.dosage_form || 'tablet',
        base_unit: data.base_unit!.trim(),
        pack_size: data.pack_size || 1,
        current_purchase_price: data.current_purchase_price || 0,
        current_selling_price: data.current_selling_price || 0,
        min_stock_level: data.min_stock_level || 5,
        reorder_level: data.reorder_level || 15,
        prescription_required: !!data.prescription_required,
        is_controlled: !!data.is_controlled,
        is_active: data.is_active !== undefined ? data.is_active : true,
        created_at: Date.now(),
        updated_at: Date.now()
      };

      ProductRepository.insert(newProduct, userId);
    } else {
      ProductRepository.update(productId, data, userId);
    }

    // Save unit conversions with lifecycle safety
    const normalizedConversions = units.map((u) => ({
      id: u.id,
      unit_name: (u.unit_name || u.unitName || '').trim(),
      conversion_factor: u.conversion_factor || u.factor || 1,
      selling_price: u.selling_price !== undefined ? u.selling_price : (u.price || 0),
      purchase_price: u.purchase_price,
      is_default_sale: !!u.is_default_sale,
      is_active: u.is_active !== undefined ? u.is_active : true
    }));

    UnitConversionRepository.saveForProduct(
      productId,
      data.base_unit || 'حبة',
      normalizedConversions,
      userId,
      data.current_selling_price || 0
    );

    return productId;
  }

  // Safe Delete or Archive Product
  static deleteOrArchiveProduct(productId: string, userId = 'user-01') {
    return ProductRepository.deleteOrArchive(productId, userId);
  }

  // Check product transaction history
  static hasTransactionsOrStock(productId: string) {
    return ProductRepository.hasTransactionsOrStock(productId);
  }

  // Check unit usage
  static isUnitInUse(productId: string, unitName: string) {
    return UnitConversionRepository.isUnitInUse(productId, unitName);
  }

  // Get product unit conversions
  static getProductConversions(productId: string, includeInactive = false) {
    return UnitConversionRepository.getByProduct(productId, includeInactive);
  }

  // Stock Adjustment delegation
  static adjustStock(
    productId: string,
    batchId: string,
    newQuantityBase: number,
    reason: string,
    userId = 'user-01'
  ) {
    StockService.adjustStock({
      productId,
      batchId,
      newQuantityBase,
      reason,
      userId
    });
  }
}
