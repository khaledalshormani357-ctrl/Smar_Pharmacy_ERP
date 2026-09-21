import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Calendar,
  Building2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  ScanLine,
  Eye,
  FileText,
  X,
  Filter
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PurchaseService } from '../../services/PurchaseService';
import { Product, Supplier, User, Purchase, PurchaseItem, Manufacturer } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { PurchaseReturnModal } from './PurchaseReturnModal';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { SmartAssistantModal } from '../modals/SmartAssistantModal';
import { useBackHandler } from '../../hooks/useBackHandler';
import { normalizeArabicSearchText } from '../../utils/inputSafety';

interface PurchasesViewProps {
  currentUser: User;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ currentUser }) => {
  const [purchases, setPurchases] = useState(db.getState().purchases);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAssistantScanner, setShowAssistantScanner] = useState(false);
  const [selectedPurchaseForReturn, setSelectedPurchaseForReturn] = useState<Purchase | null>(null);
  const [selectedPurchaseForDetail, setSelectedPurchaseForDetail] = useState<Purchase | null>(null);

  // Search and Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'cash' | 'credit' | 'returned' | 'cancelled'>('all');

  // New / Correction Purchase Form
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('credit');
  const [discountVal, setDiscountVal] = useState(0);
  const [correctionNote, setCorrectionNote] = useState<string | null>(null);

  // Line Items
  const [items, setItems] = useState<
    Array<{
      product_id: string;
      batch_number: string;
      expiry_date: string;
      unit_name: string;
      unit_factor: number;
      quantity: number;
      unit_purchase_price: number;
      unit_selling_price: number;
    }>
  >([]);

  // Item selector in modal
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [qty, setQty] = useState(1);
  const [pPrice, setPPrice] = useState(0);
  const [sPrice, setSPrice] = useState(0);

  // Android Back navigation
  useBackHandler('modal-new-purchase', showNewModal, () => {
    if (items.length > 0) {
      if (confirm('توجد أصناف غير محفوظة في فاتورة الشراء. هل تريد التراجع والخروج؟')) {
        setShowNewModal(false);
        setItems([]);
        setCorrectionNote(null);
        return true;
      }
      return true; // Prevent closing if user declined
    }
    setShowNewModal(false);
    setCorrectionNote(null);
    return true;
  }, 100);

  useEffect(() => {
    loadData();
    const unsub = db.subscribe(() => {
      loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    const state = db.getState();
    setPurchases([...state.purchases].sort((a, b) => b.created_at - a.created_at));
    setSuppliers(state.suppliers.filter((s) => s.is_active));
    setProducts(state.products.filter((p) => p.is_active));
    setManufacturers(state.manufacturers || []);
  };

  const manufacturersMap = useMemo(() => {
    return new Map<string, string>(manufacturers.map((m) => [m.id, m.name_ar || m.name_en || '']));
  }, [manufacturers]);

  // High performance product search for invoice item selection (Trade, Generic, Active Ingredient, Manufacturer, Barcode, Code)
  const searchedProducts = useMemo(() => {
    const raw = productSearchTerm.trim();
    if (!raw) return products.slice(0, 15);
    const norm = normalizeArabicSearchText(raw);
    const lower = raw.toLowerCase();

    return products.filter((p) => {
      const nAr = normalizeArabicSearchText(p.name_ar || '');
      const nEn = (p.name_en || '').toLowerCase();
      const nGen = normalizeArabicSearchText(p.generic_name || '');
      const nAct = normalizeArabicSearchText(p.active_ingredient || '');
      const nCode = (p.internal_code || '').toLowerCase();
      const nBar = (p.barcode || '').toLowerCase();
      const nMan = p.manufacturer_id ? normalizeArabicSearchText(manufacturersMap.get(p.manufacturer_id) || '') : '';

      return (
        nAr.includes(norm) ||
        nEn.includes(lower) ||
        nGen.includes(norm) ||
        nAct.includes(norm) ||
        nCode.includes(lower) ||
        nBar.includes(lower) ||
        nMan.includes(norm)
      );
    }).slice(0, 25);
  }, [products, productSearchTerm, manufacturersMap]);

  const handleSelectProduct = (p: Product) => {
    setSelectedProductId(p.id);
    setPPrice(Money.toMajor(p.current_purchase_price));
    setSPrice(Money.toMajor(p.current_selling_price));
    setProductSearchTerm('');
    setShowProductDropdown(false);
  };

  const handleProductSearchChange = (val: string) => {
    setProductSearchTerm(val);
    setShowProductDropdown(true);

    const trimmed = val.trim();
    if (trimmed.length >= 4) {
      const exactBarcodeMatch = products.find((p) => p.barcode === trimmed);
      if (exactBarcodeMatch) {
        handleSelectProduct(exactBarcodeMatch);
      }
    }
  };

  // High-performance search and filter
  const filteredPurchases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const suppliersMap = new Map<string, string>(suppliers.map((s) => [s.id, s.name.toLowerCase()]));

    return purchases.filter((p) => {
      // 1. Status / Payment filter
      if (statusFilter === 'cash' && p.payment_type !== 'cash') return false;
      if (statusFilter === 'credit' && p.payment_type !== 'credit') return false;
      if (statusFilter === 'returned' && p.status !== 'returned_partially' && p.status !== 'returned_fully') return false;
      if (statusFilter === 'cancelled' && p.status !== 'cancelled') return false;

      // 2. Text Search
      if (!q) return true;
      const suppName = suppliersMap.get(p.supplier_id) || '';
      const invoiceNo = (p.invoice_number || '').toLowerCase();
      const internalNo = (p.internal_number || '').toLowerCase();
      const dateStr = (p.purchase_date || '').toLowerCase();
      const totalStr = (p.net_total / 100).toString();

      return (
        invoiceNo.includes(q) ||
        suppName.includes(q) ||
        internalNo.includes(q) ||
        dateStr.includes(q) ||
        totalStr.includes(q)
      );
    });
  }, [purchases, suppliers, searchQuery, statusFilter]);

  const handleAddItem = () => {
    if (!selectedProductId || !batchNo.trim() || !expiryDate || qty <= 0) {
      alert('يرجى ملء كافة بيانات الصنف والتشغيلة وتاريخ الصلاحية.');
      return;
    }

    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        batch_number: batchNo.trim().toUpperCase(),
        expiry_date: expiryDate,
        unit_name: prod.base_unit,
        unit_factor: 1,
        quantity: qty,
        unit_purchase_price: Money.toMinor(pPrice),
        unit_selling_price: Money.toMinor(sPrice)
      }
    ]);

    // Reset item form
    setSelectedProductId('');
    setProductSearchTerm('');
    setShowProductDropdown(false);
    setBatchNo('');
    setQty(1);
    setPPrice(0);
    setSPrice(0);
  };

  const handleSavePurchase = () => {
    if (!supplierId || !invoiceNumber.trim() || items.length === 0) {
      alert('يرجى تحديد المورد، رقم الفاتورة، وإضافة صنف واحد على الأقل.');
      return;
    }

    try {
      const cashbox = db.getState().cashboxes[0];
      PurchaseService.createPurchase({
        supplier_id: supplierId,
        invoice_number: invoiceNumber.trim(),
        payment_type: paymentType,
        cashbox_id: cashbox ? cashbox.id : 'cash-01',
        user_id: currentUser.id,
        discount_amount: Money.toMinor(discountVal),
        notes: correctionNote || undefined,
        items
      });

      setShowNewModal(false);
      setItems([]);
      setInvoiceNumber('');
      setSupplierId('');
      setDiscountVal(0);
      setCorrectionNote(null);
    } catch (err: any) {
      alert(err.message || 'فشل إدخال فاتورة الشراء');
    }
  };

  // Safe accounting correction handler
  const handleInitiateCorrection = (original: Purchase, originalItems: PurchaseItem[]) => {
    if (
      !confirm(
        `لتعديل وتصحيح الفاتورة رقم (${original.invoice_number}):\n\nوفق المعايير المحاسبية الرقابية، سيتم أولاً إلغاء الفاتورة الحالية وعكس قيودها المخزنية والمالية، ثم تحميل بنودها في نموذج الفاتورة لإجراء التعديلات المطلوبة وحفظها كفاتورة مصححة.\n\nهل تريد المتابعة؟`
      )
    ) {
      return;
    }

    try {
      PurchaseService.cancelPurchase(
        original.id,
        `إلغاء لغرض التعديل والتصحيح - استبدال بفاتورة معدلة`,
        currentUser.id
      );

      // Load data into form
      setSupplierId(original.supplier_id);
      setInvoiceNumber(original.invoice_number);
      setPaymentType(original.payment_type);
      setDiscountVal(Money.toMajor(original.discount_amount));
      setCorrectionNote(`فاتورة مصححة بديلة عن الفاتورة الملغاة ${original.invoice_number}`);

      const mappedItems = originalItems.map((it) => {
        const prod = products.find((p) => p.id === it.product_id);
        return {
          product_id: it.product_id,
          batch_number: it.batch_number,
          expiry_date: it.expiry_date,
          unit_name: it.unit_name,
          unit_factor: it.unit_factor,
          quantity: it.quantity,
          unit_purchase_price: it.unit_purchase_price,
          unit_selling_price: prod?.current_selling_price || it.unit_purchase_price
        };
      });

      setItems(mappedItems);
      setSelectedPurchaseForDetail(null);
      setShowNewModal(true);
    } catch (err: any) {
      alert(`تعذر بدء عملية التصحيح: ${err.message}`);
    }
  };

  const subtotalMinor = items.reduce(
    (sum, it) => sum + it.quantity * it.unit_purchase_price,
    0
  );
  const netTotalMinor = Math.max(0, subtotalMinor - Money.toMinor(discountVal));

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto md:max-w-3xl pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">سجل فواتير الشراء والتوريد</h2>
          <p className="text-xs text-slate-500">استلام طلبيات الأدوية، البحث، التعديل والتصحيح الرقابي</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowAssistantScanner(true)}
            className="flex-1 sm:flex-none px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
            title="مسح فاتورة المشتريات بالذكاء الاصطناعي (Gemini Vision OCR)"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>مسح ذكي (AI)</span>
          </button>

          <button
            onClick={() => {
              setSelectedPurchaseForReturn(null);
              setShowReturnModal(true);
            }}
            className="flex-1 sm:flex-none px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            title="إنشاء مردود مشتريات"
          >
            <RotateCcw className="w-4 h-4" />
            <span>مردود</span>
          </button>

          <button
            onClick={() => {
              setCorrectionNote(null);
              setShowNewModal(true);
            }}
            className="flex-1 sm:flex-none px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة شراء</span>
          </button>
        </div>
      </div>

      {/* Fast Search & Filter Bar (DEFECT-04 FIX) */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-xs space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الفاتورة، اسم المورد، التاريخ، أو المبلغ..."
            className="w-full pr-9 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status / Type Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] font-medium no-scrollbar">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({purchases.length})
          </button>
          <button
            onClick={() => setStatusFilter('cash')}
            className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
              statusFilter === 'cash'
                ? 'bg-emerald-700 text-white font-bold'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            نقدي
          </button>
          <button
            onClick={() => setStatusFilter('credit')}
            className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
              statusFilter === 'credit'
                ? 'bg-amber-700 text-white font-bold'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            آجل
          </button>
          <button
            onClick={() => setStatusFilter('returned')}
            className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
              statusFilter === 'returned'
                ? 'bg-indigo-700 text-white font-bold'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            مردود
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
              statusFilter === 'cancelled'
                ? 'bg-rose-700 text-white font-bold'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            ملغاة
          </button>
        </div>
      </div>

      {/* List of Purchases */}
      <div className="space-y-2.5">
        {filteredPurchases.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-400">
            <Truck className="w-12 h-12 stroke-[1.2] mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold">
              {searchQuery || statusFilter !== 'all'
                ? 'لا توجد فواتير تطابق معايير البحث والفلترة'
                : 'لم يتم تسجيل فواتير شراء حتى الآن'}
            </p>
          </div>
        ) : (
          filteredPurchases.map((p) => {
            const supplier = suppliers.find((s) => s.id === p.supplier_id);
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPurchaseForDetail(p)}
                className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2 hover:border-blue-400/80 hover:shadow-sm cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 font-mono">
                        فاتورة: {p.invoice_number}
                      </span>
                      {p.status === 'cancelled' && (
                        <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded">
                          ملغاة
                        </span>
                      )}
                      {p.status === 'returned_partially' && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                          مردود جزئي
                        </span>
                      )}
                      {p.status === 'returned_fully' && (
                        <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded">
                          مردود بالكامل
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-slate-700">{supplier?.name || 'مورد'}</span>
                      <span>•</span>
                      <span className="font-mono">{p.purchase_date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-lg ${
                        p.payment_type === 'cash'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {p.payment_type === 'cash' ? 'نقدي' : 'آجل'}
                    </span>

                    <button
                      onClick={() => setSelectedPurchaseForDetail(p)}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="عرض التفاصيل والتعديل"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="text-[11px]">تفاصيل</span>
                    </button>

                    {p.status !== 'cancelled' && p.status !== 'returned_fully' && (
                      <button
                        onClick={() => {
                          setSelectedPurchaseForReturn(p);
                          setShowReturnModal(true);
                        }}
                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="إرجاع أصناف من هذه الفاتورة للمورد"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="text-[11px]">إرجاع</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">إجمالي الفاتورة:</span>
                  <span className="font-bold font-mono text-sm text-slate-900" dir="ltr">
                    {Money.format(p.net_total)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New / Correction Purchase Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {correctionNote ? 'تعديل وتصحيح فاتورة شراء' : 'تسجيل فاتورة شراء وتوريد جديدة'}
                </h3>
                {correctionNote && (
                  <p className="text-[11px] text-amber-700 mt-0.5 font-medium">{correctionNote}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setCorrectionNote(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">المورد *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">رقم فاتورة المورد *</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-9921"
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">طريقة السداد:</span>
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPaymentType('credit')}
                      className={`px-3 py-1 font-bold rounded-lg ${
                        paymentType === 'credit' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      آجل
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType('cash')}
                      className={`px-3 py-1 font-bold rounded-lg ${
                        paymentType === 'cash' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      نقداً
                    </button>
                  </div>
                </div>

                <div className="w-36">
                  <label className="block text-slate-700 font-semibold text-[10px] mb-0.5">الخصم الممنوح</label>
                  <NumericInput value={discountVal} onChange={setDiscountVal} className="py-1 text-xs" />
                </div>
              </div>

              {/* Add Line Item Box */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block">إضافة صنف للشحنة</span>

                {/* Product Search & Selection */}
                {selectedProductId ? (
                  (() => {
                    const selProd = products.find((p) => p.id === selectedProductId);
                    if (!selProd) return null;
                    const mfgName = selProd.manufacturer_id ? manufacturersMap.get(selProd.manufacturer_id) : '';

                    return (
                      <div className="p-3 bg-white border-2 border-emerald-500/40 rounded-2xl shadow-xs space-y-1.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{selProd.name_ar}</span>
                              {selProd.name_en && (
                                <span className="text-xs text-slate-500 font-medium">({selProd.name_en})</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                              {selProd.internal_code && (
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-bold">
                                  كود: {selProd.internal_code}
                                </span>
                              )}
                              {selProd.barcode && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono font-bold border border-emerald-200">
                                  باركود: {selProd.barcode}
                                </span>
                              )}
                              {mfgName && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium border border-blue-100">
                                  {mfgName}
                                </span>
                              )}
                            </div>
                            {(selProd.generic_name || selProd.active_ingredient) && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                {selProd.generic_name && <span>علمي: {selProd.generic_name}</span>}
                                {selProd.generic_name && selProd.active_ingredient && ' • '}
                                {selProd.active_ingredient && <span>المادة الفعالة: {selProd.active_ingredient}</span>}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductId('');
                              setShowProductDropdown(true);
                            }}
                            className="px-2.5 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            تغيير الصنف
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="relative space-y-1.5">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={productSearchTerm}
                        onChange={(e) => handleProductSearchChange(e.target.value)}
                        onFocus={() => setShowProductDropdown(true)}
                        placeholder="ابحث بالاسم التجاري، العلمي، المادة الفعالة، الشركة، الكود، أو امسح الباركود..."
                        className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                      />
                      {productSearchTerm && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearchTerm('');
                            setShowProductDropdown(false);
                          }}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {showProductDropdown && (
                      <div className="max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 z-10 relative">
                        {searchedProducts.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            لا توجد أصناف مطابقة لبحثك
                          </div>
                        ) : (
                          searchedProducts.map((p) => {
                            const mfg = p.manufacturer_id ? manufacturersMap.get(p.manufacturer_id) : '';
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectProduct(p)}
                                className="w-full text-right p-2.5 hover:bg-emerald-50/50 transition-colors flex items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                    <span>{p.name_ar}</span>
                                    {p.name_en && <span className="text-slate-500 font-normal">({p.name_en})</span>}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[10px] text-slate-500">
                                    {p.internal_code && (
                                      <span className="bg-slate-100 px-1 py-0.2 rounded font-mono">
                                        كود: {p.internal_code}
                                      </span>
                                    )}
                                    {p.barcode && (
                                      <span className="bg-emerald-50 text-emerald-700 px-1 py-0.2 rounded font-mono">
                                        باركود: {p.barcode}
                                      </span>
                                    )}
                                    {mfg && (
                                      <span className="text-slate-600">
                                        شركة: {mfg}
                                      </span>
                                    )}
                                    {p.generic_name && (
                                      <span className="text-slate-500">
                                        علمي: {p.generic_name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-left shrink-0">
                                  <span className="text-[11px] font-mono font-bold text-emerald-700 block">
                                    شراء: {Money.format(p.current_purchase_price)}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 block">
                                    بيع: {Money.format(p.current_selling_price)}
                                  </span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-0.5">رقم التشغيلة (Batch)</label>
                    <input
                      type="text"
                      value={batchNo}
                      onChange={(e) => setBatchNo(e.target.value)}
                      placeholder="B-2026-X"
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-0.5">تاريخ الصلاحية</label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-0.5">الكمية</label>
                    <NumericInput value={qty} onChange={setQty} className="py-1 text-xs text-center" />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-0.5">سعر الشراء</label>
                    <NumericInput value={pPrice} onChange={setPPrice} className="py-1 text-xs" />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-0.5">سعر البيع</label>
                    <NumericInput value={sPrice} onChange={setSPrice} className="py-1 text-xs" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-[0.99] transition-all"
                >
                  + إضافة الصنف للفاتورة
                </button>
              </div>

              {/* Items Table */}
              {items.length > 0 && (
                <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl p-2 max-h-36 overflow-y-auto">
                  {items.map((it, idx) => {
                    const prod = products.find((p) => p.id === it.product_id);
                    return (
                      <div key={idx} className="py-1.5 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-bold text-slate-800">{prod?.name_ar}</span>
                          <span className="text-slate-400 font-mono block">
                            دفعة: {it.batch_number} • انتهاء: {it.expiry_date}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">
                            {it.quantity} × {Money.format(it.unit_purchase_price)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Totals & Submit */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-700">صافي الفاتورة:</span>
                <span className="text-base font-extrabold font-mono text-blue-600" dir="ltr">
                  {Money.format(netTotalMinor)}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={handleSavePurchase}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                >
                  حفظ الفاتورة وتحديث الأرصدة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    setCorrectionNote(null);
                  }}
                  className="px-4 py-3 text-slate-400 font-semibold hover:text-slate-600"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal (DEFECT-04 FIX) */}
      {selectedPurchaseForDetail && (
        <PurchaseDetailModal
          purchase={selectedPurchaseForDetail}
          currentUser={currentUser}
          onClose={() => setSelectedPurchaseForDetail(null)}
          onInitiateReturn={(p) => {
            setSelectedPurchaseForReturn(p);
            setShowReturnModal(true);
          }}
          onInitiateCorrection={handleInitiateCorrection}
          onInvoiceCancelled={() => {
            loadData();
          }}
        />
      )}

      {/* Purchase Return Modal */}
      {showReturnModal && (
        <PurchaseReturnModal
          currentUser={currentUser}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedPurchaseForReturn(null);
          }}
          preselectedPurchase={selectedPurchaseForReturn}
          onReturnSuccess={() => {
            loadData();
          }}
        />
      )}

      {/* Assistant Scanner Modal */}
      {showAssistantScanner && (
        <SmartAssistantModal
          onClose={() => setShowAssistantScanner(false)}
          currentUser={currentUser}
          currentScreen="purchases"
          onNavigate={() => {}}
        />
      )}
    </div>
  );
};
