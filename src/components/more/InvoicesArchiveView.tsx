import React, { useState } from 'react';
import {
  FileText,
  Search,
  Calendar,
  Printer,
  Download,
  Share2,
  Ban,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  ShoppingBag,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  Clock
} from 'lucide-react';
import { db } from '../../db/sqlite';
import {
  SaleRepository,
  PurchaseRepository,
  SaleReturnRepository,
  PurchaseReturnRepository,
  CustomerRepository,
  SupplierRepository
} from '../../db/repositories';
import { DocumentService } from '../../services/DocumentService';
import { PdfService } from '../../services/PdfService';
import { PrintService } from '../../services/PrintService';
import { ShareService } from '../../services/ShareService';
import { SalesService } from '../../services/SalesService';
import { PurchaseService } from '../../services/PurchaseService';
import { Money } from '../../utils/money';
import { DocumentData } from '../../types';

export const InvoicesArchiveView: React.FC = () => {
  const [docType, setDocType] = useState<'sales' | 'purchases' | 'sale_returns' | 'purchase_returns'>('sales');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  // Preview & Action Modal State
  const [previewDoc, setPreviewDoc] = useState<DocumentData | null>(null);
  const [selectedRawDoc, setSelectedRawDoc] = useState<any>(null);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const customers = CustomerRepository.getAll();
  const suppliers = SupplierRepository.getAll();
  const customersMap = new Map(customers.map((c) => [c.id, c.name]));
  const suppliersMap = new Map(suppliers.map((s) => [s.id, s.name]));

  // Raw lists
  const sales = SaleRepository.getAll();
  const purchases = PurchaseRepository.getAll();
  const saleReturns = SaleReturnRepository.getAll();
  const purchaseReturns = PurchaseReturnRepository.getAll();

  const getFilteredList = () => {
    let list: any[] = [];
    if (docType === 'sales') list = sales;
    if (docType === 'purchases') list = purchases;
    if (docType === 'sale_returns') list = saleReturns;
    if (docType === 'purchase_returns') list = purchaseReturns;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    return list.filter((item) => {
      // Date Filter
      if (dateFilter === 'today' && now - item.created_at > oneDay) return false;
      if (dateFilter === 'week' && now - item.created_at > 7 * oneDay) return false;
      if (dateFilter === 'month' && now - item.created_at > 30 * oneDay) return false;

      // Status Filter
      if (statusFilter === 'completed' && item.status === 'cancelled') return false;
      if (statusFilter === 'cancelled' && item.status !== 'cancelled') return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const docNo = (
          item.invoice_number ||
          item.bill_number ||
          item.return_number ||
          ''
        ).toLowerCase();
        const partyName = (
          (item.customer_id && customersMap.get(item.customer_id)) ||
          (item.supplier_id && suppliersMap.get(item.supplier_id)) ||
          item.customer_name ||
          ''
        ).toLowerCase();

        return docNo.includes(q) || partyName.includes(q);
      }

      return true;
    });
  };

  const filteredItems = getFilteredList();

  const handleOpenPreview = (item: any) => {
    setSelectedRawDoc(item);
    setShowCancelPrompt(false);
    setCancelReason('');

    try {
      let docData: DocumentData | null = null;
      if (docType === 'sales') {
        docData = DocumentService.buildSaleInvoiceDoc(item.id);
      } else if (docType === 'purchases') {
        docData = DocumentService.buildPurchaseBillDoc(item.id);
      } else if (docType === 'sale_returns') {
        docData = DocumentService.buildSaleReturnDoc(item.id);
      } else if (docType === 'purchase_returns') {
        docData = DocumentService.buildPurchaseReturnDoc(item.id);
      }
      setPreviewDoc(docData);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'فشل تحميل بيانات المستند', type: 'error' });
    }
  };

  const handlePrint = async (format: '80mm' | 'A4') => {
    if (!previewDoc) return;
    try {
      await PrintService.printDocument(previewDoc, { paper_size: format });
      setActionMessage({ text: 'تم إرسال المستند لأمر الطباعة بنجاح.', type: 'success' });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'فشلت عملية الطباعة', type: 'error' });
    }
  };

  const handleDownloadPdf = async (format: '80mm' | 'A4') => {
    if (!previewDoc) return;
    try {
      const pdfBytes =
        format === '80mm'
          ? await PdfService.generateThermalReceipt(previewDoc)
          : await PdfService.generateA4Document(previewDoc);

      PdfService.downloadPdf(pdfBytes, `${previewDoc.document_number}.pdf`);
      setActionMessage({ text: 'تم تنزيل ملف PDF بنجاح.', type: 'success' });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'فشل تنزيل ملف PDF', type: 'error' });
    }
  };

  const handleShare = async () => {
    if (!previewDoc) return;
    try {
      const res = await ShareService.shareDocument(previewDoc, '80mm');
      if (res.success) {
        setActionMessage({ text: 'تم فتح نافذة المشاركة بنجاح.', type: 'success' });
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || 'فشلت المشاركة', type: 'error' });
    }
  };

  const handleCancelDocument = () => {
    if (!selectedRawDoc || !cancelReason.trim()) return;
    try {
      if (docType === 'sales') {
        SalesService.cancelSale(selectedRawDoc.id, cancelReason.trim());
        setActionMessage({ text: 'تم إلغاء فاتورة المبيعات وتحديث المخزون والمالية بنجاح.', type: 'success' });
      } else if (docType === 'purchases') {
        PurchaseService.cancelPurchase(selectedRawDoc.id, cancelReason.trim());
        setActionMessage({ text: 'تم إلغاء فاتورة الشراء وتحديث المخزون والمالية بنجاح.', type: 'success' });
      } else {
        throw new Error('لا يمكن إلغاء هذا النوع من المستندات آلياً حالياً.');
      }
      setPreviewDoc(null);
      setSelectedRawDoc(null);
      setShowCancelPrompt(false);
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'فشل إلغاء المستند', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">أرشيف الفواتير والمستندات</h3>
            <p className="text-xs text-slate-500">
              استعراض، إعادة طباعة، تصدير PDF، ومشاركة جميع فواتير المبيعات والتوريد والمرتجعات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl font-mono">
            {filteredItems.length} مستند
          </span>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-2.5 text-xs font-bold border animate-in fade-in ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl text-xs font-bold gap-1 overflow-x-auto">
        <button
          onClick={() => setDocType('sales')}
          className={`flex-1 min-w-[110px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            docType === 'sales' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>فواتير المبيعات ({sales.length})</span>
        </button>

        <button
          onClick={() => setDocType('purchases')}
          className={`flex-1 min-w-[110px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            docType === 'purchases' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>فواتير المشتريات ({purchases.length})</span>
        </button>

        <button
          onClick={() => setDocType('sale_returns')}
          className={`flex-1 min-w-[110px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            docType === 'sale_returns' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>مرتجع المبيعات ({saleReturns.length})</span>
        </button>

        <button
          onClick={() => setDocType('purchase_returns')}
          className={`flex-1 min-w-[110px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            docType === 'purchase_returns' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>مرتجع المشتريات ({purchaseReturns.length})</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الفاتورة أو اسم العميل / المورد..."
            className="w-full pr-10 pl-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500"
          />
        </div>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
        >
          <option value="all">كل الفترات</option>
          <option value="today">فواتير اليوم</option>
          <option value="week">آخر 7 أيام</option>
          <option value="month">آخر 30 يوماً</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
        >
          <option value="all">جميع الحالات</option>
          <option value="completed">السارية والمكتملة فقط</option>
          <option value="cancelled">الملغية فقط</option>
        </select>
      </div>

      {/* Document List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-[1.2]" />
          <p className="text-xs font-bold text-slate-600">لا توجد مستندات تطابق معايير البحث المحددة</p>
          <p className="text-[11px] text-slate-400 mt-1">تأكد من اختيار التبويب أو الفترة الزمنية الصحيحة.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => {
            const docNumber =
              item.invoice_number ||
              item.bill_number ||
              item.return_number ||
              item.id;
            const partyName =
              (item.customer_id && customersMap.get(item.customer_id)) ||
              (item.supplier_id && suppliersMap.get(item.supplier_id)) ||
              item.customer_name ||
              item.supplier_name ||
              'عميل نقدي';
            const total = item.net_total || item.total_cost || item.net_amount || 0;
            const isCancelled = item.status === 'cancelled';
            const isCredit = item.sale_type === 'credit' || item.payment_type === 'credit';

            return (
              <div
                key={item.id}
                className={`bg-white rounded-3xl p-4 border transition-all shadow-xs flex flex-col justify-between gap-3 ${
                  isCancelled ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 font-mono">{docNumber}</span>
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">
                            ملغية
                          </span>
                        ) : isCredit ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            آجل
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            نقدي
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-700 mt-1">{partyName}</p>
                    </div>

                    <div className="text-left">
                      <span className="text-xs text-slate-400 block">الإجمالي الصافي</span>
                      <span className="font-bold text-sm text-slate-900 font-mono">{Money.format(total)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-2 font-mono">
                    <span>{item.business_date || new Date(item.created_at).toLocaleDateString('ar-YE')}</span>
                    <span>•</span>
                    <span>{new Date(item.created_at).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}</span>
                    {item.user_id && (
                      <>
                        <span>•</span>
                        <span>بواسطة: {item.user_id}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500">
                    {item.notes && <span className="line-clamp-1 italic text-slate-400">{item.notes}</span>}
                  </div>

                  <button
                    onClick={() => handleOpenPreview(item)}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة وطباعة</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document Details & Print Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold">معاينة المستند: {previewDoc.document_number}</h3>
                  <p className="text-[10px] text-slate-400 font-mono">{previewDoc.business_date}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Party & General Info */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">الطرف المعني:</span>
                  <span className="font-bold text-slate-800">{previewDoc.party_name || 'عميل عام نقدي'}</span>
                  {previewDoc.party_phone && <p className="text-slate-500 font-mono">{previewDoc.party_phone}</p>}
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">حالة السداد:</span>
                  <span className="font-bold text-slate-800">{previewDoc.payment_method === 'cash' ? 'نقدي' : 'آجل'}</span>
                  <span className="block text-slate-500">المسؤول: {previewDoc.responsible_user}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-2.5">الصنف</th>
                      <th className="p-2.5 text-center">الكمية</th>
                      <th className="p-2.5 text-left">السعر</th>
                      <th className="p-2.5 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewDoc.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-800 block">{line.name}</span>
                          {line.batch_number && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              تشغيلة: {line.batch_number} {line.expiry_date ? `(صلاحية: ${line.expiry_date})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-mono">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="p-2.5 text-left font-mono">{Money.format(line.unit_price)}</td>
                        <td className="p-2.5 text-left font-bold font-mono">{Money.format(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono">{Money.format(previewDoc.subtotal)}</span>
                </div>
                {previewDoc.discount_amount > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>إجمالي الخصم:</span>
                    <span className="font-mono">-{Money.format(previewDoc.discount_amount)}</span>
                  </div>
                )}
                {previewDoc.tax_amount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>الضريبة:</span>
                    <span className="font-mono">+{Money.format(previewDoc.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>الصافي المستحق:</span>
                  <span className="font-mono">{Money.format(previewDoc.net_total)}</span>
                </div>
              </div>

              {/* Cancellation Dialog if toggled */}
              {showCancelPrompt && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-rose-800 font-bold">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>تأكيد إلغاء المستند والتراجع المالي والمخزني</span>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    تحذير: سيؤدي هذا الإجراء إلى إرجاع الكميات المباعة للمخزون فوراً ورد المبلغ للصندوق أو تسوية رصيد العميل دفترياً.
                  </p>
                  <input
                    type="text"
                    required
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="اكتب سبب الإلغاء الإلزامي..."
                    className="w-full px-3 py-2 rounded-xl border border-rose-300 text-xs bg-white text-slate-800 focus:outline-hidden"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelPrompt(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 font-bold"
                    >
                      تراجع
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDocument}
                      className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all"
                    >
                      تأكيد الإلغاء النهائي
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {selectedRawDoc?.status !== 'cancelled' && (
                  <button
                    onClick={() => setShowCancelPrompt(!showCancelPrompt)}
                    className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>إلغاء الفاتورة</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleShare}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>مشاركة</span>
                </button>

                <button
                  onClick={() => handleDownloadPdf('A4')}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>PDF (A4)</span>
                </button>

                <button
                  onClick={() => handlePrint('80mm')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة حرارية (80mm)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
