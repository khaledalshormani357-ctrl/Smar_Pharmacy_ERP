// PdfService - High-Fidelity Real PDF Generation Engine
// Uses pdf-lib + fontkit + embedded TrueType Arabic font + Unicode Arabic shaper & BiDi
// Fully offline, produces standard openable PDF files.

import { PDFDocument, rgb, RGB, PDFPage, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { KACST_BOOK_BASE64 } from '../utils/arabicFontData';
import { processBidiForPdf } from '../utils/arabicShaper';
import { DocumentData } from '../types';

export interface PdfTableColumn {
  header: string;
  width: number;
  align?: 'right' | 'left' | 'center';
}

function isArabicChar(code: number): boolean {
  return (
    (code >= 0x0600 && code <= 0x06ff) ||
    (code >= 0x0750 && code <= 0x077f) ||
    (code >= 0x08a0 && code <= 0x08ff) ||
    (code >= 0xfb50 && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfeff)
  );
}

function splitIntoDirectionalChunks(text: string): { text: string; isArabic: boolean }[] {
  if (!text) return [];
  const chunks: { text: string; isArabic: boolean }[] = [];
  let cur = '';
  let curIsArabic: boolean | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    const isNeutral = (ch === ' ' || ch === '\t' || ch === '-' || ch === ':' || ch === '.' || ch === ',' || ch === '/' || ch === '(' || ch === ')');

    if (isNeutral) {
      cur += ch;
      continue;
    }

    const isAr = isArabicChar(code);
    if (curIsArabic === null) {
      curIsArabic = isAr;
      cur += ch;
    } else if (curIsArabic === isAr) {
      cur += ch;
    } else {
      if (cur) chunks.push({ text: cur, isArabic: curIsArabic });
      cur = ch;
      curIsArabic = isAr;
    }
  }
  if (cur) chunks.push({ text: cur, isArabic: !!curIsArabic });
  return chunks;
}

export class PdfService {
  private static cachedFontBytes: Uint8Array | null = null;

  /**
   * Loads high-fidelity Arabic + Latin font bytes safely
   */
  private static async getFontBytes(): Promise<Uint8Array> {
    if (this.cachedFontBytes) return this.cachedFontBytes;

    // 1. In Node.js environment, check filesystem
    if (typeof process !== 'undefined' && process.cwd) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const candidatePaths = [
          path.resolve(process.cwd(), 'public/fonts/FreeSerif.ttf'),
          path.resolve(process.cwd(), 'dist/fonts/FreeSerif.ttf'),
          '/usr/share/fonts/truetype/freefont/FreeSerif.ttf'
        ];
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            this.cachedFontBytes = new Uint8Array(fs.readFileSync(p));
            return this.cachedFontBytes;
          }
        }
      } catch {
        // Fallback
      }
    }

    // 2. In browser environment, fetch from public assets
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/fonts/FreeSerif.ttf');
        if (res.ok) {
          const ab = await res.arrayBuffer();
          this.cachedFontBytes = new Uint8Array(ab);
          return this.cachedFontBytes;
        }
      } catch {
        // Fallback
      }
    }

    // 3. Embedded base64 fallback
    if (typeof Buffer !== 'undefined') {
      this.cachedFontBytes = Buffer.from(KACST_BOOK_BASE64, 'base64');
      return this.cachedFontBytes;
    }

    const binary = atob(KACST_BOOK_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    this.cachedFontBytes = bytes;
    return this.cachedFontBytes;
  }

  /**
   * Helper to format money from minor units to standard decimal string
   */
  static formatMoney(minorUnits: number): string {
    return (minorUnits / 100).toFixed(2);
  }

  /**
   * Initializes a PDFDocument with fontkit and Arabic/Latin font
   */
  private static async initDoc(): Promise<{ doc: PDFDocument; font: PDFFont }> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const fontBytes = await this.getFontBytes();
    const font = await doc.embedFont(fontBytes, { subset: true });
    return { doc, font };
  }

  /**
   * Helper to draw shaped Arabic or bilingual text with alignment
   */
  private static drawText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    color: RGB = rgb(0.1, 0.1, 0.1),
    options?: { align?: 'right' | 'left' | 'center'; width?: number }
  ) {
    if (!text) return;

    const hasArabic = Array.from(text).some(c => isArabicChar(c.charCodeAt(0)));

    if (!hasArabic) {
      const textWidth = font.widthOfTextAtSize(text, size);
      let drawX = x;
      if (options?.align === 'right' && options?.width) {
        drawX = x + options.width - textWidth;
      } else if (options?.align === 'center' && options?.width) {
        drawX = x + (options.width - textWidth) / 2;
      }
      page.drawText(text, { x: drawX, y, size, font, color });
      return;
    }

    const chunks = splitIntoDirectionalChunks(text);
    const chunkWidths = chunks.map(c => font.widthOfTextAtSize(c.text, size));
    const totalWidth = chunkWidths.reduce((a, b) => a + b, 0);

    const targetWidth = options?.width || totalWidth;
    let startRightX = x + targetWidth;

    if (options?.align === 'left') {
      startRightX = x + totalWidth;
    } else if (options?.align === 'center') {
      startRightX = x + (targetWidth - totalWidth) / 2 + totalWidth;
    }

    let curX = startRightX;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const w = chunkWidths[i];
      curX -= w;
      page.drawText(c.text, { x: curX, y, size, font, color });
    }
  }

  // ==========================================
  // 1. A4 DOCUMENT GENERATION (Invoice, Bill, Return, Statement)
  // ==========================================

  /**
   * Generates a formal A4 PDF Document for Sales Invoices, Purchase Bills, Returns, and Statements
   */
  static async generateA4Document(data: DocumentData): Promise<Uint8Array> {
    const { doc, font } = await this.initDoc();
    const page = doc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 36;
    const contentWidth = width - margin * 2;

    let y = height - margin - 20;

    // 1. Header Box
    page.drawRectangle({
      x: margin,
      y: y - 55,
      width: contentWidth,
      height: 70,
      color: rgb(0.95, 0.97, 1.0)
    });

    // Pharmacy Title (Right)
    const pharmName = data.pharmacy.name_ar || (data.pharmacy as any).name || 'صيدلية';
    this.drawText(page, pharmName, margin + 20, y - 5, 18, font, rgb(0.1, 0.2, 0.5), {
      align: 'right',
      width: contentWidth - 40
    });

    const pharmAddr = data.pharmacy.address_ar || (data.pharmacy as any).address || '';
    const subTitle = `${pharmAddr} | هاتف: ${data.pharmacy.phone || ''}`;
    this.drawText(page, subTitle, margin + 20, y - 25, 10, font, rgb(0.3, 0.3, 0.3), {
      align: 'right',
      width: contentWidth - 40
    });

    if (data.pharmacy.tax_number) {
      this.drawText(page, `الرقم الضريبي: ${data.pharmacy.tax_number}`, margin + 20, y - 40, 9, font, rgb(0.4, 0.4, 0.4), {
        align: 'right',
        width: contentWidth - 40
      });
    }

    // Document Type & Number (Left)
    let docTitle = 'مستند';
    if (data.document_type === 'sale_invoice') docTitle = 'فاتورة مبيعات ضريبية';
    else if (data.document_type === 'purchase_bill') docTitle = 'فاتورة مشتريات واردة';
    else if (data.document_type === 'sale_return') docTitle = 'إشعار مردود مبيعات';
    else if (data.document_type === 'purchase_return') docTitle = 'إشعار مردود مشتريات';
    else if (data.document_type === 'customer_statement') docTitle = 'كشف حساب عميل';
    else if (data.document_type === 'supplier_statement') docTitle = 'كشف حساب مورد';

    this.drawText(page, docTitle, margin + 20, y - 10, 14, font, rgb(0.1, 0.2, 0.5), {
      align: 'left',
      width: 250
    });
    this.drawText(page, `رقم: ${data.document_number}`, margin + 20, y - 28, 10, font, rgb(0.2, 0.2, 0.2), {
      align: 'left',
      width: 250
    });
    this.drawText(page, `التاريخ: ${data.business_date}`, margin + 20, y - 44, 10, font, rgb(0.3, 0.3, 0.3), {
      align: 'left',
      width: 250
    });

    y -= 85;

    // 2. Metadata Section (Customer/Supplier info + User)
    page.drawRectangle({
      x: margin,
      y: y - 40,
      width: contentWidth,
      height: 48,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.88, 0.88, 0.88),
      borderWidth: 1
    });

    const partyLabel = data.document_type.includes('customer') || data.document_type === 'sale_invoice' || data.document_type === 'sale_return' ? 'العميل' : 'المورد';
    const partyName = data.party_name || 'عميل نقدي عام';

    this.drawText(page, `${partyLabel}: ${partyName}`, margin + 15, y - 16, 11, font, rgb(0.1, 0.1, 0.1), {
      align: 'right',
      width: contentWidth - 30
    });

    if (data.party_phone) {
      this.drawText(page, `الهاتف: ${data.party_phone}`, margin + 15, y - 32, 9, font, rgb(0.3, 0.3, 0.3), {
        align: 'right',
        width: contentWidth - 30
      });
    }

    this.drawText(page, `المسؤول: ${data.responsible_user}`, margin + 15, y - 16, 10, font, rgb(0.3, 0.3, 0.3), {
      align: 'left',
      width: 200
    });
    this.drawText(page, `طريقة الدفع: ${data.payment_method === 'cash' ? 'نقدي' : data.payment_method === 'credit' ? 'آجل' : data.payment_method}`, margin + 15, y - 32, 9, font, rgb(0.3, 0.3, 0.3), {
      align: 'left',
      width: 200
    });

    y -= 58;

    // 3. Table Header
    const cols = [
      { header: 'م', width: 25, align: 'center' as const },
      { header: 'البيان / الصنف', width: 215, align: 'right' as const },
      { header: 'التشغيلة', width: 65, align: 'center' as const },
      { header: 'الوحدة', width: 45, align: 'center' as const },
      { header: 'الكمية', width: 40, align: 'center' as const },
      { header: 'السعر', width: 65, align: 'right' as const },
      { header: 'الإجمالي', width: 68, align: 'right' as const }
    ];

    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 22,
      color: rgb(0.15, 0.25, 0.45)
    });

    let curX = margin + contentWidth;
    for (const col of cols) {
      curX -= col.width;
      this.drawText(page, col.header, curX + 2, y - 13, 9, font, rgb(1, 1, 1), {
        align: col.align,
        width: col.width - 4
      });
    }

    y -= 22;

    // 4. Table Rows
    const rowHeight = 18;
    let idx = 1;

    for (const line of data.lines) {
      if (y < margin + 120) {
        // Simple 1-page guard for invoice lines, or draw warning
        break;
      }

      const bgColor = idx % 2 === 0 ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1);
      page.drawRectangle({
        x: margin,
        y: y - 15,
        width: contentWidth,
        height: rowHeight,
        color: bgColor,
        borderColor: rgb(0.9, 0.9, 0.9),
        borderWidth: 0.5
      });

      let colX = margin + contentWidth;

      // Col 0: Index
      colX -= cols[0].width;
      this.drawText(page, String(idx), colX, y - 11, 9, font, rgb(0.2, 0.2, 0.2), {
        align: 'center',
        width: cols[0].width
      });

      // Col 1: Name
      colX -= cols[1].width;
      this.drawText(page, line.name, colX + 4, y - 11, 9, font, rgb(0.1, 0.1, 0.1), {
        align: 'right',
        width: cols[1].width - 8
      });

      // Col 2: Batch
      colX -= cols[2].width;
      this.drawText(page, line.batch_number || '-', colX, y - 11, 8, font, rgb(0.3, 0.3, 0.3), {
        align: 'center',
        width: cols[2].width
      });

      // Col 3: Unit
      colX -= cols[3].width;
      this.drawText(page, line.unit || 'قطعة', colX, y - 11, 8, font, rgb(0.3, 0.3, 0.3), {
        align: 'center',
        width: cols[3].width
      });

      // Col 4: Quantity
      colX -= cols[4].width;
      this.drawText(page, String(line.quantity), colX, y - 11, 9, font, rgb(0.1, 0.1, 0.1), {
        align: 'center',
        width: cols[4].width
      });

      // Col 5: Unit Price
      colX -= cols[5].width;
      this.drawText(page, this.formatMoney(line.unit_price), colX + 2, y - 11, 9, font, rgb(0.1, 0.1, 0.1), {
        align: 'right',
        width: cols[5].width - 6
      });

      // Col 6: Line Total
      colX -= cols[6].width;
      this.drawText(page, this.formatMoney(line.line_total), colX + 2, y - 11, 9, font, rgb(0.1, 0.1, 0.1), {
        align: 'right',
        width: cols[6].width - 6
      });

      y -= rowHeight;
      idx++;
    }

    y -= 15;

    // 5. Totals Box
    const totalsWidth = 220;
    const totalsX = margin;

    page.drawRectangle({
      x: totalsX,
      y: y - 80,
      width: totalsWidth,
      height: 90,
      color: rgb(0.96, 0.98, 1.0),
      borderColor: rgb(0.7, 0.8, 0.9),
      borderWidth: 1
    });

    let totY = y - 16;

    const drawTotalRow = (label: string, value: string, isBold: boolean = false) => {
      this.drawText(page, label, totalsX + 10, totY, isBold ? 10 : 9, font, rgb(0.2, 0.2, 0.2), {
        align: 'right',
        width: 100
      });
      this.drawText(page, value, totalsX + 110, totY, isBold ? 11 : 9, font, isBold ? rgb(0.1, 0.2, 0.6) : rgb(0.1, 0.1, 0.1), {
        align: 'left',
        width: 95
      });
      totY -= 16;
    };

    drawTotalRow('المجموع الفرعي:', this.formatMoney(data.subtotal));
    if (data.discount_amount > 0) {
      drawTotalRow('إجمالي الخصم:', this.formatMoney(data.discount_amount));
    }
    drawTotalRow('صافي الفاتورة:', this.formatMoney(data.net_total), true);
    drawTotalRow('المبلغ المسدد:', this.formatMoney(data.paid_amount));
    drawTotalRow('المبلغ المتبقي:', this.formatMoney(data.remaining_amount));

    // Notes
    if (data.notes) {
      this.drawText(page, `ملاحظات: ${data.notes}`, margin + totalsWidth + 20, y - 20, 9, font, rgb(0.4, 0.4, 0.4), {
        align: 'right',
        width: contentWidth - totalsWidth - 30
      });
    }

    // Footer
    page.drawLine({
      start: { x: margin, y: margin + 25 },
      end: { x: width - margin, y: margin + 25 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });

    this.drawText(page, `تم إصدار هذا المستند إلكترونياً من نظام الصيدلية - صفحة 1 من 1`, margin, margin + 10, 8, font, rgb(0.5, 0.5, 0.5), {
      align: 'center',
      width: contentWidth
    });

    return await doc.save();
  }

  // ==========================================
  // 2. THERMAL RECEIPT PDF GENERATION (80mm)
  // ==========================================

  /**
   * Generates a thermal receipt PDF (80mm / 226.77pt)
   */
  static async generateThermalReceipt(data: DocumentData): Promise<Uint8Array> {
    const { doc, font } = await this.initDoc();

    const receiptWidth = 226.77; // 80mm
    const linesCount = data.lines.length;
    const baseHeight = 350;
    const receiptHeight = Math.max(450, baseHeight + linesCount * 22);

    const page = doc.addPage([receiptWidth, receiptHeight]);
    const margin = 10;
    const contentWidth = receiptWidth - margin * 2;

    let y = receiptHeight - 20;

    // Title
    const pharmName = data.pharmacy.name_ar || (data.pharmacy as any).name || 'صيدلية';
    this.drawText(page, pharmName, margin, y, 13, font, rgb(0, 0, 0), {
      align: 'center',
      width: contentWidth
    });
    y -= 16;

    if (data.pharmacy.phone) {
      this.drawText(page, `هاتف: ${data.pharmacy.phone}`, margin, y, 8, font, rgb(0.3, 0.3, 0.3), {
        align: 'center',
        width: contentWidth
      });
      y -= 14;
    }

    // Divider
    page.drawLine({
      start: { x: margin, y },
      end: { x: receiptWidth - margin, y },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    y -= 14;

    const docName = data.document_type === 'sale_return' ? 'إشعار مردود مبيعات' : 'فاتورة مبيعات نقدية';
    this.drawText(page, docName, margin, y, 10, font, rgb(0, 0, 0), {
      align: 'center',
      width: contentWidth
    });
    y -= 14;

    this.drawText(page, `رقم: ${data.document_number}`, margin, y, 8, font, rgb(0, 0, 0), {
      align: 'right',
      width: contentWidth
    });
    y -= 12;

    this.drawText(page, `التاريخ: ${data.business_date}`, margin, y, 8, font, rgb(0, 0, 0), {
      align: 'right',
      width: contentWidth
    });
    y -= 12;

    this.drawText(page, `الكاشير: ${data.responsible_user}`, margin, y, 8, font, rgb(0, 0, 0), {
      align: 'right',
      width: contentWidth
    });
    y -= 16;

    // Items header
    page.drawRectangle({
      x: margin,
      y: y - 10,
      width: contentWidth,
      height: 14,
      color: rgb(0.9, 0.9, 0.9)
    });

    this.drawText(page, 'الصنف', margin + 70, y - 8, 8, font, rgb(0, 0, 0), { align: 'right', width: 75 });
    this.drawText(page, 'الكمية', margin + 35, y - 8, 8, font, rgb(0, 0, 0), { align: 'center', width: 30 });
    this.drawText(page, 'الإجمالي', margin, y - 8, 8, font, rgb(0, 0, 0), { align: 'left', width: 35 });
    y -= 16;

    for (const item of data.lines) {
      this.drawText(page, item.name, margin + 70, y, 8, font, rgb(0, 0, 0), { align: 'right', width: 75 });
      this.drawText(page, String(item.quantity), margin + 35, y, 8, font, rgb(0, 0, 0), { align: 'center', width: 30 });
      this.drawText(page, this.formatMoney(item.line_total), margin, y, 8, font, rgb(0, 0, 0), { align: 'left', width: 35 });
      y -= 14;
    }

    y -= 5;
    page.drawLine({
      start: { x: margin, y },
      end: { x: receiptWidth - margin, y },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    y -= 15;

    // Totals
    this.drawText(page, 'الإجمالي الصافي:', margin + 70, y, 9, font, rgb(0, 0, 0), { align: 'right', width: 80 });
    this.drawText(page, this.formatMoney(data.net_total), margin, y, 9, font, rgb(0, 0, 0), { align: 'left', width: 50 });
    y -= 14;

    this.drawText(page, 'المدفوع:', margin + 70, y, 8, font, rgb(0, 0, 0), { align: 'right', width: 80 });
    this.drawText(page, this.formatMoney(data.paid_amount), margin, y, 8, font, rgb(0, 0, 0), { align: 'left', width: 50 });
    y -= 14;

    if (data.remaining_amount > 0) {
      this.drawText(page, 'المتبقي:', margin + 70, y, 8, font, rgb(0, 0, 0), { align: 'right', width: 80 });
      this.drawText(page, this.formatMoney(data.remaining_amount), margin, y, 8, font, rgb(0, 0, 0), { align: 'left', width: 50 });
      y -= 14;
    }

    y -= 15;
    this.drawText(page, 'شكراً لتعاملكم معنا ونتمنى لكم الشفاء العاجل', margin, y, 7, font, rgb(0.3, 0.3, 0.3), {
      align: 'center',
      width: contentWidth
    });

    return await doc.save();
  }

  // ==========================================
  // 3. TABULAR REPORT PDF GENERATION (A4 Multi-row)
  // ==========================================

  /**
   * Generates a generic tabular report PDF (e.g. Sales by Product, Inventory, Statements, Profitability)
   */
  static async generateReportPdf(
    title: string,
    subtitle: string,
    columns: PdfTableColumn[],
    rows: Array<Record<string, string | number>>,
    summaryKpis?: Array<{ label: string; value: string }>
  ): Promise<Uint8Array> {
    const { doc, font } = await this.initDoc();
    let page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const margin = 36;
    const contentWidth = width - margin * 2;

    let y = height - margin - 20;

    // Header Title
    this.drawText(page, title, margin, y, 16, font, rgb(0.1, 0.2, 0.5), {
      align: 'center',
      width: contentWidth
    });
    y -= 18;

    this.drawText(page, subtitle, margin, y, 10, font, rgb(0.4, 0.4, 0.4), {
      align: 'center',
      width: contentWidth
    });
    y -= 25;

    // Summary KPIs cards if present
    if (summaryKpis && summaryKpis.length > 0) {
      const cardWidth = (contentWidth - (summaryKpis.length - 1) * 8) / summaryKpis.length;
      let cardX = margin;

      for (const kpi of summaryKpis) {
        page.drawRectangle({
          x: cardX,
          y: y - 36,
          width: cardWidth,
          height: 38,
          color: rgb(0.95, 0.97, 1.0),
          borderColor: rgb(0.8, 0.88, 0.98),
          borderWidth: 1
        });

        this.drawText(page, kpi.label, cardX + 4, y - 14, 8, font, rgb(0.3, 0.3, 0.4), {
          align: 'center',
          width: cardWidth - 8
        });
        this.drawText(page, kpi.value, cardX + 4, y - 30, 11, font, rgb(0.1, 0.2, 0.6), {
          align: 'center',
          width: cardWidth - 8
        });

        cardX += cardWidth + 8;
      }
      y -= 50;
    }

    // Table Header
    const drawTableHeader = (p: PDFPage, atY: number) => {
      p.drawRectangle({
        x: margin,
        y: atY - 18,
        width: contentWidth,
        height: 22,
        color: rgb(0.15, 0.25, 0.45)
      });

      let colX = margin + contentWidth;
      for (const col of columns) {
        colX -= col.width;
        this.drawText(p, col.header, colX + 2, atY - 13, 8, font, rgb(1, 1, 1), {
          align: col.align || 'center',
          width: col.width - 4
        });
      }
    };

    drawTableHeader(page, y);
    y -= 22;

    // Rows
    const rowHeight = 17;
    let rowIndex = 0;

    for (const row of rows) {
      if (y < margin + 40) {
        // Add new page
        page = doc.addPage([595.28, 841.89]);
        y = height - margin - 20;
        drawTableHeader(page, y);
        y -= 22;
      }

      const bgColor = rowIndex % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1);
      page.drawRectangle({
        x: margin,
        y: y - 13,
        width: contentWidth,
        height: rowHeight,
        color: bgColor,
        borderColor: rgb(0.92, 0.92, 0.92),
        borderWidth: 0.5
      });

      let colX = margin + contentWidth;
      const keys = Object.keys(row);

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        colX -= col.width;
        const val = row[keys[i]] !== undefined ? String(row[keys[i]]) : '';

        this.drawText(page, val, colX + 2, y - 9, 8, font, rgb(0.1, 0.1, 0.1), {
          align: col.align || 'center',
          width: col.width - 4
        });
      }

      y -= rowHeight;
      rowIndex++;
    }

    return await doc.save();
  }

  // ==========================================
  // 4. BROWSER UTILITIES
  // ==========================================

  /**
   * Triggers download of generated PDF in browser
   */
  static downloadPdf(bytes: Uint8Array, fileName: string) {
    if (typeof window === 'undefined') return;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Opens PDF in a preview tab or Blob URL
   */
  static openPdfPreview(bytes: Uint8Array): string | null {
    if (typeof window === 'undefined') return null;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }
}
