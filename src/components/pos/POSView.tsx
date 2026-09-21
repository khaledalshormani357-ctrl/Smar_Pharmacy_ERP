import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Barcode,
  Trash2,
  CheckCircle2,
  Printer,
  Share2,
  Download,
  AlertCircle,
  Layers,
  UserPlus,
  Eye,
  History,
  RotateCcw
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { InventoryService } from '../../services/InventoryService';
import { SalesService } from '../../services/SalesService';
import { DocumentService } from '../../services/DocumentService';
import { CustomerRepository, SaleRepository } from '../../db/repositories';
import { CartItem, Customer, Sale, User } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { NewCustomerModal } from './NewCustomerModal';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { SaleReturnModal } from './SaleReturnModal';

interface POSViewProps {
  currentUser: User;
  onSaleCompleted?: (sale: Sale) => void;
}

export const POSView: React.FC<POSViewProps> = ({ currentUser, onSaleCompleted }) => {
  const [products, setProducts] = useState(InventoryService.getProductsWithStock());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-cash');
  const [saleType, setSaleType] = useState<'cash' | 'credit'>('cash');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountVal, setDiscountVal] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals state
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [showRecentInvoices, setShowRecentInvoices] = useState(false);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<Sale | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    const unsub = db.subscribe(() => {
      loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    setProducts(InventoryService.getProductsWithStock());
    setCustomers(CustomerRepository.getAll());
    setRecentSales(SaleRepository.getAll().slice(0, 10));
  };

  // Selected Customer Details
  const currentCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Barcode / Search Filter (supports barcode, code, name_ar, English/generic name)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => (
      p.name_ar.toLowerCase().includes(q) ||
      (p.name_en && p.name_en.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase() === q) ||
      (p.generic_name && p.generic_name.toLowerCase().includes(q)) ||
      p.internal_code.toLowerCase().includes(q)
    ));
  }, [products, searchQuery]);

  const displayedFilteredProducts = useMemo(() => {
    return filteredProducts.slice(0, 30);
  }, [filteredProducts]);

  // Handle direct barcode scanner hit (Exact match adds automatically)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const exactBarcode = products.find((p) => p.barcode && p.barcode.trim() === searchQuery.trim());
      if (exactBarcode) {
        addToCart(exactBarcode);
        setSearchQuery('');
        return;
      }
      if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0]);
        setSearchQuery('');
      }
    }
  };

  const addToCart = (product: any) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (product.totalBaseStock <= 0) {
      setErrorMsg(`عذراً، الصنف "${product.name_ar}" نفد من المخزون القابل للصرف تماماً.`);
      return;
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.productId === product.id);
      const defaultUnit =
        product.conversions.find((u: any) => u.is_default_sale) ||
        product.conversions[0] || {
          unit_name: product.base_unit,
          conversion_factor: 1,
          selling_price: product.current_selling_price
        };

      if (existingIdx !== -1) {
        const item = prev[existingIdx];
        const newQty = item.quantity + 1;
        const baseNeeded = Math.round(newQty * item.unitFactor);
        if (baseNeeded > product.totalBaseStock) {
          setErrorMsg(
            `الكمية المطلوبة تتجاوز الرصيد المتاح بالمخزن (${product.totalBaseStock} ${product.base_unit}).`
          );
          return prev;
        }

        const updated = [...prev];
        updated[existingIdx] = { ...item, quantity: newQty };
        return updated;
      }

      const availableUnits = product.conversions.map((uc: any) => ({
        unitName: uc.unit_name,
        factor: uc.conversion_factor,
        price: uc.selling_price
      }));

      const newItem: CartItem = {
        productId: product.id,
        productName: product.name_ar,
        genericName: product.generic_name,
        barcode: product.barcode,
        unitName: defaultUnit.unit_name,
        unitFactor: defaultUnit.conversion_factor,
        quantity: 1,
        unitPrice: defaultUnit.selling_price,
        discountAmount: 0,
        availableUnits,
        availableStockBase: product.totalBaseStock
      };

      return [newItem, ...prev];
    });
  };

  const updateQuantity = (index: number, newQty: number) => {
    setErrorMsg(null);
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) => {
      const item = prev[index];
      const baseNeeded = Math.round(newQty * item.unitFactor);
      if (baseNeeded > item.availableStockBase) {
        setErrorMsg(`الكمية تتجاوز الرصيد المتاح بالمخزن (${item.availableStockBase}).`);
        return prev;
      }
      const updated = [...prev];
      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  const updateLineDiscount = (index: number, discountMajor: number) => {
    const discountMinor = Money.toMinor(discountMajor);
    setCart((prev) => {
      const item = prev[index];
      const lineGross = item.unitPrice * item.quantity;
      const boundedDiscount = Math.min(lineGross, Math.max(0, discountMinor));
      const updated = [...prev];
      updated[index] = { ...item, discountAmount: boundedDiscount };
      return updated;
    });
  };

  const changeUnit = (index: number, unitName: string) => {
    setCart((prev) => {
      const item = prev[index];
      const targetUnit = item.availableUnits.find((u) => u.unitName === unitName);
      if (!targetUnit) return prev;

      const baseNeeded = Math.round(item.quantity * targetUnit.factor);
      if (baseNeeded > item.availableStockBase) {
        setErrorMsg(`الرصيد لا يكفي لاختيار وحدة ${targetUnit.unitName} بهذه الكمية.`);
        return prev;
      }

      const updated = [...prev];
      updated[index] = {
        ...item,
        unitName: targetUnit.unitName,
        unitFactor: targetUnit.factor,
        unitPrice: targetUnit.price
      };
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Financial calculations
  const subtotalMinor = cart.reduce(
    (sum, item) => sum + (item.unitPrice * item.quantity - item.discountAmount),
    0
  );
  const discountMinor = Money.toMinor(discountVal);
  const discountedSubtotal = Math.max(0, subtotalMinor - discountMinor);

  // Configured VAT
  const profileTaxRateBps = db.getState().profile?.tax_rate_bps || 0;
  const taxMinor = profileTaxRateBps > 0 ? Math.round((discountedSubtotal * profileTaxRateBps) / 10000) : 0;
  const netTotalMinor = discountedSubtotal + taxMinor;

  // Submit Sale with Atomic Guarantee and Idempotency Protection
  const handleCheckout = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (cart.length === 0) {
      setErrorMsg('سلة المبيعات فارغة.');
      return;
    }
    if (saleType === 'credit' && (!selectedCustomerId || selectedCustomerId === 'cust-cash')) {
      setErrorMsg('يجب تحديد عميل ذمة مسجل بالاسم عند البيع الآجل.');
      return;
    }

    // Guard against rapid duplicate clicks
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const cashbox = db.getState().cashboxes.find((c) => c.is_active) || db.getState().cashboxes[0];
      const idempotencyKey = `pos-sale-${currentUser.id}-${Date.now()}`;

      const newSale = SalesService.createSale({
        customer_id: selectedCustomerId,
        user_id: currentUser.id,
        sale_type: saleType,
        cashbox_id: cashbox ? cashbox.id : 'cash-01',
        items: cart,
        discount_amount: discountMinor,
        tax_rate_bps: profileTaxRateBps,
        notes: notes.trim(),
        idempotency_key: idempotencyKey
      });

      setLastCompletedSale(newSale);
      setCart([]);
      setDiscountVal(0);
      setNotes('');
      if (saleType === 'credit') {
        setSelectedCustomerId('cust-cash');
        setSaleType('cash');
      }

      if (onSaleCompleted) onSaleCompleted(newSale);
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ غير متوقع أثناء معالجة الفاتورة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = (paperSize: '80mm' | 'A4') => {
    if (!lastCompletedSale) return;
    const state = db.getState();
    const items = state.sale_items.filter((si) => si.sale_id === lastCompletedSale.id);
    const customer = state.customers.find((c) => c.id === lastCompletedSale.customer_id);
    const namesMap: Record<string, string> = {};
    state.products.forEach((p) => {
      namesMap[p.id] = p.name_ar;
    });

    DocumentService.printReceipt(lastCompletedSale, items, state.profile, customer, namesMap, paperSize);
  };

  const handleCancelSale = (saleId: string, reason: string) => {
    try {
      SalesService.cancelSale(saleId, reason, currentUser.id);
      setSuccessMsg('تم إلغاء الفاتورة ورد المخزون والقيود المالية بنجاح.');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر إلغاء الفاتورة.');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-lg mx-auto md:max-w-3xl bg-slate-50 relative">
      {/* Top Search & Barcode Input Header */}
      <div className="p-3 bg-white border-b border-slate-200 shrink-0 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <Search className="w-5 h-5 text-slate-400 absolute right-3 pointer-events-none" />
            <input
              id="pos-search-input"
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ابحث بالاسم التجاري، العلمي، أو امسح الباركود..."
              className="w-full pr-10 pl-10 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
            />
            <button
              onClick={() => searchInputRef.current?.focus()}
              className="absolute left-2.5 p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100"
              title="ماسح الباركود نشط"
            >
              <Barcode className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => setShowRecentInvoices(!showRecentInvoices)}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all ${
              showRecentInvoices
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="سجل آخر الفواتير"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">الفواتير</span>
          </button>

          <button
            onClick={() => {
              setSelectedSaleForReturn(null);
              setShowReturnModal(true);
            }}
            className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold flex items-center gap-1 transition-all"
            title="إنشاء مردود مبيعات"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">مرتجع</span>
          </button>
        </div>

        {/* Live Search Suggestions Dropdown */}
        {searchQuery.trim() !== '' && (
          <div className="mt-2 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 z-30">
            {filteredProducts.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">لا يوجد دواء مطابق لهذا البحث</div>
            ) : (
              <>
                {displayedFilteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      addToCart(p);
                      setSearchQuery('');
                    }}
                    className="w-full p-2.5 text-right flex items-center justify-between hover:bg-emerald-50/60 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <span>{p.name_ar}</span>
                        {p.isNearExpiry && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md font-semibold">
                            قريب الانتهاء
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {p.generic_name || p.internal_code}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-bold font-mono text-emerald-700 text-xs">
                        {Money.format(p.current_selling_price)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        متاح: {p.totalBaseStock} {p.base_unit}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredProducts.length > 30 && (
                  <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 font-medium">
                    يتم عرض أول 30 نتيجة من أصل {filteredProducts.length} دواء مطابق. حدد البحث لمزيد من الدقة.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="mx-3 mt-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="mx-3 mt-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Recent Invoices Drawer View */}
      {showRecentInvoices ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between pb-1 text-xs font-bold text-slate-700">
            <span>آخر الفواتير الصادرة ({recentSales.length})</span>
            <button
              onClick={() => setShowRecentInvoices(false)}
              className="text-xs text-emerald-600 hover:underline"
            >
              العودة لشاشة البيع
            </button>
          </div>
          {recentSales.map((s) => {
            const customer = customers.find((c) => c.id === s.customer_id);
            return (
              <div
                key={s.id}
                className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-slate-800">{s.invoice_number}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        s.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-700'
                          : s.sale_type === 'credit'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {s.status === 'cancelled' ? 'ملغاة' : s.sale_type === 'credit' ? 'آجل' : 'نقدي'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {customer ? customer.name : 'عميل نقدي عام'} •{' '}
                    <span dir="ltr">{new Date(s.created_at).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-left font-mono font-bold text-slate-900 text-xs">
                    {Money.format(s.net_total)}
                  </div>
                  {s.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        setSelectedSaleForReturn(s);
                        setShowReturnModal(true);
                      }}
                      className="p-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                      title="إرجاع أصناف من هذه الفاتورة"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPreviewSale(s);
                    }}
                    className="p-1.5 bg-slate-100 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="معاينة الفاتورة وإلغائها"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Cart Items List */
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
              <Layers className="w-12 h-12 stroke-[1.2] mb-2 text-slate-300" />
              <p className="text-sm font-semibold">فاتورة البيع فارغة</p>
              <p className="text-xs text-slate-400 mt-1">ابحث عن دواء أو امسح الباركود لبدء البيع السريع</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={item.productId}
                className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{item.productName}</h4>
                    {item.genericName && (
                      <p className="text-[11px] text-slate-400 truncate">{item.genericName}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeFromCart(idx)}
                    className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Unit Selector & Quantity Counter */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  {/* Available Unit Switcher */}
                  <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                    {item.availableUnits.map((u) => (
                      <button
                        key={u.unitName}
                        onClick={() => changeUnit(idx, u.unitName)}
                        className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all ${
                          item.unitName === u.unitName
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {u.unitName}
                      </button>
                    ))}
                  </div>

                  {/* Counter */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                      <button
                        onClick={() => updateQuantity(idx, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-slate-700 font-bold shadow-xs active:scale-95"
                      >
                        -
                      </button>
                      <span className="w-9 text-center font-mono font-bold text-sm text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(idx, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shadow-xs active:scale-95"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-left font-mono font-bold text-slate-900 text-sm min-w-16">
                      {Money.format(item.unitPrice * item.quantity - item.discountAmount, '')}
                    </div>
                  </div>
                </div>

                {/* Line Discount Input */}
                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  <span className="text-[11px] text-slate-400">سعر الوحدة: {Money.format(item.unitPrice)}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">خصم السطر:</span>
                    <NumericInput
                      value={Money.toMajor(item.discountAmount)}
                      onChange={(val) => updateLineDiscount(idx, val)}
                      placeholder="0.00"
                      className="py-1 px-2 text-xs text-center w-20 h-7"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* POS Bottom Panel: Customer, Sale Type & Checkout */}
      <div className="bg-white border-t border-slate-200 p-3 shadow-lg shrink-0 space-y-3 pb-20">
        {/* Customer & Payment Type Toggle */}
        <div className="flex items-center gap-2">
          {/* Customer Dropdown with Quick Add Button */}
          <div className="flex-1 flex items-center gap-1">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700"
            >
              <option value="cust-cash">عميل نقدي عام</option>
              {customers
                .filter((c) => c.id !== 'cust-cash')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
            </select>
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors"
              title="إضافة عميل جديد"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>

          {/* Sale Type Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setSaleType('cash')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                saleType === 'cash' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              نقداً
            </button>
            <button
              onClick={() => setSaleType('credit')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                saleType === 'credit' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              آجل (ذمة)
            </button>
          </div>
        </div>

        {/* Customer Balance Banner if Credit Sale */}
        {saleType === 'credit' && currentCustomer && currentCustomer.id !== 'cust-cash' && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs flex justify-between items-center text-amber-900">
            <span>الرصيد السابق بذمة العميل:</span>
            <span className="font-mono font-bold">{Money.format(currentCustomer.cached_balance)}</span>
          </div>
        )}

        {/* Discount, Tax & Totals Line */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2 w-40">
            <span className="text-xs text-slate-500 font-medium shrink-0">خصم الفاتورة:</span>
            <NumericInput
              value={discountVal}
              onChange={setDiscountVal}
              placeholder="0.00"
              className="py-1.5 text-xs text-center"
            />
          </div>

          <div className="text-left">
            {profileTaxRateBps > 0 && (
              <div className="text-[10px] text-slate-400">
                شامل ضريبة {profileTaxRateBps / 100}% (+{Money.format(taxMinor)})
              </div>
            )}
            <div className="text-[11px] text-slate-400 font-medium">الصافي المطلوب:</div>
            <div className="text-xl font-extrabold font-mono text-emerald-700 tracking-tight" dir="ltr">
              {Money.format(netTotalMinor)}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          id="btn-checkout-sale"
          disabled={cart.length === 0 || isSubmitting}
          onClick={handleCheckout}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>
            {isSubmitting ? 'جاري المعالجة والحفظ...' : `إتمام الفاتورة وحفظ السند (${cart.length} أصناف)`}
          </span>
        </button>
      </div>

      {/* Sale Completion Modal / Print Dialog */}
      {lastCompletedSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">تم إصدار الفاتورة بنجاح!</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              رقم الفاتورة: {lastCompletedSale.invoice_number}
            </p>

            <div className="my-4 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-100 w-full flex justify-between items-center font-mono">
              <span className="text-xs text-slate-500">المبلغ الإجمالي:</span>
              <span className="text-base font-bold text-slate-900">
                {Money.format(lastCompletedSale.net_total)}
              </span>
            </div>

            {/* Print & Share Actions */}
            <div className="grid grid-cols-2 gap-2 w-full mb-2">
              <button
                onClick={() => handlePrint('80mm')}
                className="py-2.5 px-3 bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-800"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة حراري 80mm</span>
              </button>

              <button
                onClick={() => handlePrint('A4')}
                className="py-2.5 px-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-200"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة قياسي A4</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full mb-3">
              <button
                onClick={async () => {
                  try {
                    const doc = DocumentService.buildSaleInvoiceDoc(lastCompletedSale.id);
                    await DocumentService.downloadDocumentPdf(doc, '80mm');
                  } catch (e: any) {
                    setErrorMsg(e?.message || 'فشل تنزيل PDF');
                  }
                }}
                className="py-2 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>تنزيل فاتورة PDF</span>
              </button>

              <button
                onClick={() => {
                  const state = db.getState();
                  const cust = state.customers.find((c) => c.id === lastCompletedSale.customer_id);
                  const doc = DocumentService.buildSaleInvoiceDoc(lastCompletedSale.id);
                  DocumentService.shareViaWhatsApp(doc, cust?.phone);
                }}
                className="py-2 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                <span>واتساب</span>
              </button>
            </div>

            <button
              onClick={() => setLastCompletedSale(null)}
              className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
            >
              إغلاق وبدء فاتورة جديدة
            </button>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      <NewCustomerModal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        onCustomerCreated={(customer) => {
          setSelectedCustomerId(customer.id);
          setSaleType('credit');
        }}
        userId={currentUser.id}
      />

      {/* Invoice Preview Modal (supports viewing & cancellation) */}
      {previewSale && (
        <InvoicePreviewModal
          isOpen={!!previewSale}
          onClose={() => setPreviewSale(null)}
          sale={previewSale}
          items={SaleRepository.getItems(previewSale.id)}
          customer={customers.find((c) => c.id === previewSale.customer_id)}
          onCancelSale={handleCancelSale}
        />
      )}

      {/* Sale Return Modal */}
      {showReturnModal && (
        <SaleReturnModal
          currentUser={currentUser}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedSaleForReturn(null);
          }}
          preselectedSale={selectedSaleForReturn}
          onReturnSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};
