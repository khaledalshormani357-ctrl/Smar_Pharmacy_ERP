import React, { useState } from 'react';
import {
  X,
  Package,
  Calendar,
  Layers,
  ArrowDownUp,
  Tag,
  Building,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  Barcode,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Edit
} from 'lucide-react';
import { Product, Batch, StockMovement, UnitConversion, Category, Manufacturer } from '../../types';
import { Money } from '../../utils/money';
import { BatchRepository, UnitConversionRepository, StockMovementRepository } from '../../db/repositories';
import { StockService } from '../../services/StockService';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { ProductEditorModal } from '../modals/ProductEditorModal';

interface ProductDetailsModalProps {
  product: Product;
  category?: Category;
  manufacturer?: Manufacturer;
  onClose: () => void;
  onOpenOpeningStock: () => void;
  onOpenAdjustment: (batchId?: string) => void;
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  product,
  category,
  manufacturer,
  onClose,
  onOpenOpeningStock,
  onOpenAdjustment
}) => {
  const [activeTab, setActiveTab] = useState<'batches' | 'units' | 'movements'>('batches');
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBatchForLabel, setSelectedBatchForLabel] = useState<Batch | undefined>(undefined);
  const [batchActionMsg, setBatchActionMsg] = useState<string | null>(null);

  const batches = BatchRepository.getByProduct(product.id);
  const conversions = UnitConversionRepository.getByProduct(product.id);
  const movements = StockMovementRepository.getByProduct(product.id);

  const totalStockBase = batches.reduce((sum, b) => sum + b.current_quantity, 0);
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleToggleQuarantine = (batch: Batch) => {
    const isCurrentlyQuarantined = batch.status === 'quarantine';
    const reason = prompt(
      isCurrentlyQuarantined
        ? 'اكتب سبب فك الحجر الصحي عن هذه التشغيلة الدوائية:'
        : 'اكتب سبب وضع هذه التشغيلة الدوائية قيد الحجر الصحي (ستستثنى من البيع):'
    );
    if (!reason || !reason.trim()) return;

    try {
      StockService.quarantineBatch(batch.id, !isCurrentlyQuarantined, reason.trim());
      setBatchActionMsg(
        isCurrentlyQuarantined
          ? `تم فك الحجر الصحي عن التشغيلة (${batch.batch_number}) بنجاح.`
          : `تم وضع التشغيلة (${batch.batch_number}) في الحجر الصحي واستبعادها من البيع.`
      );
      setTimeout(() => setBatchActionMsg(null), 3500);
    } catch (err: any) {
      alert(err.message || 'فشلت العملية');
    }
  };

  const handleWriteOff = (batch: Batch) => {
    if (batch.current_quantity <= 0) {
      alert('رصيد التشغيلة صفر مسبقاً.');
      return;
    }
    const reason = prompt(
      `هل تؤكد إتلاف الرصيد المتبقي (${batch.current_quantity} ${product.base_unit}) للتشغيلة (${batch.batch_number})؟\nاكتب محضر أو سبب الإتلاف:`
    );
    if (!reason || !reason.trim()) return;

    try {
      StockService.writeOffExpiredBatch(batch.id, reason.trim());
      setBatchActionMsg(`تم إتلاف رصيد التشغيلة (${batch.batch_number}) وإثباته في دفتر حركات المخزون.`);
      setTimeout(() => setBatchActionMsg(null), 3500);
    } catch (err: any) {
      alert(err.message || 'فشلت عملية الإتلاف');
    }
  };

  // Status calculations
  const isLowStock = totalStockBase <= product.min_stock_level;
  const isNeedsReorder = totalStockBase <= product.reorder_level;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">{product.name_ar}</h3>
                {!product.is_active && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded-md">
                    معطل
                  </span>
                )}
                {product.prescription_required && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-md">
                    وصفة طبية
                  </span>
                )}
                {product.is_controlled && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
                    مراقب
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {product.internal_code} {product.barcode ? `• باركود: ${product.barcode}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Edit className="w-3.5 h-3.5 text-emerald-600" />
              <span>تعديل الصنف والوحدات</span>
            </button>
            <button
              onClick={() => {
                setSelectedBatchForLabel(undefined);
                setShowBarcodeModal(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Barcode className="w-3.5 h-3.5 text-blue-600" />
              <span>طباعة ملصق</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {batchActionMsg && (
          <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{batchActionMsg}</span>
          </div>
        )}

        {/* Quick Identity Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-white border-b border-slate-100 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[10px]">إجمالي الرصيد المتوفر</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-bold text-base text-slate-900">{totalStockBase}</span>
              <span className="text-slate-500 text-[10px]">{product.base_unit}</span>
            </div>
            {isLowStock && (
              <span className="inline-block mt-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                تحت حد الخطر ({product.min_stock_level})
              </span>
            )}
            {!isLowStock && isNeedsReorder && (
              <span className="inline-block mt-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                تحت حد إعادة الطلب ({product.reorder_level})
              </span>
            )}
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[10px]">سعر البيع الافتراضي</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-bold text-base text-emerald-600">{Money.format(product.current_selling_price)}</span>
            </div>
            <span className="text-[10px] text-slate-400 block">لكل {product.base_unit}</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[10px]">سعر الشراء المرجعي</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-bold text-base text-slate-700">{Money.format(product.current_purchase_price)}</span>
            </div>
            <span className="text-[10px] text-slate-400 block">مرجع تسعير حالي</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[10px]">التصنيف والشركة</span>
            <p className="font-bold text-slate-800 truncate mt-0.5">{category?.name_ar || 'عام'}</p>
            <p className="text-[10px] text-slate-500 truncate">{manufacturer?.name_ar || 'غير محدد'}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-5 gap-4 text-xs font-bold bg-white">
          <button
            onClick={() => setActiveTab('batches')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'batches'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>التشغيلات والدفعات ({batches.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('units')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'units'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>وحدات التحويل ({conversions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'movements'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ArrowDownUp className="w-4 h-4" />
            <span>حركات المخزون ({movements.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
          {/* Batches Tab */}
          {activeTab === 'batches' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">قائمة التشغيلات والتواريخ المحفوظة تاريخياً</span>
                <button
                  onClick={onOpenOpeningStock}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 transition-all flex items-center gap-1"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>إضافة رصيد افتتاحي / تشغيلة</span>
                </button>
              </div>

              {batches.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center border border-slate-200 text-slate-400">
                  <Clock className="w-8 h-8 stroke-[1.2] mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-bold">لا توجد تشغيلات مسجلة لهذا الصنف حتى الآن.</p>
                  <p className="text-[11px] text-slate-400 mt-1">يمكنك إضافة رصيد افتتاحي أو تسجيل فاتورة توريد لإثبات التشغيلات.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {batches.map((b) => {
                    const isExp = b.expiry_date < todayStr;
                    return (
                      <div
                        key={b.id}
                        className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-sm font-mono">{b.batch_number}</span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                b.status === 'quarantine'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : isExp || b.status === 'expired'
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                  : b.current_quantity === 0 || b.status === 'depleted'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              }`}
                            >
                              {b.status === 'quarantine'
                                ? 'حجر صحي (موقوفة)'
                                : isExp || b.status === 'expired'
                                ? 'منتهية الصلاحية'
                                : b.current_quantity === 0
                                ? 'مستنفذة'
                                : 'صالحة (FEFO)'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>
                              تاريخ الصلاحية: <strong className="font-mono text-slate-700">{b.expiry_date}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              تكلفة الشراء: <strong className="text-slate-700">{Money.format(b.purchase_price)}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              سعر بيع الدفعة: <strong className="text-slate-700">{Money.format(b.selling_price)}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="text-left shrink-0 flex items-center gap-2">
                          <div className="text-left pl-2">
                            <span className="block text-[10px] text-slate-400">الكمية الحالية</span>
                            <span className="font-bold text-sm text-slate-900 font-mono">
                              {b.current_quantity} <span className="text-[10px] text-slate-500">{product.base_unit}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setSelectedBatchForLabel(b);
                                setShowBarcodeModal(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="طباعة ملصق للدفعة"
                            >
                              <Barcode className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleToggleQuarantine(b)}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                b.status === 'quarantine'
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title={b.status === 'quarantine' ? 'فك الحجر الصحي' : 'وضع في الحجر الصحي'}
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </button>

                            {b.current_quantity > 0 && (
                              <button
                                onClick={() => handleWriteOff(b)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="إتلاف الدفعة المنتهية أو التالفة"
                              >
                                <Flame className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => onOpenAdjustment(b.id)}
                              className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              تعديل رصيد
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Units Tab */}
          {activeTab === 'units' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold block">معاملات التحويل بين الوحدات (الوحدة الأساسية: {product.base_unit})</span>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>تعديل الوحدات والأسعار</span>
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                    <tr>
                      <th className="p-3">اسم الوحدة</th>
                      <th className="p-3">معامل التحويل (إلى {product.base_unit})</th>
                      <th className="p-3">سعر البيع</th>
                      <th className="p-3">الافتراضية للبيع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conversions.map((uc) => (
                      <tr key={uc.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-800">{uc.unit_name}</td>
                        <td className="p-3 font-mono">
                          1 {uc.unit_name} = {uc.conversion_factor} {product.base_unit}
                        </td>
                        <td className="p-3 font-bold text-emerald-600">
                          {uc.selling_price > 0 ? Money.format(uc.selling_price) : Money.format(product.current_selling_price * uc.conversion_factor)}
                        </td>
                        <td className="p-3">
                          {uc.is_default_sale ? (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 font-bold text-[10px]">
                              نعم
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Movements Tab */}
          {activeTab === 'movements' && (
            <div className="space-y-3">
              <span className="text-xs text-slate-500 font-semibold block">سجل الحركات المخزنية الصادرة والواردة</span>
              {movements.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center border border-slate-200 text-slate-400">
                  <FileText className="w-8 h-8 stroke-[1.2] mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-bold">لا توجد حركات مخزنية مسجلة لهذا الصنف بعد.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {movements.map((m) => (
                    <div
                      key={m.id}
                      className="bg-white p-3 rounded-2xl border border-slate-200 text-xs flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${
                              m.quantity_delta > 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {m.movement_type === 'opening_balance'
                              ? 'رصيد أول المدة'
                              : m.movement_type === 'adjustment_plus'
                              ? 'تعديل بالزيادة'
                              : m.movement_type === 'adjustment_minus'
                              ? 'تعديل بالنقص'
                              : m.movement_type}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px]">{m.reference_id}</span>
                        </div>
                        {m.reason && <p className="text-[11px] text-slate-600">{m.reason}</p>}
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {new Date(m.created_at).toLocaleString('ar-YE')}
                        </span>
                      </div>

                      <div className="text-left font-mono">
                        <span
                          className={`font-bold text-sm block ${
                            m.quantity_delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta} {product.base_unit}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          الرصيد الكلي بعد الحركة: {m.product_total_balance_after}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showBarcodeModal && (
        <BarcodeLabelModal
          product={product}
          batch={selectedBatchForLabel}
          onClose={() => setShowBarcodeModal(false)}
        />
      )}

      {showEditModal && (
        <ProductEditorModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          product={product}
          onArchived={() => {
            setShowEditModal(false);
            onClose();
          }}
        />
      )}
    </div>
  );
};
