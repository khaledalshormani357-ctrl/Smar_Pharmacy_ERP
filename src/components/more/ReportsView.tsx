import React, { useState } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  PackageCheck,
  Wallet,
  Calculator,
  Download,
  Printer,
  Share2,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { ReportService } from '../../services/ReportService';
import { PdfService } from '../../services/PdfService';
import { ExportService } from '../../services/ExportService';
import { ShareService } from '../../services/ShareService';
import { Money } from '../../utils/money';
import { ReportFilter } from '../../types';

type MainReportCategory = 'sales' | 'purchases' | 'inventory' | 'finance' | 'profitability';

export const ReportsView: React.FC = () => {
  const [category, setCategory] = useState<MainReportCategory>('sales');
  const [subReport, setSubReport] = useState<string>('sales_summary');

  // Filters
  const [dateQuickFilter, setDateQuickFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [dateFrom, setDateFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedCashboxId, setSelectedCashboxId] = useState<string>(db.getState().cashboxes[0]?.id || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [expiryThreshold, setExpiryThreshold] = useState<number>(60);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const state = db.getState();

  // Compute timestamp ranges based on date filter
  const getFilterParams = (): ReportFilter => {
    let startMs: number | undefined;
    let endMs: number | undefined;

    const now = new Date();
    if (dateQuickFilter === 'today') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      startMs = s.getTime();
      endMs = e.getTime();
    } else if (dateQuickFilter === 'yesterday') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      startMs = s.getTime();
      endMs = e.getTime();
    } else if (dateQuickFilter === 'week') {
      const s = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      s.setHours(0, 0, 0, 0);
      startMs = s.getTime();
      endMs = now.getTime();
    } else if (dateQuickFilter === 'month') {
      const s = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      s.setHours(0, 0, 0, 0);
      startMs = s.getTime();
      endMs = now.getTime();
    } else if (dateQuickFilter === 'custom') {
      if (dateFrom) {
        const s = new Date(dateFrom);
        s.setHours(0, 0, 0, 0);
        startMs = s.getTime();
      }
      if (dateTo) {
        const e = new Date(dateTo);
        e.setHours(23, 59, 59, 999);
        endMs = e.getTime();
      }
    }

    return {
      date_from: startMs,
      date_to: endMs,
      customer_id: selectedCustomerId || undefined,
      supplier_id: selectedSupplierId || undefined,
      expiry_threshold_days: expiryThreshold
    };
  };

  const filter = getFilterParams();

  // Load active report data
  const salesSummary = ReportService.getSalesSummary(filter);
  const salesByProduct = ReportService.getSalesByProduct(filter);
  const salesByCustomer = ReportService.getSalesByCustomer(filter);
  const salesByUser = ReportService.getSalesByUser(filter);

  const purchaseSummary = ReportService.getPurchasesSummary(filter);
  const purchasesBySupplier = ReportService.getPurchasesBySupplier(filter);
  const purchasesByProduct = ReportService.getPurchasesByProduct(filter);

  const currentStock = ReportService.getCurrentStockReport(filter);
  const batchReport = ReportService.getBatchReport(filter);
  const nearExpiry = ReportService.getNearExpiryReport(expiryThreshold, filter);
  const expiredStock = ReportService.getExpiredStockReport(filter);
  const stockMovements = ReportService.getStockMovementReport(filter);

  const cashFlow = selectedCashboxId ? ReportService.getCashFlowReport(selectedCashboxId, filter) : null;
  const cashStatement = selectedCashboxId ? ReportService.getCashTransactionsStatement(selectedCashboxId, filter) : null;
  const expensesReport = ReportService.getExpensesReport(filter);

  const profitability = ReportService.getProfitabilityReport(filter);

  const notify = (msg: string) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(null), 3500);
  };

  // ==========================================
  // EXPORT & PRINT HANDLERS
  // ==========================================

  const handleExportCsv = () => {
    setIsProcessing(true);
    try {
      if (category === 'sales' && subReport === 'sales_by_product') {
        const cols = [
          { key: 'code', label: 'كود الصنف' },
          { key: 'name', label: 'اسم الصنف' },
          { key: 'qty', label: 'الكمية المباعة' },
          { key: 'gross', label: 'إجمالي المبيعات' },
          { key: 'discount', label: 'الخصومات' },
          { key: 'net', label: 'صافي المبيعات' },
          { key: 'cogs', label: 'تكلفة المبيعات التاريخية' },
          { key: 'profit', label: 'مجمل الربح' }
        ];
        const rows = salesByProduct.items.map((it) => ({
          code: it.product_code,
          name: it.product_name,
          qty: it.base_quantity,
          gross: (it.gross_sales / 100).toFixed(2),
          discount: (it.discounts / 100).toFixed(2),
          net: (it.net_sales / 100).toFixed(2),
          cogs: (it.cogs / 100).toFixed(2),
          profit: (it.gross_profit / 100).toFixed(2)
        }));
        const csv = ExportService.generateCsv(cols, rows);
        ExportService.downloadCsv(csv, `sales_by_product_${dateFrom}.csv`);
        notify('تم تصدير تقرير المبيعات بصيغة CSV بنجاح');
      } else if (category === 'inventory' && subReport === 'current_stock') {
        const cols = [
          { key: 'code', label: 'الكود' },
          { key: 'name', label: 'اسم الصنف' },
          { key: 'unit', label: 'الوحدة' },
          { key: 'current', label: 'إجمالي الرصيد' },
          { key: 'available', label: 'الرصيد المتاح' },
          { key: 'quarantine', label: 'الحجر' },
          { key: 'value', label: 'القيمة التقديرية' }
        ];
        const rows = currentStock.items.map((it) => ({
          code: it.code,
          name: it.product_name,
          unit: it.base_unit,
          current: it.current_quantity,
          available: it.available_quantity,
          quarantine: it.quarantined_quantity,
          value: (it.estimated_inventory_value / 100).toFixed(2)
        }));
        const csv = ExportService.generateCsv(cols, rows);
        ExportService.downloadCsv(csv, `inventory_valuation_${dateFrom}.csv`);
        notify('تم تصدير تقرير المخزون بصيغة CSV بنجاح');
      } else if (category === 'inventory' && subReport === 'near_expiry') {
        const cols = [
          { key: 'name', label: 'الصنف' },
          { key: 'batch', label: 'رقم التشغيلة' },
          { key: 'expiry', label: 'تاريخ الانتهاء' },
          { key: 'days', label: 'الأيام المتبقية' },
          { key: 'qty', label: 'الرصيد' },
          { key: 'val', label: 'القيمة' }
        ];
        const rows = nearExpiry.items.map((it) => ({
          name: it.product_name,
          batch: it.batch_number,
          expiry: it.expiry_date,
          days: it.days_remaining,
          qty: it.remaining_quantity,
          val: (it.total_value / 100).toFixed(2)
        }));
        const csv = ExportService.generateCsv(cols, rows);
        ExportService.downloadCsv(csv, `near_expiry_report.csv`);
        notify('تم تصدير تقرير الصلاحية بنجاح');
      } else if (category === 'finance' && subReport === 'cash_statement' && cashStatement) {
        const cols = [
          { key: 'date', label: 'التاريخ' },
          { key: 'ref', label: 'المرجع' },
          { key: 'desc', label: 'البيان' },
          { key: 'in', label: 'وارد (IN)' },
          { key: 'out', label: 'صادر (OUT)' },
          { key: 'balance', label: 'الرصيد التراكمي' }
        ];
        const rows = cashStatement.items.map((it) => ({
          date: it.business_date,
          ref: it.reference,
          desc: it.description,
          in: (it.in_amount / 100).toFixed(2),
          out: (it.out_amount / 100).toFixed(2),
          balance: (it.running_balance / 100).toFixed(2)
        }));
        const csv = ExportService.generateCsv(cols, rows);
        ExportService.downloadCsv(csv, `cash_statement_${selectedCashboxId}.csv`);
        notify('تم تصدير كشف حركة الصندوق بنجاح');
      } else {
        // Generic export
        const cols = [
          { key: 'metric', label: 'البند' },
          { key: 'value', label: 'القيمة' }
        ];
        const rows = [
          { metric: 'إجمالي المبيعات', value: (salesSummary.gross_sales / 100).toFixed(2) },
          { metric: 'صافي المبيعات', value: (salesSummary.net_sales_after_returns / 100).toFixed(2) },
          { metric: 'تكلفة المبيعات COGS', value: (salesSummary.cogs / 100).toFixed(2) },
          { metric: 'مجمل الربح', value: (salesSummary.gross_profit / 100).toFixed(2) }
        ];
        const csv = ExportService.generateCsv(cols, rows);
        ExportService.downloadCsv(csv, `financial_summary.csv`);
        notify('تم تصدير الملخص المالي بنجاح');
      }
    } catch (err: any) {
      notify(`فشل التصدير: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintPdf = async () => {
    setIsProcessing(true);
    try {
      let pdfBytes: Uint8Array;
      const subtitle = `الفترة من: ${dateFrom} إلى: ${dateTo} | تاريخ التقرير: ${new Date().toLocaleDateString('ar-YE')}`;

      if (category === 'sales' && subReport === 'sales_by_product') {
        const cols = [
          { header: 'الصنف', width: 200, align: 'right' as const },
          { header: 'الكمية', width: 60, align: 'center' as const },
          { header: 'الصافي', width: 80, align: 'right' as const },
          { header: 'التكلفة COGS', width: 90, align: 'right' as const },
          { header: 'مجمل الربح', width: 90, align: 'right' as const }
        ];
        const rows = salesByProduct.items.map((it) => ({
          name: it.product_name,
          qty: it.base_quantity,
          net: (it.net_sales / 100).toFixed(2),
          cogs: (it.cogs / 100).toFixed(2),
          profit: (it.gross_profit / 100).toFixed(2)
        }));
        const kpis = [
          { label: 'إجمالي الوحدات المباعة', value: String(salesByProduct.total_quantity_sold) },
          { label: 'صافي المبيعات', value: Money.format(salesByProduct.total_net_sales) },
          { label: 'مجمل الربح', value: Money.format(salesByProduct.total_gross_profit) }
        ];
        pdfBytes = await PdfService.generateReportPdf('تقرير مبيعات الأصناف التفصيلي', subtitle, cols, rows, kpis);
      } else if (category === 'inventory') {
        const cols = [
          { header: 'كود', width: 60, align: 'center' as const },
          { header: 'اسم الصنف', width: 220, align: 'right' as const },
          { header: 'المتاح', width: 60, align: 'center' as const },
          { header: 'الحجر', width: 50, align: 'center' as const },
          { header: 'التقييم المخزوني', width: 130, align: 'right' as const }
        ];
        const rows = currentStock.items.map((it) => ({
          code: it.code,
          name: it.product_name,
          available: it.available_quantity,
          quarantine: it.quarantined_quantity,
          val: (it.estimated_inventory_value / 100).toFixed(2)
        }));
        const kpis = [
          { label: 'عدد الأصناف', value: String(currentStock.total_products_count) },
          { label: 'إجمالي الوحدات بالمخزن', value: String(currentStock.total_base_units) },
          { label: 'إجمالي قيمة المخزون', value: Money.format(currentStock.total_inventory_value) }
        ];
        pdfBytes = await PdfService.generateReportPdf('تقرير جرد وتقييم المخزون الفعلي', subtitle, cols, rows, kpis);
      } else if (category === 'profitability') {
        const cols = [
          { header: 'البند المحاسبي', width: 320, align: 'right' as const },
          { header: 'المبلغ (ريال)', width: 200, align: 'right' as const }
        ];
        const rows = [
          { item: 'إجمالي المبيعات الصامتة (Gross Sales)', amount: (profitability.gross_sales / 100).toFixed(2) },
          { item: 'الخصومات الممنوحة للعملاء', amount: `-${(profitability.discounts / 100).toFixed(2)}` },
          { item: 'صافي المبيعات قبل المردودات', amount: (profitability.net_sales / 100).toFixed(2) },
          { item: 'مردودات المبيعات المستردة للعملاء', amount: `-${(profitability.sales_returns / 100).toFixed(2)}` },
          { item: 'صافي المبيعات بعد المردودات (Net Sales)', amount: (profitability.net_sales_after_returns / 100).toFixed(2) },
          { item: 'تكلفة البضاعة المباعة التاريخية (Historical COGS)', amount: `-${(profitability.net_cogs / 100).toFixed(2)}` },
          { item: 'مجمل الربح (GROSS PROFIT)', amount: (profitability.gross_profit / 100).toFixed(2) },
          { item: 'المصروفات التشغيلية المباشرة (Expenses)', amount: `-${(profitability.operating_expenses / 100).toFixed(2)}` },
          { item: 'هامش التشغيل بعد المصروفات (Operating Margin)', amount: (profitability.operating_margin / 100).toFixed(2) }
        ];
        const kpis = [
          { label: 'صافي المبيعات', value: Money.format(profitability.net_sales_after_returns) },
          { label: 'مجمل الربح', value: Money.format(profitability.gross_profit) },
          { label: 'هامش التشغيل', value: Money.format(profitability.operating_margin) }
        ];
        pdfBytes = await PdfService.generateReportPdf('تقرير تحليل الأرباح وهامش التشغيل', subtitle, cols, rows, kpis);
      } else {
        // Default PDF for sales or cash
        const cols = [
          { header: 'البيان', width: 300, align: 'right' as const },
          { header: 'القيمة', width: 220, align: 'right' as const }
        ];
        const rows = [
          { item: 'إجمالي المبيعات', val: (salesSummary.gross_sales / 100).toFixed(2) },
          { item: 'المبيعات النقدية', val: (salesSummary.cash_sales / 100).toFixed(2) },
          { item: 'المبيعات الآجلة', val: (salesSummary.credit_sales / 100).toFixed(2) },
          { item: 'مردودات المبيعات', val: (salesSummary.returned_sales / 100).toFixed(2) },
          { item: 'صافي المبيعات', val: (salesSummary.net_sales_after_returns / 100).toFixed(2) },
          { item: 'تكلفة المبيعات COGS', val: (salesSummary.cogs / 100).toFixed(2) },
          { item: 'مجمل الربح', val: (salesSummary.gross_profit / 100).toFixed(2) }
        ];
        pdfBytes = await PdfService.generateReportPdf('تقرير المبيعات الشامل', subtitle, cols, rows);
      }

      PdfService.downloadPdf(pdfBytes, `report_${category}_${dateFrom}.pdf`);
      notify('تم توليد ملف PDF الأصلي وتنزيله بنجاح');
    } catch (err: any) {
      notify(`فشل إنشاء PDF: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSharePdf = async () => {
    setIsProcessing(true);
    try {
      const subtitle = `الفترة من: ${dateFrom} إلى: ${dateTo}`;
      const cols = [
        { header: 'البيان', width: 300, align: 'right' as const },
        { header: 'القيمة', width: 220, align: 'right' as const }
      ];
      const rows = [
        { item: 'صافي المبيعات', val: (salesSummary.net_sales_after_returns / 100).toFixed(2) },
        { item: 'مجمل الربح', val: (salesSummary.gross_profit / 100).toFixed(2) }
      ];
      const pdfBytes = await PdfService.generateReportPdf('تقرير الصيدلية', subtitle, cols, rows);
      const res = await ShareService.sharePdf(pdfBytes, `report_${category}.pdf`, {
        title: 'تقرير صيدلية',
        text: 'مرفق تقرير معتمد من نظام الصيدلية'
      });
      notify(res.message || 'تمت المشاركة بنجاح');
    } catch (err: any) {
      notify(`فشل المشاركة: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Main Navigation Categories */}
      <div className="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-bold text-slate-600">
        <button
          onClick={() => {
            setCategory('sales');
            setSubReport('sales_summary');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            category === 'sales' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span className="hidden sm:inline">المبيعات</span>
        </button>

        <button
          onClick={() => {
            setCategory('purchases');
            setSubReport('purchases_summary');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            category === 'purchases' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="hidden sm:inline">المشتريات</span>
        </button>

        <button
          onClick={() => {
            setCategory('inventory');
            setSubReport('current_stock');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            category === 'inventory' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span className="hidden sm:inline">المخزون</span>
        </button>

        <button
          onClick={() => {
            setCategory('finance');
            setSubReport('cash_flow');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            category === 'finance' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span className="hidden sm:inline">المالية</span>
        </button>

        <button
          onClick={() => {
            setCategory('profitability');
            setSubReport('profit_analysis');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            category === 'profitability' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span className="hidden sm:inline">الأرباح</span>
        </button>
      </div>

      {/* Sub-Report Pills */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200/60 text-xs">
        {category === 'sales' && (
          <>
            <button
              onClick={() => setSubReport('sales_summary')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'sales_summary' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              ملخص المبيعات
            </button>
            <button
              onClick={() => setSubReport('sales_by_product')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'sales_by_product' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              مبيعات الأصناف
            </button>
            <button
              onClick={() => setSubReport('sales_by_customer')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'sales_by_customer' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              مبيعات العملاء
            </button>
            <button
              onClick={() => setSubReport('sales_by_user')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'sales_by_user' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              أداء الكاشير
            </button>
          </>
        )}

        {category === 'purchases' && (
          <>
            <button
              onClick={() => setSubReport('purchases_summary')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'purchases_summary' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              ملخص المشتريات
            </button>
            <button
              onClick={() => setSubReport('purchases_by_supplier')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'purchases_by_supplier' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              مشتريات الموردين
            </button>
            <button
              onClick={() => setSubReport('purchases_by_product')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'purchases_by_product' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              أصناف المشتريات والتشغيلات
            </button>
          </>
        )}

        {category === 'inventory' && (
          <>
            <button
              onClick={() => setSubReport('current_stock')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'current_stock' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              أرصدة وتقييم المخزون
            </button>
            <button
              onClick={() => setSubReport('batch_report')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'batch_report' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              تفاصيل الباتشات والتشغيلات
            </button>
            <button
              onClick={() => setSubReport('near_expiry')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'near_expiry' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              قرب انتهاء الصلاحية
            </button>
            <button
              onClick={() => setSubReport('expired_stock')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'expired_stock' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              التوالف والمنتهية
            </button>
            <button
              onClick={() => setSubReport('stock_movement')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'stock_movement' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              حركة المخزون (Ledger)
            </button>
          </>
        )}

        {category === 'finance' && (
          <>
            <button
              onClick={() => setSubReport('cash_flow')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'cash_flow' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              التدفق النقدي للصندوق
            </button>
            <button
              onClick={() => setSubReport('cash_statement')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'cash_statement' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              كشف حركة الصندوق
            </button>
            <button
              onClick={() => setSubReport('expenses_analysis')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                subReport === 'expenses_analysis' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              تحليل المصروفات
            </button>
          </>
        )}

        {category === 'profitability' && (
          <button
            onClick={() => setSubReport('profit_analysis')}
            className={`px-3 py-1.5 rounded-lg font-bold bg-blue-600 text-white`}
          >
            تحليل مجمل الربح وهامش التشغيل
          </button>
        )}
      </div>

      {/* Action Bar (Filters + Export / Print / Share Buttons) */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Quick Date Range Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setDateQuickFilter('today')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                dateQuickFilter === 'today' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-500'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={() => setDateQuickFilter('yesterday')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                dateQuickFilter === 'yesterday' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-500'
              }`}
            >
              أمس
            </button>
            <button
              onClick={() => setDateQuickFilter('week')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                dateQuickFilter === 'week' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-500'
              }`}
            >
              الأسبوع
            </button>
            <button
              onClick={() => setDateQuickFilter('month')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                dateQuickFilter === 'month' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-500'
              }`}
            >
              الشهر
            </button>
            <button
              onClick={() => setDateQuickFilter('custom')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                dateQuickFilter === 'custom' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-500'
              }`}
            >
              مخصص
            </button>
          </div>

          {/* Action Buttons: Export CSV / Print PDF / Share */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
              title="تصدير CSV متوافق مع Excel والأرقام القياسية"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel (CSV)</span>
            </button>

            <button
              onClick={handlePrintPdf}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
              title="توليد مستند PDF حقيقي معتمد"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة PDF</span>
            </button>

            <button
              onClick={handleSharePdf}
              disabled={isProcessing}
              className="px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-medium flex items-center gap-1 transition-all"
              title="مشاركة المستند"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Custom Date Range & Secondary Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          {dateQuickFilter === 'custom' && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">من:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span className="text-slate-500 font-medium">إلى:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          )}

          {category === 'finance' && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">الصندوق:</span>
              <select
                value={selectedCashboxId}
                onChange={(e) => setSelectedCashboxId(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
              >
                {state.cashboxes.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}

          {subReport === 'near_expiry' && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">مهلة الصلاحية:</span>
              <select
                value={expiryThreshold}
                onChange={(e) => setExpiryThreshold(Number(e.target.value))}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
              >
                <option value={30}>30 يوماً</option>
                <option value={60}>60 يوماً</option>
                <option value={90}>90 يوماً</option>
                <option value={180}>6 أشهر</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {statusFeedback && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-2.5 rounded-xl text-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusFeedback}</span>
        </div>
      )}

      {/* ========================================== */}
      {/* 1. SALES REPORTS VIEW */}
      {/* ========================================== */}
      {category === 'sales' && subReport === 'sales_summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block font-semibold">إجمالي المبيعات (Gross)</span>
              <span className="font-bold font-mono text-slate-800 text-sm" dir="ltr">
                {Money.format(salesSummary.gross_sales)}
              </span>
            </div>
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <span className="text-[10px] text-blue-600 block font-semibold">صافي المبيعات بعد المردودات</span>
              <span className="font-bold font-mono text-blue-700 text-sm" dir="ltr">
                {Money.format(salesSummary.net_sales_after_returns)}
              </span>
            </div>
            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
              <span className="text-[10px] text-amber-700 block font-semibold">تكلفة المبيعات (COGS)</span>
              <span className="font-bold font-mono text-amber-800 text-sm" dir="ltr">
                {Money.format(salesSummary.cogs)}
              </span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
              <span className="text-[10px] text-emerald-600 block font-semibold">مجمل الربح (Gross Profit)</span>
              <span className="font-bold font-mono text-emerald-700 text-sm" dir="ltr">
                {Money.format(salesSummary.gross_profit)}
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <h4 className="font-bold text-slate-800 pb-1 border-b border-slate-100">تفاصيل عمليات المبيعات</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">المبيعات النقدية:</span>
                <span className="font-bold font-mono" dir="ltr">{Money.format(salesSummary.cash_sales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">المبيعات الآجلة:</span>
                <span className="font-bold font-mono" dir="ltr">{Money.format(salesSummary.credit_sales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">مردودات المبيعات:</span>
                <span className="font-bold font-mono text-rose-600" dir="ltr">-{Money.format(salesSummary.returned_sales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">الخصومات الممنوحة:</span>
                <span className="font-bold font-mono text-amber-600" dir="ltr">-{Money.format(salesSummary.discounts)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">عدد الفواتير المنفذة:</span>
                <span className="font-bold">{salesSummary.invoice_count} فاتورة</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">عدد فواتير المردودات:</span>
                <span className="font-bold">{salesSummary.returned_invoice_count} فاتورة</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {category === 'sales' && subReport === 'sales_by_product' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-slate-700">
            <span>مبيعات الأصناف وتكلفتها التاريخية ({salesByProduct.items.length} صنف)</span>
            <span>صافي المبيعات: {Money.format(salesByProduct.total_net_sales)}</span>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="p-2.5">الصنف</th>
                  <th className="p-2.5 text-center">الكمية</th>
                  <th className="p-2.5 text-left">صافي المبيعات</th>
                  <th className="p-2.5 text-left">التكلفة COGS</th>
                  <th className="p-2.5 text-left">مجمل الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesByProduct.items.map((it) => (
                  <tr key={it.product_id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">
                      <div>{it.product_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{it.product_code}</div>
                    </td>
                    <td className="p-2.5 text-center font-mono">{it.base_quantity} {it.selling_unit}</td>
                    <td className="p-2.5 text-left font-mono font-bold" dir="ltr">{Money.format(it.net_sales)}</td>
                    <td className="p-2.5 text-left font-mono text-slate-500" dir="ltr">{Money.format(it.cogs)}</td>
                    <td className="p-2.5 text-left font-mono font-bold text-emerald-600" dir="ltr">{Money.format(it.gross_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {category === 'sales' && subReport === 'sales_by_customer' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
            مبيعات العملاء وأرصدتهم الذممية المستحقة ({salesByCustomer.customers.length} عميل)
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="p-2.5">العميل</th>
                  <th className="p-2.5 text-center">الفواتير</th>
                  <th className="p-2.5 text-left">إجمالي المسحوبات</th>
                  <th className="p-2.5 text-left">السدادات</th>
                  <th className="p-2.5 text-left">الرصيد المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesByCustomer.customers.map((c) => (
                  <tr key={c.customer_id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">
                      <div>{c.customer_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{c.phone || '-'}</div>
                    </td>
                    <td className="p-2.5 text-center font-mono">{c.invoices_count}</td>
                    <td className="p-2.5 text-left font-mono font-bold" dir="ltr">{Money.format(c.total_sales)}</td>
                    <td className="p-2.5 text-left font-mono text-emerald-600" dir="ltr">{Money.format(c.payments)}</td>
                    <td className="p-2.5 text-left font-mono font-bold text-rose-600" dir="ltr">{Money.format(c.outstanding_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {category === 'sales' && subReport === 'sales_by_user' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
            تقرير مبيعات وأداء مستخدمي الكاشير
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-2.5">المستخدم</th>
                  <th className="p-2.5 text-center">عدد الفواتير</th>
                  <th className="p-2.5 text-left">صافي المبيعات</th>
                  <th className="p-2.5 text-left">النقدية المحصلة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesByUser.users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">{u.full_name}</td>
                    <td className="p-2.5 text-center font-mono">{u.invoice_count}</td>
                    <td className="p-2.5 text-left font-mono font-bold" dir="ltr">{Money.format(u.net_sales)}</td>
                    <td className="p-2.5 text-left font-mono text-emerald-600" dir="ltr">{Money.format(u.cash_collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. PURCHASES REPORTS VIEW */}
      {/* ========================================== */}
      {category === 'purchases' && subReport === 'purchases_summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block font-semibold">إجمالي المشتريات</span>
              <span className="font-bold font-mono text-slate-800 text-sm" dir="ltr">
                {Money.format(purchaseSummary.total_purchases)}
              </span>
            </div>
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <span className="text-[10px] text-blue-600 block font-semibold">صافي المشتريات بعد المردود</span>
              <span className="font-bold font-mono text-blue-700 text-sm" dir="ltr">
                {Money.format(purchaseSummary.net_purchases)}
              </span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
              <span className="text-[10px] text-emerald-600 block font-semibold">مشتريات نقدية</span>
              <span className="font-bold font-mono text-emerald-700 text-sm" dir="ltr">
                {Money.format(purchaseSummary.cash_purchases)}
              </span>
            </div>
            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
              <span className="text-[10px] text-amber-700 block font-semibold">مشتريات آجلة</span>
              <span className="font-bold font-mono text-amber-800 text-sm" dir="ltr">
                {Money.format(purchaseSummary.credit_purchases)}
              </span>
            </div>
          </div>
        </div>
      )}

      {category === 'purchases' && subReport === 'purchases_by_supplier' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
            مشتريات الموردين والأرصدة المستحقة لهم
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="p-2.5">المورد</th>
                  <th className="p-2.5 text-center">الفواتير</th>
                  <th className="p-2.5 text-left">إجمالي المشتريات</th>
                  <th className="p-2.5 text-left">المسدد له</th>
                  <th className="p-2.5 text-left">المستحق للمورد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchasesBySupplier.suppliers.map((s) => (
                  <tr key={s.supplier_id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">
                      <div>{s.supplier_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{s.phone}</div>
                    </td>
                    <td className="p-2.5 text-center font-mono">{s.purchase_count}</td>
                    <td className="p-2.5 text-left font-mono font-bold" dir="ltr">{Money.format(s.purchases)}</td>
                    <td className="p-2.5 text-left font-mono text-emerald-600" dir="ltr">{Money.format(s.payments)}</td>
                    <td className="p-2.5 text-left font-mono font-bold text-amber-700" dir="ltr">{Money.format(s.outstanding_payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 3. INVENTORY & EXPIRY REPORTS VIEW */}
      {/* ========================================== */}
      {category === 'inventory' && subReport === 'current_stock' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block font-semibold">إجمالي الأصناف</span>
              <span className="font-bold text-slate-800 text-sm">{currentStock.total_products_count} صنف</span>
            </div>
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <span className="text-[10px] text-blue-600 block font-semibold">إجمالي الوحدات بالمخزن</span>
              <span className="font-bold font-mono text-blue-700 text-sm">{currentStock.total_base_units}</span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
              <span className="text-[10px] text-emerald-600 block font-semibold">الرصيد المتاح للبيع</span>
              <span className="font-bold font-mono text-emerald-700 text-sm">{currentStock.total_available_units}</span>
            </div>
            <div className="bg-purple-50 p-3 rounded-2xl border border-purple-100">
              <span className="text-[10px] text-purple-700 block font-semibold">التقييم المخزوني (التكلفة الفعلية)</span>
              <span className="font-bold font-mono text-purple-800 text-sm" dir="ltr">
                {Money.format(currentStock.total_inventory_value)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 text-slate-600 sticky top-0">
                  <tr>
                    <th className="p-2.5">الكود والصنف</th>
                    <th className="p-2.5 text-center">الرصيد الكلي</th>
                    <th className="p-2.5 text-center">المتاح للبيع</th>
                    <th className="p-2.5 text-center">الحجر والتالف</th>
                    <th className="p-2.5 text-left">قيمة المخزون</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentStock.items.map((it) => (
                    <tr key={it.product_id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-800">
                        <div>{it.product_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{it.code}</div>
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold">{it.current_quantity} {it.base_unit}</td>
                      <td className="p-2.5 text-center font-mono text-emerald-600">{it.available_quantity}</td>
                      <td className="p-2.5 text-center font-mono text-rose-500">{it.quarantined_quantity}</td>
                      <td className="p-2.5 text-left font-mono font-bold" dir="ltr">{Money.format(it.estimated_inventory_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {category === 'inventory' && subReport === 'near_expiry' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 bg-amber-50 border-b border-amber-200 flex justify-between items-center text-xs font-bold text-amber-800">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>أصناف تنتهي صلاحيتها خلال {expiryThreshold} يوماً ({nearExpiry.items.length} تشغيلة)</span>
            </div>
            <span>القيمة الإجمالية: {Money.format(nearExpiry.total_near_expiry_value + nearExpiry.total_expired_value)}</span>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="p-2.5">الصنف</th>
                  <th className="p-2.5 text-center">التشغيلة</th>
                  <th className="p-2.5 text-center">تاريخ الانتهاء</th>
                  <th className="p-2.5 text-center">الأيام المتبقية</th>
                  <th className="p-2.5 text-center">الكمية</th>
                  <th className="p-2.5 text-left">قيمة التشغيلة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nearExpiry.items.map((it) => (
                  <tr key={it.batch_id} className={`hover:bg-slate-50 ${it.status_category === 'expired' ? 'bg-rose-50/50' : ''}`}>
                    <td className="p-2.5 font-bold text-slate-800">{it.product_name}</td>
                    <td className="p-2.5 text-center font-mono">{it.batch_number}</td>
                    <td className="p-2.5 text-center font-mono">{it.expiry_date}</td>
                    <td className="p-2.5 text-center font-mono font-bold">
                      {it.status_category === 'expired' ? (
                        <span className="text-rose-600">منتهي ({it.days_remaining} يوم)</span>
                      ) : (
                        <span className="text-amber-600">{it.days_remaining} يوم</span>
                      )}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold">{it.remaining_quantity}</td>
                    <td className="p-2.5 text-left font-mono" dir="ltr">{Money.format(it.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 4. PROFITABILITY VIEW */}
      {/* ========================================== */}
      {category === 'profitability' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 shadow-xs">
              <span className="text-xs text-blue-700 block font-semibold">صافي المبيعات (Net Sales)</span>
              <span className="font-black font-mono text-blue-900 text-lg" dir="ltr">
                {Money.format(profitability.net_sales_after_returns)}
              </span>
              <p className="text-[10px] text-blue-600 mt-1">بعد استبعاد الخصومات ومردودات المبيعات</p>
            </div>

            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-xs">
              <span className="text-xs text-emerald-700 block font-semibold">مجمل الربح (GROSS PROFIT)</span>
              <span className="font-black font-mono text-emerald-900 text-lg" dir="ltr">
                {Money.format(profitability.gross_profit)}
              </span>
              <p className="text-[10px] text-emerald-600 mt-1">المبيعات الصافية مطروحاً منها تكلفة COGS الفعلية</p>
            </div>

            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 shadow-xs">
              <span className="text-xs text-purple-700 block font-semibold">هامش التشغيل (Operating Margin)</span>
              <span className="font-black font-mono text-purple-900 text-lg" dir="ltr">
                {Money.format(profitability.operating_margin)}
              </span>
              <p className="text-[10px] text-purple-600 mt-1">مجمل الربح مطروحاً منه المصروفات التشغيلية</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <h4 className="font-bold text-slate-800 pb-2 border-b border-slate-100">
              قائمة الدخل ومجمل الربح التراكمي المعتمد
            </h4>
            <div className="space-y-2 divide-y divide-slate-100">
              <div className="flex justify-between py-1.5 text-slate-700">
                <span>إجمالي مبيعات الصيدلية (Gross Sales):</span>
                <span className="font-bold font-mono" dir="ltr">{Money.format(profitability.gross_sales)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-amber-700">
                <span>الخصومات الممنوحة للعملاء:</span>
                <span className="font-bold font-mono" dir="ltr">-{Money.format(profitability.discounts)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-rose-700">
                <span>مردودات المبيعات المستردة:</span>
                <span className="font-bold font-mono" dir="ltr">-{Money.format(profitability.sales_returns)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-blue-800 font-bold bg-blue-50/50 px-2 rounded-lg">
                <span>صافي المبيعات الفعلي:</span>
                <span className="font-mono" dir="ltr">{Money.format(profitability.net_sales_after_returns)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-slate-700">
                <span>تكلفة البضاعة المباعة التاريخية (Historical COGS):</span>
                <span className="font-bold font-mono text-amber-800" dir="ltr">-{Money.format(profitability.net_cogs)}</span>
              </div>
              <div className="flex justify-between py-2 text-emerald-800 font-black bg-emerald-50 px-2 rounded-lg text-sm">
                <span>مجمل الربح المحقق (GROSS PROFIT):</span>
                <span className="font-mono" dir="ltr">{Money.format(profitability.gross_profit)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-rose-700">
                <span>المصروفات التشغيلية المباشرة (Expenses):</span>
                <span className="font-bold font-mono" dir="ltr">-{Money.format(profitability.operating_expenses)}</span>
              </div>
              <div className="flex justify-between py-2 text-purple-900 font-black bg-purple-50 px-2 rounded-lg text-sm">
                <span>هامش التشغيل بعد المصروفات (Operating Margin):</span>
                <span className="font-mono" dir="ltr">{Money.format(profitability.operating_margin)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
