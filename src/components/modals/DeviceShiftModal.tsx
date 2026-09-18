import React, { useState } from 'react';
import { X, Clock, PlayCircle, StopCircle, Download, AlertCircle, CheckCircle, Wallet, ShieldAlert } from 'lucide-react';
import { db } from '../../db/sqlite';
import { FinanceService } from '../../services/FinanceService';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { User, WorkShift } from '../../types';

interface DeviceShiftModalProps {
  currentUser: User;
  onClose: () => void;
}

export const DeviceShiftModal: React.FC<DeviceShiftModalProps> = ({ currentUser, onClose }) => {
  const state = db.getState();
  const activeShift = state.work_shifts.find((s) => s.status === 'open');
  const cashboxes = state.cashboxes;

  // New Shift state
  const [openingCashboxId, setOpeningCashboxId] = useState(cashboxes[0]?.id || '');
  const [openingCash, setOpeningCash] = useState(0);

  // Close Shift state
  const [countedCash, setCountedCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Calculate live shift summary if open
  const summary = activeShift ? FinanceService.getShiftSummary(activeShift.id) : null;
  const variance = summary ? Money.toMinor(countedCash) - summary.expected_cash : 0;

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingCashboxId) {
      setMessage({ text: 'يرجى اختيار صندوق الوردية.', type: 'error' });
      return;
    }
    try {
      FinanceService.openShift({
        cashbox_id: openingCashboxId,
        opening_cash: Money.toMinor(openingCash),
        user_id: currentUser.id
      });
      setMessage({ text: 'تم فتح وردية عمل جديدة للجهاز بنجاح.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل فتح الوردية', type: 'error' });
    }
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    if (variance !== 0 && !closingNotes.trim()) {
      setMessage({
        text: `يوجد فارق نقدي (${Money.format(variance)}). تدوين الملاحظات إلزامي قبل الإغلاق.`,
        type: 'error'
      });
      return;
    }

    try {
      FinanceService.closeShift({
        shift_id: activeShift.id,
        actual_cash: Money.toMinor(countedCash),
        closing_notes: closingNotes.trim() || undefined,
        user_id: currentUser.id
      });
      setMessage({ text: 'تم إغلاق الوردية واعتماد تسوية الصندوق النقدية بنجاح.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل إغلاق الوردية', type: 'error' });
    }
  };

  const handleExportShiftPackage = () => {
    if (!activeShift && state.work_shifts.length === 0) {
      setMessage({ text: 'لا توجد ورديات متاحة للتصدير.', type: 'error' });
      return;
    }
    const targetShift = activeShift || state.work_shifts[state.work_shifts.length - 1];
    const shiftSummaryData = FinanceService.getShiftSummary(targetShift.id);
    const shiftPackage = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      device_id: state.profile.device_id,
      pharmacy_name: state.profile.name_ar,
      shift: targetShift,
      summary: shiftSummaryData,
      sales_in_shift: state.sales.filter((s) => s.created_at >= targetShift.started_at && (!targetShift.closed_at || s.created_at <= targetShift.closed_at)),
      cash_transactions_in_shift: state.cash_transactions.filter((c) => c.created_at >= targetShift.started_at && (!targetShift.closed_at || c.created_at <= targetShift.closed_at))
    };

    const blob = new Blob([JSON.stringify(shiftPackage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Shift_Package_${targetShift.id}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: 'تم تصدير حزمة الوردية بنجاح لإرسالها للمدير.', type: 'success' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">وردية الجهاز وحزم العمل</h3>
              <p className="text-xs text-slate-500">فتح/إغلاق وردية العمل وتصدير حزمة للمدير</p>
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

        {/* Current Shift Status */}
        {activeShift ? (
          <div className="space-y-3">
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  وردية عمل مفتوحة حالياً (رقم: {activeShift.id})
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  بدأت: {new Date(activeShift.started_at).toLocaleTimeString('ar-YE')}
                </span>
              </div>

              {summary && (
                <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">الرصيد الافتتاحي:</span>
                    <span className="font-mono font-bold text-slate-800">{Money.format(summary.opening_cash)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">مبيعات نقدية:</span>
                    <span className="font-mono font-bold text-emerald-600">+{Money.format(summary.sales_cash)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">تحصيلات الذمم:</span>
                    <span className="font-mono font-bold text-blue-600">+{Money.format(summary.customer_collections)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">المصروفات والسدادات:</span>
                    <span className="font-mono font-bold text-rose-600">-{Money.format(summary.total_out)}</span>
                  </div>
                  <div className="col-span-2 p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between">
                    <span className="text-blue-900 font-bold">النقد المتوقع في الدرج:</span>
                    <span className="font-mono font-black text-sm text-blue-800">{Money.format(summary.expected_cash)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Close Shift Form */}
            <form onSubmit={handleCloseShift} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                <StopCircle className="w-4 h-4 text-rose-600" />
                إغلاق وتسوية الوردية الحالية
              </h4>

              <div>
                <label className="block text-slate-600 font-bold mb-1">النقدية الفعلية بعد الجرد والعدّ (ر.ي) *</label>
                <NumericInput
                  value={countedCash}
                  onChange={setCountedCash}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              {/* Variance indicator */}
              <div
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                  variance === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : variance > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <span>فارق التسوية (الفعلي - المتوقع):</span>
                <span className="font-mono text-sm">
                  {variance > 0 ? `+${Money.format(variance)} (فائض)` : variance < 0 ? `${Money.format(variance)} (عجز)` : '0.00 ر.ي (مطابق تماماً)'}
                </span>
              </div>

              {variance !== 0 && (
                <div>
                  <label className="block text-rose-700 font-bold mb-1">
                    ملاحظات وتبرير الفارق (إلزامي في حال وجود عجز أو فائض) *
                  </label>
                  <input
                    type="text"
                    required
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="بيان سبب الفارق النقدي..."
                    className="w-full p-2.5 bg-white border border-rose-300 rounded-xl font-bold text-slate-800"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportShiftPackage}
                  className="px-3 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير حزمة</span>
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>إغلاق الوردية واعتماد الجرد</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Open New Shift Form */
          <form onSubmit={handleOpenShift} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <PlayCircle className="w-4 h-4 text-emerald-600" />
              بدء وفتح وردية عمل جديدة
            </h4>

            <div>
              <label className="block text-slate-600 font-bold mb-1">الصندوق النقدي *</label>
              <select
                required
                value={openingCashboxId}
                onChange={(e) => setOpeningCashboxId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
              >
                {cashboxes.map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name_ar} (الرصيد المتاح: {Money.format(box.cached_balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">الرصيد الافتتاحي في الدرج (ر.ي) *</label>
              <NumericInput
                value={openingCash}
                onChange={setOpeningCash}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleExportShiftPackage}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>تصدير آخر وردية</span>
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
              >
                <PlayCircle className="w-4 h-4" />
                <span>فتح الوردية وبدء العمل</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
