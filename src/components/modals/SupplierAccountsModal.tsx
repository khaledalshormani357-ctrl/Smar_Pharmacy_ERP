import React, { useState } from 'react';
import { X, Truck, Search, DollarSign, FileText, Phone, ArrowDownLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../../db/sqlite';
import { FinanceService } from '../../services/FinanceService';
import { Money } from '../../utils/money';
import { Supplier } from '../../types';
import { NumericInput } from '../ui/NumericInput';
import { StatementModal } from '../more/StatementModal';

interface SupplierAccountsModalProps {
  onClose: () => void;
}

export const SupplierAccountsModal: React.FC<SupplierAccountsModalProps> = ({ onClose }) => {
  const state = db.getState();
  const suppliers = state.suppliers;
  const cashboxes = state.cashboxes;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterPayablesOnly, setFilterPayablesOnly] = useState(false);
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);

  // Quick Payment Voucher state
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [selectedCashboxId, setSelectedCashboxId] = useState(cashboxes[0]?.id || '');
  const [paymentNotes, setPaymentNotes] = useState('سداد دفعة نقدية لحساب المورد');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const filteredSuppliers = suppliers.filter((s) => {
    const term = searchTerm.toLowerCase();
    const match = s.name.toLowerCase().includes(term) || (s.phone && s.phone.includes(term));
    if (filterPayablesOnly) {
      return match && s.cached_balance > 0;
    }
    return match;
  });

  const totalPayables = suppliers.reduce((sum, s) => sum + Math.max(0, s.cached_balance), 0);

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;

    if (paymentAmount <= 0) {
      setMessage({ text: 'يرجى إدخال مبلغ سداد صالح.', type: 'error' });
      return;
    }

    try {
      FinanceService.recordSupplierPayment({
        supplier_id: selectedSupplier.id,
        cashbox_id: selectedCashboxId,
        amount: Money.toMinor(paymentAmount),
        statement: paymentNotes.trim() || 'سند صرف وسداد نقدي',
        user_id: 'user-01'
      });

      setMessage({ text: `تم تسجيل سند الصرف وسداد مبلغ ${paymentAmount} ر.ي للمورد بنجاح!`, type: 'success' });
      setSelectedSupplier(null);
      setPaymentAmount(0);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسجيل سند الصرف.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">حسابات الموردين ومتابعة المستحقات</h3>
              <p className="text-xs text-slate-500">كشوفات الحساب وسداد فواتير الموردين وسندات الصرف</p>
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

        {/* Top Summary Banner */}
        <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-indigo-900 font-bold block">إجمالي مستحقات الموردين القائمة</span>
            <span className="text-[11px] text-indigo-700">الذمم الدائنة الواجب سدادها لشركات الأدوية</span>
          </div>
          <div className="font-mono text-base font-black text-indigo-950">
            {Money.format(totalPayables)}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterPayablesOnly(!filterPayablesOnly)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
              filterPayablesOnly
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {filterPayablesOnly ? 'عرض كل الموردين' : 'الموردون المستحقون فقط'}
          </button>
        </div>

        {/* Modal for Quick Payment Voucher */}
        {selectedSupplier && (
          <form onSubmit={handleRecordPayment} className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-amber-700" />
                إصدار سند صرف وسداد للمورد: {selectedSupplier.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedSupplier(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">المبلغ المسدد (ر.ي) *</label>
                <NumericInput
                  value={paymentAmount}
                  onChange={setPaymentAmount}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-amber-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الصندوق المنصرف منه *</label>
                <select
                  value={selectedCashboxId}
                  onChange={(e) => setSelectedCashboxId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (المتاح: {Money.format(box.cached_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-700 font-bold mb-1">بيان السند ورقم الإشعار</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedSupplier(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                <span>حفظ سند الصرف</span>
              </button>
            </div>
          </form>
        )}

        {/* Supplier List */}
        <div className="space-y-2 text-xs">
          <div className="max-h-[320px] overflow-y-auto space-y-2 pr-0.5">
            {filteredSuppliers.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">لا يوجد موردون مطابقون للبحث</p>
            ) : (
              filteredSuppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 hover:border-indigo-300 transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{sup.name}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      {sup.phone && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3" />
                          {sup.phone}
                        </span>
                      )}
                      {sup.contact_person && <span>المندوب: {sup.contact_person}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 block">المستحق للمورد:</span>
                      <span
                        className={`font-mono font-black text-sm ${
                          sup.cached_balance > 0 ? 'text-amber-700' : 'text-slate-700'
                        }`}
                      >
                        {Money.format(sup.cached_balance)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSupplier(sup);
                          setPaymentAmount(Money.toMajor(Math.max(0, sup.cached_balance)));
                        }}
                        className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1"
                        title="سند صرف"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span className="hidden sm:inline">سداد</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStatementSupplierId(sup.id)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1"
                        title="كشف حساب"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="hidden sm:inline">كشف</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
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

      {statementSupplierId && (
        <StatementModal
          type="supplier"
          partyId={statementSupplierId}
          onClose={() => setStatementSupplierId(null)}
        />
      )}
    </div>
  );
};
