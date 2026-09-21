import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Search,
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  Calendar,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { SaleRepository } from '../../db/repositories';
import { SalesReturnService } from '../../services/SalesReturnService';
import { Sale, SaleItem, SaleItemAllocation, User, ItemCondition } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { useBackHandler } from '../../hooks/useBackHandler';

interface SaleReturnModalProps {
  currentUser: User;
  onClose: () => void;
  preselectedSale?: Sale | null;
  onReturnSuccess?: () => void;
}

export const SaleReturnModal: React.FC<SaleReturnModalProps> = ({
  currentUser,
  onClose,
  preselectedSale,
  onReturnSuccess
}) => {
  useBackHandler('modal-sale-return', true, () => {
    onClose();
    return true;
  }, 105);

  const [searchQuery, setSearchQuery] = useState(preselectedSale?.invoice_number || '');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(preselectedSale || null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [allocations, setAllocations] = useState<SaleItemAllocation[]>([]);
  const [selectedReturnQuantities, setSelectedReturnQuantities] = useState<Record<string, number>>({});
  const [itemConditions, setItemConditions] = useState<Record<string, ItemCondition>>({});
  const [settlementMethod, setSettlementMethod] = useState<'cash' | 'credit'>('cash');
  const [cashboxId, setCashboxId] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('طلب العميل');
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
    if (preselectedSale) {
      handleSelectSale(preselectedSale);
    }
  }, [preselectedSale]);

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setErrorMsg(null);
    setSuccessMsg(null);

    const items = SaleRepository.getItems(sale.id);
    const allocs = SaleRepository.getAllocations(sale.id);
    setSaleItems(items);
    setAllocations(allocs);

    // Default settlement method based on sale type
    setSettlementMethod(sale.sale_type === 'credit' && sale.customer_id ? 'credit' : 'cash');
    if (sale.cashbox_id) {
      setCashboxId(sale.cashbox_id);
    }

    // Initialize return quantities to 0
    const initialQty: Record<string, number> = {};
    const initialCond: Record<string, ItemCondition> = {};
    items.forEach((it) => {
      initialQty[it.id] = 0;
      initialCond[it.id] = 'resellable';
    });
    setSelectedReturnQuantities(initialQty);
    setItemConditions(initialCond);
  };

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;

    const allSales = SaleRepository.getAll();
    const found = allSales.find(
      (s) => s.invoice_number.toLowerCase() === q.toLowerCase() || s.id === q
    );

    if (found) {
      handleSelectSale(found);
    } else {
      setErrorMsg(`لم يتم العثور على فاتورة برقم "${q}"`);
      setSelectedSale(null);
    }
  };

  // Compute remaining returnable quantity for each item
  const getRemainingReturnable = (item: SaleItem): number => {
    const alreadyReturned = (state.sale_return_items || [])
      .filter((ri) => {
        if (ri.original_sale_item_id !== item.id) return false;
        const parentReturn = (state.sale_returns || []).find((r) => r.id === ri.return_id);
        return parentReturn && parentReturn.status !== 'cancelled';
      })
      .reduce((sum, ri) => sum + ri.returned_quantity, 0);

    return Math.max(0, item.quantity - alreadyReturned);
  };

  // Calculate live totals
  let totalRefund = 0;
  let hasAnyReturn = false;

  saleItems.forEach((it) => {
    const retQty = selectedReturnQuantities[it.id] || 0;
    if (retQty > 0) {
      hasAnyReturn = true;
      const unitNet = Math.round(it.line_total / it.quantity);
      totalRefund += unitNet * retQty;
    }
  });

  const handleSubmitReturn = async () => {
    if (!selectedSale) return;
    if (!hasAnyReturn) {
      setErrorMsg('يرجى تحديد كمية صنف واحد على الأقل للإرجاع.');
      return;
    }

    const itemsToReturn = saleItems
      .filter((it) => (selectedReturnQuantities[it.id] || 0) > 0)
      .map((it) => ({
        sale_item_id: it.id,
        returned_quantity: selectedReturnQuantities[it.id],
        item_condition: itemConditions[it.id] || 'resellable',
        item_reason: returnReason
      }));

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const result = SalesReturnService.createSaleReturn({
        sale_id: selectedSale.id,
        items: itemsToReturn,
        settlement_method: settlementMethod,
        cashbox_id: cashboxId,
        return_reason: returnReason,
        userId: currentUser.id
      });

      setSuccessMsg(`تم إنشاء سند المردود بنجاح برقم: ${result.return_number}`);
      if (onReturnSuccess) {
        onReturnSuccess();
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل في إنشاء مردود المبيعات');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">إنشاء مردود مبيعات (Sales Return)</h2>
              <p className="text-xs text-slate-500">إرجاع موثق بدفعات الصرف الأصلية واسترجاع الذمم والخزينة</p>
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
          {/* Invoice Search Bar if not preselected */}
          {!preselectedSale && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="ابحث برقم الفاتورة (مثال: INV-250915-001)..."
                  className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
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

          {selectedSale ? (
            <div className="space-y-4">
              {/* Sale Info Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">رقم الفاتورة</span>
                  <span className="font-bold text-slate-700">{selectedSale.invoice_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">التاريخ</span>
                  <span className="font-medium text-slate-600">
                    {new Date(selectedSale.created_at).toLocaleDateString('ar-EG')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">العميل</span>
                  <span className="font-bold text-slate-700">
                    {state.customers.find((c) => c.id === selectedSale.customer_id)?.name || 'عميل نقدي عام'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">إجمالي الفاتورة</span>
                  <span className="font-bold text-amber-600">{Money.format(selectedSale.net_total)}</span>
                </div>
              </div>

              {/* Items List to Return */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 mb-2">الأصناف القابلة للإرجاع</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {saleItems.map((item) => {
                    const remainingReturnable = getRemainingReturnable(item);
                    const isFullyReturned = remainingReturnable <= 0;
                    const itemAllocs = allocations.filter((a) => a.sale_item_id === item.id);
                    const curQty = selectedReturnQuantities[item.id] || 0;

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border transition-all ${
                          isFullyReturned
                            ? 'bg-slate-100 border-slate-200 opacity-60'
                            : curQty > 0
                            ? 'bg-amber-50/50 border-amber-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="text-xs font-bold text-slate-800">{item.product_name_snapshot}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                              <span>الوحدة: {item.unit_name}</span>
                              <span>•</span>
                              <span>المباع: {item.quantity}</span>
                              <span>•</span>
                              <span>المتبقي: {remainingReturnable}</span>
                              <span>•</span>
                              <span>سعر الوحدة: {Money.format(Math.round(item.line_total / item.quantity))}</span>
                            </div>

                            {/* Batch Provenance Badges */}
                            {itemAllocs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {itemAllocs.map((al) => {
                                  const b = state.batches.find((b) => b.id === al.batch_id);
                                  return (
                                    <span
                                      key={al.id}
                                      className="inline-flex items-center gap-1 text-[10px] bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-mono"
                                    >
                                      <Layers className="w-2.5 h-2.5" />
                                      {b?.batch_number || al.batch_id.slice(-6)}: {al.allocated_base_quantity} وحدة
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Controls */}
                          {!isFullyReturned ? (
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-slate-600">كمية الإرجاع:</span>
                                <div className="w-20">
                                  <NumericInput
                                    value={curQty}
                                    min={0}
                                    max={remainingReturnable}
                                    allowDecimals={false}
                                    onChange={(val) => {
                                      const bounded = Math.max(0, Math.min(remainingReturnable, val));
                                      setSelectedReturnQuantities({
                                        ...selectedReturnQuantities,
                                        [item.id]: bounded
                                      });
                                    }}
                                    className="py-1 text-xs text-center font-bold"
                                  />
                                </div>
                              </div>

                              {curQty > 0 && (
                                <select
                                  value={itemConditions[item.id] || 'resellable'}
                                  onChange={(e) =>
                                    setItemConditions({
                                      ...itemConditions,
                                      [item.id]: e.target.value as ItemCondition
                                    })
                                  }
                                  className="text-[11px] px-2 py-0.5 bg-slate-100 border border-slate-300 rounded-md"
                                >
                                  <option value="resellable">سليم (صالح للبيع)</option>
                                  <option value="damaged">تالف (حجر صحي)</option>
                                  <option value="expired">منتهي الصلاحية</option>
                                </select>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400 bg-slate-200/70 px-2 py-1 rounded-md">
                              تم إرجاعه بالكامل
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
                <h3 className="font-bold text-slate-700">طريقة التسوية المالية والسبب</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">طريقة رد المبلغ</label>
                    <div className="flex gap-2">
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
                        نقداً
                      </button>
                      <button
                        type="button"
                        disabled={!selectedSale.customer_id}
                        onClick={() => setSettlementMethod('credit')}
                        className={`flex-1 py-1.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all ${
                          settlementMethod === 'credit'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 disabled:opacity-40'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        رصيد آجل (ذمم)
                      </button>
                    </div>
                  </div>

                  {settlementMethod === 'cash' && (
                    <div>
                      <label className="block text-slate-500 mb-1">الصندوق المخصوم منه</label>
                      <select
                        value={cashboxId}
                        onChange={(e) => setCashboxId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
                  <label className="block text-slate-500 mb-1">سبب الإرجاع</label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="مثال: طلب العميل، خطأ في الصرف، عبوة تالفة..."
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Total Refund Banner */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-amber-800 block">إجمالي قيمة المردود المستحق:</span>
                  <span className="text-xl font-black text-amber-900">{Money.format(totalRefund)}</span>
                </div>
                <button
                  type="button"
                  disabled={!hasAnyReturn || isSubmitting}
                  onClick={handleSubmitReturn}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {isSubmitting ? 'جاري المعالجة...' : 'تأكيد المردود'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-xs">يرجى البحث عن فاتورة مبيعات لبدء الإرجاع</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
