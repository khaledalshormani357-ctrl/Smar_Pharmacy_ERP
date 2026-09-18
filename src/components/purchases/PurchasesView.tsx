import React, { useState, useEffect } from 'react';
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
  ScanLine
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PurchaseService } from '../../services/PurchaseService';
import { Product, Supplier, User, Purchase } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { PurchaseReturnModal } from './PurchaseReturnModal';
import { SmartAssistantModal } from '../modals/SmartAssistantModal';

interface PurchasesViewProps {
  currentUser: User;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ currentUser }) => {
  const [purchases, setPurchases] = useState(db.getState().purchases);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAssistantScanner, setShowAssistantScanner] = useState(false);
  const [selectedPurchaseForReturn, setSelectedPurchaseForReturn] = useState<Purchase | null>(null);

  // New Purchase Form
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('credit');
  const [discountVal, setDiscountVal] = useState(0);

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
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [qty, setQty] = useState(1);
  const [pPrice, setPPrice] = useState(0);
  const [sPrice, setSPrice] = useState(0);

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
  };

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
        items
      });

      setShowNewModal(false);
      setItems([]);
      setInvoiceNumber('');
      setSupplierId('');
      setDiscountVal(0);
    } catch (err: any) {
      alert(err.message || 'فشل إدخال فاتورة الشراء');
    }
  };

  const subtotalMinor = items.reduce(
    (sum, it) => sum + it.quantity * it.unit_purchase_price,
    0
  );
  const netTotalMinor = Math.max(0, subtotalMinor - Money.toMinor(discountVal));

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto md:max-w-2xl pb-24">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">سجل فواتير الشراء والتوريد</h2>
          <p className="text-xs text-slate-500">استلام طلبيات الأدوية وإدخال الدفعات الجديدة</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAssistantScanner(true)}
            className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
            title="مسح فاتورة المشتريات بالذكاء الاصطناعي (Gemini Vision OCR)"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>مسح فاتورة ذكية (AI)</span>
          </button>

          <button
            onClick={() => {
              setSelectedPurchaseForReturn(null);
              setShowReturnModal(true);
            }}
            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
            title="إنشاء مردود مشتريات"
          >
            <RotateCcw className="w-4 h-4" />
            <span>مردود مشتريات</span>
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة شراء</span>
          </button>
        </div>
      </div>

      {/* List of Purchases */}
      <div className="space-y-2.5">
        {purchases.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-400">
            <Truck className="w-12 h-12 stroke-[1.2] mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold">لم يتم تسجيل فواتير شراء حتى الآن</p>
          </div>
        ) : (
          purchases.map((p) => {
            const supplier = suppliers.find((s) => s.id === p.supplier_id);
            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 font-mono">
                        فاتورة: {p.invoice_number}
                      </span>
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
                      <span>{supplier?.name || 'مورد'}</span>
                      <span>•</span>
                      <span>{p.purchase_date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-lg ${
                        p.payment_type === 'cash'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {p.payment_type === 'cash' ? 'نقدي' : 'آجل'}
                    </span>

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

      {/* New Purchase Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-3">تسجيل فاتورة شراء وتوريد جديدة</h3>

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

              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">نوع السداد:</span>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPaymentType('credit')}
                    className={`px-3 py-1 font-bold rounded-lg ${
                      paymentType === 'credit' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    آجل (حساب مورد)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('cash')}
                    className={`px-3 py-1 font-bold rounded-lg ${
                      paymentType === 'cash' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    نقداً من الصندوق
                  </button>
                </div>
              </div>

              {/* Add Line Item Box */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block">إضافة صنف للشحنة</span>

                <div>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      const p = products.find((x) => x.id === e.target.value);
                      if (p) {
                        setPPrice(Money.toMajor(p.current_purchase_price));
                        setSPrice(Money.toMajor(p.current_selling_price));
                      }
                    }}
                    className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl"
                  >
                    <option value="">-- اختر الدواء --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name_ar} ({p.internal_code})
                      </option>
                    ))}
                  </select>
                </div>

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
                  className="w-full py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800"
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
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold rounded-xl shadow-md"
                >
                  حفظ الفاتورة وتحديث الأرصدة
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-3 text-slate-400 font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
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

      {/* Smart Assistant Invoice Scanner Modal */}
      {showAssistantScanner && (
        <SmartAssistantModal
          onClose={() => {
            setShowAssistantScanner(false);
            loadData();
          }}
          initialTab="invoice_scanner"
        />
      )}
    </div>
  );
};
