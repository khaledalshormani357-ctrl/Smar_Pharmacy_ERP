import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Search,
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  DollarSign,
  CreditCard
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PurchaseRepository } from '../../db/repositories';
import { PurchaseReturnService } from '../../services/PurchaseReturnService';
import { Purchase, PurchaseItem, User } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { useBackHandler } from '../../hooks/useBackHandler';

interface PurchaseReturnModalProps {
  currentUser: User;
  onClose: () => void;
  preselectedPurchase?: Purchase | null;
  onReturnSuccess?: () => void;
}

export const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({
  currentUser,
  onClose,
  preselectedPurchase,
  onReturnSuccess
}) => {
  useBackHandler('modal-purchase-return', true, () => {
    onClose();
    return true;
  }, 105);

  const [searchQuery, setSearchQuery] = useState(preselectedPurchase?.invoice_number || '');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(preselectedPurchase || null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [selectedReturnQuantities, setSelectedReturnQuantities] = useState<Record<string, number>>({});
  const [settlementMethod, setSettlementMethod] = useState<'cash' | 'credit'>('credit');
  const [cashboxId, setCashboxId] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('مردود للمورد');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const state = db.getState();
  const cashboxes = state.cashboxes;

  useEffect(() => {
    if (cashboxes.length > 0 && !cashboxId) {
      setCashboxId(cashboxes[0].id);
    }
  }, [cashboxes, cashboxId]);

  useEffect(() => {
    if (preselectedPurchase) {
      handleSelectPurchase(preselectedPurchase);
    }
  }, [preselectedPurchase]);

  const handleSelectPurchase = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setErrorMsg(null);
    setSuccessMsg(null);

    const items = PurchaseRepository.getItems(purchase.id);
    setPurchaseItems(items);

    // Default settlement method: credit if supplier has balance, otherwise cash
    setSettlementMethod('credit');
    if (purchase.cashbox_id) {
      setCashboxId(purchase.cashbox_id);
    }

    const initialQty: Record<string, number> = {};
    items.forEach((it) => {
      initialQty[it.id] = 0;
    });
    setSelectedReturnQuantities(initialQty);
  };

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;

    const allPurchases = PurchaseRepository.getAll();
    const found = allPurchases.find(
      (p) =>
        p.invoice_number.toLowerCase() === q.toLowerCase() ||
        p.internal_number.toLowerCase() === q.toLowerCase() ||
        p.id === q
    );

    if (found) {
      handleSelectPurchase(found);
    } else {
      setErrorMsg(`لم يتم العثور على فاتورة مشتريات برقم "${q}"`);
      setSelectedPurchase(null);
    }
  };

  // Compute maximum returnable quantity considering invoice remaining & physical batch stock
  const getMaxReturnable = (item: PurchaseItem): { maxQty: number; reason?: string } => {
    const alreadyReturned = (state.purchase_return_items || [])
      .filter((pri) => {
        if (pri.original_purchase_item_id !== item.id) return false;
        const parentReturn = (state.purchase_returns || []).find((pr) => pr.id === pri.return_id);
        return parentReturn && parentReturn.status !== 'cancelled';
      })
      .reduce((sum, pri) => sum + pri.returned_quantity, 0);

    const invoiceRemaining = Math.max(0, item.quantity - alreadyReturned);

    const batch = state.batches.find((b) => b.id === item.batch_id);
    if (!batch) return { maxQty: 0, reason: 'التشغيلة غير موجودة' };

    const batchStockInItemUnits = Math.floor(batch.current_quantity / item.unit_factor);
    const maxQty = Math.min(invoiceRemaining, batchStockInItemUnits);

    let reason: string | undefined;
    if (batchStockInItemUnits < invoiceRemaining) {
      reason = `المتوفر في المخزن ${batchStockInItemUnits} وحدة فقط`;
    }

    return { maxQty, reason };
  };

  // Calculate live totals
  let totalRefund = 0;
  let hasAnyReturn = false;

  purchaseItems.forEach((it) => {
    const retQty = selectedReturnQuantities[it.id] || 0;
    if (retQty > 0) {
      hasAnyReturn = true;
      totalRefund += it.unit_purchase_price * retQty;
    }
  });

  const handleSubmitReturn = async () => {
    if (!selectedPurchase) return;
    if (!hasAnyReturn) {
      setErrorMsg('يرجى تحديد كمية صنف واحد على الأقل للإرجاع للمورد.');
      return;
    }

    const itemsToReturn = purchaseItems
      .filter((it) => (selectedReturnQuantities[it.id] || 0) > 0)
      .map((it) => ({
        purchase_item_id: it.id,
        returned_quantity: selectedReturnQuantities[it.id],
        batch_id: it.batch_id,
        item_reason: returnReason
      }));

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const result = PurchaseReturnService.createPurchaseReturn({
        purchase_id: selectedPurchase.id,
        items: itemsToReturn,
        settlement_method: settlementMethod,
        cashbox_id: cashboxId,
        return_reason: returnReason,
        userId: currentUser.id
      });

      setSuccessMsg(`تم إنشاء سند مردود المشتريات بنجاح برقم: ${result.return_number}`);
      if (onReturnSuccess) {
        onReturnSuccess();
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل في إنشاء مردود المشتريات');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">إنشاء مردود مشتريات (Purchase Return)</h2>
              <p className="text-xs text-slate-500">إرجاع بضاعة للمورد، خصم المخزون وعكس مديونية المورد أو استرداد نقدي</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {!preselectedPurchase && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="ابحث برقم فاتورة المشتريات أو الرقم الداخلي..."
                  className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                بحث
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {selectedPurchase ? (
            <div className="space-y-4">
              {/* Purchase Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">رقم الفاتورة</span>
                  <span className="font-bold text-slate-700">{selectedPurchase.invoice_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">الرقم الداخلي</span>
                  <span className="font-medium text-slate-600">{selectedPurchase.internal_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">المورد</span>
                  <span className="font-bold text-slate-700">
                    {state.suppliers.find((s) => s.id === selectedPurchase.supplier_id)?.name_ar || 'غير محدد'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">إجمالي الفاتورة</span>
                  <span className="font-bold text-indigo-600">{Money.format(selectedPurchase.net_total)}</span>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 mb-2">الأصناف المشتراة وتوفرها في المخزن</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {purchaseItems.map((item) => {
                    const { maxQty, reason } = getMaxReturnable(item);
                    const isFullyReturned = maxQty <= 0;
                    const curQty = selectedReturnQuantities[item.id] || 0;
                    const batch = state.batches.find((b) => b.id === item.batch_id);

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border transition-all ${
                          isFullyReturned
                            ? 'bg-slate-100 border-slate-200 opacity-60'
                            : curQty > 0
                            ? 'bg-indigo-50/50 border-indigo-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="text-xs font-bold text-slate-800">{item.product_name_snapshot}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                              <span>الوحدة: {item.unit_name}</span>
                              <span>•</span>
                              <span>المشترى: {item.quantity}</span>
                              <span>•</span>
                              <span>القابل للإرجاع: {maxQty}</span>
                              <span>•</span>
                              <span>سعر الشراء: {Money.format(item.unit_purchase_price)}</span>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono font-medium">
                                <Layers className="w-2.5 h-2.5" />
                                التشغيلة: {batch?.batch_number || item.batch_number} (الرصيد: {batch?.current_quantity || 0})
                              </span>
                              {reason && (
                                <span className="text-[10px] text-amber-600 font-medium">{reason}</span>
                              )}
                            </div>
                          </div>

                          {!isFullyReturned ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-slate-600">كمية الإرجاع:</span>
                              <div className="w-20">
                                <NumericInput
                                  value={curQty}
                                  min={0}
                                  max={maxQty}
                                  allowDecimals={false}
                                  onChange={(val) => {
                                    const bounded = Math.max(0, Math.min(maxQty, val));
                                    setSelectedReturnQuantities({
                                      ...selectedReturnQuantities,
                                      [item.id]: bounded
                                    });
                                  }}
                                  className="py-1 text-xs text-center font-bold"
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400 bg-slate-200/70 px-2 py-1 rounded-md">
                              غير متاح للإرجاع
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Settlement Options */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                <h3 className="font-bold text-slate-700">طريقة استرداد القيمة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">طريقة التسوية</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSettlementMethod('credit')}
                        className={`flex-1 py-1.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all ${
                          settlementMethod === 'credit'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        خصم من رصيد المورد (آجل)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettlementMethod('cash')}
                        className={`flex-1 py-1.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all ${
                          settlementMethod === 'cash'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        استرداد نقدي بالصندوق
                      </button>
                    </div>
                  </div>

                  {settlementMethod === 'cash' && (
                    <div>
                      <label className="block text-slate-500 mb-1">الصندوق المودع به</label>
                      <select
                        value={cashboxId}
                        onChange={(e) => setCashboxId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        {cashboxes.map((cb) => (
                          <option key={cb.id} value={cb.id}>
                            {cb.name_ar} (الرصيد: {Money.format(cb.cached_balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">سبب إرجاع البضاعة</label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="مثال: أصناف غير مطابقة، تاريخ صلاحية قريب، كسر أثناء النقل..."
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Total Refund Banner */}
              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-indigo-800 block">إجمالي قيمة المردود للمورد:</span>
                  <span className="text-xl font-black text-indigo-900">{Money.format(totalRefund)}</span>
                </div>
                <button
                  type="button"
                  disabled={!hasAnyReturn || isSubmitting}
                  onClick={handleSubmitReturn}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {isSubmitting ? 'جاري المعالجة...' : 'تأكيد مردود المشتريات'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-xs">يرجى البحث عن فاتورة مشتريات لبدء الإرجاع</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
