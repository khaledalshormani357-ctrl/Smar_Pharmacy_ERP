// DocumentService - Generates structured document models and manages PDF & Print workflows
// Preserves immutable snapshots for Sales, Purchases, Returns, and Financial Statements.

import { db } from '../db/sqlite';
import {
  DocumentData,
  DocumentLineItem,
  Sale,
  SaleItem,
  PharmacyProfile,
  Customer,
  ReportFilter
} from '../types';
import { Money } from '../utils/money';
import { PdfService } from './PdfService';
import { ReportService } from './ReportService';

export class DocumentService {
  private static getProfile(): PharmacyProfile {
    const state = db.getState();
    return state.pharmacy_profile || state.profile || {
      id: 'profile-main',
      name_ar: 'صيدلية الأمل النموذجية',
      phone: '01-234567',
      currency: 'ريال',
      currency_code: 'YER',
      default_profit_margin_bps: 2000,
      receipt_paper_size: '80mm',
      device_id: 'dev-001',
      sync_status: 'synced',
      updated_at: Date.now()
    };
  }

  // ==========================================
  // 1. DOCUMENT DATA BUILDERS (Immutable Snapshots)
  // ==========================================

  /**
   * Builds DocumentData for a Sales Invoice
   */
  static buildSaleInvoiceDoc(saleId: string): DocumentData {
    const state = db.getState();
    const sale = state.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error(`فاتورة المبيعات غير موجودة (${saleId})`);

    const customer = state.customers.find((c) => c.id === sale.customer_id);
    const user = state.users.find((u) => u.id === sale.user_id);
    const items = state.sale_items.filter((it) => it.sale_id === sale.id);
    const profile = this.getProfile();

    const lines: DocumentLineItem[] = items.map((it) => {
      const prod = state.products.find((p) => p.id === it.product_id);
      // find batch allocation if available
      const alloc = state.sale_item_allocations.find((a) => a.sale_item_id === it.id);
      const batch = alloc ? state.batches.find((b) => b.id === alloc.batch_id) : undefined;

      return {
        id: it.id,
        name: prod?.name_ar || 'صنف',
        code: prod?.code,
        unit: it.unit_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount: it.discount_amount,
        line_total: it.line_total,
        batch_number: batch?.batch_number,
        expiry_date: batch?.expiry_date
      };
    });

    return {
      document_type: 'sale_invoice',
      document_number: sale.invoice_number,
      business_date: new Date(sale.created_at).toISOString().split('T')[0],
      created_at: sale.created_at,
      pharmacy: profile,
      party_name: customer ? customer.name : 'عميل نقدي عام',
      party_phone: customer?.phone,
      party_address: customer?.address,
      party_tax_number: customer?.tax_number,
      responsible_user: user?.full_name || 'الكاشير',
      lines,
      subtotal: sale.subtotal,
      discount_amount: sale.discount_amount,
      tax_amount: sale.tax_amount,
      net_total: sale.net_total,
      paid_amount: sale.paid_amount,
      remaining_amount: sale.remaining_amount,
      payment_status: sale.remaining_amount === 0 ? 'مسددة بالكامل' : sale.paid_amount > 0 ? 'مسددة جزئياً' : 'آجلة',
      payment_method: sale.payment_method || sale.sale_type,
      status: sale.status,
      notes: sale.notes
    };
  }

  /**
   * Builds DocumentData for a Purchase Bill
   */
  static buildPurchaseBillDoc(purchaseId: string): DocumentData {
    const state = db.getState();
    const purchase = state.purchases.find((p) => p.id === purchaseId);
    if (!purchase) throw new Error(`فاتورة المشتريات غير موجودة (${purchaseId})`);

    const supplier = state.suppliers.find((s) => s.id === purchase.supplier_id);
    const user = state.users.find((u) => u.id === purchase.user_id);
    const items = state.purchase_items.filter((it) => it.purchase_id === purchase.id);
    const profile = this.getProfile();

    const lines: DocumentLineItem[] = items.map((it) => ({
      id: it.id,
      name: it.product_name_snapshot || state.products.find((p) => p.id === it.product_id)?.name_ar || 'صنف',
      code: it.product_code_snapshot,
      unit: it.unit_name,
      quantity: it.quantity,
      unit_price: it.unit_purchase_price,
      discount: it.discount_amount || 0,
      line_total: it.line_total,
      batch_number: it.batch_number,
      expiry_date: it.expiry_date
    }));

    return {
      document_type: 'purchase_bill',
      document_number: purchase.internal_number || purchase.invoice_number,
      business_date: purchase.purchase_date,
      created_at: purchase.created_at,
      pharmacy: profile,
      party_name: supplier ? supplier.name_ar || supplier.name : 'مورد غير محدد',
      party_phone: supplier?.phone,
      party_address: supplier?.address,
      party_tax_number: supplier?.tax_number,
      responsible_user: user?.full_name || 'أمين المخزن',
      lines,
      subtotal: purchase.subtotal,
      discount_amount: purchase.discount_amount,
      tax_amount: purchase.tax_amount,
      net_total: purchase.net_total,
      paid_amount: purchase.paid_amount,
      remaining_amount: purchase.remaining_amount,
      payment_status: purchase.remaining_amount === 0 ? 'مسددة' : purchase.paid_amount > 0 ? 'مسددة جزئياً' : 'آجلة',
      payment_method: purchase.payment_type,
      status: purchase.status,
      notes: purchase.notes
    };
  }

  /**
   * Builds DocumentData for a Sales Return
   */
  static buildSaleReturnDoc(returnId: string): DocumentData {
    const state = db.getState();
    const ret = state.sale_returns.find((r) => r.id === returnId);
    if (!ret) throw new Error(`إشعار مردود المبيعات غير موجود (${returnId})`);

    const customer = state.customers.find((c) => c.id === ret.customer_id);
    const user = state.users.find((u) => u.id === ret.created_by);
    const items = state.sale_return_items.filter((it) => it.return_id === ret.id);
    const origSale = ret.original_sale_id ? state.sales.find((s) => s.id === ret.original_sale_id) : undefined;
    const profile = this.getProfile();

    const lines: DocumentLineItem[] = items.map((it) => {
      const prod = state.products.find((p) => p.id === it.product_id);
      const batch = state.batches.find((b) => b.id === it.target_batch_id);

      return {
        id: it.id,
        name: prod?.name_ar || 'صنف',
        code: prod?.code,
        unit: it.unit_name,
        quantity: it.returned_quantity,
        unit_price: it.refund_unit_price,
        discount: 0,
        line_total: it.line_refund_total,
        batch_number: batch?.batch_number,
        reason: it.item_reason || ret.return_reason
      };
    });

    return {
      document_type: 'sale_return',
      document_number: ret.return_number,
      business_date: new Date(ret.created_at).toISOString().split('T')[0],
      created_at: ret.created_at,
      pharmacy: profile,
      party_name: customer ? customer.name : 'عميل نقدي عام',
      party_phone: customer?.phone,
      responsible_user: user?.full_name || 'الكاشير',
      lines,
      subtotal: ret.subtotal || ret.total_refund_amount,
      discount_amount: ret.discount_amount || 0,
      tax_amount: ret.tax_amount || 0,
      net_total: ret.total_refund_amount,
      paid_amount: ret.total_refund_amount,
      remaining_amount: 0,
      payment_status: ret.settlement_method === 'cash' ? 'مسترد نقداً' : 'رصيد دائن بحساب العميل',
      payment_method: ret.settlement_method,
      status: ret.status,
      original_reference: origSale ? origSale.invoice_number : undefined,
      notes: `السبب: ${ret.return_reason}`
    };
  }

  /**
   * Builds DocumentData for a Purchase Return
   */
  static buildPurchaseReturnDoc(returnId: string): DocumentData {
    const state = db.getState();
    const ret = state.purchase_returns.find((r) => r.id === returnId);
    if (!ret) throw new Error(`إشعار مردود المشتريات غير موجود (${returnId})`);

    const supplier = state.suppliers.find((s) => s.id === ret.supplier_id);
    const user = state.users.find((u) => u.id === ret.created_by);
    const items = state.purchase_return_items.filter((it) => it.return_id === ret.id);
    const origPurchase = ret.original_purchase_id ? state.purchases.find((p) => p.id === ret.original_purchase_id) : undefined;
    const profile = this.getProfile();

    const lines: DocumentLineItem[] = items.map((it) => {
      const prod = state.products.find((p) => p.id === it.product_id);
      const batch = state.batches.find((b) => b.id === it.batch_id);

      return {
        id: it.id,
        name: prod?.name_ar || 'صنف',
        code: prod?.code,
        unit: it.unit_name || 'وحدة',
        quantity: it.returned_quantity,
        unit_price: it.unit_refund_price,
        discount: 0,
        line_total: it.line_total,
        batch_number: batch?.batch_number,
        reason: it.item_reason || ret.return_reason
      };
    });

    return {
      document_type: 'purchase_return',
      document_number: ret.return_number,
      business_date: new Date(ret.created_at).toISOString().split('T')[0],
      created_at: ret.created_at,
      pharmacy: profile,
      party_name: supplier ? supplier.name_ar || supplier.name : 'مورد',
      party_phone: supplier?.phone,
      responsible_user: user?.full_name || 'أمين المخزن',
      lines,
      subtotal: ret.subtotal || ret.total_refund_amount,
      discount_amount: ret.discount_amount || 0,
      tax_amount: ret.tax_amount || 0,
      net_total: ret.total_refund_amount,
      paid_amount: ret.total_refund_amount,
      remaining_amount: 0,
      payment_status: ret.settlement_method === 'cash' ? 'مسترد نقداً' : 'خصم من رصيد المورد',
      payment_method: ret.settlement_method,
      status: ret.status,
      original_reference: origPurchase ? origPurchase.internal_number || origPurchase.invoice_number : undefined,
      notes: `السبب: ${ret.return_reason}`
    };
  }

  /**
   * Builds DocumentData for Customer Statement
   */
  static buildCustomerStatementDoc(customerId: string, filter?: ReportFilter): DocumentData {
    const statement = ReportService.getCustomerStatement(customerId, filter);
    const profile = this.getProfile();

    const lines: DocumentLineItem[] = statement.items.map((it) => ({
      id: it.id,
      name: it.notes || it.transaction_type,
      unit: 'عملية',
      quantity: 1,
      unit_price: it.debit > 0 ? it.debit : it.credit,
      discount: 0,
      line_total: it.running_balance,
      reason: `${it.reference_type}: ${it.reference_id}`
    }));

    return {
      document_type: 'customer_statement',
      document_number: `STMT-${customerId.substring(0, 8)}`,
      business_date: new Date().toISOString().split('T')[0],
      created_at: Date.now(),
      pharmacy: profile,
      party_name: statement.customer.name,
      party_phone: statement.customer.phone,
      party_address: statement.customer.address,
      party_tax_number: statement.customer.tax_number,
      responsible_user: 'قسم الحسابات',
      lines,
      subtotal: statement.total_debits,
      discount_amount: 0,
      tax_amount: 0,
      net_total: statement.closing_balance,
      paid_amount: statement.total_credits,
      remaining_amount: statement.closing_balance,
      payment_status: statement.closing_balance > 0 ? 'مطلوب من العميل' : statement.closing_balance < 0 ? 'دائن للعميل' : 'حساب متزن',
      payment_method: 'آجل',
      status: 'active',
      financial_summary: {
        opening_balance: statement.opening_balance,
        total_debits: statement.total_debits,
        total_credits: statement.total_credits,
        closing_balance: statement.closing_balance
      }
    };
  }

  /**
   * Builds DocumentData for Supplier Statement
   */
  static buildSupplierStatementDoc(supplierId: string, filter?: ReportFilter): DocumentData {
    const statement = ReportService.getSupplierStatement(supplierId, filter);
    const profile = this.getProfile();

    const lines: DocumentLineItem[] = statement.items.map((it) => ({
      id: it.id,
      name: it.notes || it.transaction_type,
      unit: 'عملية',
      quantity: 1,
      unit_price: it.credit > 0 ? it.credit : it.debit,
      discount: 0,
      line_total: it.running_balance,
      reason: `${it.reference_type}: ${it.reference_id}`
    }));

    return {
      document_type: 'supplier_statement',
      document_number: `STMT-${supplierId.substring(0, 8)}`,
      business_date: new Date().toISOString().split('T')[0],
      created_at: Date.now(),
      pharmacy: profile,
      party_name: statement.supplier.name_ar || statement.supplier.name,
      party_phone: statement.supplier.phone,
      party_address: statement.supplier.address,
      party_tax_number: statement.supplier.tax_number,
      responsible_user: 'قسم المشتريات والحسابات',
      lines,
      subtotal: statement.total_credits,
      discount_amount: 0,
      tax_amount: 0,
      net_total: statement.closing_balance,
      paid_amount: statement.total_debits,
      remaining_amount: statement.closing_balance,
      payment_status: statement.closing_balance > 0 ? 'مستحق للمورد' : statement.closing_balance < 0 ? 'رصيد دائن لنا' : 'حساب متزن',
      payment_method: 'آجل',
      status: 'active',
      financial_summary: {
        opening_balance: statement.opening_balance,
        total_credits: statement.total_credits,
        total_debits: statement.total_debits,
        closing_balance: statement.closing_balance
      }
    };
  }

  // ==========================================
  // 2. PDF & PRINT EXECUTORS
  // ==========================================

  /**
   * Generates real PDF bytes for any document
   */
  static async generateDocumentPdf(doc: DocumentData, format: 'A4' | '80mm' = 'A4'): Promise<Uint8Array> {
    if (format === '80mm') {
      return await PdfService.generateThermalReceipt(doc);
    }
    return await PdfService.generateA4Document(doc);
  }

  /**
   * Triggers download of real PDF document
   */
  static async downloadDocumentPdf(doc: DocumentData, format: 'A4' | '80mm' = 'A4') {
    const bytes = await this.generateDocumentPdf(doc, format);
    const fileName = `${doc.document_number}_${format}.pdf`;
    PdfService.downloadPdf(bytes, fileName);
  }

  /**
   * Legacy print method kept for seamless compatibility
   */
  static printReceipt(
    sale: Sale,
    items: SaleItem[],
    profile: PharmacyProfile,
    customer?: Customer,
    productNamesMap: Record<string, string> = {},
    paperSize: '80mm' | 'A4' = '80mm'
  ) {
    const doc = this.buildSaleInvoiceDoc(sale.id);
    if (paperSize === '80mm') {
      this.printViaWindow(doc, true);
    } else {
      this.printViaWindow(doc, false);
    }
  }

  /**
   * Renders high-resolution print window for connected printers
   */
  static printViaWindow(doc: DocumentData, isThermal: boolean = true) {
    if (typeof window === 'undefined') return;

    const printWindow = window.open('', '_blank', 'width=480,height=700');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${doc.document_number}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Cairo', sans-serif;
            background: #fff;
            color: #000;
            font-size: ${isThermal ? '12px' : '14px'};
            line-height: 1.4;
            padding: ${isThermal ? '10px' : '30px'};
            width: ${isThermal ? '78mm' : '100%'};
            margin: auto;
          }
          .header { text-align: center; border-bottom: 1px dashed #444; padding-bottom: 8px; margin-bottom: 8px; }
          .title { font-size: ${isThermal ? '16px' : '22px'}; font-weight: 800; }
          .meta-row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th { border-bottom: 1px solid #000; padding: 4px 2px; text-align: right; font-size: 11px; font-weight: 700; }
          td { padding: 4px 2px; border-bottom: 1px dashed #eee; font-size: 11px; }
          .text-left { text-align: left; }
          .text-center { text-align: center; }
          .totals-table { width: 100%; margin-top: 6px; border-top: 1px dashed #000; }
          .totals-table td { border: none; padding: 3px 0; }
          .grand-total { font-weight: 800; font-size: ${isThermal ? '14px' : '18px'}; }
          .footer { text-align: center; font-size: 10px; margin-top: 12px; border-top: 1px dashed #444; padding-top: 6px; }
          @media print {
            body { padding: 0; width: ${isThermal ? '78mm' : '100%'}; }
            @page { margin: 0; size: ${isThermal ? '80mm auto' : 'A4'}; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${doc.pharmacy.name_ar}</div>
          <div style="font-size: 11px;">${doc.pharmacy.address_ar || ''} | هاتف: ${doc.pharmacy.phone}</div>
        </div>
        <div class="meta-row"><span>المستند:</span><strong>${doc.document_number}</strong></div>
        <div class="meta-row"><span>التاريخ:</span><span>${doc.business_date}</span></div>
        <div class="meta-row"><span>الطرف:</span><strong>${doc.party_name || 'عام'}</strong></div>
        <table>
          <thead>
            <tr>
              <th style="width: 50%;">الصنف</th>
              <th class="text-center" style="width: 20%;">الكمية</th>
              <th class="text-left" style="width: 30%;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${doc.lines
              .map(
                (l) => `
              <tr>
                <td>${l.name}</td>
                <td class="text-center">${l.quantity} ${l.unit}</td>
                <td class="text-left">${Money.format(l.line_total)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <table class="totals-table">
          <tr>
            <td>الإجمالي الفرعي:</td>
            <td class="text-left font-mono">${Money.format(doc.subtotal)}</td>
          </tr>
          ${
            doc.discount_amount > 0
              ? `<tr><td>الخصم:</td><td class="text-left font-mono text-rose-600">-${Money.format(doc.discount_amount)}</td></tr>`
              : ''
          }
          ${
            doc.tax_amount > 0
              ? `<tr><td>الضريبة:</td><td class="text-left font-mono">+${Money.format(doc.tax_amount)}</td></tr>`
              : ''
          }
          <tr class="grand-total">
            <td>الإجمالي النهائي (الصافي):</td>
            <td class="text-left font-mono">${Money.format(doc.net_total)}</td>
          </tr>
          ${
            doc.remaining_amount > 0
              ? `<tr><td>المتبقي:</td><td class="text-left font-mono">${Money.format(doc.remaining_amount)}</td></tr>`
              : ''
          }
        </table>
        <div class="footer">شكراً لتعاملكم معنا ودمتم بصحة وعافية</div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }

  /**
   * WhatsApp share link helper
   */
  static shareViaWhatsApp(doc: DocumentData, phone = '') {
    const text = `*مستند من ${doc.pharmacy.name_ar}*
رقم المستند: ${doc.document_number}
التاريخ: ${doc.business_date}
الصافي الإجمالي: ${Money.format(doc.net_total)}
طريقة السداد: ${doc.payment_method === 'cash' ? 'نقداً' : 'آجل'}
نتمنى لكم دوام الصحة والعافية!`;

    const encoded = encodeURIComponent(text);
    const targetPhone = phone.replace(/[^0-9]/g, '');
    const url = targetPhone ? `https://wa.me/${targetPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }
}
