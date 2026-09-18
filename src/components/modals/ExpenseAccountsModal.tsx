import React, { useState } from 'react';
import { X, Network, Plus, Trash2, CheckCircle, AlertCircle, ToggleLeft, ToggleRight, FolderTree } from 'lucide-react';
import { db } from '../../db/sqlite';
import { ExpenseCategory } from '../../types';

interface ExpenseAccountsModalProps {
  onClose: () => void;
}

export const ExpenseAccountsModal: React.FC<ExpenseAccountsModalProps> = ({ onClose }) => {
  const [categories, setCategories] = useState<ExpenseCategory[]>(() => db.getState().expense_categories);
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNameAr.trim()) {
      setMessage({ text: 'يرجى كتابة اسم بند المصروف بالعربية.', type: 'error' });
      return;
    }

    try {
      db.transaction(() => {
        const state = db.getState();
        const newCat: ExpenseCategory = {
          id: 'exp-cat-' + Math.random().toString(36).substring(2, 9),
          name_ar: newNameAr.trim(),
          name_en: newNameEn.trim() || undefined,
          is_active: true
        };
        state.expense_categories.push(newCat);
      });
      setCategories([...db.getState().expense_categories]);
      setNewNameAr('');
      setNewNameEn('');
      setMessage({ text: 'تمت إضافة بند المصروف بنجاح إلى دليل الحسابات.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل إضافة بند المصروف.', type: 'error' });
    }
  };

  const handleToggleActive = (catId: string) => {
    try {
      db.transaction(() => {
        const state = db.getState();
        const target = state.expense_categories.find((c) => c.id === catId);
        if (target) {
          target.is_active = !target.is_active;
        }
      });
      setCategories([...db.getState().expense_categories]);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">دليل حسابات المصروفات</h3>
              <p className="text-xs text-slate-500">إدارة دليل الحسابات والبنود وتفعيلها وحذفها</p>
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

        {/* Add New Category Form */}
        <form onSubmit={handleAddCategory} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
          <span className="font-bold text-slate-800 block">إضافة بند مصروف جديد</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={newNameAr}
              onChange={(e) => setNewNameAr(e.target.value)}
              placeholder="اسم البند بالعربية (مثل: فاتورة مياه)..."
              className="p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
            />
            <input
              type="text"
              value={newNameEn}
              onChange={(e) => setNewNameEn(e.target.value)}
              placeholder="الاسم بالإنجليزي (اختياري)..."
              className="p-2.5 bg-white border border-slate-200 rounded-xl font-medium"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة البند لدليل المصروفات</span>
          </button>
        </form>

        {/* Categories List */}
        <div className="space-y-2 text-xs">
          <h4 className="font-bold text-slate-700">البنود الحالية ({categories.length})</h4>
          <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-0.5">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300"
              >
                <div>
                  <div className="font-bold text-slate-900">{cat.name_ar}</div>
                  {cat.name_en && <div className="text-[11px] text-slate-400">{cat.name_en}</div>}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(cat.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      cat.is_active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {cat.is_active ? 'نشط ومفعل' : 'معطل'}
                  </button>
                </div>
              </div>
            ))}
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
