import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Sparkles,
  RefreshCw
} from 'lucide-react';
import {
  CatalogImportService,
  CatalogImportProgress
} from '../../services/CatalogImportService';
import { Product } from '../../types';
import { useBackHandler } from '../../hooks/useBackHandler';
import { ErrorBoundary } from '../common/ErrorBoundary';

export type ImportModalState =
  | 'IDLE'
  | 'LOADING'
  | 'READY'
  | 'IMPORTING'
  | 'SUCCESS'
  | 'ERROR'
  | 'CANCELLED';

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
  const [machineState, setMachineState] = useState<ImportModalState>('IDLE');
  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'report' | 'files'>('preview');

  // Handle hardware Back button: close modal if not actively importing
  useBackHandler(
    'modal-catalog-import',
    isOpen,
    () => {
      if (machineState === 'IMPORTING') {
        return true; // Protect active database write
      }
      onClose();
      return true;
    },
    110
  );

  // Load catalog statistics on open
  const loadMetadata = useCallback(async () => {
    setMachineState('LOADING');
    setErrorMessage(null);
    try {
      const st = await CatalogImportService.getCatalogStats();
      setStats(st);
      setMachineState('READY');
    } catch (err: any) {
      console.error('Failed to load catalog stats:', err);
      setErrorMessage(err?.message || 'تعذر تحميل بيانات الدليل الوطني');
      setMachineState('ERROR');
    }
  }, []);

  // Load preview chunk on-demand (bounded state, never crashes memory)
  const loadPreview = useCallback(async (page = 1, search = searchQuery, cat = selectedCategory) => {
    setPreviewLoading(true);
    try {
      const res = await CatalogImportService.getCatalogPreview({
        page,
        pageSize: 50,
        search,
        category: cat
      });
      setPreviewProducts(res.items);
      setPreviewTotal(res.total);
      setCategoriesList(res.categories);
      setPreviewPage(page);
    } catch (err) {
      console.warn('Preview slice error:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    if (isOpen) {
      loadMetadata();
    } else {
      setMachineState('IDLE');
      setImportResult(null);
      setErrorMessage(null);
    }
  }, [isOpen, loadMetadata]);

  useEffect(() => {
    if (isOpen && activeTab === 'preview' && machineState === 'READY') {
      const timer = setTimeout(() => {
        loadPreview(1, searchQuery, selectedCategory);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab, machineState, searchQuery, selectedCategory, loadPreview]);

  if (!isOpen) return null;

  const handleStartImport = async () => {
    setMachineState('IMPORTING');
    setImportResult(null);
    setErrorMessage(null);
    setImportProgress({
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

    try {
      const res = await CatalogImportService.importCatalog({
        batchSize: 60,
        onProgress: (prog) => {
          setImportProgress(prog);
        }
      });
      setImportResult(res);
      setMachineState('SUCCESS');

      // Refresh stats
      const updatedStats = await CatalogImportService.getCatalogStats();
      setStats(updatedStats);

      // Refresh preview to reflect new state
      loadPreview(1, searchQuery, selectedCategory);

      if (onImportComplete) {
        // Yield to event loop before notifying parent to allow render cycle to finish smoothly
        setTimeout(() => {
          onImportComplete();
        }, 100);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('إلغاء')) {
        console.log('Import cancelled by user');
        setMachineState('CANCELLED');
      } else {
        console.error('Import failed:', err);
        setErrorMessage(err?.message || 'حدث خطأ أثناء استيراد الدليل الدوائي');
        setMachineState('ERROR');
      }
    }
  };

  const handleCancelImport = () => {
    CatalogImportService.cancelImport();
  };

  const isImporting = machineState === 'IMPORTING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <ErrorBoundary title="خطأ في نافذة استيراد الدليل" subTitle="تم احتواء الخطأ البرمجي في نافذة الدليل دون التأثير على النظام.">
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
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 disabled:opacity-40 transition-colors"
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
                  type="button"
                  onClick={handleCancelImport}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                  title="إلغاء عملية الاستيراد الجارية بأمان"
                >
                  <X className="w-4 h-4" />
                  <span>إلغاء الاستيراد</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleStartImport}
                disabled={isImporting || machineState === 'LOADING'}
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
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
                activeTab === 'preview'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              استعراض الأصناف الدوائية
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
                activeTab === 'report'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              تقرير المطابقة والتدقيق الرسمي
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
                activeTab === 'files'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              الملفات المصدرية (JSON & CSV)
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {/* Active Progress Card */}
            {isImporting && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span className="font-bold text-emerald-900">
                      {importProgress.stage === 'categories' && 'جاري استيراد التصنيفات العلاجية...'}
                      {importProgress.stage === 'manufacturers' && 'جاري استيراد الشركات المصنعة...'}
                      {importProgress.stage === 'products' &&
                        `جاري معالجة الأصناف (دفعة ${importProgress.currentBatch} من ${importProgress.totalBatches})...`}
                      {importProgress.stage === 'finalizing' && 'جاري حفظ البيانات في قاعدة البيانات وتحديث الفهارس...'}
                      {importProgress.stage === 'loading' && 'جاري تحضير ملف الدليل...'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700">
                    {importProgress.percent}%
                  </span>
                </div>

                <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress.percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-emerald-800 font-mono">
                  <span>تم استيراد: {importProgress.imported} صنف</span>
                  <span>تم تخطي: {importProgress.skippedDuplicates} مكرر</span>
                  <span>المتبقي: {importProgress.remaining}</span>
                </div>
              </div>
            )}

            {/* Error Message Card */}
            {machineState === 'ERROR' && errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">فشل في استيراد الدليل الدوائي</p>
                  <p className="mt-1 text-rose-700">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={loadMetadata}
                  className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 text-xs flex items-center gap-1 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            )}

            {/* Cancelled State Card */}
            {machineState === 'CANCELLED' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">تم إلغاء عملية الاستيراد بأمان</p>
                  <p className="mt-1 text-amber-700">
                    تم التراجع عن التغييرات المؤقتة وإلغاء الاستيراد دون التأثير على قاعدة البيانات الحالية.
                  </p>
                </div>
              </div>
            )}

            {/* Success State Card */}
            {machineState === 'SUCCESS' && importResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs">
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
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 max-w-[240px]"
                  >
                    <option value="">جميع الفئات العلاجية ({categoriesList.length})</option>
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Table Container */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                  <div className="max-h-[380px] overflow-y-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-[11px] text-slate-600 font-bold">
                        <tr>
                          <th className="py-2.5 px-3">الكود</th>
                          <th className="py-2.5 px-3">الاسم التجاري</th>
                          <th className="py-2.5 px-3">الاسم العلمي / الفعالة</th>
                          <th className="py-2.5 px-3">الشكل الصيدلاني</th>
                          <th className="py-2.5 px-3">الشركة المصنعة</th>
                          <th className="py-2.5 px-3">الفئة العلاجية</th>
                          <th className="py-2.5 px-3">المصدر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewLoading ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                              <p className="mt-2 text-xs">جاري تحميل المعاينة السريعة...</p>
                            </td>
                          </tr>
                        ) : previewProducts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              لا توجد نتائج مطابقة لبحثك في الدليل الدوائي
                            </td>
                          </tr>
                        ) : (
                          previewProducts.map((prod) => (
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
                                ص {(prod as any).source_page || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {previewTotal > 0 && (
                    <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        يتم عرض {previewProducts.length} صنف من إجمالي {previewTotal} صنف مطابق
                      </span>
                      {previewTotal > 50 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={previewPage <= 1 || previewLoading}
                            onClick={() => loadPreview(previewPage - 1)}
                            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50 text-[11px]"
                          >
                            السابق
                          </button>
                          <span className="px-2 font-mono text-[11px]">
                            صفحة {previewPage} من {Math.ceil(previewTotal / 50)}
                          </span>
                          <button
                            type="button"
                            disabled={previewPage >= Math.ceil(previewTotal / 50) || previewLoading}
                            onClick={() => loadPreview(previewPage + 1)}
                            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50 text-[11px]"
                          >
                            التالي
                          </button>
                        </div>
                      )}
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
                        <span>معرفات ثابتة ومستقرة غير قابلة للتكرار (Idempotent)</span>
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
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 font-bold rounded-xl transition-colors"
            >
              إغلاق
            </button>
          </div>
        </ErrorBoundary>
      </div>
    </div>
  );
};
