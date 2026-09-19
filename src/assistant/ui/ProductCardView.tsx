// Product Card View for Smart Pharmacy Copilot (Phase 9)
import React from 'react';
import { ProductCardData } from '../types';
import { Package, Tag, Clock, CheckCircle2, Layers } from 'lucide-react';

interface ProductCardViewProps {
  product: ProductCardData;
}

export const ProductCardView: React.FC<ProductCardViewProps> = ({ product }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 my-2 text-slate-800 shadow-xs space-y-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div>
          <h4 className="text-xs font-bold text-slate-900">{product.name_ar}</h4>
          {product.name_en && <p className="text-2xs text-slate-400 font-sans">{product.name_en}</p>}
        </div>
        <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${product.total_stock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {product.total_stock > 0 ? `متوفر: ${product.total_stock} ${product.base_unit}` : 'نافد من المخزون'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-2xs">
        {product.active_ingredient && (
          <div className="col-span-2 bg-slate-50 p-2 rounded-lg text-slate-600">
            <span className="font-medium text-slate-500">المادة الفعالة: </span>
            <span className="font-bold text-slate-700">{product.active_ingredient}</span>
          </div>
        )}
        <div className="bg-slate-50 p-2 rounded-lg">
          <span className="text-slate-500 block">سعر البيع للجمهور:</span>
          <span className="font-bold text-slate-900 text-xs">{product.current_selling_price} ر.ي</span>
        </div>
        <div className="bg-slate-50 p-2 rounded-lg">
          <span className="text-slate-500 block">سعر الشراء (التكلفة):</span>
          <span className="font-bold text-slate-700 text-xs">{product.current_purchase_price} ر.ي</span>
        </div>
      </div>

      {product.batches && product.batches.length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-2xs font-bold text-slate-500 block flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-400" />
            التشغيلات والصلاحية (FEFO):
          </span>
          <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
            {product.batches.map((b, idx) => (
              <div key={idx} className="flex items-center justify-between text-2xs bg-slate-50/80 px-2 py-1 rounded border border-slate-100">
                <span className="font-mono text-slate-700 font-medium">#{b.batch_number}</span>
                <span className="text-slate-500 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-amber-500" />
                  {b.expiry_date}
                </span>
                <span className="font-bold text-slate-800">{b.quantity} {product.base_unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
