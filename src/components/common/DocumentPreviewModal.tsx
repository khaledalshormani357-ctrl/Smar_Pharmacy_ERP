import React, { useState } from 'react';
import { X, Printer, Download, Share2, MessageCircle, FileText } from 'lucide-react';
import { DocumentData } from '../../types';
import { DocumentService } from '../../services/DocumentService';
import { PrintService } from '../../services/PrintService';
import { ShareService } from '../../services/ShareService';
import { Money } from '../../utils/money';

interface DocumentPreviewModalProps {
  document: DocumentData;
  onClose: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ document: doc, onClose }) => {
  const [paperFormat, setPaperFormat] = useState<'A4' | '80mm'>('A4');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleDownloadPdf = async () => {
    try {
      await DocumentService.downloadDocumentPdf(doc, paperFormat);
      showStatus('تم تنزيل مستند PDF بنجاح');
    } catch (err: any) {
      showStatus(`فشل التنزيل: ${err?.message || 'خطأ'}`);
    }
  };

  const handlePrint = async () => {
    try {
      const res = await PrintService.printDocument(doc, { paper_size: paperFormat });
      showStatus(res.message || 'تم إرسال أمر الطباعة');
    } catch (err: any) {
      showStatus(`فشل الطباعة: ${err?.message || 'خطأ'}`);
    }
  };

  const handleShare = async () => {
    try {
      const res = await ShareService.shareDocument(doc, paperFormat);
      showStatus(res.message || 'تمت المشاركة بنجاح');
    } catch (err: any) {
      showStatus(`فشل المشاركة: ${err?.message || 'خطأ'}`);
    }
  };

  const handleWhatsApp = () => {
    DocumentService.shareViaWhatsApp(doc, doc.party_phone || '');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                معاينة المستند ({doc.document_number})
              </h3>
              <p className="text-[11px] text-slate-500">{doc.pharmacy.name_ar} - {doc.business_date}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Format toggle */}
            <div className="flex bg-slate-200 p-0.5 rounded-xl text-xs font-bold">
              <button
                onClick={() => setPaperFormat('A4')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  paperFormat === 'A4' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                A4
              </button>
              <button
                onClick={() => setPaperFormat('80mm')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  paperFormat === '80mm' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                حراري (80mm)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {statusMsg && (
          <div className="bg-emerald-50 text-emerald-800 text-xs px-4 py-2 border-b border-emerald-100 text-center font-bold">
            {statusMsg}
          </div>
        )}

        {/* Document Content Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-100 flex justify-center">
          <div
            className={`bg-white shadow-md rounded-2xl p-4 border border-slate-200 text-xs space-y-3 transition-all ${
              paperFormat === '80mm' ? 'max-w-[340px] w-full text-[11px]' : 'max-w-xl w-full'
            }`}
          >
            {/* Pharmacy details */}
            <div className="text-center border-b border-dashed border-slate-300 pb-2 space-y-0.5">
              <h2 className="font-extrabold text-sm text-slate-800">{doc.pharmacy.name_ar}</h2>
              <p className="text-slate-500 text-[10px]">{doc.pharmacy.address_ar || ''}</p>
              <p className="text-slate-500 text-[10px]">هاتف: {doc.pharmacy.phone}</p>
            </div>

            {/* Document metadata */}
            <div className="grid grid-cols-2 gap-1 text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400">رقم المستند: </span>
                <span className="font-bold font-mono">{doc.document_number}</span>
              </div>
              <div>
                <span className="text-slate-400">التاريخ: </span>
                <span>{doc.business_date}</span>
              </div>
              <div>
                <span className="text-slate-400">الطرف: </span>
                <span className="font-bold">{doc.party_name || 'عام'}</span>
              </div>
              <div>
                <span className="text-slate-400">المسؤول: </span>
                <span>{doc.responsible_user}</span>
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px]">
                  <th className="py-1">الصنف</th>
                  <th className="py-1 text-center">الكمية</th>
                  <th className="py-1 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-bold text-slate-800">
                      <div>{l.name}</div>
                      {l.batch_number && (
                        <div className="text-[9px] text-slate-400 font-mono">تشغيلة: {l.batch_number}</div>
                      )}
                    </td>
                    <td className="py-1.5 text-center font-mono">{l.quantity} {l.unit}</td>
                    <td className="py-1.5 text-left font-mono font-bold" dir="ltr">{Money.format(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-mono" dir="ltr">{Money.format(doc.subtotal)}</span>
              </div>
              {doc.discount_amount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>الخصم:</span>
                  <span className="font-mono" dir="ltr">-{Money.format(doc.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-blue-900 bg-blue-50/70 p-1.5 rounded-lg">
                <span>الصافي النهائي:</span>
                <span className="font-mono" dir="ltr">{Money.format(doc.net_total)}</span>
              </div>
              {doc.remaining_amount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>المتبقي آجل:</span>
                  <span className="font-mono" dir="ltr">{Money.format(doc.remaining_amount)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل PDF</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>

            <button
              onClick={handleShare}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span>مشاركة</span>
            </button>
          </div>

          <button
            onClick={handleWhatsApp}
            className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            <span>واتساب</span>
          </button>
        </div>
      </div>
    </div>
  );
};
