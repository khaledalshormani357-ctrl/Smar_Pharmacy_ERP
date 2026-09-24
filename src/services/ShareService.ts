// ShareService - Native Android & Cross-Platform Document Sharing
// Uses @capacitor/share and @capacitor/filesystem on Native Android, with Web Share fallback.

import { ShareOptions, ShareResult, DocumentData } from '../types';
import { PdfService } from './PdfService';
import { DocumentService } from './DocumentService';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

export class ShareService {
  /**
   * Checks if running under native Android runtime (Capacitor Native)
   */
  static isNativeAndroid(): boolean {
    if (typeof window === 'undefined') return false;
    const isCapacitor = !!(window as any)?.Capacitor?.isNativePlatform?.();
    const isAndroidUA = /android/i.test(navigator.userAgent);
    return isCapacitor && isAndroidUA;
  }

  /**
   * Helper to convert Uint8Array bytes to Base64 string for Android filesystem
   */
  private static uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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
    const text = options.text || 'مرفق مستند رسمي صادر من نظام الصيدلية.';

    // 1. Try Native Android Share Intent via Capacitor
    if (this.isNativeAndroid()) {
      try {
        const base64Data = this.uint8ArrayToBase64(pdfBytes);
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache
        });

        const uriResult = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache
        });

        await Share.share({
          title,
          text,
          url: uriResult.uri,
          dialogTitle: 'مشاركة المستند (WhatsApp, Gmail, Telegram...)'
        });

        return {
          success: true,
          method: 'native_share',
          message: 'تم فتح نافذة المشاركة في نظام أندرويد بنجاح.'
        };
      } catch (err: any) {
        console.warn('Capacitor native share failed, falling back to Web Share', err);
      }
    }

    // 2. Web Share API with Files support (Mobile Web & modern browsers)
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

    // 3. Direct browser download fallback
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
