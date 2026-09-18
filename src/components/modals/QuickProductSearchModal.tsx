import React, { useState } from 'react';
import { X, Search, Pill, Package, AlertTriangle, CheckCircle, Barcode, DollarSign } from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { Product, Batch } from '../../types';

interface QuickProductSearchModalProps {
  onClose: () => void;
  onSelectProduct?: (product: Product) => void;
}

export const QuickProductSearchModal: React.FC<QuickProductSearchModalProps> = ({ onClose, onSelectProduct }) => {
  const state = db.getState();
  const products = state.products;
  const batches = state.batches;
  const categories = state.categories;

  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(products[0] || null);

  const filteredProducts = products.filter((p) => {
    const term = query.toLowerCase();
    return (
      p.name_ar.toLowerCase().includes(term) ||
      (p.name_en && p.name_en.toLowerCase().includes(term)) ||
      (p.active_ingredient && p.active_ingredient.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.includes(term))
    );
  });

  const getProductBatches = (productId: string) => {
    return batches.filter((b) => b.product_id === productId && b.current_quantity > 0);
  };

  const getCategoryName = (catId?: string) => {
    return categories.find((c) => c.id === catId)?.name_ar || 'عام';
  };

  const currentBatches = selectedProduct ? getProductBatches(selectedProduct.id) : [];
  const totalStock = currentBatches.reduce((sum, b) => sum + b.current_quantity, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-3xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">بحث سريع عن صنف ومخزونه وتفاصيله</h3>
              <p className="text-xs text-slate-500">الاستعلام الفوري عن الأسعار، التشغيلات، الصلاحية، والمواقع</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم الصنف (عربي أو إنجليزي)، المادة الفعالة، أو الباركود..."
            className="w-full pr-11 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-800 focus:bg-white focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Results List */}
          <div className="md:col-span-2 space-y-2 border-l border-slate-100 pl-3 max-h-[380px] overflow-y-auto">
            <div className="text-xs font-bold text-slate-500">نتائج البحث ({filteredProducts.length})</div>
            {filteredProducts.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">لا توجد أصناف مطابقة</p>
            ) : (
              filteredProducts.map((prod) => {
                const bList = getProductBatches(prod.id);
                const stock = bList.reduce((acc, b) => acc + b.current_quantity, 0);
                return (
                  <button
                    key={prod.id}
                    onClick={() => setSelectedProduct(prod)}
                    className={`w-full text-right p-3 rounded-2xl border text-xs transition-all ${
                      selectedProduct?.id === prod.id
                        ? 'bg-emerald-50/80 border-emerald-300 font-bold'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-slate-900 truncate">{prod.name_ar}</div>
                    {prod.name_en && <div className="text-[11px] text-slate-500 truncate">{prod.name_en}</div>}
                    <div className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="font-mono text-emerald-700 font-bold">
                        {Money.format(prod.current_selling_price || 0)}
                      </span>
                      <span
                        className={`font-mono px-2 py-0.5 rounded-full ${
                          stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        المخزون: {stock}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Product Deep Information */}
          <div className="md:col-span-3">
            {selectedProduct ? (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-black text-slate-900">{selectedProduct.name_ar}</h4>
                      {selectedProduct.name_en && (
                        <p className="text-xs text-slate-500 font-medium">{selectedProduct.name_en}</p>
                      )}
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-xl text-xs">
                      {getCategoryName(selectedProduct.category_id)}
                    </span>
                  </div>

                  {selectedProduct.active_ingredient && (
                    <div className="mt-2 text-xs text-slate-600 bg-white p-2 rounded-xl border border-slate-200">
                      <strong>المادة الفعالة:</strong> {selectedProduct.active_ingredient}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div>
                      <span className="text-[11px] text-slate-500 block">سعر الجمهور:</span>
                      <span className="font-mono text-base font-black text-emerald-700">
                        {Money.format(selectedProduct.current_selling_price || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">سعر التكلفة:</span>
                      <span className="font-mono text-sm font-bold text-slate-700">
                        {Money.format(selectedProduct.current_purchase_price || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Available Batches & Expiry */}
                <div>
                  <h5 className="font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                    <span>التشغيلات والدفعات المتاحة بالمخزن ({currentBatches.length})</span>
                    <span className="font-mono font-bold text-slate-600">إجمالي الرصيد: {totalStock}</span>
                  </h5>

                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-0.5">
                    {currentBatches.length === 0 ? (
                      <p className="text-rose-600 font-bold p-3 bg-rose-50 rounded-xl text-center">
                        هذا الصنف نافد تماماً من المخزن!
                      </p>
                    ) : (
                      currentBatches.map((b) => (
                        <div
                          key={b.id}
                          className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-800 block">تشغيلة: {b.batch_number}</span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              انتهاء: {b.expiry_date}
                            </span>
                          </div>
                          <div className="text-left font-mono">
                            <span className="font-bold text-emerald-700 block">{b.current_quantity} عبوة</span>
                            <span className="text-[10px] text-slate-400">سعر: {Money.format(b.selling_price)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {onSelectProduct && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProduct(selectedProduct);
                        onClose();
                      }}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all"
                    >
                      اختيار الصنف وإضافته للفاتورة
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-400 py-20 text-center">اختر صنفاً من القائمة لعرض تفاصيله الكاملة</p>
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
