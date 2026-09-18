import React, { useState } from 'react';
import { X, RotateCcw, ArrowLeftRight, Search, FileText, CheckCircle, AlertCircle, ShoppingBag, Truck } from 'lucide-react';
import { db } from '../../db/sqlite';
import { SalesReturnService } from '../../services/SalesReturnService';
import { PurchaseReturnService } from '../../services/PurchaseReturnService';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { Sale, Purchase } from '../../types';

interface ReturnsHubModalProps {
  initialType?: 'sale' | 'purchase';
  onClose: () => void;
}

export const ReturnsHubModal: React.FC<ReturnsHubModalProps> = ({ initialType = 'sale', onClose }) => {
  const [returnType, setReturnType] = useState<'sale' | 'purchase'>(initialType);
  const state = db.getState();

  // Search state
  const [docNumberQuery, setDocNumberQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  // Return form state
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('إرجاع بناء على طلب الزبون / بضاعة سليمة');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'credit'>('cash');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filter completed / posted documents
  const completedSales = state.sales.filter((s) => s.status === 'completed');
  const completedPurchases = state.purchases.filter((p) => p.status === 'posted' || p.status === 'returned_partially');

  const handleSearchDoc = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const q = docNumberQuery.trim().toLowerCase();

    if (returnType === 'sale') {
      const found = completedSales.find(
        (s) => s.invoice_number.toLowerCase() === q || s.id.toLowerCase() === q
      );
      if (found) {
        setSelectedSale(found);
        setReturnQuantities({});
      } else {
        setMessage({ text: `لم يتم العثور على فاتورة مبيعات مكتملة بالرقم: ${docNumberQuery}`, type: 'error' });
      }
    } else {
      const found = completedPurchases.find(
        (p) => p.invoice_number.toLowerCase() === q || p.id.toLowerCase() === q
      );
      if (found) {
        setSelectedPurchase(found);
        setReturnQuantities({});
      } else {
        setMessage({ text: `لم يتم العثور على فاتورة مشتريات بالرقم: ${docNumberQuery}`, type: 'error' });
      }
    }
  };

  const handleExecuteSaleReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    const itemsToReturn = Object.entries(returnQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([saleItemId, qty]) => ({
        sale_item_id: saleItemId,
        quantity: Number(qty)
      }));

    if (itemsToReturn.length === 0) {
      setMessage({ text: 'يرجى تحديد كمية صنف واحد على الأقل للإرجاع.', type: 'error' });
      return;
    }

    try {
      SalesReturnService.createSaleReturn({
        sale_id: selectedSale.id,
        items: itemsToReturn.map((it) => ({
          sale_item_id: it.sale_item_id,
          returned_quantity: it.quantity
        })),
        settlement_method: refundMethod,
        return_reason: returnReason.trim() || 'مرتجع مبيعات',
        userId: 'user-01'
      });

      setMessage({ text: 'تم تسجيل مرتجع المبيعات وإعادة الكميات للمخزن واسترداد القيمة بنجاح!', type: 'success' });
      setSelectedSale(null);
      setReturnQuantities({});
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسجيل مرتجع المبيعات.', type: 'error' });
    }
  };

  const handleExecutePurchaseReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase) return;

    const itemsToReturn = Object.entries(returnQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([purchaseItemId, qty]) => ({
        purchase_item_id: purchaseItemId,
        quantity: Number(qty)
      }));

    if (itemsToReturn.length === 0) {
      setMessage({ text: 'يرجى تحديد كمية صنف واحد على الأقل للإرجاع.', type: 'error' });
      return;
    }

    try {
      PurchaseReturnService.createPurchaseReturn({
        purchase_id: selectedPurchase.id,
        items: itemsToReturn.map((it) => ({
          purchase_item_id: it.purchase_item_id,
          returned_quantity: it.quantity
        })),
        settlement_method: refundMethod,
        return_reason: returnReason.trim() || 'مرتجع مشتريات للمورد',
        userId: 'user-01'
      });

      setMessage({ text: 'تم تسجيل مرتجع المشتريات وخصم البضاعة من المخزن وتسوية الحساب بنجاح!', type: 'success' });
      setSelectedPurchase(null);
      setReturnQuantities({});
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسجيل مرتجع المشتريات.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                returnType === 'sale' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}
            >
              {returnType === 'sale' ? <RotateCcw className="w-6 h-6" /> : <ArrowLeftRight className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {returnType === 'sale' ? 'إدارة مرتجع المبيعات' : 'إدارة مرتجع المشتريات للموردين'}
              </h3>
              <p className="text-xs text-slate-500">استرداد أو إرجاع الأدوية وتسوية المخزون والمالية</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {message.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Toggle between Sales Return and Purchases Return */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setReturnType('sale');
              setSelectedSale(null);
              setSelectedPurchase(null);
              setMessage(null);
            }}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              returnType === 'sale' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>مرتجع مبيعات (من زبون)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReturnType('purchase');
              setSelectedSale(null);
              setSelectedPurchase(null);
              setMessage(null);
            }}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              returnType === 'purchase' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>مرتجع مشتريات (إلى مورد)</span>
          </button>
        </div>

        {/* Search for Invoice */}
        <form onSubmit={handleSearchDoc} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              required
              value={docNumberQuery}
              onChange={(e) => setDocNumberQuery(e.target.value)}
              placeholder={returnType === 'sale' ? 'أدخل رقم فاتورة المبيعات (مثل: INV-001)...' : 'أدخل رقم فاتورة الشراء...'}
              className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all"
          >
            بحث عن الفاتورة
          </button>
        </form>

        {/* Quick select from recent invoices */}
        <div className="space-y-1">
          <span className="text-[11px] text-slate-500 font-bold block">أو اختر من آخر الفواتير:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            {(returnType === 'sale' ? completedSales : completedPurchases).slice(-4).reverse().map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => {
                  if (returnType === 'sale') setSelectedSale(doc as Sale);
                  else setSelectedPurchase(doc as Purchase);
                  setReturnQuantities({});
                  setMessage(null);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-mono text-[11px] shrink-0 font-bold"
              >
                {doc.invoice_number} ({Money.format(doc.net_total)})
              </button>
            ))}
          </div>
        </div>

        {/* Return Details for Sale */}
        {returnType === 'sale' && selectedSale && (
          <form onSubmit={handleExecuteSaleReturn} className="p-4 bg-rose-50/50 border border-rose-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-rose-200">
              <span className="font-bold text-rose-950 text-sm">
                فاتورة مبيعات: {selectedSale.invoice_number}
              </span>
              <span className="font-mono font-bold text-slate-700">
                الإجمالي: {Money.format(selectedSale.net_total)}
              </span>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-800 block">حدد الكميات المراد إرجاعها:</span>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-0.5">
                {state.sale_items.filter((si) => si.sale_id === selectedSale.id).map((item) => {
                  const prod = state.products.find((p) => p.id === item.product_id);
                  const maxQty = item.quantity - (item.returned_quantity || 0);
                  const currentRetQty = returnQuantities[item.id] || 0;

                  return (
                    <div
                      key={item.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{prod?.name_ar || item.product_id}</span>
                        <span className="text-[11px] text-slate-500">
                          الكمية المباعة: {item.quantity} (المتاح للإرجاع: {maxQty})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">الكمية المرتجعة:</span>
                        <NumericInput
                          value={currentRetQty}
                          onChange={(val) =>
                            setReturnQuantities((prev) => ({
                              ...prev,
                              [item.id]: Math.min(maxQty, Math.max(0, val))
                            }))
                          }
                          className="w-16 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-mono font-bold text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-700 font-bold mb-1">طريقة رد المبلغ</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  <option value="cash">رد نقدي من الصندوق (كاش)</option>
                  <option value="credit">خصم من رصيد دين العميل (آجل)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">سبب الإرجاع</label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>اعتماد مرتجع المبيعات</span>
              </button>
            </div>
          </form>
        )}

        {/* Return Details for Purchase */}
        {returnType === 'purchase' && selectedPurchase && (
          <form onSubmit={handleExecutePurchaseReturn} className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-amber-200">
              <span className="font-bold text-amber-950 text-sm">
                فاتورة مشتريات: {selectedPurchase.invoice_number}
              </span>
              <span className="font-mono font-bold text-slate-700">
                الإجمالي: {Money.format(selectedPurchase.net_total)}
              </span>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-800 block">حدد الكميات المراد إرجاعها للمورد:</span>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-0.5">
                {state.purchase_items.filter((pi) => pi.purchase_id === selectedPurchase.id).map((item) => {
                  const prod = state.products.find((p) => p.id === item.product_id);
                  const maxQty = (item.quantity || 0) - (item.returned_quantity || 0);
                  const currentRetQty = returnQuantities[item.id] || 0;

                  return (
                    <div
                      key={item.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{prod?.name_ar || item.product_id}</span>
                        <span className="text-[11px] text-slate-500">
                          الكمية المشتراة: {item.quantity} (المتاح للإرجاع: {maxQty})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">الكمية المرتجعة:</span>
                        <NumericInput
                          value={currentRetQty}
                          onChange={(val) =>
                            setReturnQuantities((prev) => ({
                              ...prev,
                              [item.id]: Math.min(maxQty, Math.max(0, val))
                            }))
                          }
                          className="w-16 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-mono font-bold text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-700 font-bold mb-1">طريقة الاسترداد</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  <option value="cash">استرداد نقدي للصندوق</option>
                  <option value="credit">خصم من مستحقات المورد (آجل)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">سبب الإرجاع</label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPurchase(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>اعتماد مرتجع المشتريات</span>
              </button>
            </div>
          </form>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
