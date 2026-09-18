import React, { useState } from 'react';
import { UserPlus, X, User, Phone, MapPin, CreditCard, Save } from 'lucide-react';
import { CustomerRepository } from '../../db/repositories';
import { NumericInput } from '../ui/NumericInput';
import { Money } from '../../utils/money';
import { Customer } from '../../types';

interface NewCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
  userId?: string;
}

export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  isOpen,
  onClose,
  onCustomerCreated,
  userId = 'user-01'
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimitMajor, setCreditLimitMajor] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('اسم العميل إلزامي.');
      return;
    }

    try {
      const created = CustomerRepository.create(
        {
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          credit_limit: Money.toMinor(creditLimitMajor)
        },
        userId
      );
      onCustomerCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'تعذر إنشاء حساب العميل.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            <h3 className="text-base font-bold">إضافة عميل جديد (حساب ذمة)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم العميل / الجهة <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: مستوصف الشفاء، أو أحمد محمد"
                className="w-full pr-9 pl-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف / الجوال</label>
            <div className="relative flex items-center">
              <Phone className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="770000000"
                dir="ltr"
                className="w-full pr-9 pl-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-left font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / المنطقة</label>
            <div className="relative flex items-center">
              <MapPin className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثال: شارع الستين، بجوار مدرسة الأمل"
                className="w-full pr-9 pl-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">سقف الائتمان المسموح به (ر.ي)</label>
            <div className="relative flex items-center">
              <CreditCard className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none z-10" />
              <NumericInput
                value={creditLimitMajor}
                onChange={setCreditLimitMajor}
                placeholder="0.00 (صفر = غير محدد)"
                className="pr-9"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">اتركه صفراً إذا لم يكن هناك حد أقصى للمديونية.</p>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>حفظ واختيار العميل</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
