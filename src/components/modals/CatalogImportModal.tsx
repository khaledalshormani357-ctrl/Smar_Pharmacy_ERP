import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Database,
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Building,
  FolderTree,
  Pill,
  BookOpen,
  ArrowDownToLine,
  Loader2,
  ShieldCheck,
  Info,
  Sparkles
} from 'lucide-react';
import {
  CatalogImportService,
  DrugCatalogSeed,
  CatalogImportProgress
} from '../../services/CatalogImportService';
import { Product } from '../../types';
import { useBackHandler } from '../../hooks/useBackHandler';

interface CatalogImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

export const CatalogImportModal: React.FC<CatalogImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const [loading, setLoading] = useState(true);
  const [seedData, setSeedData] = useState<DrugCatalogSeed | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<CatalogImportProgress>({
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
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'report' | 'files'>('preview');

  // Handle hardware Back button: close modal if not importing
  useBackHandler('modal-catalog-import', isOpen, () => {
    if (isImporting) {
      return true; // Keep open while import is writing to DB
    }
    onClose();
    return true;
  }, 110);

  useEffect(() => {
    if (isOpen) {
      loadCatalog();
    }
  }, [isOpen]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await CatalogImportService.loadSeedData();
      setSeedData(data);
      const st = await CatalogImportService.getCatalogStats();
      setStats(st);
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleStartImport = async () => {
    setIsImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res = await CatalogImportService.importCatalog({
        batchSize: 60,
        onProgress: (prog) => {
          setImportProgress(prog);
        }
      });
      setImportResult(res);
      // Refresh stats
      const updatedStats = await CatalogImportService.getCatalogStats();
      setStats(updatedStats);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('إلغاء')) {
        console.log('Import cancelled by user');
      } else {
        console.error('Import failed:', err);
        setImportError(err?.message || 'حدث خطأ أثناء استيراد الدليل الدوائي');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancelImport = () => {
    CatalogImportService.cancelImport();
  };

  // High performance memoized filtering to avoid UI lockup
  const filteredProducts = useMemo(() => {
    if (!seedData?.products) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q && !selectedCategory) return seedData.products;

    return seedData.products.filter((p) => {
      const matchesSearch =
        !q ||
        (p.name_en && p.name_en.toLowerCase().includes(q)) ||
        (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
        (p.generic_name && p.generic_name.toLowerCase().includes(q)) ||
        (p.active_ingredient && p.active_ingredient.toLowerCase().includes(q)) ||
        ((p as any).manufacturer_name && (p as any).manufacturer_name.toLowerCase().includes(q));

      const matchesCategory =
        !selectedCategory || (p as any).therapeutic_category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [seedData?.products, searchQuery, selectedCategory]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  دليل الأدوية والمنتجات الطبية المعتمد
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Authoritative Catalog Gate
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                المستخرج بدقة من الدليل الرسمي (588 صفحة - 4,048 صنف دوائي نقي)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Key Metrics Banner */}
        <div className="px-6 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-400 block text-[10px]">إجمالي الأصناف المعتمدة</span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {stats?.totalProductsInCatalog || 4048} صنف
              </span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[10px]">التصنيفات العلاجية</span>
              <span className="text-purple-300 font-bold font-mono text-sm">
                {stats?.totalCategoriesInCatalog || 224} فئة
              </span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[10px]">الشركات المصنعة</span>
              <span className="text-blue-300 font-bold font-mono text-sm">
                {stats?.totalManufacturersInCatalog || 544} شركة
              </span>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[10px]">الحالة في قاعدة البيانات</span>
              <span className="text-amber-300 font-bold font-mono text-sm">
                {stats?.alreadyImportedProducts || 0} مستورد
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isImporting ? (
              <button
                onClick={handleCancelImport}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                title="إلغاء عملية الاستيراد الجارية بأمان"
              >
                <X className="w-4 h-4" />
                <span>إلغاء الاستيراد</span>
              </button>
            ) : null}

            <button
              onClick={handleStartImport}
              disabled={isImporting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-all active:scale-95"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري الاستيراد ({importProgress.percent}%)...</span>
                </>
              ) : (
                <>
                  <ArrowDownToLine className="w-4 h-4" />
                  <span>استيراد الدليل الآن للبرنامج</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 border-b border-slate-200 bg-white text-xs pt-2">
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
              activeTab === 'preview'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            معاينة الأصناف ({filteredProducts.length})
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
              activeTab === 'report'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            تقرير التدقيق وقواعد النزاهة (Gate Report)
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
              activeTab === 'files'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            ملفات التصدير والـ Artifacts المعتمدة
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Active Chunked Import Progress Card */}
          {isImporting && (
            <div className="mb-5 p-5 bg-gradient-to-br from-emerald-50 to-teal-50/70 border border-emerald-200/80 rounded-2xl shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950">
                      جاري استيراد الدليل الوطني للأدوية (معالجة غير متزامنة لمنع تعليق النظام)
                    </h4>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      {importProgress.stage === 'loading' && 'جاري تحميل ملف الدليل المعتمد...'}
                      {importProgress.stage === 'categories' && 'جاري استيراد التصنيفات العلاجية...'}
                      {importProgress.stage === 'manufacturers' && 'جاري استيراد الشركات المصنعة...'}
                      {importProgress.stage === 'products' &&
                        `جاري استيراد دفعات الأصناف (الدفعة ${importProgress.currentBatch} من ${importProgress.totalBatches})...`}
                      {importProgress.stage === 'finalizing' && 'جاري حفظ وفهرسة البيانات في التخزين الآمن...'}
                      {importProgress.stage === 'completed' && 'اكتمل الاستيراد بنجاح!'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCancelImport}
                    className="px-2.5 py-1 text-[11px] bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold transition-colors"
                  >
                    إلغاء العملية
                  </button>
                  <div className="text-left font-mono font-black text-emerald-700 text-sm">
                    {importProgress.percent}%
                  </div>
                </div>
              </div>

              {/* Progress Track */}
              <div className="w-full h-2.5 bg-emerald-100/80 rounded-full overflow-hidden mb-3.5">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-150 rounded-full"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>

              {/* Statistics Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-white/80 border border-emerald-200/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-600">المستورد:</span>
                  <span className="font-bold font-mono text-emerald-700">{importProgress.imported.toLocaleString('en-US')}</span>
                </div>
                <div className="bg-white/80 border border-emerald-200/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-600">المتبقي:</span>
                  <span className="font-bold font-mono text-slate-700">{importProgress.remaining.toLocaleString('en-US')}</span>
                </div>
                <div className="bg-white/80 border border-emerald-200/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-600">تخطي تكرار:</span>
                  <span className="font-bold font-mono text-amber-700">{importProgress.skippedDuplicates.toLocaleString('en-US')}</span>
                </div>
                <div className="bg-white/80 border border-emerald-200/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-slate-600">الدفعة:</span>
                  <span className="font-bold font-mono text-blue-700">{importProgress.currentBatch} / {importProgress.totalBatches}</span>
                </div>
              </div>
            </div>
          )}

          {importError && (
            <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">فشل في استيراد الدليل الدوائي</p>
                <p className="mt-1 text-rose-700">{importError}</p>
              </div>
            </div>
          )}

          {importProgress.stage === 'cancelled' && !isImporting && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">تم إلغاء عملية الاستيراد بأمان</p>
                <p className="mt-1 text-amber-700">
                  تم التراجع عن التغييرات المؤقتة وإلغاء الاستيراد دون التأثير على قاعدة البيانات الحالية.
                </p>
              </div>
            </div>
          )}

          {importResult && (
            <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">اكتمل الاستيراد بنجاح!</p>
                <p className="mt-1 text-emerald-700">
                  تم استيراد <strong>{importResult.importedProducts}</strong> صنف دوائي،{' '}
                  <strong>{importResult.importedCategories}</strong> تصنيف، و{' '}
                  <strong>{importResult.importedManufacturers}</strong> شركة مصنعة. تم تخطي{' '}
                  {importResult.skippedDuplicates} صنف مكرر للمحافظة على سلامة البيانات.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم التجاري، العلمي، المادة الفعالة، أو الشركة..."
                    className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-emerald-500 max-w-xs"
                >
                  <option value="">جميع التصنيفات العلاجية</option>
                  {(seedData?.categories || []).map((cat) => (
                    <option key={cat.id} value={cat.name_en}>
                      {cat.name_en} ({cat.name_ar})
                    </option>
                  ))}
                </select>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0 font-bold z-10">
                      <tr>
                        <th className="py-2.5 px-3">الكود</th>
                        <th className="py-2.5 px-3">الاسم التجاري</th>
                        <th className="py-2.5 px-3">الاسم العلمي / المادة الفعالة</th>
                        <th className="py-2.5 px-3">الشكل الصيدلاني</th>
                        <th className="py-2.5 px-3">الشركة المصنعة والدولة</th>
                        <th className="py-2.5 px-3">التصنيف العلاجي</th>
                        <th className="py-2.5 px-3">الصفحة في الدليل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                            جاري تحميل سجلات الدليل المعتمد...
                          </td>
                        </tr>
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            لا توجد نتائج تطابق البحث في الدليل.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.slice(0, 100).map((prod) => (
                          <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                              {prod.internal_code}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              {prod.name_en}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {prod.generic_name || prod.active_ingredient || '-'}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                                {prod.dosage_form}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {(prod as any).manufacturer_name || '-'}
                              {(prod as any).country_of_origin && (
                                <span className="text-slate-400 text-[10px] mr-1">
                                  ({(prod as any).country_of_origin})
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600 max-w-[200px] truncate">
                              {(prod as any).therapeutic_category || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                              ص {(prod as any).source_page}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredProducts.length > 100 && (
                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
                    يتم عرض أول 100 صنف من أصل {filteredProducts.length} صنف مطابق
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-900 text-sm">
                    تقرير التدقيق وقواعد النزاهة الدوائية (Authoritative Source Policy)
                  </h4>
                  <p className="mt-1 text-emerald-800">
                    تم استخراج الدليل وفقًا لتعليمات وزارة الصحة والدليل اليمني الموحد للأدوية (588
                    صفحة). تم الالتزام الصارم بقاعدة <strong>Zero-Invention</strong>: لم يتم اختلاق
                    أي باركود، ولم يتم افتراض أي أسعار بيع أو شراء، ولم يتم تسجيل أي أرصدة مخزنية
                    مصطنعة، لضمان أعلى معايير النزاهة والمطابقة المحاسبية والطبية.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-slate-200 rounded-2xl bg-white space-y-3">
                  <h5 className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    المطابقة الإلزامية لمصدر البيانات
                  </h5>
                  <ul className="space-y-2 text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>الملف المعتمد: <code>Drug_Products_Directory_Yemen.pdf</code></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>عدد الصفحات المفحوصة: 588 صفحة (586 صفحة محتوى)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>إجمالي البطاقات المستخرجة: 4,101 بطاقة دوائية كاملة</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>الأصناف النقية بعد إزالة التكرارات: 4,048 صنف فريد</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 border border-slate-200 rounded-2xl bg-white space-y-3">
                  <h5 className="font-bold text-slate-900 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600" />
                    حماية بيئة وسجلات الصيدلية الحالية
                  </h5>
                  <ul className="space-y-2 text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>استيراد بيانات رئيسية (Master Data) فقط</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>عدم المساس بحركات البيع، الشراء، أو حسابات العملاء والموردين</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>معرفات UUID ثابتة ومستقرة غير قابلة للتكرار (Idempotent)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>توثيق كل حركة في سجل الرقابة والتدقيق (Audit Trail)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                تم تجهيز جميع الملفات المعيارية المطلوبة وفق أعلى معايير هندسة البيانات وقواعد ERP
                الصيدلانية:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href="/data/drug_catalog_clean.json"
                  download
                  className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-xs transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <FileCode className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block group-hover:text-emerald-700">
                        drug_catalog_clean.json
                      </span>
                      <span className="text-[11px] text-slate-400">
                        سجلات الأصناف النقية بتنسيق JSON (4.7 MB)
                      </span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                </a>

                <a
                  href="/data/drug_catalog_clean.csv"
                  download
                  className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-xs transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block group-hover:text-emerald-700">
                        drug_catalog_clean.csv
                      </span>
                      <span className="text-[11px] text-slate-400">
                        جدول البيانات المعتمد متوافق مع Excel (885 KB)
                      </span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                </a>

                <a
                  href="/data/drug_catalog_seed.json"
                  download
                  className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-xs transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block group-hover:text-emerald-700">
                        drug_catalog_seed.json
                      </span>
                      <span className="text-[11px] text-slate-400">
                        حزمة التهيئة الكاملة (أصناف، تصنيفات، مصانع) (5.1 MB)
                      </span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                </a>

                <a
                  href="/data/drug_catalog_import_report.md"
                  download
                  className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-xs transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block group-hover:text-emerald-700">
                        drug_catalog_import_report.md
                      </span>
                      <span className="text-[11px] text-slate-400">
                        تقرير التدقيق والمطابقة الشامل
                      </span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            الدليل الوطني للأدوية والمنتجات الطبية • الجمهورية اليمنية
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
