import React, { useState } from 'react';
import { X, FilePlus, Gift, Calendar, Tag, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { db } from '../../db/sqlite';
import { StockService } from '../../services/StockService';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { Product } from '../../types';

interface UniversalOpeningStockModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const UniversalOpeningStockModal: React.FC<UniversalOpeningStockModalProps> = ({ onClose, onSuccess }) => {
  const products = db.getState().products;

  const [entryType, setEntryType] = useState<'opening' | 'sample'>('opening');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');

  const [batchNumber, setBatchNumber] = useState('INIT-' + Math.floor(1000 + Math.random() * 9000));
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 2);
  const [expiryDate, setExpiryDate] = useState(nextYear.toISOString().slice(0, 10));

  const [quantity, setQuantity] = useState(10);
  const [purchaseCost, setPurchaseCost] = useState(1000);
  const [sellingPrice, setSellingPrice] = useState(1300);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase();
    return p.name_ar.toLowerCase().includes(term) || (p.name_en && p.name_en.toLowerCase().includes(term));
  });

  const handleProductSelect = (p: Product) => {
    setSelectedProductId(p.id);
    if (p.current_purchase_price) {
      setPurchaseCost(Money.toMajor(p.current_purchase_price));
    }
    if (p.current_selling_price) {
      setSellingPrice(Money.toMajor(p.current_selling_price));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      setMessage({ text: 'يرجى اختيار الصنف أولاً.', type: 'error' });
      return;
    }

    try {
      // For free samples, purchase cost is 0
      const effectivePurchaseCost = entryType === 'sample' ? 0 : Money.toMinor(purchaseCost);
      const effectiveSellingPrice = Money.toMinor(sellingPrice);

      StockService.addOpeningStock({
        productId: selectedProductId,
        batchNumber: batchNumber.trim(),
        expiryDate,
        quantityBase: quantity,
        purchaseCostMinor: effectivePurchaseCost,
        sellingPriceMinor: effectiveSellingPrice,
        userId: 'user-01'
      });

      setMessage({
        text: `تم إثبات ${entryType === 'opening' ? 'بضاعة أول المدة' : 'العينة الطبية المجانية'} للصنف بنجاح!`,
        type: 'success'
      });
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تسجيل الرصيد.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <FilePlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">العينات المجانية والمخزون الافتتاحي</h3>
              <p className="text-xs text-slate-500">إدخال وضبط بضاعة أول المدة أو هدايا وعينات المندوبين</p>
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

        {/* Type Selector: Opening Stock vs Free Sample */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setEntryType('opening')}
            className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              entryType === 'opening' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>بضاعة أول المدة (افتتاحي)</span>
          </button>

          <button
            type="button"
            onClick={() => setEntryType('sample')}
            className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              entryType === 'sample' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>عينة طبية مجانية (تكلفة 0)</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Product Picker */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">اختر الصنف الدوائي *</label>
            <div className="relative mb-1.5">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="تصفية قائمة الأصناف..."
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <select
              required
              value={selectedProductId}
              onChange={(e) => {
                const prod = products.find((p) => p.id === e.target.value);
                if (prod) handleProductSelect(prod);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
            >
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_ar} {p.name_en ? `(${p.name_en})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">رقم التشغيلة / الدفعة *</label>
              <input
                type="text"
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">تاريخ انتهاء الصلاحية *</label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">الكمية المدخلة (بالوحدة الأساسية) *</label>
              <NumericInput
                value={quantity}
                onChange={setQuantity}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold"
              />
            </div>

            {entryType === 'opening' ? (
              <div>
                <label className="block text-slate-700 font-bold mb-1">سعر التكلفة والشراء (ر.ي) *</label>
                <NumericInput
                  value={purchaseCost}
                  onChange={setPurchaseCost}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold"
                />
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-emerald-800 font-bold block text-[11px]">تكلفة الشراء:</span>
                <span className="font-mono font-black text-emerald-700 text-sm">0.00 ر.ي (مجانية)</span>
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-slate-700 font-bold mb-1">سعر البيع للجمهور (ر.ي) *</label>
              <NumericInput
                value={sellingPrice}
                onChange={setSellingPrice}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold"
              />
            </div>
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
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <FilePlus className="w-4 h-4" />
              <span>إثبات في المخزون</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
