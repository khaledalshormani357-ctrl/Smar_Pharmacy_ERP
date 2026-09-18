import React, { useState } from 'react';
import { X, ClipboardList, Upload, CheckCircle2, AlertCircle, FileText, Check } from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { WorkShift } from '../../types';

interface IncomingShiftsModalProps {
  onClose: () => void;
}

export const IncomingShiftsModal: React.FC<IncomingShiftsModalProps> = ({ onClose }) => {
  const state = db.getState();
  const shifts = [...state.work_shifts].reverse();
  const users = state.users;

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [selectedShift, setSelectedShift] = useState<WorkShift | null>(shifts[0] || null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !parsed.shift || !parsed.shift.id) {
          throw new Error('الملف ليس حزمة وردية صالحة.');
        }

        // Add or update shift in state
        db.transaction(() => {
          const s = db.getState();
          const existingIdx = s.work_shifts.findIndex((ws) => ws.id === parsed.shift.id);
          if (existingIdx >= 0) {
            s.work_shifts[existingIdx] = parsed.shift;
          } else {
            s.work_shifts.push(parsed.shift);
          }
        });

        setMessage({ text: `تم استيراد حزمة الوردية (${parsed.shift.id}) بنجاح!`, type: 'success' });
      } catch (err: any) {
        setMessage({ text: err.message || 'فشل قراءة ملف الوردية.', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const getUserName = (userId: string) => {
    return users.find((u) => u.id === userId)?.full_name || userId;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">مراجعة الورديات الواردة وحزم الموظفين</h3>
              <p className="text-xs text-slate-500">استيراد حزم الموظفين ومطابقة التوريدات واعتمادها</p>
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
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Upload Action */}
        <div className="p-4 bg-purple-50/60 border border-dashed border-purple-300 rounded-2xl flex items-center justify-between gap-3">
          <div>
            <span className="font-bold text-xs text-purple-900 block">استيراد حزمة وردية خارجية من جهاز موظف (JSON)</span>
            <span className="text-[11px] text-purple-700">يمكنك رفع ملف الحزمة الصادر من جهاز الكاشير لمراجعته هنا</span>
          </div>
          <label className="cursor-pointer px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-xs">
            <Upload className="w-4 h-4" />
            <span>اختر ملف الحزمة</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>

        {/* Shifts List & Review Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Shifts Sidebar */}
          <div className="md:col-span-1 space-y-2 max-h-[340px] overflow-y-auto pr-1">
            <h4 className="text-xs font-bold text-slate-700">سجل الورديات ({shifts.length})</h4>
            {shifts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">لا توجد ورديات مسجلة بعد</p>
            ) : (
              shifts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShift(s)}
                  className={`w-full text-right p-3 rounded-2xl border transition-all text-xs ${
                    selectedShift?.id === s.id
                      ? 'bg-blue-50/90 border-blue-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="truncate">{getUserName(s.user_id)}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        s.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.status === 'open' ? 'جارية' : 'مغلقة'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                    <span>{new Date(s.started_at).toLocaleDateString('ar-YE')}</span>
                    <span className="font-mono font-bold text-slate-700">{Money.format(s.expected_cash || s.opening_cash)}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Shift Detailed View */}
          <div className="md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            {selectedShift ? (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <h5 className="font-bold text-sm text-slate-900">تفاصيل الوردية: {selectedShift.id}</h5>
                    <p className="text-[11px] text-slate-500">
                      الموظف المسؤول: {getUserName(selectedShift.user_id)}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-xl font-bold text-xs ${
                      selectedShift.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {selectedShift.status === 'open' ? 'مفتوحة حالياً' : 'مكتملة ومغلقة'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">تاريخ الفتح:</span>
                    <span className="font-bold">{new Date(selectedShift.started_at).toLocaleString('ar-YE')}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">تاريخ الإغلاق:</span>
                    <span className="font-bold">
                      {selectedShift.closed_at ? new Date(selectedShift.closed_at).toLocaleString('ar-YE') : 'لم تغلق بعد'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">الرصيد الافتتاحي:</span>
                    <span className="font-mono font-bold text-slate-800">{Money.format(selectedShift.opening_cash)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">المبيعات النقدية:</span>
                    <span className="font-mono font-bold text-emerald-600">+{Money.format(selectedShift.total_sales_cash || 0)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">المبيعات الآجلة:</span>
                    <span className="font-mono font-bold text-amber-600">{Money.format(selectedShift.total_sales_credit || 0)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">المصروفات:</span>
                    <span className="font-mono font-bold text-rose-600">-{Money.format(selectedShift.total_expenses || 0)}</span>
                  </div>
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-blue-900 block text-[11px] font-bold">المبلغ المتوقع:</span>
                    <span className="font-mono font-black text-blue-800">{Money.format(selectedShift.expected_cash || 0)}</span>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-emerald-900 block text-[11px] font-bold">المبلغ الفعلي المورّد:</span>
                    <span className="font-mono font-black text-emerald-800">{Money.format(selectedShift.actual_cash || 0)}</span>
                  </div>
                </div>

                {selectedShift.cash_difference !== undefined && selectedShift.cash_difference !== 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                    <div className="font-bold flex items-center justify-between">
                      <span>الفارق النقدي المسجل:</span>
                      <span className="font-mono text-sm">{Money.format(selectedShift.cash_difference)}</span>
                    </div>
                    {selectedShift.closing_notes && (
                      <div className="mt-1 text-[11px] text-amber-800">
                        <strong>التبرير:</strong> {selectedShift.closing_notes}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-400 py-12 text-center">اختر وردية من القائمة لعرض تقريرها المالي</p>
            )}
          </div>
        </div>

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
