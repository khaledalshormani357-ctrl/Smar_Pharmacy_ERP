import React from 'react';
import { X, CheckCircle2, FileText, Ban, AlertTriangle, Calendar, User, DollarSign, Package, Printer, Download } from 'lucide-react';
import { Sale, SaleItem, Customer } from '../../types';
import { Money } from '../../utils/money';
import { DocumentService } from '../../services/DocumentService';
import { PrintService } from '../../services/PrintService';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  items: SaleItem[];
  customer?: Customer;
  onCancelSale?: (saleId: string, reason: string) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  sale,
  items,
  customer,
  onCancelSale
}) => {
  const [showCancelPrompt, setShowCancelPrompt] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (!isOpen) return null;

  const handleConfirmCancel = () => {
    if (!cancelReason.trim()) return;
    if (onCancelSale) {
      setIsSubmitting(true);
      try {
        onCancelSale(sale.id, cancelReason.trim());
        setShowCancelPrompt(false);
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const isCancelled = sale.status === 'cancelled';
  const isCredit = sale.sale_type === 'credit';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`p-4 text-white flex items-center justify-between ${isCancelled ? 'bg-slate-700' : 'bg-slate-900'}`}>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">معاينة الفاتورة</h3>
              <p className="text-[11px] font-mono text-slate-300">{sale.invoice_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
                isCancelled
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isCancelled ? 'ملغاة' : 'مكتملة'}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Metadata */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs space-y-1.5 font-medium">
          <div className="flex justify-between items-center text-slate-600">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              التاريخ والوقت:
            </span>
            <span className="font-mono text-slate-800" dir="ltr">
              {new Date(sale.created_at).toLocaleString('ar-YE')}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-600">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              العميل:
            </span>
            <span className="font-bold text-slate-800">
              {customer ? customer.name : 'عميل نقدي عام'}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-600">
            <span className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              نوع البيع:
            </span>
            <span className={`font-bold ${isCredit ? 'text-rose-600' : 'text-emerald-700'}`}>
              {isCredit ? 'آجل (ذمة)' : 'نقدي'}
            </span>
          </div>

          {sale.notes && (
            <div className="pt-1 text-[11px] text-slate-500 italic">
              ملاحظة: {sale.notes}
            </div>
          )}

          {isCancelled && sale.cancellation_reason && (
            <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>سبب الإلغاء: {sale.cancellation_reason}</span>
            </div>
          )}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
          <div className="text-xs font-bold text-slate-400 pb-2 flex justify-between">
            <span>الأصناف ({items.length})</span>
            <span>المجموع</span>
          </div>
          {items.map((item) => (
            <div key={item.id} className="py-2.5 flex justify-between items-center text-xs">
              <div>
                <div className="font-bold text-slate-800">{item.unit_name}</div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {item.quantity} × {Money.format(item.unit_price)}
                  {item.discount_amount > 0 && ` (خصم: ${Money.format(item.discount_amount)})`}
                </div>
              </div>
              <div className="font-mono font-bold text-slate-900 text-sm">
                {Money.format(item.line_total)}
              </div>
            </div>
          ))}
        </div>

        {/* Financial Summary */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-1.5 text-xs font-medium">
          <div className="flex justify-between text-slate-500">
            <span>المجموع الفرعي:</span>
            <span className="font-mono text-slate-700">{Money.format(sale.subtotal)}</span>
          </div>

          {sale.discount_amount > 0 && (
            <div className="flex justify-between text-emerald-600 font-semibold">
              <span>خصم الفاتورة:</span>
              <span className="font-mono">-{Money.format(sale.discount_amount)}</span>
            </div>
          )}

          {sale.tax_amount > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>ضريبة القيمة المضافة:</span>
              <span className="font-mono text-slate-700">+{Money.format(sale.tax_amount)}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
            <span>الصافي الإجمالي:</span>
            <span className="text-base font-extrabold text-emerald-700 font-mono">
              {Money.format(sale.net_total)}
            </span>
          </div>

          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
            <span>المدفوع: {Money.format(sale.paid_amount)}</span>
            {sale.remaining_amount > 0 && (
              <span className="text-rose-600 font-bold">
                المتبقي (آجل): {Money.format(sale.remaining_amount)}
              </span>
            )}
          </div>

          {/* Print & PDF Actions */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={async () => {
                const doc = DocumentService.buildSaleInvoiceDoc(sale.id);
                await DocumentService.downloadDocumentPdf(doc, 'A4');
              }}
              className="py-1.5 px-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تنزيل PDF</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const doc = DocumentService.buildSaleInvoiceDoc(sale.id);
                PrintService.printDocument(doc, { paper_size: '80mm' });
              }}
              className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الفاتورة</span>
            </button>
          </div>
        </div>

        {/* Cancellation Actions */}
        <div className="p-3 bg-white border-t border-slate-200">
          {!isCancelled && onCancelSale && (
            <div>
              {!showCancelPrompt ? (
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(true)}
                  className="w-full py-2 px-3 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold border border-rose-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>إلغاء الفاتورة وردّ المخزون (Reversal)</span>
                </button>
              ) : (
                <div className="space-y-2 p-3 bg-rose-50 border border-rose-200 rounded-2xl">
                  <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>تأكيد إلغاء الفاتورة وعكس القيود المالية والمخزنية</span>
                  </div>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="اكتب سبب الإلغاء (إلزامي)..."
                    className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-xl focus:outline-none text-slate-800"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!cancelReason.trim() || isSubmitting}
                      onClick={handleConfirmCancel}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl disabled:bg-slate-300"
                    >
                      تأكيد الإلغاء الفوري
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelPrompt(false)}
                      className="py-2 px-3 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
