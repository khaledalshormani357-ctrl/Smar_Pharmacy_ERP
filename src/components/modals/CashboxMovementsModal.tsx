import React, { useState } from 'react';
import { X, Wallet, ArrowDownLeft, ArrowUpRight, Plus, ArrowRightLeft, DollarSign, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { db } from '../../db/sqlite';
import { FinanceService } from '../../services/FinanceService';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';

interface CashboxMovementsModalProps {
  onClose: () => void;
}

export const CashboxMovementsModal: React.FC<CashboxMovementsModalProps> = ({ onClose }) => {
  const state = db.getState();
  const cashboxes = state.cashboxes;
  const expenseCategories = state.expense_categories.filter((c) => c.is_active);

  const [activeTab, setActiveTab] = useState<'movements' | 'transfer' | 'expense' | 'adjust'>('movements');
  const [selectedBoxId, setSelectedBoxId] = useState(cashboxes[0]?.id || '');

  // Transfer state
  const [transferFrom, setTransferFrom] = useState(cashboxes[0]?.id || '');
  const [transferTo, setTransferTo] = useState(cashboxes[1]?.id || cashboxes[0]?.id || '');
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferNotes, setTransferNotes] = useState('');

  // Expense state
  const [expenseCatId, setExpenseCatId] = useState(expenseCategories[0]?.id || '');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseStatement, setExpenseStatement] = useState('');
  const [expenseRecipient, setExpenseRecipient] = useState('');

  // Adjust state
  const [adjustDirection, setAdjustDirection] = useState<'IN' | 'OUT'>('IN');
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const selectedBox = cashboxes.find((c) => c.id === selectedBoxId);
  const transactions = state.cash_transactions
    .filter((tx) => !selectedBoxId || tx.cashbox_id === selectedBoxId)
    .slice(-30)
    .reverse();

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferFrom === transferTo) {
      setMessage({ text: 'لا يمكن التحويل لنفس الصندوق.', type: 'error' });
      return;
    }
    try {
      FinanceService.transferCash({
        from_cashbox_id: transferFrom,
        to_cashbox_id: transferTo,
        amount: Money.toMinor(transferAmount),
        notes: transferNotes.trim() || 'تحويل نقدي بين الصناديق',
        user_id: 'user-01'
      });
      setMessage({ text: 'تم التحويل المالي بين الصناديق بنجاح!', type: 'success' });
      setTransferAmount(0);
      setTransferNotes('');
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل التحويل.', type: 'error' });
    }
  };

  const handleExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0) {
      setMessage({ text: 'يرجى إدخال مبلغ صحيح.', type: 'error' });
      return;
    }
    try {
      FinanceService.recordExpense({
        cashbox_id: selectedBoxId,
        category_id: expenseCatId,
        amount: Money.toMinor(expenseAmount),
        statement: expenseStatement.trim() || 'تسجيل سند مصروف',
        recipient: expenseRecipient.trim() || undefined,
        user_id: 'user-01'
      });
      setMessage({ text: 'تم تسجيل المصروف وصرفه من الصندوق بنجاح!', type: 'success' });
      setExpenseAmount(0);
      setExpenseStatement('');
      setExpenseRecipient('');
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسجيل المصروف.', type: 'error' });
    }
  };

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustAmount <= 0) {
      setMessage({ text: 'يرجى إدخال مبلغ تسوية صالح.', type: 'error' });
      return;
    }
    try {
      FinanceService.adjustCash({
        cashbox_id: selectedBoxId,
        direction: adjustDirection,
        amount: Money.toMinor(adjustAmount),
        reason: adjustReason.trim(),
        user_id: 'user-01'
      });
      setMessage({ text: 'تمت التسوية النقدية للصندوق بنجاح!', type: 'success' });
      setAdjustAmount(0);
      setAdjustReason('');
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسوية الصندوق.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">حركات الصندوق وسندات القبض والصرف</h3>
              <p className="text-xs text-slate-500">متابعة الأرصدة النقدية، التحويلات، المصروفات، والتسويات</p>
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

        {/* Cashbox cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cashboxes.map((box) => (
            <button
              key={box.id}
              onClick={() => setSelectedBoxId(box.id)}
              className={`p-3 rounded-2xl border text-right transition-all ${
                selectedBoxId === box.id
                  ? 'bg-teal-50/80 border-teal-300 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className="text-[11px] text-slate-500 block">{box.name_ar}</span>
              <span className="font-mono font-black text-sm text-slate-900 block mt-0.5">
                {Money.format(box.cached_balance)}
              </span>
            </button>
          ))}
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'movements' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            سجل الحركات
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('expense')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'expense' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            تسجيل مصروف
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transfer')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'transfer' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            نقل سيولة
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('adjust')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'adjust' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            تسوية نقدية
          </button>
        </div>

        {/* Content according to tab */}
        {activeTab === 'movements' && (
          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-slate-700">آخر الحركات النقدية</h4>
            <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-0.5">
              {transactions.length === 0 ? (
                <p className="text-slate-400 py-8 text-center">لا توجد حركات مسجلة لهذا الصندوق</p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                          tx.direction === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {tx.direction === 'IN' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{tx.statement || tx.type}</div>
                        <div className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleString('ar-YE')}</div>
                      </div>
                    </div>

                    <div className="text-left font-mono">
                      <span className={`font-black ${tx.direction === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.direction === 'IN' ? '+' : '-'}{Money.format(tx.amount)}
                      </span>
                      <span className="block text-[10px] text-slate-400">بعد: {Money.format(tx.balance_after)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'expense' && (
          <form onSubmit={handleExpense} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <h4 className="font-bold text-slate-800">صرف مصروف من: {selectedBox?.name_ar}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">بند المصروف *</label>
                <select
                  value={expenseCatId}
                  onChange={(e) => setExpenseCatId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">المبلغ المصروف (ر.ي) *</label>
                <NumericInput
                  value={expenseAmount}
                  onChange={setExpenseAmount}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-rose-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">المستلم / الجهة</label>
                <input
                  type="text"
                  value={expenseRecipient}
                  onChange={(e) => setExpenseRecipient(e.target.value)}
                  placeholder="اسم الشخص أو الشركة..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">البيان والشرح</label>
                <input
                  type="text"
                  value={expenseStatement}
                  onChange={(e) => setExpenseStatement(e.target.value)}
                  placeholder="تفاصيل المصروف..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>اعتماد صرف المصروف</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'transfer' && (
          <form onSubmit={handleTransfer} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <h4 className="font-bold text-slate-800">تحويل سيولة نقدية بين الصناديق</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">من الصندوق *</label>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (الرصيد: {Money.format(box.cached_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">إلى الصندوق *</label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (الرصيد: {Money.format(box.cached_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-700 font-bold mb-1">المبلغ المراد تحويله (ر.ي) *</label>
                <NumericInput
                  value={transferAmount}
                  onChange={setTransferAmount}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-teal-700"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-slate-700 font-bold mb-1">ملاحظات التحويل</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="سبب التحويل أو رقم الإشعار..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>إتمام عملية التحويل</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'adjust' && (
          <form onSubmit={handleAdjust} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <h4 className="font-bold text-slate-800">تسوية رصيد الصندوق: {selectedBox?.name_ar}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">نوع التسوية *</label>
                <select
                  value={adjustDirection}
                  onChange={(e) => setAdjustDirection(e.target.value as 'IN' | 'OUT')}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                >
                  <option value="IN">إيداع تسوية (+ زيادة نقدية)</option>
                  <option value="OUT">سحب تسوية (- عجز أو سحب أرباح)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">مبلغ التسوية (ر.ي) *</label>
                <NumericInput
                  value={adjustAmount}
                  onChange={setAdjustAmount}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-slate-700 font-bold mb-1">سبب التسوية الإدارية *</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="سبب التسوية لتوثيقها في سجل التدقيق..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                <span>اعتماد التسوية النقدية</span>
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
