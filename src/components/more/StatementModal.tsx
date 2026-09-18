import React, { useState } from 'react';
import { X, Download, Printer, Share2 } from 'lucide-react';
import { FinanceService } from '../../services/FinanceService';
import { DocumentService } from '../../services/DocumentService';
import { ExportService } from '../../services/ExportService';
import { PrintService } from '../../services/PrintService';
import { ShareService } from '../../services/ShareService';
import { Money } from '../../utils/money';

interface StatementModalProps {
  type: 'customer' | 'supplier';
  entityId: string;
  onClose: () => void;
}

export const StatementModal: React.FC<StatementModalProps> = ({ type, entityId, onClose }) => {
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const now = Date.now();
  let startDate: number | undefined;

  if (dateFilter === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    startDate = d.getTime();
  } else if (dateFilter === 'week') {
    startDate = now - 7 * 24 * 60 * 60 * 1000;
  } else if (dateFilter === 'month') {
    startDate = now - 30 * 24 * 60 * 60 * 1000;
  }

  const isCustomer = type === 'customer';
  const statement = isCustomer
    ? FinanceService.getCustomerStatement(entityId, startDate, now)
    : FinanceService.getSupplierStatement(entityId, startDate, now);

  const entity = isCustomer ? (statement as any).customer : (statement as any).supplier;
  const items = statement.items;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const getDocData = () => {
    const filter = { date_from: startDate, date_to: now };
    return isCustomer
      ? DocumentService.buildCustomerStatementDoc(entityId, filter)
      : DocumentService.buildSupplierStatementDoc(entityId, filter);
  };

  const handleExportCsv = () => {
    try {
      const cols = [
        { key: 'date', label: 'التاريخ' },
        { key: 'ref', label: 'المرجع' },
        { key: 'statement', label: 'البيان' },
        { key: 'debit', label: 'مدين (+)' },
        { key: 'credit', label: 'دائن (-)' },
        { key: 'balance', label: 'الرصيد التراكمي' }
      ];

      const rows = items.map((it: any) => ({
        date: new Date(it.created_at).toISOString().split('T')[0],
        ref: it.reference_id || it.reference_type,
        statement: it.notes || it.statement || '-',
        debit: (it.debit / 100).toFixed(2),
        credit: (it.credit / 100).toFixed(2),
        balance: (it.running_balance / 100).toFixed(2)
      }));

      const csv = ExportService.generateCsv(cols, rows);
      const fileName = `statement_${isCustomer ? 'cust' : 'supp'}_${entityId.substring(0, 6)}.csv`;
      ExportService.downloadCsv(csv, fileName);
      showStatus('تم تصدير كشف الحساب بصيغة CSV بنجاح');
    } catch (err: any) {
      showStatus(`فشل التصدير: ${err?.message || 'خطأ'}`);
    }
  };

  const handleDownloadPdf = async () => {
    setIsProcessing(true);
    try {
      const doc = getDocData();
      await DocumentService.downloadDocumentPdf(doc, 'A4');
      showStatus('تم توليد وتنزيل كشف الحساب PDF بنجاح');
    } catch (err: any) {
      showStatus(`فشل إنشاء PDF: ${err?.message || 'خطأ'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = async () => {
    setIsProcessing(true);
    try {
      const doc = getDocData();
      const res = await PrintService.printDocument(doc, { paper_size: 'A4' });
      showStatus(res.message || 'تم إرسال أمر الطباعة');
    } catch (err: any) {
      showStatus(`فشل الطباعة: ${err?.message || 'خطأ'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShare = async () => {
    setIsProcessing(true);
    try {
      const doc = getDocData();
      const res = await ShareService.shareDocument(doc, 'A4');
      showStatus(res.message || 'تمت المشاركة بنجاح');
    } catch (err: any) {
      showStatus(`فشل المشاركة: ${err?.message || 'خطأ'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl p-5 max-w-2xl w-full shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              كشف حساب {isCustomer ? 'عميل' : 'مورد'}: {entity?.name_ar || entity?.name}
            </h3>
            <p className="text-xs text-slate-400">
              {entity?.phone ? `هاتف: ${entity.phone} • ` : ''}
              الرصيد الختامي:{' '}
              <span className="font-bold font-mono text-blue-600" dir="ltr">
                {Money.format(statement.closing_balance)}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMessage && (
          <div className="bg-emerald-50 text-emerald-800 text-xs px-3 py-1.5 rounded-xl mt-2 text-center font-bold">
            {statusMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center justify-between py-3 gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all font-semibold ${
                dateFilter === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1 rounded-lg transition-all font-semibold ${
                dateFilter === 'today' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={() => setDateFilter('week')}
              className={`px-2.5 py-1 rounded-lg transition-all font-semibold ${
                dateFilter === 'week' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-2.5 py-1 rounded-lg transition-all font-semibold ${
                dateFilter === 'month' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              آخر 30 يوماً
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            عدد الحركات: <span className="font-bold font-mono">{items.length}</span>
          </div>
        </div>

        {/* Statement Summary Card */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-3 text-center text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block">الرصيد السابق</span>
            <span className="font-bold font-mono text-slate-700 text-xs" dir="ltr">
              {Money.format(statement.opening_balance)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">
              {isCustomer ? 'إجمالي المشتريات (مدين)' : 'إجمالي المشتريات (دائن)'}
            </span>
            <span className="font-bold font-mono text-rose-600 text-xs" dir="ltr">
              {Money.format(isCustomer ? statement.total_debits : (statement as any).total_credits)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">
              {isCustomer ? 'إجمالي المقبوضات (دائن)' : 'إجمالي المسدد (مدين)'}
            </span>
            <span className="font-bold font-mono text-emerald-600 text-xs" dir="ltr">
              {Money.format(isCustomer ? statement.total_credits : (statement as any).total_debits)}
            </span>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 font-bold border-b border-slate-200">
              <tr>
                <th className="p-2.5">التاريخ</th>
                <th className="p-2.5">المرجع / البيان</th>
                <th className="p-2.5 text-center">مدين (+)</th>
                <th className="p-2.5 text-center">دائن (-)</th>
                <th className="p-2.5 text-left">الرصيد التراكمي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-400 font-sans text-xs">
                    لا توجد حركات مسجلة خلال الفترة المحددة
                  </td>
                </tr>
              ) : (
                items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 font-sans text-[11px] text-slate-500">
                      {new Date(it.created_at).toLocaleDateString('ar-YE', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="p-2.5 font-sans">
                      <div className="font-bold text-slate-800 text-xs">
                        {it.reference_id || it.reference_type}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">
                        {it.notes || it.statement || '-'}
                      </div>
                    </td>
                    <td className="p-2.5 text-center font-bold text-rose-600" dir="ltr">
                      {it.debit > 0 ? Money.format(it.debit) : '-'}
                    </td>
                    <td className="p-2.5 text-center font-bold text-emerald-600" dir="ltr">
                      {it.credit > 0 ? Money.format(it.credit) : '-'}
                    </td>
                    <td className="p-2.5 text-left font-bold text-slate-900" dir="ltr">
                      {Money.format(it.running_balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel (CSV)</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تنزيل PDF</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>

            <button
              onClick={handleShare}
              disabled={isProcessing}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
