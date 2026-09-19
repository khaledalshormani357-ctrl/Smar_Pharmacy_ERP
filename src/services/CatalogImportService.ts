// Service for Importing and Managing the Authoritative Yemen Pharmacy Drug Catalog
// Strict zero-invention compliance: preserves master catalog records without artificial prices or stock

import { db } from '../db/sqlite';
import { Product, Category, Manufacturer } from '../types';

export interface CatalogMetadata {
  version: number;
  generated_at: string;
  source_file: string;
  source_pages: number;
  total_products: number;
  total_categories: number;
  total_manufacturers: number;
}

export interface CatalogSeedData {
  version: number;
  generated_at: string;
  source_file: string;
  source_pages: number;
  categories: Category[];
  manufacturers: Manufacturer[];
  products: Product[];
}

export class CatalogImportService {
  private static cachedSeed: CatalogSeedData | null = null;

  public static async loadSeedData(): Promise<CatalogSeedData> {
    if (this.cachedSeed) {
      return this.cachedSeed;
    }

    try {
      const res = await fetch('/data/drug_catalog_seed.json');
      if (!res.ok) {
        throw new Error(`Failed to fetch catalog seed: ${res.statusText}`);
      }
      const data: CatalogSeedData = await res.json();
      this.cachedSeed = data;
      return data;
    } catch (err) {
      console.error('Error loading drug catalog seed data:', err);
      throw err;
    }
  }

  public static async getCatalogStats(): Promise<{
    metadata: CatalogMetadata | null;
    alreadyImportedProducts: number;
    newProductsCount: number;
    totalProductsInCatalog: number;
    totalCategoriesInCatalog: number;
    totalManufacturersInCatalog: number;
  }> {
    const state = db.getState();
    const existingProductIds = new Set(state.products.map((p) => p.id));
    const existingCodes = new Set(state.products.map((p) => p.internal_code));

    try {
      const seed = await this.loadSeedData();
      let alreadyImported = 0;
      let newCount = 0;

      for (const prod of seed.products) {
        if (existingProductIds.has(prod.id) || existingCodes.has(prod.internal_code)) {
          alreadyImported++;
        } else {
          newCount++;
        }
      }

      return {
        metadata: {
          version: seed.version,
          generated_at: seed.generated_at,
          source_file: seed.source_file,
          source_pages: seed.source_pages,
          total_products: seed.products.length,
          total_categories: seed.categories.length,
          total_manufacturers: seed.manufacturers.length
        },
        alreadyImportedProducts: alreadyImported,
        newProductsCount: newCount,
        totalProductsInCatalog: seed.products.length,
        totalCategoriesInCatalog: seed.categories.length,
        totalManufacturersInCatalog: seed.manufacturers.length
      };
    } catch (e) {
      return {
        metadata: null,
        alreadyImportedProducts: state.products.length,
        newProductsCount: 0,
        totalProductsInCatalog: 0,
        totalCategoriesInCatalog: 0,
        totalManufacturersInCatalog: 0
      };
    }
  }

  // Idempotent Master Catalog Import
  public static async importCatalog(options?: {
    batchSize?: number;
    onProgress?: (progress: { imported: number; total: number; percent: number }) => void;
  }): Promise<{
    importedProducts: number;
    importedCategories: number;
    importedManufacturers: number;
    skippedDuplicates: number;
  }> {
    const seed = await this.loadSeedData();
    const state = db.getState();

    let importedProducts = 0;
    let importedCategories = 0;
    let importedManufacturers = 0;
    let skippedDuplicates = 0;

    // 1. Import Categories idempotently
    const existingCategoryNames = new Set(
      state.categories.map((c) => (c.name_en || c.name_ar || '').toLowerCase().trim())
    );
    const existingCategoryIds = new Set(state.categories.map((c) => c.id));

    for (const cat of seed.categories) {
      const nameKey = (cat.name_en || cat.name_ar || '').toLowerCase().trim();
      if (!existingCategoryIds.has(cat.id) && !existingCategoryNames.has(nameKey)) {
        state.categories.push({
          id: cat.id,
          name_ar: cat.name_ar,
          name_en: cat.name_en,
          is_active: true
        });
        existingCategoryIds.add(cat.id);
        existingCategoryNames.add(nameKey);
        importedCategories++;
      }
    }

    // 2. Import Manufacturers idempotently
    const existingMfgNames = new Set(state.manufacturers.map((m) => m.name_ar.toLowerCase().trim()));
    const existingMfgIds = new Set(state.manufacturers.map((m) => m.id));

    for (const mfg of seed.manufacturers) {
      const nameKey = mfg.name_ar.toLowerCase().trim();
      if (!existingMfgIds.has(mfg.id) && !existingMfgNames.has(nameKey)) {
        state.manufacturers.push({
          id: mfg.id,
          name_ar: mfg.name_ar,
          country: mfg.country
        });
        existingMfgIds.add(mfg.id);
        existingMfgNames.add(nameKey);
        importedManufacturers++;
      }
    }

    // 3. Import Products idempotently
    const existingProductIds = new Set(state.products.map((p) => p.id));
    const existingSignatures = new Set(
      state.products.map((p) => {
        const name = (p.name_en || p.name_ar || '').toLowerCase().trim();
        return `${name}|${p.dosage_form}|${p.pack_size}`;
      })
    );

    const totalToProcess = seed.products.length;

    for (let i = 0; i < totalToProcess; i++) {
      const prod = seed.products[i];
      const name = (prod.name_en || prod.name_ar || '').toLowerCase().trim();
      const sig = `${name}|${prod.dosage_form}|${prod.pack_size}`;

      if (existingProductIds.has(prod.id) || existingSignatures.has(sig)) {
        skippedDuplicates++;
      } else {
        state.products.push({
          ...prod,
          current_purchase_price: 0,
          current_selling_price: 0,
          min_stock_level: 0,
          reorder_level: 0,
          is_active: true
        });
        existingProductIds.add(prod.id);
        existingSignatures.add(sig);
        importedProducts++;
      }

      if (options?.onProgress && (i % 200 === 0 || i === totalToProcess - 1)) {
        options.onProgress({
          imported: importedProducts,
          total: totalToProcess,
          percent: Math.round(((i + 1) / totalToProcess) * 100)
        });
      }
    }

    // Audit log entry
    if (state.audit_logs) {
      state.audit_logs.push({
        id: 'audit-' + Date.now(),
        user_id: 'admin',
        action: 'import',
        entity: 'product',
        entity_id: 'drug_catalog_yemen',
        device_id: 'local_terminal',
        reason: `استيراد الدليل الوطني للأدوية: تم استيراد ${importedProducts} صنف، ${importedCategories} تصنيف، ${importedManufacturers} شركة مصنعة بنجاح بدون ابتداع أسعار أو مخزون.`,
        created_at: Date.now()
      });
    }

    // Persist to local SQLite storage
    db.saveState();

    return {
      importedProducts,
      importedCategories,
      importedManufacturers,
      skippedDuplicates
    };
  }
}
