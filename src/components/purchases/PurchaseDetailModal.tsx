// Purchase Invoice Details & Correction Modal
// Displays complete invoice data, batch details, and safe accounting reversal/correction options

import React, { useState } from 'react';
import {
  X,
  Building2,
  Calendar,
  CreditCard,
  RotateCcw,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FileText,
  Clock,
  Printer
} from 'lucide-react';
import { Purchase, PurchaseItem, Supplier, Product, User } from '../../types';
import { Money } from '../../utils/money';
import { db } from '../../db/sqlite';
import { PurchaseService } from '../../services/PurchaseService';
import { useBackHandler } from '../../hooks/useBackHandler';

interface PurchaseDetailModalProps {
  purchase: Purchase | null;
  onClose: () => void;
  onInitiateReturn?: (purchase: Purchase) => void;
  onInitiateCorrection?: (purchase: Purchase, items: PurchaseItem[]) => void;
  onInvoiceCancelled?: () => void;
  currentUser: User;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({
  purchase,
  onClose,
  onInitiateReturn,
  onInitiateCorrection,
  onInvoiceCancelled,
  currentUser
}) => {
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useBackHandler('modal-purchase-detail', !!purchase, () => {
    if (showCancelPrompt) {
      setShowCancelPrompt(false);
      return true;
    }
    onClose();
    return true;
  }, 105);

  if (!purchase) return null;

  const state = db.getState();
  const supplier = state.suppliers.find((s) => s.id === purchase.supplier_id);
  const items = state.purchase_items.filter((it) => it.purchase_id === purchase.id);
  const productsMap = new Map(state.products.map((p) => [p.id, p]));

  const handleCancelInvoice = () => {
    if (!cancelReason.trim()) {
      setActionError('يرجى كتابة سبب إلغاء الفاتورة.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      PurchaseService.cancelPurchase(purchase.id, cancelReason.trim(), currentUser.id);
      setIsProcessing(false);
      setShowCancelPrompt(false);
      if (onInvoiceCancelled) {
        onInvoiceCancelled();
      }
      onClose();
    } catch (err: any) {
      setIsProcessing(false);
      setActionError(err.message || 'تعذر إلغاء فاتورة المشتريات.');
    }
  };

  const handleCorrectInvoice = () => {
    if (onInitiateCorrection) {
      onInitiateCorrection(purchase, items);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  تفاصيل فاتورة شراء #{purchase.invoice_number}
                </h3>
                {purchase.status === 'cancelled' && (
                  <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                    ملغاة
                  </span>
                )}
                {purchase.status === 'posted' && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    معتمدة
                  </span>
                )}
                {purchase.status === 'returned_partially' && (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    مردود جزئي
                  </span>
                )}
                {purchase.status === 'returned_fully' && (
                  <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                    مردود كلي
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                الرقم الداخلي: {purchase.internal_number || purchase.id} • التاريخ: {purchase.purchase_date}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
          {/* Action Error Alert */}
          {actionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Supplier & Payment Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-semibold">بيانات المورد</span>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                  {supplier?.name || 'مورد عام'}
                </span>
              </div>
              {supplier?.phone && (
                <p className="text-slate-500 text-[11px] font-mono">هاتف: {supplier.phone}</p>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-semibold">بيانات السداد</span>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">طريقة الدفع:</span>
                <span
                  className={`px-2 py-0.5 rounded-lg font-bold text-[11px] ${
                    purchase.payment_type === 'cash'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {purchase.payment_type === 'cash' ? 'نقداً (الصندوق)' : 'آجل (حساب المورد)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>تاريخ التوريد:</span>
                <span className="font-mono">{purchase.purchase_date}</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between font-bold text-slate-700">
              <span>الأصناف والتشغيلات الموردة ({items.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">الصنف الدوائي</th>
                    <th className="py-2.5 px-3">التشغيلة (Batch)</th>
                    <th className="py-2.5 px-3">الصلاحية</th>
                    <th className="py-2.5 px-3">الكمية</th>
                    <th className="py-2.5 px-3">سعر الشراء</th>
                    <th className="py-2.5 px-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        لا توجد أصناف مسجلة لهذه الفاتورة
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const prod = productsMap.get(it.product_id);
                      return (
                        <tr key={it.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">{prod?.name_ar || it.product_id}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{prod?.name_en || prod?.internal_code}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 font-bold">
                            {it.batch_number}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {it.expiry_date}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {it.quantity} {it.unit_name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700" dir="ltr">
                            {Money.format(it.unit_purchase_price)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700" dir="ltr">
                            {Money.format(it.line_total || it.quantity * it.unit_purchase_price)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Totals */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>المجموع الفرعي:</span>
              <span className="font-mono" dir="ltr">{Money.format(purchase.subtotal)}</span>
            </div>
            {purchase.discount_amount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>الخصم الممنوح:</span>
                <span className="font-mono" dir="ltr">-{Money.format(purchase.discount_amount)}</span>
              </div>
            )}
            {purchase.tax_amount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>الضريبة:</span>
                <span className="font-mono" dir="ltr">+{Money.format(purchase.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-sm text-slate-900">
              <span>صافي الفاتورة الإجمالي:</span>
              <span className="font-mono text-blue-700 text-base" dir="ltr">{Money.format(purchase.net_total)}</span>
            </div>
            {purchase.payment_type === 'credit' && (
              <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                <span>المسدد: {Money.format(purchase.paid_amount)}</span>
                <span>المتبقي في حساب المورد: {Money.format(purchase.remaining_amount)}</span>
              </div>
            )}
          </div>

          {/* Cancel Invoice Confirmation Area */}
          {showCancelPrompt && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span>تأكيد إلغاء وعكس فاتورة المشتريات</span>
              </div>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                وفق معايير النزاهة المحاسبية والرقابية، سيتم فحص المخزون للتأكد من عدم بيع أي كمية تجعل الرصيد سالباً،
                ثم يتم خصم الكميات من التشغيلات، وعكس قيود المورد أو الصندوق تلقائياً.
              </p>
              <div>
                <label className="block text-slate-700 font-semibold text-[11px] mb-1">
                  سبب الإلغاء الإلزامي *
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="مثال: إدخال بالخطأ / اختلاف الأصناف المستلمة / تصحيح أسعار"
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleCancelInvoice}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition-all shadow-sm"
                >
                  {isProcessing ? 'جاري الإلغاء وعكس القيود...' : 'نعم، إلغاء الفاتورة نهائياً'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(false)}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-xl text-xs font-semibold"
                >
                  تراجع
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {purchase.status !== 'cancelled' && (
              <>
                <button
                  type="button"
                  onClick={handleCorrectInvoice}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                  title="تصحيح الفاتورة: عكس القيد وإعادة فتح محرر الفاتورة للتعديل"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل وتصحيح الفاتورة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onInitiateReturn) {
                      onInitiateReturn(purchase);
                      onClose();
                    }
                  }}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>مردود مشتريات</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(true)}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إلغاء الفاتورة</span>
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
