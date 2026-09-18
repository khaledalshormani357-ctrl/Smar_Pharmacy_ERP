import React, { useState } from 'react';
import { X, Printer, Barcode, Tag, Calendar, DollarSign, CheckCircle2 } from 'lucide-react';
import { Product, Batch } from '../../types';
import { Money } from '../../utils/money';
import { db } from '../../db/sqlite';

interface BarcodeLabelModalProps {
  product: Product;
  batch?: Batch;
  onClose: () => void;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  product,
  batch,
  onClose
}) => {
  const [copies, setCopies] = useState<number>(1);
  const [labelSize, setLabelSize] = useState<'single' | 'sheet'>('single');
  const pharmacy = db.getState().profile;

  const displayBarcode = product.barcode || product.internal_code;
  const displayPrice = batch?.selling_price || product.selling_price;
  const displayExpiry = batch?.expiry_date || 'N/A';
  const displayBatch = batch?.batch_number || 'GEN-01';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">طباعة ملصق الباركود والتسعيرة</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Label Preview Card */}
          <div className="bg-slate-100 p-6 rounded-2xl flex items-center justify-center">
            <div className="bg-white border-2 border-slate-800 rounded-xl p-4 w-72 shadow-sm text-center space-y-2">
              <span className="text-[10px] font-bold text-slate-500 block">{pharmacy.name_ar}</span>
              <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{product.name_ar}</h4>
              {product.name_en && (
                <p className="text-[9px] text-slate-400 font-mono -mt-1">{product.name_en}</p>
              )}

              {/* Barcode Simulated Lines */}
              <div className="py-2 flex flex-col items-center">
                <div className="flex items-center justify-center gap-0.5 h-10 w-48 bg-slate-50 p-1 rounded-sm">
                  {displayBarcode.split('').map((char, i) => (
                    <div
                      key={i}
                      className={`h-full ${
                        char.charCodeAt(0) % 2 === 0 ? 'w-1 bg-black' : 'w-0.5 bg-black'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-mono font-bold tracking-widest text-slate-800 mt-1">
                  {displayBarcode}
                </span>
              </div>

              {/* Price & Expiry */}
              <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-300 text-[10px]">
                <div className="text-right">
                  <span className="text-slate-400 block text-[8px]">السعر</span>
                  <span className="font-bold text-xs text-slate-900 font-mono">
                    {Money.format(displayPrice)}
                  </span>
                </div>
                {batch && (
                  <div className="text-left">
                    <span className="text-slate-400 block text-[8px]">الانتهاء / الدفعة</span>
                    <span className="font-bold font-mono text-slate-700">
                      {displayExpiry} ({displayBatch})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Print Controls */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عدد الملصقات المطلوبة</label>
              <input
                type="number"
                min="1"
                max="500"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 font-mono focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تنسيق الطباعة</label>
              <select
                value={labelSize}
                onChange={(e) => setLabelSize(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-hidden focus:border-blue-500"
              >
                <option value="single">طابعة ملصقات حرارية فردية (40x25mm)</option>
                <option value="sheet">صفحة ملصقات A4 متكررة</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-white"
          >
            إغلاق
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الملصقات ({copies})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
