import React, { useState } from 'react';
import { X, CalendarClock, Edit3, Search, AlertCircle, CheckCircle, Save } from 'lucide-react';
import { db } from '../../db/sqlite';
import { StockService } from '../../services/StockService';
import { Money } from '../../utils/money';
import { Batch, Product } from '../../types';
import { NumericInput } from '../ui/NumericInput';

interface BatchAdjustmentModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const BatchAdjustmentModal: React.FC<BatchAdjustmentModalProps> = ({ onClose, onSuccess }) => {
  const state = db.getState();
  const products = state.products;
  const batches = state.batches;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);

  // Edit fields
  const [newQuantity, setNewQuantity] = useState(0);
  const [newPurchasePrice, setNewPurchasePrice] = useState(0);
  const [newSellingPrice, setNewSellingPrice] = useState(0);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [reason, setReason] = useState('تعديل تسوية رصيد افتتاحي وتصحيح دفعة');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const filteredBatches = batches.filter((b) => {
    const prod = products.find((p) => p.id === b.product_id);
    const term = searchTerm.toLowerCase();
    return (
      b.batch_number.toLowerCase().includes(term) ||
      (prod && (prod.name_ar.toLowerCase().includes(term) || prod.name_en?.toLowerCase().includes(term)))
    );
  });

  const handleSelectBatch = (b: Batch) => {
    setSelectedBatch(b);
    setNewQuantity(b.current_quantity);
    setNewPurchasePrice(Money.toMajor(b.purchase_price));
    setNewSellingPrice(Money.toMajor(b.selling_price));
    setNewExpiryDate(b.expiry_date);
    setMessage(null);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    if (!reason.trim()) {
      setMessage({ text: 'يرجى كتابة سبب التعديل لتوثيقه في سجل التدقيق.', type: 'error' });
      return;
    }

    try {
      db.transaction(() => {
        const s = db.getState();
        const batchToUpdate = s.batches.find((b) => b.id === selectedBatch.id);
        if (!batchToUpdate) throw new Error('الدفعة غير موجودة.');

        const qtyDiff = newQuantity - batchToUpdate.current_quantity;

        // Record stock movement if quantity changed
        if (qtyDiff !== 0) {
          s.stock_movements.push({
            id: 'smv-' + Math.random().toString(36).substring(2, 9),
            batch_id: batchToUpdate.id,
            product_id: batchToUpdate.product_id,
            movement_type: qtyDiff > 0 ? 'adjustment_plus' : 'adjustment_minus',
            quantity_delta: qtyDiff,
            balance_after: newQuantity,
            product_total_balance_after: newQuantity,
            unit_cost: batchToUpdate.purchase_price,
            reference_type: 'opening_stock_adjustment',
            reference_id: `ADJ-${Date.now()}`,
            created_by: 'user-01',
            reason: reason.trim(),
            created_at: Date.now()
          });
        }

        // Apply edits to batch
        batchToUpdate.current_quantity = newQuantity;
        batchToUpdate.purchase_price = Money.toMinor(newPurchasePrice);
        batchToUpdate.selling_price = Money.toMinor(newSellingPrice);
        batchToUpdate.expiry_date = newExpiryDate;

        // Also update product cached prices
        const prod = s.products.find((p) => p.id === batchToUpdate.product_id);
        if (prod) {
          prod.current_purchase_price = Money.toMinor(newPurchasePrice);
          prod.current_selling_price = Money.toMinor(newSellingPrice);
          prod.updated_at = Date.now();
        }

        // Audit log
        s.audit_logs.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          user_id: 'user-01',
          action: 'UPDATE',
          entity: 'batch_adjustment',
          entity_id: batchToUpdate.id,
          device_id: s.profile.device_id,
          reason: reason.trim(),
          payload_after: JSON.stringify({
            batch_number: batchToUpdate.batch_number,
            newQuantity,
            newPurchasePrice,
            newSellingPrice,
            newExpiryDate
          }),
          created_at: Date.now()
        });
      });

      setMessage({ text: 'تم حفظ تعديلات الدفعة وتحديث المخزون بنجاح!', type: 'success' });
      onSuccess?.();
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تعديل الدفعة.', type: 'error' });
    }
  };

  const getProductName = (productId: string) => {
    return products.find((p) => p.id === productId)?.name_ar || 'صنف غير معروف';
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <CalendarClock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">تعديل الرصيد الافتتاحي وتصحيح الدفعات</h3>
              <p className="text-xs text-slate-500">تعديل صنف / كمية / سعر / تاريخ انتهاء تشغيلة</p>
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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Batches Search & Selection */}
          <div className="md:col-span-2 space-y-2 border-l border-slate-100 pl-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث عن دفعة أو صنف..."
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-0.5">
              {filteredBatches.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">لا توجد دفعات مطابقة</p>
              ) : (
                filteredBatches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSelectBatch(b)}
                    className={`w-full text-right p-2.5 rounded-xl border text-xs transition-all ${
                      selectedBatch?.id === b.id
                        ? 'bg-violet-50 border-violet-300 font-bold text-violet-950'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="font-bold truncate">{getProductName(b.product_id)}</div>
                    <div className="text-[11px] text-slate-500 flex justify-between mt-1">
                      <span>تشغيلة: {b.batch_number}</span>
                      <span className="font-mono">الكمية: {b.current_quantity}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Edit Form */}
          <div className="md:col-span-3">
            {selectedBatch ? (
              <form onSubmit={handleSaveAdjustment} className="space-y-3 text-xs">
                <div className="p-3 bg-violet-50/70 border border-violet-200 rounded-2xl">
                  <div className="font-bold text-violet-950 text-sm">{getProductName(selectedBatch.product_id)}</div>
                  <div className="text-[11px] text-violet-700 mt-0.5">
                    رقم التشغيلة الحالية: <span className="font-mono font-bold">{selectedBatch.batch_number}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">الكمية المعدلة *</label>
                    <NumericInput
                      value={newQuantity}
                      onChange={setNewQuantity}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">تاريخ الانتهاء *</label>
                    <input
                      type="date"
                      required
                      value={newExpiryDate}
                      onChange={(e) => setNewExpiryDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">سعر الشراء والتكلفة (ر.ي) *</label>
                    <NumericInput
                      value={newPurchasePrice}
                      onChange={setNewPurchasePrice}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">سعر البيع للجمهور (ر.ي) *</label>
                    <NumericInput
                      value={newSellingPrice}
                      onChange={setNewSellingPrice}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">سبب التعديل والتوثيق *</label>
                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="سبب تصحيح رصيد الدفعة..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
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
                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>اعتماد تعديل الدفعة</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-16 text-center text-slate-400">
                <Edit3 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>اختر دفعة من القائمة لبدء التعديل والتصحيح</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
