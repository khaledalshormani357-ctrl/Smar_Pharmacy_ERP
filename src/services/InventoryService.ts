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

    return state.products
      .filter((p) => (includeInactive ? !p.deleted_at : p.is_active && !p.deleted_at))
      .map((product) => {
        const productBatches = state.batches.filter((b) => b.product_id === product.id && b.status === 'active');
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

        const conversions = state.unit_conversions.filter((uc) => uc.product_id === product.id);

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
    units: { unitName: string; factor: number; price: number }[],
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
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now()
      };

      ProductRepository.insert(newProduct, userId);
    } else {
      ProductRepository.update(productId, data, userId);
    }

    // Save unit conversions
    UnitConversionRepository.saveForProduct(
      productId,
      data.base_unit || 'حبة',
      units.map((u) => ({
        unit_name: u.unitName,
        conversion_factor: u.factor,
        selling_price: u.price
      })),
      userId
    );

    return productId;
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
