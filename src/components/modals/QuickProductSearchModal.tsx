import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Pill,
  Package,
  AlertTriangle,
  CheckCircle,
  Barcode,
  DollarSign,
  Edit,
  Plus,
  Layers,
  ChevronDown
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { Product, Batch, UnitConversion } from '../../types';
import { normalizeArabicSearchText } from '../../utils/inputSafety';
import { ProductEditorModal } from './ProductEditorModal';

interface QuickProductSearchModalProps {
  onClose: () => void;
  onSelectProduct?: (product: Product) => void;
}

export const QuickProductSearchModal: React.FC<QuickProductSearchModalProps> = ({
  onClose,
  onSelectProduct
}) => {
  const [dbVersion, setDbVersion] = useState(0);

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setDbVersion((v) => v + 1);
    });
    return unsub;
  }, []);

  const state = db.getState();
  const products = state.products || [];
  const batches = state.batches || [];
  const categories = state.categories || [];
  const manufacturers = state.manufacturers || [];
  const unitConversions = state.unit_conversions || [];

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(40);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Product Editor Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);

  // Debounce search query to prevent main thread blocking
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setVisibleLimit(40); // Reset limit on query change
    }, 120);
    return () => clearTimeout(handler);
  }, [query]);

  // Fast O(1) indexed stock calculation by product_id
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      if (b.current_quantity > 0) {
        map.set(b.product_id, (map.get(b.product_id) || 0) + b.current_quantity);
      }
    }
    return map;
  }, [batches, dbVersion]);

  // Fast O(1) batches lookup by product_id
  const batchesMap = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      if (b.current_quantity > 0) {
        if (!map.has(b.product_id)) map.set(b.product_id, []);
        map.get(b.product_id)!.push(b);
      }
    }
    return map;
  }, [batches, dbVersion]);

  // Fast O(1) units lookup by product_id
  const unitsMap = useMemo(() => {
    const map = new Map<string, UnitConversion[]>();
    for (let i = 0; i < unitConversions.length; i++) {
      const uc = unitConversions[i];
      if (uc.is_active !== false) {
        if (!map.has(uc.product_id)) map.set(uc.product_id, []);
        map.get(uc.product_id)!.push(uc);
      }
    }
    return map;
  }, [unitConversions, dbVersion]);

  // Fast O(1) manufacturers lookup
  const manufacturersMap = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < manufacturers.length; i++) {
      const m = manufacturers[i];
      map.set(m.id, normalizeArabicSearchText(m.name_ar || m.name_en || ''));
    }
    return map;
  }, [manufacturers, dbVersion]);

  // Fast O(1) categories lookup
  const categoriesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      map.set(c.id, normalizeArabicSearchText(c.name_ar || c.name_en || ''));
    }
    return map;
  }, [categories, dbVersion]);

  // Filtered products with normalized Arabic search
  const filteredProducts = useMemo(() => {
    const norm = normalizeArabicSearchText(debouncedQuery);

    if (!norm) {
      // Return first items without expensive filtering
      return products.filter((p) => p.is_active && !p.deleted_at);
    }

    const matches: Product[] = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p.is_active || p.deleted_at) continue;

      const nAr = normalizeArabicSearchText(p.name_ar);
      const nEn = (p.name_en || '').toLowerCase();
      const nAct = normalizeArabicSearchText(p.active_ingredient || '');
      const nGen = normalizeArabicSearchText(p.generic_name || '');
      const nBar = (p.barcode || '').toLowerCase();
      const nCode = (p.internal_code || '').toLowerCase();
      const nMan = p.manufacturer_id ? manufacturersMap.get(p.manufacturer_id) || '' : '';
      const nCat = p.category_id ? categoriesMap.get(p.category_id) || '' : '';

      if (
        nAr.includes(norm) ||
        nEn.includes(norm) ||
        nAct.includes(norm) ||
        nGen.includes(norm) ||
        nBar.includes(norm) ||
        nCode.includes(norm) ||
        nMan.includes(norm) ||
        nCat.includes(norm)
      ) {
        matches.push(p);
      }
    }
    return matches;
  }, [products, debouncedQuery, manufacturersMap, categoriesMap, dbVersion]);

  // Selected product logic
  const selectedProduct = useMemo(() => {
    if (selectedProductId) {
      const found = products.find((p) => p.id === selectedProductId);
      if (found) return found;
    }
    return filteredProducts[0] || null;
  }, [selectedProductId, products, filteredProducts]);

  const currentBatches = selectedProduct ? (batchesMap.get(selectedProduct.id) || []) : [];
  const currentUnits = selectedProduct ? (unitsMap.get(selectedProduct.id) || []) : [];
  const totalStock = selectedProduct ? (stockMap.get(selectedProduct.id) || 0) : 0;

  const getCategoryName = (catId?: string) => {
    return categories.find((c) => c.id === catId)?.name_ar || 'عام';
  };

  const visibleProducts = filteredProducts.slice(0, visibleLimit);

  // Handle open editor
  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setShowEditorModal(true);
  };

  const handleOpenNew = () => {
    setEditingProduct(null);
    setShowEditorModal(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 max-w-4xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  بحث واستعلام الأصناف والمخزون
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  البحث الفوري في الكتالوج، استعراض التشغيلات، وتعديل بيانات الصنف والوحدات
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenNew}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">إضافة صنف جديد</span>
                <span className="sm:hidden">صنف جديد</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم الصنف (عربي أو إنجليزي)، المادة الفعالة، الكود، أو الباركود..."
              className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-500 transition-all outline-hidden"
            />
          </div>

          {/* Body Content */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Results List */}
            <div className="md:col-span-2 space-y-2 border-l border-slate-100 dark:border-slate-800 pl-2 sm:pl-3 max-h-[420px] overflow-y-auto">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                <span>نتائج البحث ({filteredProducts.length})</span>
                {filteredProducts.length > visibleLimit && (
                  <span className="text-[11px] text-slate-400">
                    معروض {visibleLimit} من {filteredProducts.length}
                  </span>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <p className="text-xs text-slate-400">لا توجد أصناف مطابقة لكلمة البحث</p>
                  <button
                    type="button"
                    onClick={handleOpenNew}
                    className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-colors"
                  >
                    + إضافة صنف جديد بهذا الاسم
                  </button>
                </div>
              ) : (
                <>
                  {visibleProducts.map((prod) => {
                    const stock = stockMap.get(prod.id) || 0;
                    const isSelected = selectedProduct?.id === prod.id;

                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => setSelectedProductId(prod.id)}
                        className={`w-full text-right p-3 rounded-2xl border text-xs transition-all ${
                          isSelected
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {prod.name_ar}
                        </div>
                        {prod.name_en && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {prod.name_en}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-1 text-[11px]">
                          <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                            {Money.format(prod.current_selling_price || 0)}
                          </span>
                          <span
                            className={`font-mono px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              stock > 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            المخزون: {stock} {prod.base_unit || 'حبة'}
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  {filteredProducts.length > visibleLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((l) => l + 50)}
                      className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                      عرض المزيد من النتائج (+50)
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Product Details Column */}
            <div className="md:col-span-3">
              {selectedProduct ? (
                <div className="space-y-3.5 text-xs">
                  {/* Card Header & Actions */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-black text-slate-900 dark:text-white">
                          {selectedProduct.name_ar}
                        </h4>
                        {selectedProduct.name_en && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {selectedProduct.name_en}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold rounded-xl text-[11px]">
                          {getCategoryName(selectedProduct.category_id)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(selectedProduct)}
                          className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                        >
                          <Edit className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تعديل الصنف والوحدات</span>
                        </button>
                      </div>
                    </div>

                    {selectedProduct.active_ingredient && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                        <strong>المادة الفعالة:</strong> {selectedProduct.active_ingredient}{' '}
                        {selectedProduct.strength ? `(${selectedProduct.strength})` : ''}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-center">
                      <div>
                        <span className="text-[10px] text-slate-500 block">سعر البيع (أساسي):</span>
                        <span className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">
                          {Money.format(selectedProduct.current_selling_price || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">سعر التكلفة:</span>
                        <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">
                          {Money.format(selectedProduct.current_purchase_price || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">إجمالي الرصيد:</span>
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {totalStock} {selectedProduct.base_unit || 'حبة'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Available Selling Units */}
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-600" />
                      <span>الوحدات والأسعار المعتمدة للبيع ({currentUnits.length})</span>
                    </h5>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {currentUnits.length === 0 ? (
                        <div className="col-span-full p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-slate-400 text-[11px]">
                          الوحدة الأساسية فقط: {selectedProduct.base_unit} (
                          {Money.format(selectedProduct.current_selling_price || 0)})
                        </div>
                      ) : (
                        currentUnits.map((u) => (
                          <div
                            key={u.id}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{u.unit_name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">x{u.conversion_factor}</span>
                            </div>
                            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-[11px]">
                              {Money.format(u.selling_price || (selectedProduct.current_selling_price * u.conversion_factor))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Batches & Expiry Dates */}
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                      <span>التشغيلات المتاحة بالمخزن (FEFO) ({currentBatches.length})</span>
                      <span className="font-mono text-slate-500 text-[11px]">رصيد: {totalStock}</span>
                    </h5>

                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-0.5">
                      {currentBatches.length === 0 ? (
                        <p className="text-rose-600 font-bold p-2.5 bg-rose-50 dark:bg-rose-950/30 rounded-xl text-center text-xs">
                          هذا الصنف نافد تماماً من المخزن حالياً
                        </p>
                      ) : (
                        currentBatches.map((b) => (
                          <div
                            key={b.id}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                تشغيلة: {b.batch_number}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                انتهاء: {b.expiry_date}
                              </span>
                            </div>
                            <div className="text-left font-mono">
                              <span className="font-bold text-emerald-700 dark:text-emerald-400 block">
                                {b.current_quantity} {selectedProduct.base_unit || 'عبوة'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                سعر: {Money.format(b.selling_price)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Selection Button */}
                  {onSelectProduct && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProduct(selectedProduct);
                          onClose();
                        }}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all text-xs"
                      >
                        اختيار الصنف وإضافته للفاتورة
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-16 text-center text-slate-400 text-xs">
                  اختر صنفاً من القائمة لعرض تفاصيله الكاملة والتشغيلات
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Product Editor Modal */}
      {showEditorModal && (
        <ProductEditorModal
          isOpen={showEditorModal}
          onClose={() => setShowEditorModal(false)}
          product={editingProduct}
          onSaved={(saved) => {
            setSelectedProductId(saved.id);
          }}
        />
      )}
    </>
  );
};
