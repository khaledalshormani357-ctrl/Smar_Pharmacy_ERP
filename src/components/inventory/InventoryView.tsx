import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  Layers,
  Edit,
  SlidersHorizontal,
  ClipboardCheck,
  Tag,
  Eye,
  Building,
  FolderTree,
  DollarSign,
  BookOpen,
  Database
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { InventoryService } from '../../services/InventoryService';
import { StockService } from '../../services/StockService';
import { Product, Batch, Category, Manufacturer } from '../../types';
import { Money } from '../../utils/money';
import { normalizeArabicSearchText } from '../../utils/inputSafety';
import { NumericInput } from '../ui/NumericInput';
import { ProductDetailsModal } from './ProductDetailsModal';
import { OpeningStockModal } from './OpeningStockModal';
import { StockCountModal } from './StockCountModal';
import { CatalogImportModal } from '../modals/CatalogImportModal';
import { ProductEditorModal } from '../modals/ProductEditorModal';

export const InventoryView: React.FC = () => {
  const [products, setProducts] = useState(InventoryService.getProductsWithStock());
  const [categories, setCategories] = useState<Category[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'low' | 'reorder' | 'expiring' | 'expired'>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Modals state
  const [showProductEditor, setShowProductEditor] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showOpeningStockModal, setShowOpeningStockModal] = useState(false);
  const [showStockCountModal, setShowStockCountModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  // Active product for inspection, adjustment, or edit
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Form State for Adding / Editing Product
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [barcode, setBarcode] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [genericName, setGenericName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [dosageForm, setDosageForm] = useState<'tablet' | 'capsule' | 'syrup' | 'suspension' | 'injection' | 'ointment' | 'drops' | 'cream' | 'spray' | 'other'>('tablet');
  const [baseUnit, setBaseUnit] = useState('حبة');
  const [packSize, setPackSize] = useState(1);
  const [purchasePriceVal, setPurchasePriceVal] = useState(0);
  const [sellingPriceVal, setSellingPriceVal] = useState(0);
  const [minStockVal, setMinStockVal] = useState(10);
  const [reorderLevelVal, setReorderLevelVal] = useState(25);
  const [prescriptionRequired, setPrescriptionRequired] = useState(false);
  const [isControlled, setIsControlled] = useState(false);
  const [additionalUnits, setAdditionalUnits] = useState<
    Array<{ unitName: string; factor: number; price: number }>
  >([]);

  // Adjustment State
  const [adjustBatchId, setAdjustBatchId] = useState('');
  const [adjustNewQty, setAdjustNewQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // Valuation summary
  const valuation = StockService.getInventoryValuation();

  useEffect(() => {
    loadData();
    const unsub = db.subscribe(() => {
      loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    const prods = InventoryService.getProductsWithStock();
    setProducts(prods);
    setCategories(db.getState().categories || []);
    setManufacturers(db.getState().manufacturers || []);
  };

  // High-performance single-pass summary counts
  const productCounts = useMemo(() => {
    let low = 0;
    let reorder = 0;
    let nearExpiry = 0;
    let expired = 0;
    for (const p of products) {
      if (p.isLowStock) low++;
      if (p.isNeedsReorder) reorder++;
      if (p.isNearExpiry) nearExpiry++;
      if (p.isExpired) expired++;
    }
    return { low, reorder, nearExpiry, expired, total: products.length };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const rawQuery = searchQuery.trim();
    const qLower = rawQuery.toLowerCase();
    const qArabic = normalizeArabicSearchText(rawQuery);

    return products.filter((p) => {
      // Archive filter
      if (!showArchived && (p.is_active === false || p.deleted_at)) {
        return false;
      }

      const matchesQuery =
        !rawQuery ||
        (p.name_ar && normalizeArabicSearchText(p.name_ar).includes(qArabic)) ||
        (p.name_en && p.name_en.toLowerCase().includes(qLower)) ||
        (p.barcode && p.barcode.toLowerCase().includes(qLower)) ||
        (p.generic_name && (p.generic_name.toLowerCase().includes(qLower) || normalizeArabicSearchText(p.generic_name).includes(qArabic))) ||
        (p.active_ingredient && (p.active_ingredient.toLowerCase().includes(qLower) || normalizeArabicSearchText(p.active_ingredient).includes(qArabic))) ||
        p.internal_code.toLowerCase().includes(qLower);

      if (!matchesQuery) return false;
      if (selectedCategoryFilter && p.category_id !== selectedCategoryFilter) return false;

      if (filterType === 'low') return p.isLowStock;
      if (filterType === 'reorder') return p.isNeedsReorder;
      if (filterType === 'expiring') return p.isNearExpiry;
      if (filterType === 'expired') return p.isExpired;
      return true;
    });
  }, [products, searchQuery, selectedCategoryFilter, filterType, showArchived]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 40;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategoryFilter, filterType, showArchived]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const handleOpenAdd = () => {
    setProductToEdit(null);
    setShowProductEditor(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      alert('اسم الدواء بالعربية إلزامي');
      return;
    }

    try {
      InventoryService.saveProduct(
        {
          id: selectedProduct?.id,
          name_ar: nameAr,
          name_en: nameEn,
          barcode: barcode || undefined,
          internal_code: internalCode,
          generic_name: genericName,
          active_ingredient: activeIngredient,
          category_id: categoryId,
          manufacturer_id: manufacturerId,
          dosage_form: dosageForm,
          base_unit: baseUnit,
          pack_size: packSize,
          current_purchase_price: purchasePriceVal,
          current_selling_price: sellingPriceVal,
          min_stock_level: minStockVal,
          reorder_level: reorderLevelVal,
          prescription_required: prescriptionRequired,
          is_controlled: isControlled
        },
        additionalUnits,
        'user-01'
      );

      setShowAddModal(false);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ الصنف');
    }
  };

  const handleSaveAdjustment = () => {
    if (!selectedProduct || !adjustBatchId) return;
    if (!adjustReason.trim()) {
      alert('يرجى كتابة سبب التسوية المخزنية');
      return;
    }

    try {
      StockService.adjustStock({
        productId: selectedProduct.id,
        batchId: adjustBatchId,
        newQuantityBase: adjustNewQty,
        reason: adjustReason.trim(),
        userId: 'user-01'
      });
      setShowAdjustModal(false);
      setAdjustReason('');
    } catch (err: any) {
      alert(err.message || 'خطأ أثناء تسجيل التسوية');
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto md:max-w-3xl pb-24">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">مخزون الأدوية والتشغيلات الصيدلانية</h2>
          <p className="text-xs text-slate-500">إدارة الأصناف، تتبع الدفعات وتواريخ الصلاحية وتطبيق سياسة FEFO</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatalogModal(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs shadow-emerald-500/20 active:scale-95 transition-all"
            title="فتح دليل الأدوية واستيراد الأصناف المعتمدة (4,048 صنف)"
          >
            <Database className="w-4 h-4" />
            <span className="hidden sm:inline">دليل الأدوية المعتمد (4,048)</span>
            <span className="sm:hidden">الدليل</span>
          </button>

          <a
            href="/docs/Drug_Products_Directory_Yemen.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-emerald-200 transition-all"
            title="فتح ملف PDF المعتمد (588 صفحة)"
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">PDF</span>
          </a>

          <button
            onClick={() => setShowStockCountModal(true)}
            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-purple-200 transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>جلسة جرد</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>صنف جديد</span>
          </button>
        </div>
      </div>

      {/* Valuation & Key Indicators Bar */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 block font-semibold">إجمالي قيمة المخزون (تاريخي)</span>
          <span className="font-bold text-sm text-slate-900 block mt-0.5 font-mono">
            {Money.format(valuation.totalValueMinor)}
          </span>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">
            محسوب بتكلفة الدفعات التاريخية
          </span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 block font-semibold">التشغيلات الصالحة (FEFO)</span>
          <span className="font-bold text-sm text-emerald-600 block mt-0.5 font-mono">
            {valuation.activeBatchesCount} دفعة
          </span>
          <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">
            {valuation.totalUnitsCount} وحدة متوفرة
          </span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 block font-semibold">تنبيهات الصلاحية والنواقص</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-bold text-xs text-rose-600 font-mono">
              {productCounts.expired} منتهي
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-bold text-xs text-amber-600 font-mono">
              {productCounts.low} نواقص
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم العربي، الإنجليزي، المادة الفعالة، أو الباركود..."
            className="w-full pr-9 pl-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              filterType === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            الكل ({productCounts.total})
          </button>
          <button
            onClick={() => setFilterType('low')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              filterType === 'low'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-amber-700 hover:bg-amber-50'
            }`}
          >
            تحت حد الخطر ({productCounts.low})
          </button>
          <button
            onClick={() => setFilterType('reorder')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              filterType === 'reorder'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-blue-700 hover:bg-blue-50'
            }`}
          >
            إعادة الطلب ({productCounts.reorder})
          </button>
          <button
            onClick={() => setFilterType('expiring')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              filterType === 'expiring'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-orange-700 hover:bg-orange-50'
            }`}
          >
            صلاحية وشيكة ({productCounts.nearExpiry})
          </button>
          <button
            onClick={() => setFilterType('expired')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              filterType === 'expired'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-rose-700 hover:bg-rose-50'
            }`}
          >
            منتهية الصلاحية ({productCounts.expired})
          </button>

          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap select-none transition-colors">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span>عرض الأصناف المؤرشفة</span>
          </label>
        </div>
      </div>

      {/* Product List */}
      <div className="space-y-2.5">
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-slate-400 shadow-xs">
            <Package className="w-12 h-12 stroke-[1.2] mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold">لا توجد أدوية مطابقة لهذا البحث أو الفلتر</p>
          </div>
        ) : (
          <>
            {paginatedProducts.map((p) => (
              <div
                key={p.id}
                className={`bg-white rounded-3xl p-4 border shadow-xs flex flex-col gap-3 transition-all ${
                  p.is_active === false ? 'border-amber-200 bg-amber-50/20 opacity-80' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{p.name_ar}</h4>
                      {p.is_active === false && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                          مؤرشف / معطل
                        </span>
                      )}
                      {p.isLowStock && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 rounded-md">
                          نواقص
                        </span>
                      )}
                      {p.isNearExpiry && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200 rounded-md">
                          قريب الصلاحية
                        </span>
                      )}
                      {p.isExpired && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 rounded-md">
                          منتهي
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                      <span>{p.internal_code}</span>
                      {p.barcode && <span>• باركود: {p.barcode}</span>}
                      {p.generic_name && <span>• {p.generic_name}</span>}
                    </div>
                  </div>

                  {/* Quick Inspection & Action Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setProductToEdit(p);
                        setShowProductEditor(true);
                      }}
                      className="px-2.5 py-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                      title="تعديل بيانات الصنف والوحدات والأسعار"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedProduct(p);
                        setShowDetailsModal(true);
                      }}
                      className="px-2.5 py-1 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                      title="عرض بطاقة الصنف والتشغيلات"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>التفاصيل</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedProduct(p);
                        setShowOpeningStockModal(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition-colors"
                      title="إضافة رصيد افتتاحي"
                    >
                      <Tag className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        setSelectedProduct(p);
                        setAdjustBatchId(p.batches[0]?.id || '');
                        setAdjustNewQty(p.batches[0]?.current_quantity || 0);
                        setShowAdjustModal(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-amber-600 rounded-xl hover:bg-slate-100 transition-colors"
                      title="تسوية مخزنية وتعديل رصيد"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stock and Price details */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">الرصيد الكلي:</span>
                    <span className="font-bold font-mono text-slate-800">
                      {p.totalBaseStock} {p.base_unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">سعر الشراء المرجعي:</span>
                    <span className="font-mono text-slate-700">
                      {Money.format(p.current_purchase_price)}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-400 block">سعر البيع الافتراضي:</span>
                    <span className="font-bold font-mono text-emerald-600">
                      {Money.format(p.current_selling_price)}
                    </span>
                  </div>
                </div>

                {/* Batches Preview */}
                {p.batches.length > 0 && (
                  <div className="bg-slate-50 p-2 rounded-2xl text-[11px] flex items-center justify-between font-mono">
                    <span className="text-slate-500">أقرب دفعة FEFO: {p.batches[0].batch_number}</span>
                    <span
                      className={
                        p.isExpired
                          ? 'text-rose-600 font-bold'
                          : p.isNearExpiry
                          ? 'text-orange-600 font-bold'
                          : 'text-slate-600'
                      }
                    >
                      صلاحية: {p.batches[0].expiry_date}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 text-xs text-slate-600 shadow-xs">
                <div className="font-medium">
                  عرض {(currentPage - 1) * pageSize + 1} إلى {Math.min(currentPage * pageSize, filteredProducts.length)} من أصل <strong className="text-slate-900 font-bold">{filteredProducts.length.toLocaleString('en-US')}</strong> صنف
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 disabled:opacity-35 hover:bg-slate-50 font-bold transition-colors"
                  >
                    السابق
                  </button>
                  <div className="px-3 py-1.5 font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl">
                    {currentPage} / {totalPages}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 disabled:opacity-35 hover:bg-slate-50 font-bold transition-colors"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Product Details Modal */}
      {showDetailsModal && selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          category={categories.find((c) => c.id === selectedProduct.category_id)}
          manufacturer={manufacturers.find((m) => m.id === selectedProduct.manufacturer_id)}
          onClose={() => setShowDetailsModal(false)}
          onOpenOpeningStock={() => {
            setShowDetailsModal(false);
            setShowOpeningStockModal(true);
          }}
          onOpenAdjustment={(batchId) => {
            setShowDetailsModal(false);
            setAdjustBatchId(batchId || selectedProduct.batches[0]?.id || '');
            const b = selectedProduct.batches.find((x: any) => x.id === batchId);
            setAdjustNewQty(b?.current_quantity || 0);
            setShowAdjustModal(true);
          }}
        />
      )}

      {/* Opening Stock Modal */}
      {showOpeningStockModal && selectedProduct && (
        <OpeningStockModal
          product={selectedProduct}
          onClose={() => setShowOpeningStockModal(false)}
          onSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Stock Count Modal */}
      {showStockCountModal && (
        <StockCountModal
          onClose={() => {
            setShowStockCountModal(false);
            loadData();
          }}
        />
      )}

      {/* Modal: Add / Edit Product */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                {selectedProduct ? 'تعديل بيانات الدواء' : 'إضافة دواء جديد في الدليل'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="font-bold text-slate-700">الاسم التجاري بالعربية *</label>
                  <input
                    type="text"
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: باراسيتامول 500 ملغ"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">الاسم التجاري بالإنجليزية</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Paracetamol 500mg"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-[11px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">الباركود الدولي</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="628100123456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">الاسم العلمي</label>
                  <input
                    type="text"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    placeholder="Acetaminophen"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">المادة الفعالة</label>
                  <input
                    type="text"
                    value={activeIngredient}
                    onChange={(e) => setActiveIngredient(e.target.value)}
                    placeholder="Paracetamol"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">التصنيف الدوائي</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">الشركة المصنعة</label>
                  <select
                    value={manufacturerId}
                    onChange={(e) => setManufacturerId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name_ar}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">الشكل الصيدلاني</label>
                  <select
                    value={dosageForm}
                    onChange={(e) => setDosageForm(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <option value="tablet">أقراص (Tablets)</option>
                    <option value="capsule">كبسولات (Capsules)</option>
                    <option value="syrup">شراب (Syrup)</option>
                    <option value="suspension">معلق (Suspension)</option>
                    <option value="injection">حقن (Injection)</option>
                    <option value="ointment">مرهم (Ointment)</option>
                    <option value="drops">قطرة (Drops)</option>
                    <option value="cream">كريم (Cream)</option>
                    <option value="spray">بخاخ (Spray)</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">الوحدة الأساسية (Base Unit) *</label>
                  <input
                    type="text"
                    required
                    value={baseUnit}
                    onChange={(e) => setBaseUnit(e.target.value)}
                    placeholder="حبة، مل، أمبولة"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              {/* Pricing & Levels */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">سعر الشراء المرجعي</label>
                  <NumericInput
                    value={purchasePriceVal}
                    onChange={setPurchasePriceVal}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {Money.format(purchasePriceVal)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">سعر البيع الافتراضي للوحدة</label>
                  <NumericInput
                    value={sellingPriceVal}
                    onChange={setSellingPriceVal}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-emerald-600"
                  />
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {Money.format(sellingPriceVal)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">حد الخطر / النواقص الأدنى</label>
                  <NumericInput
                    value={minStockVal}
                    onChange={setMinStockVal}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-amber-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">حد إعادة الطلب (Reorder)</label>
                  <NumericInput
                    value={reorderLevelVal}
                    onChange={setReorderLevelVal}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-blue-600"
                  />
                </div>
              </div>

              {/* Controlled and Prescription Flags */}
              <div className="flex items-center gap-4 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prescriptionRequired}
                    onChange={(e) => setPrescriptionRequired(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-slate-700 font-bold">يتطلب وصفة طبية</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isControlled}
                    onChange={(e) => setIsControlled(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span className="text-slate-700 font-bold">دواء مراقب ومهدئ</span>
                </label>
              </div>

              {/* Additional Unit Conversions */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">وحدات التحويل المتعددة</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAdditionalUnits([
                        ...additionalUnits,
                        { unitName: 'باكت', factor: 10, price: sellingPriceVal * 10 }
                      ])
                    }
                    className="text-blue-600 font-bold hover:underline"
                  >
                    + إضافة وحدة
                  </button>
                </div>

                {additionalUnits.map((u, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl">
                    <input
                      type="text"
                      placeholder="اسم الوحدة"
                      value={u.unitName}
                      onChange={(e) => {
                        const arr = [...additionalUnits];
                        arr[idx].unitName = e.target.value;
                        setAdditionalUnits(arr);
                      }}
                      className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg"
                    />
                    <span className="text-slate-400">=</span>
                    <NumericInput
                      value={u.factor}
                      onChange={(val) => {
                        const arr = [...additionalUnits];
                        arr[idx].factor = val;
                        setAdditionalUnits(arr);
                      }}
                      className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-center"
                    />
                    <span className="text-slate-400">{baseUnit}</span>

                    <button
                      type="button"
                      onClick={() => setAdditionalUnits(additionalUnits.filter((_, i) => i !== idx))}
                      className="text-rose-500 font-bold px-1 hover:text-rose-700 mr-auto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-xs hover:bg-blue-700"
                >
                  حفظ الصنف في الدليل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Controlled Stock Adjustment */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">تسوية مخزنية رسمية</h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="font-bold text-slate-800">{selectedProduct.name_ar}</p>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">اختر التشغيلة المراد تسويتها</label>
                <select
                  value={adjustBatchId}
                  onChange={(e) => {
                    setAdjustBatchId(e.target.value);
                    const b = selectedProduct.batches.find((x: any) => x.id === e.target.value);
                    if (b) setAdjustNewQty(b.current_quantity);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                >
                  {selectedProduct.batches.map((b: Batch) => (
                    <option key={b.id} value={b.id}>
                      تشغيلة {b.batch_number} (رصيدها: {b.current_quantity} {selectedProduct.base_unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  الرصيد الفعلي الجديد ({selectedProduct.base_unit})
                </label>
                <NumericInput
                  value={adjustNewQty}
                  onChange={setAdjustNewQty}
                  className="w-full py-2 text-center font-bold text-sm bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  سبب التسوية (إجباري لقيد الحركة وسجل التدقيق) *
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="مثال: جرد دوري، معالجة تالف، تصحيح إدخال"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={handleSaveAdjustment}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  اعتماد التسوية وقيد الحركة
                </button>
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2.5 text-slate-500 text-xs font-semibold hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Authoritative Drug Catalog Import Modal */}
      <CatalogImportModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        onImportComplete={loadData}
      />

      {/* Product Editor Modal for Add and Edit */}
      {showProductEditor && (
        <ProductEditorModal
          isOpen={showProductEditor}
          onClose={() => {
            setShowProductEditor(false);
            setProductToEdit(null);
          }}
          product={productToEdit}
          onSaved={() => {
            loadData();
          }}
          onArchived={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};
