// Drug Catalog Import Service for Smart Pharmacy ERP
// Solves DEFECT-05 / Phase 8.5: Eliminates UI freezing / ANR via async chunked batching, mutex lock & responsive yield cycles

import { db } from '../db/sqlite';
import { Product, Category, Manufacturer } from '../types';
import { reconstructArabicText } from '../utils/arabicCatalogRepair';

export interface CatalogMetadata {
  version: string;
  generated_at: string;
  source_file: string;
  source_pages: number;
  total_products: number;
  total_categories: number;
  total_manufacturers: number;
}

export interface DrugCatalogSeed {
  version: string;
  generated_at: string;
  source_file: string;
  source_pages: number;
  total_items: number;
  categories: Array<{ id: string; name_ar: string; name_en: string }>;
  manufacturers: Array<{ id: string; name_ar: string; country: string }>;
  products: Product[];
}

export interface CatalogImportProgress {
  imported: number;
  total: number;
  percent: number;
  remaining: number;
  skippedDuplicates: number;
  errorsCount: number;
  currentBatch: number;
  totalBatches: number;
  stage: 'loading' | 'categories' | 'manufacturers' | 'products' | 'finalizing' | 'completed' | 'cancelled';
}

export interface CatalogImportOptions {
  batchSize?: number;
  onProgress?: (progress: CatalogImportProgress) => void;
  signal?: AbortSignal;
  limit?: number; // for testing custom counts e.g. 10, 100, 1000
  itemsOverride?: any[]; // for testing custom payloads
}

export class CatalogImportService {
  private static cachedSeed: DrugCatalogSeed | null = null;
  private static isImporting = false;
  private static activeAbortController: AbortController | null = null;

  public static isRunning(): boolean {
    return this.isImporting;
  }

  public static cancelImport(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
  }

  public static clearCache(): void {
    this.cachedSeed = null;
  }

  public static async loadSeedData(): Promise<DrugCatalogSeed> {
    if (this.cachedSeed) {
      return this.cachedSeed;
    }

    let rawData: any = null;

    if (typeof window === 'undefined') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const seedPath = path.resolve(process.cwd(), 'public/data/drug_catalog_seed.json');
        const cleanPath = path.resolve(process.cwd(), 'public/data/drug_catalog_clean.json');
        const targetPath = fs.existsSync(seedPath) ? seedPath : cleanPath;
        if (fs.existsSync(targetPath)) {
          const content = fs.readFileSync(targetPath, 'utf-8');
          rawData = JSON.parse(content);
        }
      } catch (err) {
        // Fall back to fetch if fs fails
      }
    }

    if (!rawData) {
      let response = await fetch('/data/drug_catalog_seed.json');
      if (!response.ok) {
        response = await fetch('/data/drug_catalog_clean.json');
      }
      if (!response.ok) {
        throw new Error(`تعذر تحميل ملف الدليل الوطني (${response.status})`);
      }
      rawData = await response.json();
    }

    if (Array.isArray(rawData)) {
      this.cachedSeed = {
        version: '1.0.0',
        generated_at: new Date().toISOString(),
        source_file: 'drug_catalog_clean.json',
        source_pages: 588,
        total_items: rawData.length,
        categories: [],
        manufacturers: [],
        products: rawData
      };
    } else {
      this.cachedSeed = rawData as DrugCatalogSeed;
    }

    return this.cachedSeed;
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

  /**
   * Lightweight paginated & searchable preview without loading entire catalog into React state
   */
  public static async getCatalogPreview(options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
  }): Promise<{
    items: Product[];
    total: number;
    categories: string[];
  }> {
    const seed = await this.loadSeedData();
    let filtered = seed.products;

    const uniqueCategories = Array.from(
      new Set(
        seed.products
          .map((p) => (p as any).therapeutic_category)
          .filter(Boolean)
      )
    ).sort();

    const q = options?.search?.toLowerCase().trim();
    if (q || options?.category) {
      filtered = filtered.filter((p) => {
        const matchesQ =
          !q ||
          (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
          (p.name_en && p.name_en.toLowerCase().includes(q)) ||
          (p.generic_name && p.generic_name.toLowerCase().includes(q)) ||
          (p.active_ingredient && p.active_ingredient.toLowerCase().includes(q)) ||
          ((p as any).manufacturer_name && (p as any).manufacturer_name.toLowerCase().includes(q));

        const matchesCat = !options?.category || (p as any).therapeutic_category === options.category;
        return matchesQ && matchesCat;
      });
    }

    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(10, Math.min(100, options?.pageSize || 50));
    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      categories: uniqueCategories
    };
  }

  /**
   * Safe, non-blocking async chunked import of drug catalog.
   * Features:
   * - Concurrency mutex lock (prevents duplicate simultaneous imports)
   * - Cancellation support via AbortSignal or cancelImport()
   * - Responsive yield cycles (requestAnimationFrame + setTimeout) to prevent UI freeze
   * - Atomic rollback snapshot on cancellation or fatal error
   * - Idempotency against IDs and composite trade/dosage/pack signatures
   */
  public static async importCatalog(options?: CatalogImportOptions): Promise<{
    importedProducts: number;
    importedCategories: number;
    importedManufacturers: number;
    skippedDuplicates: number;
    errorsCount: number;
  }> {
    if (this.isImporting) {
      throw new Error('عملية استيراد قاعدة بيانات الأدوية قيد التنفيذ بالفعل');
    }

    this.isImporting = true;
    this.activeAbortController = new AbortController();

    const checkAborted = () => {
      if (options?.signal?.aborted || this.activeAbortController?.signal.aborted) {
        const err = new Error('تم إلغاء عملية الاستيراد بواسطة المستخدم');
        err.name = 'AbortError';
        throw err;
      }
    };

    // Take snapshot for clean transactional rollback if aborted or failed
    const state = db.getState();
    const stateSnapshot = {
      categories: [...state.categories],
      manufacturers: [...state.manufacturers],
      products: [...state.products]
    };

    const batchSize = Math.max(10, Math.min(200, options?.batchSize || 60));

    // Responsive yield helper: guarantees rendering thread gets frame time
    const yieldToEventLoop = () =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => setTimeout(resolve, 0));
        } else {
          setTimeout(resolve, 4);
        }
      });

    try {
      if (options?.onProgress) {
        options.onProgress({
          imported: 0,
          total: 0,
          percent: 0,
          remaining: 0,
          skippedDuplicates: 0,
          errorsCount: 0,
          currentBatch: 0,
          totalBatches: 0,
          stage: 'loading'
        });
      }

      checkAborted();
      const seed = await this.loadSeedData();
      checkAborted();

      let productsSource = options?.itemsOverride || seed.products;
      if (options?.limit && options.limit > 0) {
        productsSource = productsSource.slice(0, options.limit);
      }

      let importedProducts = 0;
      let importedCategories = 0;
      let importedManufacturers = 0;
      let skippedDuplicates = 0;
      let errorsCount = 0;

      const totalToProcess = productsSource.length;
      const totalBatches = Math.max(1, Math.ceil(totalToProcess / batchSize));

      // 1. Import Categories idempotently
      if (options?.onProgress) {
        options.onProgress({
          imported: 0,
          total: totalToProcess,
          percent: 1,
          remaining: totalToProcess,
          skippedDuplicates: 0,
          errorsCount: 0,
          currentBatch: 0,
          totalBatches,
          stage: 'categories'
        });
      }

      const existingCategoryNames = new Set(
        state.categories.map((c) => (c.name_en || c.name_ar || '').toLowerCase().trim())
      );
      const existingCategoryIds = new Set(state.categories.map((c) => c.id));

      for (const cat of seed.categories) {
        const nameKey = (cat.name_en || cat.name_ar || '').toLowerCase().trim();
        if (!existingCategoryIds.has(cat.id) && !existingCategoryNames.has(nameKey)) {
          const cleanNameAr = reconstructArabicText(cat.name_ar) || cat.name_ar;
          state.categories.push({
            id: cat.id,
            name_ar: cleanNameAr,
            name_en: cat.name_en,
            is_active: true
          });
          existingCategoryIds.add(cat.id);
          existingCategoryNames.add(nameKey);
          importedCategories++;
        }
      }

      await yieldToEventLoop();
      checkAborted();

      // 2. Import Manufacturers idempotently
      if (options?.onProgress) {
        options.onProgress({
          imported: 0,
          total: totalToProcess,
          percent: 3,
          remaining: totalToProcess,
          skippedDuplicates: 0,
          errorsCount: 0,
          currentBatch: 0,
          totalBatches,
          stage: 'manufacturers'
        });
      }

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

      await yieldToEventLoop();
      checkAborted();

      // 3. Import Products in Non-blocking Async Chunks
      const existingProductIds = new Set(state.products.map((p) => p.id));
      const existingSignatures = new Set(
        state.products.map((p) => {
          const name = (p.name_en || p.name_ar || '').toLowerCase().trim();
          return `${name}|${p.dosage_form}|${p.pack_size}`;
        })
      );

      for (let b = 0; b < totalBatches; b++) {
        checkAborted();

        const startIdx = b * batchSize;
        const endIdx = Math.min(startIdx + batchSize, totalToProcess);
        const batchSlice = productsSource.slice(startIdx, endIdx);

        for (const prod of batchSlice) {
          try {
            const name = (prod.name_en || prod.name_ar || '').toLowerCase().trim();
            const sig = `${name}|${prod.dosage_form}|${prod.pack_size}`;

            if (existingProductIds.has(prod.id) || existingSignatures.has(sig)) {
              skippedDuplicates++;
            } else {
              const fixedDisease = prod.disease_indication ? reconstructArabicText(prod.disease_indication) || prod.disease_indication : undefined;
              const fixedNameAr = fixedDisease
                ? `${prod.name_en || prod.name_ar} (${fixedDisease})`
                : (prod.name_ar || prod.name_en);

              state.products.push({
                ...prod,
                name_ar: fixedNameAr,
                disease_indication: fixedDisease,
                current_purchase_price: prod.current_purchase_price || 0,
                current_selling_price: prod.current_selling_price || 0,
                min_stock_level: prod.min_stock_level || 0,
                reorder_level: prod.reorder_level || 0,
                is_active: prod.is_active !== undefined ? prod.is_active : true
              });
              existingProductIds.add(prod.id);
              existingSignatures.add(sig);
              importedProducts++;

              // Authoritative Unit Conversions
              if (!Array.isArray(state.unit_conversions)) {
                state.unit_conversions = [];
              }
              const baseUnitName = prod.base_unit || 'حبة';
              state.unit_conversions.push({
                id: 'uc-' + Math.random().toString(36).substring(2, 9),
                product_id: prod.id,
                unit_name: baseUnitName,
                conversion_factor: 1,
                selling_price: prod.current_selling_price || 0,
                is_default_sale: true
              });

              if (prod.selling_unit && prod.selling_unit !== baseUnitName) {
                const factor = prod.pack_size && prod.pack_size > 1 ? prod.pack_size : 10;
                state.unit_conversions.push({
                  id: 'uc-' + Math.random().toString(36).substring(2, 9),
                  product_id: prod.id,
                  unit_name: prod.selling_unit,
                  conversion_factor: factor,
                  selling_price: prod.current_selling_price ? prod.current_selling_price * factor : 0,
                  is_default_sale: false
                });
              }
            }
          } catch (itemErr) {
            console.warn('Error processing product during catalog import:', itemErr);
            errorsCount++;
          }
        }

        const processedSoFar = endIdx;
        const percent = Math.min(99, Math.round((processedSoFar / totalToProcess) * 100));

        if (options?.onProgress) {
          options.onProgress({
            imported: importedProducts,
            total: totalToProcess,
            percent,
            remaining: totalToProcess - processedSoFar,
            skippedDuplicates,
            errorsCount,
            currentBatch: b + 1,
            totalBatches,
            stage: 'products'
          });
        }

        // Give the UI thread frame time to paint progress and process user events
        await yieldToEventLoop();
      }

      checkAborted();

      // 4. Finalize & Save
      if (options?.onProgress) {
        options.onProgress({
          imported: importedProducts,
          total: totalToProcess,
          percent: 99,
          remaining: 0,
          skippedDuplicates,
          errorsCount,
          currentBatch: totalBatches,
          totalBatches,
          stage: 'finalizing'
        });
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
          reason: `استيراد الدليل الوطني للأدوية المعتمد: تم استيراد ${importedProducts} صنف، ${importedCategories} تصنيف، ${importedManufacturers} شركة مصنعة (تخطي ${skippedDuplicates} مكرر).`,
          created_at: Date.now()
        });
      }

      // Save and notify listeners cleanly
      db.notify();

      if (options?.onProgress) {
        options.onProgress({
          imported: importedProducts,
          total: totalToProcess,
          percent: 100,
          remaining: 0,
          skippedDuplicates,
          errorsCount,
          currentBatch: totalBatches,
          totalBatches,
          stage: 'completed'
        });
      }

      return {
        importedProducts,
        importedCategories,
        importedManufacturers,
        skippedDuplicates,
        errorsCount
      };
    } catch (err: any) {
      // Transactional rollback on abort or error
      state.categories = stateSnapshot.categories;
      state.manufacturers = stateSnapshot.manufacturers;
      state.products = stateSnapshot.products;

      if (options?.onProgress && (err?.name === 'AbortError' || err?.message?.includes('إلغاء'))) {
        options.onProgress({
          imported: 0,
          total: 0,
          percent: 0,
          remaining: 0,
          skippedDuplicates: 0,
          errorsCount: 0,
          currentBatch: 0,
          totalBatches: 0,
          stage: 'cancelled'
        });
      }

      throw err;
    } finally {
      this.isImporting = false;
      this.activeAbortController = null;
    }
  }
}
