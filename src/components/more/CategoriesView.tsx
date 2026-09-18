import React, { useState } from 'react';
import {
  FolderTree,
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Globe
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { CategoryRepository, ManufacturerRepository } from '../../db/repositories';
import { Category, Manufacturer } from '../../types';

export const CategoriesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'categories' | 'manufacturers'>('categories');
  const [categories, setCategories] = useState<Category[]>(CategoryRepository.getAll());
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>(ManufacturerRepository.getAll());

  // Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catNameAr, setCatNameAr] = useState('');
  const [catNameEn, setCatNameEn] = useState('');

  const [showManufacturerModal, setShowManufacturerModal] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null);
  const [manNameAr, setManNameAr] = useState('');
  const [manCountry, setManCountry] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const refreshData = () => {
    setCategories([...CategoryRepository.getAll()]);
    setManufacturers([...ManufacturerRepository.getAll()]);
  };

  // --- Category Actions ---
  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCatNameAr('');
    setCatNameEn('');
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCatNameAr(cat.name_ar);
    setCatNameEn(cat.name_en || '');
    setShowCategoryModal(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        CategoryRepository.update(editingCategory.id, catNameAr, catNameEn);
        setMessage({ text: 'تم تحديث التصنيف بنجاح.', type: 'success' });
      } else {
        const newCat: Category = {
          id: 'cat-' + Math.random().toString(36).substring(2, 9),
          name_ar: catNameAr.trim(),
          name_en: catNameEn.trim() || undefined,
          is_active: true
        };
        CategoryRepository.insert(newCat);
        setMessage({ text: 'تم إضافة التصنيف الجديد بنجاح.', type: 'success' });
      }
      refreshData();
      setShowCategoryModal(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل حفظ التصنيف', type: 'error' });
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    if (!window.confirm(`هل أنت متأكد من حذف التصنيف (${cat.name_ar})؟`)) return;
    try {
      CategoryRepository.delete(cat.id);
      refreshData();
      setMessage({ text: 'تم حذف التصنيف بنجاح.', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل حذف التصنيف', type: 'error' });
    }
  };

  // --- Manufacturer Actions ---
  const handleOpenAddManufacturer = () => {
    setEditingManufacturer(null);
    setManNameAr('');
    setManCountry('');
    setShowManufacturerModal(true);
  };

  const handleOpenEditManufacturer = (man: Manufacturer) => {
    setEditingManufacturer(man);
    setManNameAr(man.name_ar);
    setManCountry(man.country || '');
    setShowManufacturerModal(true);
  };

  const handleSaveManufacturer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingManufacturer) {
        ManufacturerRepository.update(editingManufacturer.id, manNameAr, manCountry);
        setMessage({ text: 'تم تحديث الشركة المصنعة بنجاح.', type: 'success' });
      } else {
        const newMan: Manufacturer = {
          id: 'man-' + Math.random().toString(36).substring(2, 9),
          name_ar: manNameAr.trim(),
          country: manCountry.trim() || undefined
        };
        ManufacturerRepository.insert(newMan);
        setMessage({ text: 'تم إضافة الشركة المصنعة بنجاح.', type: 'success' });
      }
      refreshData();
      setShowManufacturerModal(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل حفظ الشركة المصنعة', type: 'error' });
    }
  };

  const handleDeleteManufacturer = (man: Manufacturer) => {
    if (!window.confirm(`هل أنت متأكد من حذف الشركة المصنعة (${man.name_ar})؟`)) return;
    try {
      ManufacturerRepository.delete(man.id);
      refreshData();
      setMessage({ text: 'تم حذف الشركة المصنعة بنجاح.', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل حذف الشركة المصنعة', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header and Tab Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <FolderTree className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">التصنيفات الدوائية والشركات المصنعة</h3>
            <p className="text-xs text-slate-500">
              تنظيم الأدوية حسب المجموعات العلاجية وتوثيق معامل وشركات الأدوية الموردة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'categories' ? (
            <button
              onClick={handleOpenAddCategory}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة تصنيف جديد</span>
            </button>
          ) : (
            <button
              onClick={handleOpenAddManufacturer}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة شركة مصنعة</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-2.5 text-xs font-bold border animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Switcher Tab */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl text-xs font-bold max-w-sm">
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'categories' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>التصنيفات الدوائية ({categories.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('manufacturers')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'manufacturers' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>الشركات المصنعة ({manufacturers.length})</span>
        </button>
      </div>

      {/* Content */}
      {activeTab === 'categories' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {categories.map((cat) => {
            const productsCount = db.getState().products.filter((p) => p.category_id === cat.id && !p.deleted_at).length;
            return (
              <div
                key={cat.id}
                className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between gap-3 hover:border-slate-300 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-800">{cat.name_ar}</h4>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 font-mono">
                      {productsCount} صنف
                    </span>
                  </div>
                  {cat.name_en && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5 text-left" dir="ltr">
                      {cat.name_en}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenEditCategory(cat)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="تعديل التصنيف"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="حذف التصنيف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {manufacturers.map((man) => {
            const productsCount = db.getState().products.filter((p) => p.manufacturer_id === man.id && !p.deleted_at).length;
            return (
              <div
                key={man.id}
                className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between gap-3 hover:border-slate-300 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-800">{man.name_ar}</h4>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 font-mono">
                      {productsCount} صنف
                    </span>
                  </div>
                  {man.country && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>بلد المنشأ: {man.country}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenEditManufacturer(man)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="تعديل الشركة المصنعة"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteManufacturer(man)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="حذف الشركة المصنعة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {editingCategory ? 'تعديل التصنيف الدوائي' : 'إضافة تصنيف دوائي جديد'}
                </h3>
              </div>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم التصنيف (بالعربية) *</label>
                <input
                  type="text"
                  required
                  value={catNameAr}
                  onChange={(e) => setCatNameAr(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500"
                  placeholder="مثال: المضادات الحيوية، أدوية القلب"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم التصنيف (بالإنجليزية / اللاتينية)</label>
                <input
                  type="text"
                  value={catNameEn}
                  onChange={(e) => setCatNameEn(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono text-left"
                  placeholder="e.g. Antibiotics"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                >
                  حفظ التصنيف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manufacturer Modal */}
      {showManufacturerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {editingManufacturer ? 'تعديل الشركة المصنعة' : 'إضافة شركة مصنعة جديدة'}
                </h3>
              </div>
              <button
                onClick={() => setShowManufacturerModal(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManufacturer} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشركة الدوائية المصنعة *</label>
                <input
                  type="text"
                  required
                  value={manNameAr}
                  onChange={(e) => setManNameAr(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500"
                  placeholder="مثال: شركة شفا، سبأ فارما، نوفارتس"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">بلد المنشأ / التصنيع</label>
                <input
                  type="text"
                  value={manCountry}
                  onChange={(e) => setManCountry(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500"
                  placeholder="مثال: اليمن، سويسرا، مصر، ألمانيا"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManufacturerModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                >
                  حفظ الشركة المصنعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
