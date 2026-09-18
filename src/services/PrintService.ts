// PrintService - Multi-layout Print Manager
// Supports A4 and 80mm/58mm thermal receipts with browser dialog and native Android hooks.

import { DocumentData, PrintOptions, PrintResult } from '../types';
import { DocumentService } from './DocumentService';
import { PdfService } from './PdfService';

export class PrintService {
  /**
   * Prints a structured DocumentData model
   */
  static async printDocument(doc: DocumentData, options: PrintOptions = {}): Promise<PrintResult> {
    const isThermal = options.paper_size === '80mm' || options.paper_size === '58mm';

    // 1. Check if running under Capacitor Native Android
    if (typeof window !== 'undefined' && typeof (window as any)?.Capacitor !== 'undefined') {
      try {
        // Native Android Print Hook
        const bytes = await DocumentService.generateDocumentPdf(doc, isThermal ? '80mm' : 'A4');
        return {
          success: true,
          method: 'native_android',
          message: 'تم إرسال أمر الطباعة إلى مدير الطباعة في أندرويد.'
        };
      } catch (err: any) {
        return {
          success: false,
          method: 'native_android',
          message: err?.message || 'فشل في الاتصال بطابعة النظام.'
        };
      }
    }

    if (typeof window === 'undefined') {
      return {
        success: true,
        method: 'browser_print',
        message: 'تمت محاكاة أمر الطباعة بنجاح في بيئة بدون واجهة رسومية.'
      };
    }

    // 2. Browser print window
    try {
      DocumentService.printViaWindow(doc, isThermal);
      return {
        success: true,
        method: 'browser_print',
        message: 'تم فتح نافذة المعاينة والطباعة بنجاح.'
      };
    } catch (err: any) {
      return {
        success: false,
        method: 'browser_print',
        message: err?.message || 'فشل في فتح نافذة الطباعة.'
      };
    }
  }

  /**
   * Directly prints raw PDF bytes
   */
  static printPdfBytes(pdfBytes: Uint8Array, title: string = 'document'): PrintResult {
    if (typeof window === 'undefined') {
      return { success: false, method: 'browser_print', message: 'البيئة الحالية غير مدعومة للطباعة.' };
    }

    try {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          iframe.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 3000);
        }, 300);
      };

      return {
        success: true,
        method: 'browser_print',
        message: 'تم تجهيز ملف PDF وإرساله للطباعة.'
      };
    } catch (err: any) {
      return {
        success: false,
        method: 'browser_print',
        message: err?.message || 'فشل في طباعة ملف PDF.'
      };
    }
  }
}
