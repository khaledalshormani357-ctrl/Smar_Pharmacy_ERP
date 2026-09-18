import React, { useState } from 'react';
import { X, ClipboardCheck, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { db } from '../../db/sqlite';
import { StockService } from '../../services/StockService';
import { StockCountSession, StockCountItem } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';

interface StockCountModalProps {
  onClose: () => void;
}

export const StockCountModal: React.FC<StockCountModalProps> = ({ onClose }) => {
  const [activeSession, setActiveSession] = useState<StockCountSession | null>(() => {
    const sessions = db.getState().stock_count_sessions || [];
    return sessions.find((s) => s.status === 'draft') || null;
  });
  const [sessionTitle, setSessionTitle] = useState('جرد المخزون الدوري - ' + new Date().toLocaleDateString('ar-YE'));
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const state = db.getState();
  const countItems = activeSession
    ? (state.stock_count_items || []).filter((i) => i.session_id === activeSession.id)
    : [];

  const handleStartSession = () => {
    setError(null);
    try {
      const session = StockService.startStockCountSession(sessionTitle, 'user-01');
      setActiveSession(session);
    } catch (err: any) {
      setError(err.message || 'فشل فتح جلسة الجرد.');
    }
  };

  const handleUpdateItem = (batchId: string, val: number) => {
    if (!activeSession) return;
    try {
      StockService.recordCountItem(activeSession.id, batchId, val);
      // force update by re-reading session
      setActiveSession({ ...activeSession });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApproveSession = () => {
    if (!activeSession) return;
    setError(null);
    try {
      StockService.approveStockCountSession(activeSession.id, 'user-01');
      setSuccessMsg('تم اعتماد تسوية الجرد بنجاح وتوليد الحركات المخزنية وسجلات التدقيق.');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'فشل اعتماد جلسة الجرد.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-600/10 text-purple-600 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {activeSession ? `جلسة جرد: ${activeSession.session_number}` : 'جلسة جرد مخزني جديدة'}
              </h3>
              <p className="text-xs text-slate-500">مقارنة الرصيد الفعلي بالرصيد الدفتري واعتماد التسويات بدقة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-600 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {!activeSession ? (
            <div className="text-center py-8 space-y-4">
              <div className="max-w-md mx-auto space-y-2">
                <label className="text-xs font-bold text-slate-700 block text-right">عنوان جلسة الجرد</label>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
                <p className="text-[11px] text-slate-400 text-right">
                  عند بدء الجلسة سيتم أخذ لقطة فورية لكافة التشغيلات النشطة في النظام للمقارنة مع الجرد الفعلي.
                </p>
              </div>

              <button
                onClick={handleStartSession}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
              >
                بدء جلسة الجرد الآن
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs bg-purple-50 p-3 rounded-2xl border border-purple-100">
                <span className="font-bold text-purple-900">{activeSession.title}</span>
                <span className="text-purple-700 font-mono">البنود المشمولة بالجرد: {countItems.length}</span>
              </div>

              {countItems.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">لا توجد تشغيلات مسجلة للجرد.</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                      <tr>
                        <th className="p-3">الصنف / التشغيلة</th>
                        <th className="p-3">الرصيد الدفتري (النظام)</th>
                        <th className="p-3">الرصيد الفعلي المقاس</th>
                        <th className="p-3">الفارق (Variance)</th>
                        <th className="p-3">قيمة الفارق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {countItems.map((item) => {
                        const prod = state.products.find((p) => p.id === item.product_id);
                        const batch = state.batches.find((b) => b.id === item.batch_id);
                        const variance = item.physical_quantity_base - item.system_quantity_base;
                        const varianceCost = variance * item.unit_cost;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-sans">
                              <span className="font-bold text-slate-900 block">{prod?.name_ar || 'غير محدد'}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                دفعة: {batch?.batch_number} (انتهاء: {batch?.expiry_date})
                              </span>
                            </td>
                            <td className="p-3 text-slate-700">{item.system_quantity_base}</td>
                            <td className="p-3">
                              <div className="w-24">
                                <NumericInput
                                  value={item.physical_quantity_base}
                                  onChange={(val) => handleUpdateItem(item.batch_id, val)}
                                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-center"
                                />
                              </div>
                            </td>
                            <td
                              className={`p-3 font-bold ${
                                variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-rose-600' : 'text-slate-400'
                              }`}
                            >
                              {variance > 0 ? `+${variance}` : variance}
                            </td>
                            <td className="p-3 font-bold text-slate-700">{Money.format(varianceCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeSession && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
            >
              إغلاق وحفظ كمسودة
            </button>
            <button
              onClick={handleApproveSession}
              className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>اعتماد الجرد وتوليد التسويات</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
