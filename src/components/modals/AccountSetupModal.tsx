import React, { useState } from 'react';
import { X, UserPlus, Truck, User, Phone, MapPin, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { Customer, Supplier } from '../../types';

interface AccountSetupModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  defaultType?: 'customer' | 'supplier';
}

export const AccountSetupModal: React.FC<AccountSetupModalProps> = ({
  onClose,
  onSuccess,
  defaultType = 'customer'
}) => {
  const [accountType, setAccountType] = useState<'customer' | 'supplier'>(defaultType);

  // Common & specific fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [creditLimit, setCreditLimit] = useState(50000);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: 'يرجى إدخال اسم العميل أو المورد.', type: 'error' });
      return;
    }

    try {
      db.transaction(() => {
        const state = db.getState();
        const now = Date.now();
        const initialBalanceMinor = Money.toMinor(openingBalance);

        if (accountType === 'customer') {
          const newCust: Customer = {
            id: 'cust-' + Math.random().toString(36).substring(2, 9),
            name: name.trim(),
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            cached_balance: initialBalanceMinor,
            credit_limit: Money.toMinor(creditLimit),
            is_active: true,
            created_at: now,
            updated_at: now
          };
          state.customers.push(newCust);

          // If there's an opening balance debt, create opening customer transaction
          if (initialBalanceMinor > 0) {
            state.customer_transactions.push({
              id: 'ctx-init-' + Math.random().toString(36).substring(2, 9),
              customer_id: newCust.id,
              transaction_type: 'opening_balance',
              reference_type: 'opening_balance',
              reference_id: `OB-${newCust.id}`,
              debit: initialBalanceMinor,
              credit: 0,
              balance_after: initialBalanceMinor,
              notes: 'رصيد مدين افتتاحي عند تأسيس الحساب',
              created_by: 'user-01',
              created_at: now,
              business_date: new Date(now).toISOString().slice(0, 10)
            });
          }
        } else {
          const newSup: Supplier = {
            id: 'sup-' + Math.random().toString(36).substring(2, 9),
            name: name.trim(),
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            contact_person: contactPerson.trim() || undefined,
            cached_balance: initialBalanceMinor,
            is_active: true,
            created_at: now,
            updated_at: now
          };
          state.suppliers.push(newSup);

          // If there's an opening payable, create opening supplier transaction
          if (initialBalanceMinor > 0) {
            state.supplier_transactions.push({
              id: 'stx-init-' + Math.random().toString(36).substring(2, 9),
              supplier_id: newSup.id,
              transaction_type: 'opening_balance',
              reference_type: 'opening_balance',
              reference_id: `OB-${newSup.id}`,
              debit: 0,
              credit: initialBalanceMinor,
              balance_after: initialBalanceMinor,
              notes: 'رصيد دائن افتتاحي مستحق للمورد عند التأسيس',
              created_by: 'user-01',
              created_at: now,
              business_date: new Date(now).toISOString().slice(0, 10)
            });
          }
        }
      });

      setMessage({
        text: `تم تأسيس حساب ${accountType === 'customer' ? 'العميل' : 'المورد'} بنجاح!`,
        type: 'success'
      });
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تأسيس الحساب.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">تأسيس حساب عميل / مورد جديد</h3>
              <p className="text-xs text-slate-500">فتح وتأسيس حسابات الذمم المالية والحد الائتماني</p>
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

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setAccountType('customer')}
            className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              accountType === 'customer' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>حساب عميل (مدين)</span>
          </button>

          <button
            type="button"
            onClick={() => setAccountType('supplier')}
            className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              accountType === 'supplier' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>حساب مورد (دائن)</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              {accountType === 'customer' ? 'اسم العميل / المستوصف *' : 'اسم شركة التوريد / المورد *'}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={accountType === 'customer' ? 'مثال: أحمد محمد أو مركز الحياة الطبي' : 'مثال: شركة ابن سينا للأدوية'}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">رقم الهاتف / الجوال</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="77XXXXXXX"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>

            {accountType === 'supplier' ? (
              <div>
                <label className="block text-slate-700 font-bold mb-1">مسؤول التواصل / المندوب</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="اسم المندوب..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            ) : (
              <div>
                <label className="block text-slate-700 font-bold mb-1">سقف الدين / الائتمان (ر.ي)</label>
                <NumericInput
                  value={creditLimit}
                  onChange={setCreditLimit}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">العنوان / المنطقة</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="المدينة، الشارع..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              الرصيد الافتتاحي السابق (ر.ي)
              <span className="text-slate-400 font-normal mr-1">
                ({accountType === 'customer' ? 'دين سابق على العميل' : 'مستحق سابق للمورد'})
              </span>
            </label>
            <NumericInput
              value={openingBalance}
              onChange={setOpeningBalance}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900"
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
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>تأسيس الحساب المالي</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
