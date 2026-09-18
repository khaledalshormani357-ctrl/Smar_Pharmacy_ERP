// ShareService - Native Android and Web Sharing Engine
// Accurately differentiates between native Android runtime and Web environment.

import { ShareOptions, ShareResult, DocumentData } from '../types';
import { PdfService } from './PdfService';
import { DocumentService } from './DocumentService';

export class ShareService {
  /**
   * Checks if running under native Android runtime
   */
  static isNativeAndroid(): boolean {
    if (typeof window === 'undefined') return false;
    const isCapacitor = !!(window as any)?.Capacitor?.isNativePlatform?.();
    const isAndroidUA = /android/i.test(navigator.userAgent);
    return isCapacitor && isAndroidUA;
  }

  /**
   * Shares a PDF file using the best available platform capability
   */
  static async sharePdf(
    pdfBytes: Uint8Array,
    fileName: string,
    options: ShareOptions = {}
  ): Promise<ShareResult> {
    const title = options.title || 'مستند صيدلية';
    const text = options.text || 'مرفق مستند رسمي صادرة من نظام الصيدلية.';

    // 1. Web Share API with Files support (modern browsers & mobile web)
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([pdfBytes], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title,
            text
          });
          return {
            success: true,
            method: 'web_share',
            message: 'تمت مشاركة الملف بنجاح.'
          };
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Web Share failed, falling back to download', err);
        } else {
          return { success: false, method: 'web_share', message: 'تم إلغاء المشاركة من قِبل المستخدم.' };
        }
      }
    }

    // 2. Direct browser download fallback
    PdfService.downloadPdf(pdfBytes, fileName);
    return {
      success: true,
      method: 'file_download',
      message: 'تم حفظ وتنزيل ملف PDF في جهازك.'
    };
  }

  /**
   * Convenience method to share a structured DocumentData
   */
  static async shareDocument(doc: DocumentData, format: 'A4' | '80mm' = 'A4'): Promise<ShareResult> {
    const bytes = await DocumentService.generateDocumentPdf(doc, format);
    const fileName = `${doc.document_number}.pdf`;
    return await this.sharePdf(bytes, fileName, {
      title: `${doc.document_type}: ${doc.document_number}`,
      text: `مستند رقم ${doc.document_number} من ${doc.pharmacy.name_ar}`
    });
  }
}
