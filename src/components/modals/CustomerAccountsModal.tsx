import React, { useState } from 'react';
import { X, Users, Search, DollarSign, FileText, Phone, ArrowUpRight, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../../db/sqlite';
import { FinanceService } from '../../services/FinanceService';
import { Money } from '../../utils/money';
import { Customer } from '../../types';
import { NumericInput } from '../ui/NumericInput';
import { StatementModal } from '../more/StatementModal';

interface CustomerAccountsModalProps {
  onClose: () => void;
}

export const CustomerAccountsModal: React.FC<CustomerAccountsModalProps> = ({ onClose }) => {
  const state = db.getState();
  const customers = state.customers;
  const cashboxes = state.cashboxes;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDebtsOnly, setFilterDebtsOnly] = useState(false);
  const [statementCustomerId, setStatementCustomerId] = useState<string | null>(null);

  // Quick Receipt Voucher state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [receiptAmount, setReceiptAmount] = useState(0);
  const [selectedCashboxId, setSelectedCashboxId] = useState(cashboxes[0]?.id || '');
  const [receiptNotes, setReceiptNotes] = useState('تحصيل دفعة نقدية من الحساب');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const filteredCustomers = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    const match = c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term));
    if (filterDebtsOnly) {
      return match && c.cached_balance > 0;
    }
    return match;
  });

  const totalDebts = customers.reduce((sum, c) => sum + Math.max(0, c.cached_balance), 0);

  const handleRecordReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    if (receiptAmount <= 0) {
      setMessage({ text: 'يرجى إدخال مبلغ تحصيل صالح.', type: 'error' });
      return;
    }

    try {
      FinanceService.recordReceipt({
        customer_id: selectedCustomer.id,
        cashbox_id: selectedCashboxId,
        amount: Money.toMinor(receiptAmount),
        statement: receiptNotes.trim() || 'سند قبض وتحصيل نقدي',
        user_id: 'user-01'
      });

      setMessage({ text: `تم تسجيل سند القبض وتحصيل مبلغ ${receiptAmount} ر.ي بنجاح!`, type: 'success' });
      setSelectedCustomer(null);
      setReceiptAmount(0);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسجيل سند القبض.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">حسابات العملاء والديون والتحصيل</h3>
              <p className="text-xs text-slate-500">كشوفات الحساب ومتابعة الديون وسندات القبض</p>
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
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-blue-800 font-bold block">إجمالي ديون العملاء المستحقة</span>
            <span className="text-[11px] text-blue-600">الذمم المدينة المسجلة على العملاء</span>
          </div>
          <div className="font-mono text-base font-black text-blue-900">
            {Money.format(totalDebts)}
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
            onClick={() => setFilterDebtsOnly(!filterDebtsOnly)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
              filterDebtsOnly
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {filterDebtsOnly ? 'عرض كل العملاء' : 'العملاء المدينون فقط'}
          </button>
        </div>

        {/* Modal for Quick Receipt Voucher */}
        {selectedCustomer && (
          <form onSubmit={handleRecordReceipt} className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                إصدار سند قبض وتحصيل من العميل: {selectedCustomer.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">المبلغ المقبوض (ر.ي) *</label>
                <NumericInput
                  value={receiptAmount}
                  onChange={setReceiptAmount}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-emerald-700"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الصندوق المستلم *</label>
                <select
                  value={selectedCashboxId}
                  onChange={(e) => setSelectedCashboxId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-700 font-bold mb-1">بيان السند والملاحظات</label>
                <input
                  type="text"
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                <span>حفظ سند القبض</span>
              </button>
            </div>
          </form>
        )}

        {/* Customer List */}
        <div className="space-y-2 text-xs">
          <div className="max-h-[320px] overflow-y-auto space-y-2 pr-0.5">
            {filteredCustomers.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">لا يوجد عملاء مطابقون للبحث</p>
            ) : (
              filteredCustomers.map((cust) => (
                <div
                  key={cust.id}
                  className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 hover:border-blue-300 transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{cust.name}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      {cust.phone && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3" />
                          {cust.phone}
                        </span>
                      )}
                      {cust.address && <span>{cust.address}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left">
                      <span className="text-[10px] text-slate-400 block">الرصيد المدين:</span>
                      <span
                        className={`font-mono font-black text-sm ${
                          cust.cached_balance > 0 ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        {Money.format(cust.cached_balance)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setReceiptAmount(Money.toMajor(Math.max(0, cust.cached_balance)));
                        }}
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1"
                        title="سند قبض"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span className="hidden sm:inline">تحصيل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStatementCustomerId(cust.id)}
                        className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1"
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

      {statementCustomerId && (
        <StatementModal
          type="customer"
          partyId={statementCustomerId}
          onClose={() => setStatementCustomerId(null)}
        />
      )}
    </div>
  );
};
