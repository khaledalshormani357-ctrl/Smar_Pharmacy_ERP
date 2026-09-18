import React, { useState } from 'react';
import { X, Calendar, ShieldCheck, Tag } from 'lucide-react';
import { Product } from '../../types';
import { StockService } from '../../services/StockService';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';

interface OpeningStockModalProps {
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export const OpeningStockModal: React.FC<OpeningStockModalProps> = ({
  product,
  onClose,
  onSuccess
}) => {
  const [batchNumber, setBatchNumber] = useState('BATCH-' + Math.floor(1000 + Math.random() * 9000));
  // Default expiry date 1 year from now
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const [expiryDate, setExpiryDate] = useState(nextYear.toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(10);
  const [purchaseCost, setPurchaseCost] = useState(product.current_purchase_price || 0);
  const [sellingPrice, setSellingPrice] = useState(product.current_selling_price || 0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      StockService.addOpeningStock({
        productId: product.id,
        batchNumber: batchNumber.trim(),
        expiryDate: expiryDate,
        quantityBase: quantity,
        purchaseCostMinor: purchaseCost,
        sellingPriceMinor: sellingPrice,
        userId: 'user-01'
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إضافة الرصيد الافتتاحي.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">إثبات رصيد افتتاحي (تشغيلة أولية)</h3>
              <p className="text-xs text-slate-500 truncate max-w-[240px]">{product.name_ar}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-bold">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">رقم التشغيلة / الدفعة (Batch No.)</label>
            <input
              type="text"
              required
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">تاريخ انتهاء الصلاحية (YYYY-MM-DD)</label>
            <input
              type="date"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              الكمية المضافة بالوحدة الأساسية ({product.base_unit})
            </label>
            <NumericInput
              value={quantity}
              onChange={setQuantity}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">تكلفة الشراء التاريخية</label>
              <NumericInput
                value={purchaseCost}
                onChange={setPurchaseCost}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block font-mono">{Money.format(purchaseCost)}</span>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">سعر البيع للدفعة</label>
              <NumericInput
                value={sellingPrice}
                onChange={setSellingPrice}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-600"
              />
              <span className="text-[10px] text-slate-400 block font-mono">{Money.format(sellingPrice)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
            >
              إثبات الرصيد في المخزون
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
