import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Pill,
  Layers,
  Tag,
  Barcode,
  DollarSign,
  Plus,
  Trash2,
  Archive,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Building2,
  Globe,
  FileText,
  ShieldCheck,
  History
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { Product, UnitConversion, DosageForm } from '../../types';
import { InventoryService } from '../../services/InventoryService';
import { Money } from '../../utils/money';

interface ProductEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSaved?: (savedProduct: Product) => void;
  onArchived?: (archivedProduct: Product) => void;
  userId?: string;
}

const COMMON_UNITS = [
  'حبة',
  'قرص',
  'كبسولة',
  'شريط',
  'علبة',
  'باكيت',
  'زجاجة',
  'أمبول',
  'فيال',
  'كيس',
  'مل',
  'جرام'
];

const DOSAGE_FORMS: { value: DosageForm; label: string }[] = [
  { value: 'tablet', label: 'أقراص / حبوب (Tablet)' },
  { value: 'capsule', label: 'كبسولات (Capsule)' },
  { value: 'syrup', label: 'شراب (Syrup)' },
  { value: 'suspension', label: 'معلق (Suspension)' },
  { value: 'injection', label: 'حقن / أمبولات (Injection)' },
  { value: 'drops', label: 'قطرات (Drops)' },
  { value: 'ointment', label: 'مرهم (Ointment)' },
  { value: 'cream', label: 'كريم (Cream)' },
  { value: 'spray', label: 'بخاخ (Spray)' },
  { value: 'other', label: 'شكل صيدلاني آخر' }
];

export const ProductEditorModal: React.FC<ProductEditorModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaved,
  onArchived,
  userId = 'user-01'
}) => {
  const isEditing = !!product?.id;

  // Active Tab
  const [activeTab, setActiveTab] = useState<'basic' | 'units' | 'extra' | 'audit'>('basic');

  // Form State
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [genericName, setGenericName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [strength, setStrength] = useState('');
  const [dosageForm, setDosageForm] = useState<DosageForm>('tablet');
  const [categoryId, setCategoryId] = useState<string>('');
  const [manufacturerId, setManufacturerId] = useState<string>('');
  const [country, setCountry] = useState('');
  const [barcode, setBarcode] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [description, setDescription] = useState('');
  const [baseUnit, setBaseUnit] = useState('حبة');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [minStockLevel, setMinStockLevel] = useState<number>(5);
  const [reorderLevel, setReorderLevel] = useState<number>(15);
  const [prescriptionRequired, setPrescriptionRequired] = useState(false);
  const [isControlled, setIsControlled] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Units State
  const [sellingUnits, setSellingUnits] = useState<
    Array<{
      id?: string;
      unit_name: string;
      conversion_factor: number;
      selling_price: number;
      purchase_price?: number;
      is_default_sale: boolean;
      is_active: boolean;
    }>
  >([]);

  // New Unit Form State
  const [showAddUnitForm, setShowAddUnitForm] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitFactor, setNewUnitFactor] = useState<number>(10);
  const [newUnitPrice, setNewUnitPrice] = useState<number>(0);

  // Status & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [historyCheck, setHistoryCheck] = useState<{
    hasHistory: boolean;
    reason?: string;
    stockQty: number;
    batchesCount: number;
    salesCount: number;
    purchasesCount: number;
  }>({
    hasHistory: false,
    stockQty: 0,
    batchesCount: 0,
    salesCount: 0,
    purchasesCount: 0
  });

  const state = db.getState();
  const categories = state.categories || [];
  const manufacturers = state.manufacturers || [];

  // Reset or Populate on product change
  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      setNameAr(product.name_ar || '');
      setNameEn(product.name_en || '');
      setGenericName(product.generic_name || '');
      setActiveIngredient(product.active_ingredient || '');
      setStrength(product.strength || '');
      setDosageForm(product.dosage_form || 'tablet');
      setCategoryId(product.category_id || '');
      setManufacturerId(product.manufacturer_id || '');
      setCountry(product.country || product.country_of_origin || '');
      setBarcode(product.barcode || '');
      setInternalCode(product.internal_code || '');
      setDescription(product.description || '');
      setBaseUnit(product.base_unit || 'حبة');
      setPurchasePrice(product.current_purchase_price || 0);
      setSellingPrice(product.current_selling_price || 0);
      setMinStockLevel(product.min_stock_level || 5);
      setReorderLevel(product.reorder_level || 15);
      setPrescriptionRequired(!!product.prescription_required);
      setIsControlled(!!product.is_controlled);
      setIsActive(product.is_active !== false);

      // Check transaction history
      const hist = InventoryService.hasTransactionsOrStock(product.id);
      setHistoryCheck(hist);

      // Load units
      const existingConvs = (state.unit_conversions || [])
        .filter((uc) => uc.product_id === product.id && uc.unit_name !== product.base_unit)
        .map((uc) => ({
          id: uc.id,
          unit_name: uc.unit_name,
          conversion_factor: uc.conversion_factor,
          selling_price: uc.selling_price,
          purchase_price: uc.purchase_price,
          is_default_sale: !!uc.is_default_sale,
          is_active: uc.is_active !== false
        }));
      setSellingUnits(existingConvs);
    } else {
      // New product defaults
      setNameAr('');
      setNameEn('');
      setGenericName('');
      setActiveIngredient('');
      setStrength('');
      setDosageForm('tablet');
      setCategoryId(categories[0]?.id || '');
      setManufacturerId('');
      setCountry('');
      setBarcode('');
      setInternalCode('MED-' + Math.floor(1000 + Math.random() * 9000));
      setDescription('');
      setBaseUnit('حبة');
      setPurchasePrice(0);
      setSellingPrice(0);
      setMinStockLevel(5);
      setReorderLevel(15);
      setPrescriptionRequired(false);
      setIsControlled(false);
      setIsActive(true);
      setHistoryCheck({
        hasHistory: false,
        stockQty: 0,
        batchesCount: 0,
        salesCount: 0,
        purchasesCount: 0
      });

      // Default units for new tablet
      setSellingUnits([
        {
          unit_name: 'شريط',
          conversion_factor: 10,
          selling_price: 0,
          is_default_sale: false,
          is_active: true
        },
        {
          unit_name: 'علبة',
          conversion_factor: 100,
          selling_price: 0,
          is_default_sale: false,
          is_active: true
        }
      ]);
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setShowAddUnitForm(false);
    setActiveTab('basic');
  }, [isOpen, product]);

  // Product Audit Logs
  const productAuditLogs = useMemo(() => {
    if (!product?.id) return [];
    return (state.audit_logs || [])
      .filter((log) => log.entity_id === product.id)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 30);
  }, [product?.id, state.audit_logs]);

  if (!isOpen) return null;

  // Add unit to local state
  const handleAddUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newUnitName.trim();
    if (!cleanName) {
      setErrorMsg('يرجى تحديد اسم الوحدة');
      return;
    }
    if (cleanName === baseUnit.trim()) {
      setErrorMsg(`الوحدة (${cleanName}) هي الوحدة الأساسية للصنف بالفعل!`);
      return;
    }
    if (newUnitFactor <= 0) {
      setErrorMsg('معامل التحويل يجب أن يكون أكبر من 0');
      return;
    }

    const existingIdx = sellingUnits.findIndex((u) => u.unit_name.trim() === cleanName);
    if (existingIdx >= 0) {
      // If already present but inactive, reactivate it
      const updated = [...sellingUnits];
      updated[existingIdx] = {
        ...updated[existingIdx],
        conversion_factor: newUnitFactor,
        selling_price: newUnitPrice,
        is_active: true
      };
      setSellingUnits(updated);
    } else {
      setSellingUnits([
        ...sellingUnits,
        {
          id: 'uc-new-' + Math.random().toString(36).substring(2, 9),
          unit_name: cleanName,
          conversion_factor: newUnitFactor,
          selling_price: newUnitPrice,
          is_default_sale: false,
          is_active: true
        }
      ]);
    }

    setNewUnitName('');
    setNewUnitFactor(10);
    setNewUnitPrice(0);
    setShowAddUnitForm(false);
    setErrorMsg(null);
  };

  // Remove or Archive unit
  const handleRemoveUnit = (unitName: string) => {
    if (!product?.id) {
      // Just in-memory for unsaved product
      setSellingUnits(sellingUnits.filter((u) => u.unit_name !== unitName));
      return;
    }

    const usage = InventoryService.isUnitInUse(product.id, unitName);
    if (usage.inUse) {
      // Warn and mark as archived
      const confirmed = window.confirm(
        `تنبيه نظام الصيدلية:\nالوحدة (${unitName}) مستخدمة في فواتير ومعاملات تاريخية سابقة.\n\nسيتم "أرشفة" الوحدة وتعطيل البيع بها مستقبلاً دون حذفها من قاعدة البيانات، للحفاظ التام على صحة الفواتير والمبيعات السابقة. هل ترغب بالمتابعة؟`
      );
      if (confirmed) {
        setSellingUnits(
          sellingUnits.map((u) => (u.unit_name === unitName ? { ...u, is_active: false } : u))
        );
        setSuccessMsg(`تم أرشفة وحدة البيع (${unitName}) بنجاح.`);
      }
    } else {
      // Not used historically, safe to remove completely
      setSellingUnits(sellingUnits.filter((u) => u.unit_name !== unitName));
    }
  };

  // Reactivate an archived unit
  const handleReactivateUnit = (unitName: string) => {
    setSellingUnits(
      sellingUnits.map((u) => (u.unit_name === unitName ? { ...u, is_active: true } : u))
    );
  };

  // Generate Barcode
  const handleGenerateBarcode = () => {
    const randomBarcode = '629' + Math.floor(100000000 + Math.random() * 900000000);
    setBarcode(randomBarcode);
  };

  // Save Product and Units
  const handleSave = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!nameAr.trim()) {
      setErrorMsg('اسم الصنف بالعربية إلزامي');
      setActiveTab('basic');
      return;
    }

    if (!baseUnit.trim()) {
      setErrorMsg('الوحدة الأساسية إلزامية');
      setActiveTab('units');
      return;
    }

    // Check base unit modification safety
    if (isEditing && product && product.base_unit.trim() !== baseUnit.trim()) {
      if (historyCheck.hasHistory) {
        setErrorMsg(
          `لا يمكن تغيير الوحدة الأساسية (${product.base_unit}) لوجود حركات مسجلة: ${historyCheck.reason}`
        );
        setActiveTab('units');
        return;
      }
    }

    setIsSaving(true);
    try {
      const productPayload: Partial<Product> = {
        id: product?.id,
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || undefined,
        generic_name: genericName.trim() || undefined,
        active_ingredient: activeIngredient.trim() || undefined,
        strength: strength.trim() || undefined,
        dosage_form: dosageForm,
        category_id: categoryId || undefined,
        manufacturer_id: manufacturerId || undefined,
        country: country.trim() || undefined,
        barcode: barcode.trim() || undefined,
        internal_code: internalCode.trim(),
        description: description.trim() || undefined,
        base_unit: baseUnit.trim(),
        current_purchase_price: purchasePrice,
        current_selling_price: sellingPrice,
        min_stock_level: minStockLevel,
        reorder_level: reorderLevel,
        prescription_required: prescriptionRequired,
        is_controlled: isControlled,
        is_active: isActive
      };

      const savedId = InventoryService.saveProduct(
        productPayload,
        sellingUnits.map((u) => ({
          id: u.id,
          unitName: u.unit_name,
          unit_name: u.unit_name,
          factor: u.conversion_factor,
          conversion_factor: u.conversion_factor,
          price: u.selling_price,
          selling_price: u.selling_price,
          purchase_price: u.purchase_price,
          is_default_sale: u.is_default_sale,
          is_active: u.is_active
        })),
        userId
      );

      const updatedProduct = db.getState().products.find((p) => p.id === savedId);
      setSuccessMsg('تم حفظ بيانات الصنف والوحدات بنجاح في قاعدة البيانات.');

      setTimeout(() => {
        if (updatedProduct && onSaved) {
          onSaved(updatedProduct);
        }
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to save product:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ الصنف');
    } finally {
      setIsSaving(false);
    }
  };

  // Safe Archive or Delete Product
  const handleDeleteOrArchiveProduct = () => {
    if (!product?.id) return;

    const actionText = historyCheck.hasHistory ? 'أرشفة وتعطيل' : 'حذف نهائي لـ';
    const confirmPrompt = historyCheck.hasHistory
      ? `تنبيه: يحتوي هذا الصنف على معاملات أو رصيد (${historyCheck.reason}).\nهل أنت متأكد من أرشفة وتعطيل الصنف؟ لن يظهر في نتائج البحث الافتراضية وسيتم الحفاظ على كامل الفواتير التاريخية.`
      : `هل أنت متأكد من الحذف النهائي للصنف (${product.name_ar})؟ لا توجد أي معاملات سابقة مرتبطة به.`;

    if (window.confirm(confirmPrompt)) {
      try {
        const res = InventoryService.deleteOrArchiveProduct(product.id, userId);
        alert(res.message);
        if (onArchived && product) {
          onArchived(product);
        }
        onClose();
      } catch (err: any) {
        alert(err.message || 'فشلت عملية الحذف/الأرشفة');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 my-auto flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {isEditing ? 'تعديل بيانات الصنف الدوائي' : 'إضافة صنف دوائي جديد'}
                {!isActive && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                    مؤرشف / معطل
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing
                  ? `الصنف: ${product.name_ar} (كود: ${product.internal_code})`
                  : 'إدخال بطاقة صنف جديدة، ضبط الوحدات والتحويلات، والتسعير المعتمد'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleDeleteOrArchiveProduct}
                title={historyCheck.hasHistory ? 'أرشفة الصنف' : 'حذف الصنف'}
                className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-900 transition-colors"
              >
                {historyCheck.hasHistory ? <Archive className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{historyCheck.hasHistory ? 'أرشفة' : 'حذف'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-bold animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-2xl flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 pt-2 bg-white dark:bg-slate-900 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'basic'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Pill className="w-4 h-4" />
            البيانات الأساسية
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('units')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'units'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            إدارة الوحدات والأسعار ({sellingUnits.filter((u) => u.is_active).length + 1})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extra')}
            className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'extra'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Tag className="w-4 h-4" />
            التصنيف والمصنع والمخزون
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`pb-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'audit'
                  ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <History className="w-4 h-4" />
              سجل التعديلات والتدقيق ({productAuditLogs.length})
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 1: Basic Information */}
          {activeTab === 'basic' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Arabic Name */}
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم التجاري للصنف بالعربية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: باراسيتامول 500 ملجم أقراص"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* English Name */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم بالإنجليزية (Commercial Name EN)
                  </label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Paracetamol 500mg Tablets"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:border-emerald-500"
                  />
                </div>

                {/* Dosage Form */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الشكل الصيدلاني (Dosage Form)
                  </label>
                  <select
                    value={dosageForm}
                    onChange={(e) => setDosageForm(e.target.value as DosageForm)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:border-emerald-500"
                  >
                    {DOSAGE_FORMS.map((df) => (
                      <option key={df.value} value={df.value}>
                        {df.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Generic / Scientific Name */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم العلمي (Generic Name)
                  </label>
                  <input
                    type="text"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    placeholder="مثال: Acetaminophen"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:border-emerald-500"
                  />
                </div>

                {/* Active Ingredient */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    المادة الفعالة والتركيز (Active Ingredient)
                  </label>
                  <input
                    type="text"
                    value={activeIngredient}
                    onChange={(e) => setActiveIngredient(e.target.value)}
                    placeholder="مثال: Paracetamol"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:border-emerald-500"
                  />
                </div>

                {/* Strength */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    التركيز الدوائي (Strength)
                  </label>
                  <input
                    type="text"
                    value={strength}
                    onChange={(e) => setStrength(e.target.value)}
                    placeholder="مثال: 500mg أو 100ml أو 5%"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:border-emerald-500"
                  />
                </div>

                {/* Barcode */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>الباركود الدولي (Barcode)</span>
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      className="text-[11px] text-emerald-600 hover:underline"
                    >
                      توليد باركود تلقائي
                    </button>
                  </label>
                  <div className="relative">
                    <Barcode className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="امسح الباركود أو أدخله يدوياً"
                      className="w-full pr-9 pl-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Internal Code */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الكود الداخلي للصيدلية (Internal Code)
                  </label>
                  <input
                    type="text"
                    value={internalCode}
                    onChange={(e) => setInternalCode(e.target.value)}
                    placeholder="MED-1234"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white font-mono text-xs focus:border-emerald-500"
                  />
                </div>

                {/* Status Toggle */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">حالة الصنف</label>
                  <select
                    value={isActive ? 'active' : 'inactive'}
                    onChange={(e) => setIsActive(e.target.value === 'active')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs"
                  >
                    <option value="active">نشط ومتاح للبيع والمخزون</option>
                    <option value="inactive">معطل / مؤرشف (مخفي من البيع الافتراضي)</option>
                  </select>
                </div>
              </div>

              {/* Prescription / Controlled */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prescriptionRequired}
                    onChange={(e) => setPrescriptionRequired(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    يتطلب وصفة طبية (Prescription Required)
                  </span>
                </label>
                <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isControlled}
                    onChange={(e) => setIsControlled(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    دواء مراقب / جدول (Controlled Drug)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: Units Management */}
          {activeTab === 'units' && (
            <div className="space-y-5 text-xs">
              {/* Base Unit Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">الوحدة الأساسية (Base Unit)</h4>
                      <p className="text-[11px] text-slate-500">
                        الوحدة الصغرى التي يُحسب بها رصيد المخزن ومعاملات التحويل (معامل = 1 دائماً)
                      </p>
                    </div>
                  </div>
                  {historyCheck.hasHistory && (
                    <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold rounded-xl">
                      <Lock className="w-3.5 h-3.5" />
                      مقفلة لوجود معاملات
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      اسم الوحدة الأساسية
                    </label>
                    <input
                      type="text"
                      disabled={historyCheck.hasHistory}
                      value={baseUnit}
                      onChange={(e) => setBaseUnit(e.target.value)}
                      placeholder="مثال: حبة، مل، أمبولة"
                      className={`w-full px-3.5 py-2 rounded-xl border font-bold text-xs ${
                        historyCheck.hasHistory
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 cursor-not-allowed'
                          : 'bg-white dark:bg-slate-900 border-slate-300 text-slate-900 dark:text-white focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      سعر بيع الوحدة الأساسية (الجمهور)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      سعر تكلفة الشراء المرجعي
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs focus:border-emerald-500"
                    />
                  </div>
                </div>

                {historyCheck.hasHistory && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
                    🔒 لا يمكن تغيير اسم الوحدة الأساسية ({baseUnit}) لوجود حركات مسجلة للصنف: {historyCheck.reason}. هذا القيد يمنع تلف الحسابات والأرصدة المخزنية التاريخية.
                  </p>
                )}
              </div>

              {/* Selling Units Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">الوحدات البيعية والتحويلات</h4>
                    <p className="text-[11px] text-slate-500">
                      كل وحدة لها معامل تحويل وسعر بيع مستقل تماماً (مثال: شريط = 10 حبات، علبة = 100 حبة)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddUnitForm(!showAddUnitForm)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    + إضافة وحدة بيع
                  </button>
                </div>

                {/* Add Unit Sub-Form */}
                {showAddUnitForm && (
                  <form
                    onSubmit={handleAddUnit}
                    className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl space-y-3 animate-in fade-in"
                  >
                    <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                      <span>إضافة وحدة بيع جديدة</span>
                      <button
                        type="button"
                        onClick={() => setShowAddUnitForm(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick selection presets */}
                    <div>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">
                        اختيار سريع لوحدة شائعة:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_UNITS.map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setNewUnitName(u)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                              newUnitName === u
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 hover:border-emerald-400'
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          اسم الوحدة <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          placeholder="مثال: شريط، علبة"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-xs"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          معامل التحويل (كم {baseUnit}؟) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={newUnitFactor}
                          onChange={(e) => setNewUnitFactor(Number(e.target.value))}
                          placeholder="10"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          سعر بيع هذه الوحدة (مستقل)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={newUnitPrice}
                          onChange={(e) => setNewUnitPrice(Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddUnitForm(false)}
                        className="px-3 py-1.5 text-slate-600 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs"
                      >
                        تأكيد إضافة الوحدة
                      </button>
                    </div>
                  </form>
                )}

                {/* Units List */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {/* Base unit display row */}
                  <div className="p-3 bg-slate-50/80 dark:bg-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">{baseUnit}</span>
                        <span className="text-[11px] text-slate-500 mr-2">(الوحدة الأساسية)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500 font-mono text-[11px]">معامل: 1</span>
                      <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">
                        {Money.format(sellingPrice)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-md font-bold text-slate-600 dark:text-slate-300">
                        أساسية
                      </span>
                    </div>
                  </div>

                  {/* Configured selling units */}
                  {sellingUnits.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      لا توجد وحدات بيع إضافية مسجلة لهذا الصنف حتى الآن (يُباع بالـ {baseUnit} فقط).
                    </div>
                  ) : (
                    sellingUnits.map((u, idx) => (
                      <div
                        key={idx}
                        className={`p-3 flex items-center justify-between text-xs transition-colors ${
                          !u.is_active ? 'bg-amber-50/50 dark:bg-amber-950/20 opacity-70' : 'bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-indigo-500' : 'bg-amber-400'}`}
                          />
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">{u.unit_name}</span>
                            {!u.is_active && (
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 mr-2 font-bold">
                                (مؤرشفة - معطلة للبيع)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Conversion factor input */}
                          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            <span>1 {u.unit_name} =</span>
                            <input
                              type="number"
                              min="1"
                              value={u.conversion_factor}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setSellingUnits(
                                  sellingUnits.map((item, i) =>
                                    i === idx ? { ...item, conversion_factor: val } : item
                                  )
                                );
                              }}
                              className="w-14 px-1.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center font-bold"
                            />
                            <span>{baseUnit}</span>
                          </div>

                          {/* Price input */}
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 text-[11px]">السعر:</span>
                            <input
                              type="number"
                              min="0"
                              value={u.selling_price}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setSellingUnits(
                                  sellingUnits.map((item, i) =>
                                    i === idx ? { ...item, selling_price: val } : item
                                  )
                                );
                              }}
                              className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs"
                            />
                          </div>

                          {/* Action button */}
                          {u.is_active ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveUnit(u.unit_name)}
                              title="حذف أو أرشفة هذه الوحدة"
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReactivateUnit(u.unit_name)}
                              title="إعادة تنشيط هذه الوحدة"
                              className="px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-lg font-bold text-[10px]"
                            >
                              إعادة تفعيل
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Classification & Extra Info */}
          {activeTab === 'extra' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    التصنيف الدوائي (Category)
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:border-emerald-500"
                  >
                    <option value="">-- اختر التصنيف --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ar} {c.name_en ? `(${c.name_en})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Manufacturer */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الشركة المصنعة (Manufacturer)
                  </label>
                  <select
                    value={manufacturerId}
                    onChange={(e) => setManufacturerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs focus:border-emerald-500"
                  >
                    <option value="">-- اختر الشركة المصنعة --</option>
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name_ar} {m.country ? `(${m.country})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Country of Origin */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    بلد المنشأ (Country of Origin)
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="مثال: اليمن، مصر، الهند، ألمانيا"
                      className="w-full pr-9 pl-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Min Stock Level */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    حد النواقص الأدنى (Min Stock) بالـ {baseUnit}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={minStockLevel}
                    onChange={(e) => setMinStockLevel(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-xs"
                  />
                </div>

                {/* Reorder Level */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    نقطة إعادة الطلب (Reorder Level) بالـ {baseUnit}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-xs"
                  />
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الوصف والاستطباب والتعليمات
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ملاحظات حول طريقة الاستخدام، الحفظ، أو التحذيرات..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Audit Log */}
          {activeTab === 'audit' && isEditing && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  سجل التعديلات والتدقيق المحاسبي (Audit Trail)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  إجمالي العمليات: {productAuditLogs.length}
                </span>
              </div>

              {productAuditLogs.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs">
                  لا توجد سجلات تعديل تاريخية مسجلة لهذا الصنف بعد.
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {productAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                          {log.action}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {new Date(log.created_at).toLocaleString('ar-YE')}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 font-medium text-xs">
                        {log.reason || 'تحديث بيانات الصنف'}
                      </p>
                      <div className="text-[10px] text-slate-400 flex items-center gap-3">
                        <span>المستخدم: {log.user_id}</span>
                        <span>الجهاز: {log.device_id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {isEditing ? (
              <span>كود الصنف: <strong className="font-mono text-slate-700 dark:text-slate-300">{internalCode}</strong></span>
            ) : (
              <span>سيتم إدراج الصنف في الكتالوج فورياً</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ التغييرات والوحدات'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
