import React, { useState } from 'react';
import { X, FileSpreadsheet, ArrowDownLeft, ArrowUpRight, DollarSign, CheckCircle, AlertCircle, Printer, ArrowRightLeft } from 'lucide-react';
import { db } from '../../db/sqlite';
import { FinanceService } from '../../services/FinanceService';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';

interface QuickVoucherModalProps {
  onClose: () => void;
}

export const QuickVoucherModal: React.FC<QuickVoucherModalProps> = ({ onClose }) => {
  const state = db.getState();
  const customers = state.customers;
  const suppliers = state.suppliers;
  const cashboxes = state.cashboxes;
  const expenseCategories = state.expense_categories.filter((c) => c.is_active);

  const [voucherType, setVoucherType] = useState<'receipt' | 'payment' | 'expense' | 'transfer'>('receipt');

  // Form fields
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '');
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [selectedExpenseCatId, setSelectedExpenseCatId] = useState(expenseCategories[0]?.id || '');
  const [selectedCashboxId, setSelectedCashboxId] = useState(cashboxes[0]?.id || '');
  const [transferToCashboxId, setTransferToCashboxId] = useState(cashboxes[1]?.id || cashboxes[0]?.id || '');
  const [amount, setAmount] = useState(0);
  const [statement, setStatement] = useState('');
  const [recipient, setRecipient] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setMessage({ text: 'يرجى إدخال مبلغ صالح أكبر من الصفر.', type: 'error' });
      return;
    }

    try {
      if (voucherType === 'receipt') {
        if (!selectedCustomerId) throw new Error('يرجى اختيار العميل.');
        FinanceService.recordReceipt({
          customer_id: selectedCustomerId,
          cashbox_id: selectedCashboxId,
          amount: Money.toMinor(amount),
          statement: statement.trim() || 'سند قبض نقدي',
          user_id: 'user-01'
        });
        setMessage({ text: 'تم إصدار سند القبض بنجاح وقيد المبلغ في الصندوق وحساب العميل.', type: 'success' });
      } else if (voucherType === 'payment') {
        if (!selectedSupplierId) throw new Error('يرجى اختيار المورد.');
        FinanceService.recordSupplierPayment({
          supplier_id: selectedSupplierId,
          cashbox_id: selectedCashboxId,
          amount: Money.toMinor(amount),
          statement: statement.trim() || 'سند صرف وسداد نقدي',
          user_id: 'user-01'
        });
        setMessage({ text: 'تم إصدار سند الصرف وسداد المبلغ للمورد بنجاح.', type: 'success' });
      } else if (voucherType === 'expense') {
        FinanceService.recordExpense({
          cashbox_id: selectedCashboxId,
          category_id: selectedExpenseCatId,
          amount: Money.toMinor(amount),
          statement: statement.trim() || 'تسجيل سند مصروف',
          recipient: recipient.trim() || undefined,
          user_id: 'user-01'
        });
        setMessage({ text: 'تم إصدار سند المصروف وخصم المبلغ من الصندوق بنجاح.', type: 'success' });
      } else if (voucherType === 'transfer') {
        if (selectedCashboxId === transferToCashboxId) throw new Error('لا يمكن التحويل لنفس الصندوق.');
        FinanceService.transferCash({
          from_cashbox_id: selectedCashboxId,
          to_cashbox_id: transferToCashboxId,
          amount: Money.toMinor(amount),
          notes: statement.trim() || 'تحويل نقدي بين الصناديق',
          user_id: 'user-01'
        });
        setMessage({ text: 'تم إجراء التحويل المالي بين الصناديق بنجاح.', type: 'success' });
      }

      setAmount(0);
      setStatement('');
      setRecipient('');
    } catch (err: any) {
      setMessage({ text: err.message || 'فشلت العملية.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">إصدار سند مالي جديد</h3>
              <p className="text-xs text-slate-500">سندات قبض، سندات صرف، قيود مصروفات وتحويلات</p>
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

        {/* Voucher Type Pills */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setVoucherType('receipt')}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1 ${
              voucherType === 'receipt' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>سند قبض</span>
          </button>

          <button
            type="button"
            onClick={() => setVoucherType('payment')}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1 ${
              voucherType === 'payment' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>سند صرف</span>
          </button>

          <button
            type="button"
            onClick={() => setVoucherType('expense')}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1 ${
              voucherType === 'expense' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>مصروف</span>
          </button>

          <button
            type="button"
            onClick={() => setVoucherType('transfer')}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1 ${
              voucherType === 'transfer' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>تحويل</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Party Selection based on type */}
          {voucherType === 'receipt' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">العميل المقبوض منه *</label>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (الرصيد المدين الحالي: {Money.format(c.cached_balance)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {voucherType === 'payment' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">المورد المصروف له *</label>
              <select
                required
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (المستحق الحالي: {Money.format(s.cached_balance)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {voucherType === 'expense' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">بند المصروف *</label>
                <select
                  required
                  value={selectedExpenseCatId}
                  onChange={(e) => setSelectedExpenseCatId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {expenseCategories.map((ec) => (
                    <option key={ec.id} value={ec.id}>
                      {ec.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">اسم المستلم</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="المستفيد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>
          )}

          {/* Cashboxes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                {voucherType === 'receipt'
                  ? 'الصندوق المودع فيه *'
                  : voucherType === 'transfer'
                  ? 'من صندوق *'
                  : 'الصندوق المنصرف منه *'}
              </label>
              <select
                required
                value={selectedCashboxId}
                onChange={(e) => setSelectedCashboxId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                {cashboxes.map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.name_ar} ({Money.format(box.cached_balance)})
                  </option>
                ))}
              </select>
            </div>

            {voucherType === 'transfer' ? (
              <div>
                <label className="block text-slate-700 font-bold mb-1">إلى صندوق *</label>
                <select
                  required
                  value={transferToCashboxId}
                  onChange={(e) => setTransferToCashboxId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} ({Money.format(box.cached_balance)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-slate-700 font-bold mb-1">المبلغ المالي (ر.ي) *</label>
                <NumericInput
                  value={amount}
                  onChange={setAmount}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>
            )}
          </div>

          {voucherType === 'transfer' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">المبلغ المراد تحويله (ر.ي) *</label>
              <NumericInput
                value={amount}
                onChange={setAmount}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-blue-700"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-bold mb-1">البيان والشرح والملاحظات</label>
            <input
              type="text"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="شرح السند أو رقم الإشعار..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>إصدار واعتماد السند</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
