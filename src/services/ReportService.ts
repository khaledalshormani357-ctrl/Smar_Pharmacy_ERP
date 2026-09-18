// ReportService - Authoritative Transactional Reporting Layer
// Strictly READ-ONLY. Derives all operational, financial, and inventory reports from transactional truth.

import { db } from '../db/sqlite';
import {
  ReportFilter,
  SalesSummaryReport,
  SalesByProductReport,
  SalesByProductItem,
  SalesByCustomerReport,
  SalesByCustomerItem,
  SalesByUserReport,
  SalesByUserItem,
  PurchaseSummaryReport,
  PurchasesBySupplierReport,
  PurchasesBySupplierItem,
  PurchasesByProductReport,
  PurchasesByProductItem,
  CurrentStockReport,
  CurrentStockItem,
  BatchReport,
  BatchReportItem,
  NearExpiryReport,
  NearExpiryItem,
  ExpiredStockReport,
  ExpiredStockItem,
  StockMovementReport,
  StockMovementReportItem,
  CashFlowReport,
  CashTransactionsStatementReport,
  ProfitabilityReport,
  CustomerTransaction,
  SupplierTransaction,
  Expense
} from '../types';

export class ReportService {
  /**
   * Helper to verify report permissions if userId is provided
   */
  private static checkPermission(userId?: string, requiredRole: string[] = ['admin', 'reports']) {
    if (!userId) return; // internal/system query
    const state = db.getState();
    const user = state.users.find((u) => u.id === userId);
    if (!user) throw new Error(`المستخدم غير موجود (${userId})`);
    if (!user.is_active) throw new Error('حساب المستخدم معطل');

    const role = state.roles.find((r) => r.id === user.role_id);
    const perms = role?.permissions || [];
    if (perms.includes('all')) return;

    const hasPermission = requiredRole.some((r) => perms.includes(r));
    if (!hasPermission) {
      throw new Error(`ليس لديك صلاحية للاطلاع على التقارير المالية والإدارية.`);
    }
  }

  /**
   * Emits audit log for sensitive report access/export
   */
  private static logReportAccess(userId: string, action: string, reportName: string) {
    const state = db.getState();
    state.audit_logs.push({
      id: `audit-rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      action: `REPORT_${action.toUpperCase()}`,
      entity: 'report',
      entity_id: reportName,
      device_id: 'web-pos',
      created_at: Date.now()
    });
  }

  /**
   * Evaluates date & business date matching for transactions
   */
  private static matchesDateFilter(itemCreatedAt: number, itemBusinessDate: string | undefined, filter?: ReportFilter): boolean {
    if (!filter) return true;

    if (filter.date_from !== undefined && itemCreatedAt < filter.date_from) {
      return false;
    }
    if (filter.date_to !== undefined && itemCreatedAt > filter.date_to) {
      return false;
    }

    const bDate = itemBusinessDate || new Date(itemCreatedAt).toISOString().split('T')[0];
    if (filter.business_date_from && bDate < filter.business_date_from) {
      return false;
    }
    if (filter.business_date_to && bDate > filter.business_date_to) {
      return false;
    }

    return true;
  }

  // ==========================================
  // 1. SALES REPORTS
  // ==========================================

  /**
   * Sales Summary Report
   */
  static getSalesSummary(filter?: ReportFilter, userId?: string): SalesSummaryReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    // Active (non-cancelled) sales
    const sales = state.sales.filter((s) => {
      if (s.status === 'cancelled') return false;
      if (!this.matchesDateFilter(s.created_at, undefined, filter)) return false;
      if (filter?.customer_id && s.customer_id !== filter.customer_id) return false;
      if (filter?.user_id && s.user_id !== filter.user_id) return false;
      if (filter?.cashier_id && s.user_id !== filter.cashier_id) return false;
      if (filter?.shift_id && s.shift_id !== filter.shift_id) return false;
      if (filter?.payment_type && s.sale_type !== filter.payment_type) return false;
      return true;
    });

    // Completed sale returns in the filtered timeframe
    const returns = (state.sale_returns || []).filter((r) => {
      if (r.status === 'cancelled') return false;
      if (!this.matchesDateFilter(r.created_at, undefined, filter)) return false;
      if (filter?.customer_id && r.customer_id !== filter.customer_id) return false;
      return true;
    });

    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let cashSales = 0;
    let creditSales = 0;
    let totalCogs = 0;

    for (const s of sales) {
      grossSales += s.subtotal;
      discounts += s.discount_amount;
      netSales += s.net_total;
      if (s.sale_type === 'cash') {
        cashSales += s.net_total;
      } else {
        creditSales += s.net_total;
      }
      
      let sCogs = s.total_cogs;
      if (sCogs === undefined || isNaN(sCogs)) {
        const saleItems = state.sale_items.filter((si) => si.sale_id === s.id);
        sCogs = saleItems.reduce((acc, si) => {
          if (si.item_cogs !== undefined && !isNaN(si.item_cogs)) {
            return acc + si.item_cogs;
          }
          const allocs = state.sale_item_allocations.filter((a) => a.sale_item_id === si.id);
          const allocSum = allocs.reduce((sum, a) => {
            const cost = a.total_cost ?? ((a.allocated_base_quantity ?? (a as any).quantity ?? 0) * (a.unit_purchase_cost ?? (a as any).unit_cost ?? 0));
            return sum + (cost || 0);
          }, 0);
          return acc + allocSum;
        }, 0);
      }
      totalCogs += (sCogs || 0);
    }

    let returnedSales = 0;
    let cogsReversed = 0;
    for (const r of returns) {
      returnedSales += r.total_refund_amount;
      let rCogs = r.total_cogs_reversed;
      if (rCogs === undefined || isNaN(rCogs)) {
        const retItems = (state.sale_return_items || []).filter((ri) => ri.return_id === r.id);
        rCogs = retItems.reduce((acc, ri) => {
          const itemCogs = ri.reversed_line_cogs ?? ((ri as any).cogs_unit_cost !== undefined ? (ri as any).cogs_unit_cost * ri.returned_base_quantity : 0);
          return acc + (itemCogs || 0);
        }, 0);
      }
      cogsReversed += (rCogs || 0);
    }

    const netSalesAfterReturns = netSales - returnedSales;
    const finalCogs = totalCogs - cogsReversed;
    const grossProfit = netSalesAfterReturns - finalCogs;

    return {
      gross_sales: grossSales,
      discounts,
      net_sales: netSales,
      cash_sales: cashSales,
      credit_sales: creditSales,
      returned_sales: returnedSales,
      net_sales_after_returns: netSalesAfterReturns,
      cogs: finalCogs,
      gross_profit: grossProfit,
      invoice_count: sales.length,
      returned_invoice_count: returns.length
    };
  }

  /**
   * Sales By Product Report
   */
  static getSalesByProduct(filter?: ReportFilter, userId?: string): SalesByProductReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    // 1. Get valid sales
    const validSaleIds = new Set(
      state.sales
        .filter((s) => {
          if (s.status === 'cancelled') return false;
          if (!this.matchesDateFilter(s.created_at, undefined, filter)) return false;
          if (filter?.customer_id && s.customer_id !== filter.customer_id) return false;
          if (filter?.user_id && s.user_id !== filter.user_id) return false;
          if (filter?.shift_id && s.shift_id !== filter.shift_id) return false;
          return true;
        })
        .map((s) => s.id)
    );

    // 2. Aggregate sale items
    const productMap = new Map<string, SalesByProductItem>();

    for (const item of state.sale_items) {
      if (!validSaleIds.has(item.sale_id)) continue;
      if (filter?.product_id && item.product_id !== filter.product_id) continue;

      const product = state.products.find((p) => p.id === item.product_id);
      if (filter?.category_id && product?.category_id !== filter.category_id) continue;
      if (filter?.manufacturer_id && product?.manufacturer_id !== filter.manufacturer_id) continue;

      const existing = productMap.get(item.product_id) || {
        product_id: item.product_id,
        product_name: product?.name_ar || 'صنف غير محدد',
        product_code: product?.code || product?.internal_code || '',
        category_name: state.categories.find((c) => c.id === product?.category_id)?.name_ar,
        quantity_sold: 0,
        base_quantity: 0,
        selling_unit: item.unit_name || product?.base_unit || 'وحدة',
        gross_sales: 0,
        discounts: 0,
        net_sales: 0,
        cogs: 0,
        gross_profit: 0
      };

      existing.quantity_sold += item.quantity;
      existing.base_quantity += item.base_quantity;
      existing.gross_sales += item.unit_price * item.quantity;
      existing.discounts += item.discount_amount;
      existing.net_sales += item.line_total;
      let itCogs = item.item_cogs;
      if (itCogs === undefined || isNaN(itCogs)) {
        const allocs = state.sale_item_allocations.filter((a) => a.sale_item_id === item.id);
        itCogs = allocs.reduce((sum, a) => {
          const cost = a.total_cost ?? ((a.allocated_base_quantity ?? (a as any).quantity ?? 0) * (a.unit_purchase_cost ?? (a as any).unit_cost ?? 0));
          return sum + (cost || 0);
        }, 0);
      }
      existing.cogs += (itCogs || 0);
      existing.gross_profit += (item.item_gross_profit !== undefined && !isNaN(item.item_gross_profit)) ? item.item_gross_profit : (item.line_total - (itCogs || 0));

      productMap.set(item.product_id, existing);
    }

    const items = Array.from(productMap.values()).sort((a, b) => b.net_sales - a.net_sales);

    let totalBaseQty = 0;
    let totalNet = 0;
    let totalCogs = 0;
    let totalGrossProfit = 0;

    for (const it of items) {
      totalBaseQty += it.base_quantity;
      totalNet += it.net_sales;
      totalCogs += it.cogs;
      totalGrossProfit += it.gross_profit;
    }

    return {
      total_quantity_sold: totalBaseQty,
      total_net_sales: totalNet,
      total_cogs: totalCogs,
      total_gross_profit: totalGrossProfit,
      items
    };
  }

  /**
   * Sales By Customer Report
   */
  static getSalesByCustomer(filter?: ReportFilter, userId?: string): SalesByCustomerReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    const customerMap = new Map<string, SalesByCustomerItem>();

    for (const cust of state.customers) {
      if (filter?.customer_id && cust.id !== filter.customer_id) continue;

      // Customer sales
      const custSales = state.sales.filter((s) => {
        if (s.customer_id !== cust.id) return false;
        if (s.status === 'cancelled') return false;
        return this.matchesDateFilter(s.created_at, undefined, filter);
      });

      const totalSales = custSales.reduce((acc, s) => acc + s.net_total, 0);

      // Payments from CustomerTransaction (source of truth)
      let payments = state.customer_transactions
        .filter((tx) => {
          if (tx.customer_id !== cust.id) return false;
          if (tx.transaction_type !== 'payment_receipt') return false;
          return this.matchesDateFilter(tx.created_at, tx.business_date, filter);
        })
        .reduce((acc, tx) => acc + tx.credit, 0);

      const directPaidOnSales = custSales.reduce((acc, s) => acc + (s.paid_amount || 0), 0);
      if (payments === 0 && directPaidOnSales > 0) {
        payments = directPaidOnSales;
      }

      // Returns from CustomerTransaction (source of truth)
      const returns = state.customer_transactions
        .filter((tx) => {
          if (tx.customer_id !== cust.id) return false;
          if (tx.transaction_type !== 'sale_return_credit') return false;
          return this.matchesDateFilter(tx.created_at, tx.business_date, filter);
        })
        .reduce((acc, tx) => acc + tx.credit, 0);

      // Outstanding balance from CustomerTransaction source of truth
      let outstandingBalance = state.customer_transactions
        .filter((tx) => tx.customer_id === cust.id)
        .reduce((acc, tx) => acc + (tx.debit - tx.credit), 0);

      if (outstandingBalance === 0 && (cust.cached_balance || (cust as any).balance)) {
        outstandingBalance = cust.cached_balance ?? (cust as any).balance ?? 0;
      }

      if (custSales.length > 0 || payments > 0 || returns > 0 || outstandingBalance !== 0) {
        customerMap.set(cust.id, {
          customer_id: cust.id,
          customer_name: cust.name,
          phone: cust.phone,
          invoices_count: custSales.length,
          total_sales: totalSales,
          payments,
          returns,
          outstanding_balance: outstandingBalance
        });
      }
    }

    const customers = Array.from(customerMap.values()).sort((a, b) => b.total_sales - a.total_sales);

    return {
      total_sales: customers.reduce((acc, c) => acc + c.total_sales, 0),
      total_payments: customers.reduce((acc, c) => acc + c.payments, 0),
      total_returns: customers.reduce((acc, c) => acc + c.returns, 0),
      total_outstanding: customers.reduce((acc, c) => acc + c.outstanding_balance, 0),
      customers
    };
  }

  /**
   * Sales By User / Cashier Report
   */
  static getSalesByUser(filter?: ReportFilter, userId?: string): SalesByUserReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    const userMap = new Map<string, SalesByUserItem>();

    for (const u of state.users) {
      if (filter?.user_id && u.id !== filter.user_id) continue;
      if (filter?.cashier_id && u.id !== filter.cashier_id) continue;

      const userSales = state.sales.filter((s) => {
        if (s.user_id !== u.id) return false;
        if (s.status === 'cancelled') return false;
        return this.matchesDateFilter(s.created_at, undefined, filter);
      });

      const userReturns = (state.sale_returns || []).filter((r) => {
        if (r.created_by !== u.id) return false;
        if (r.status === 'cancelled') return false;
        return this.matchesDateFilter(r.created_at, undefined, filter);
      });

      const totalSales = userSales.reduce((acc, s) => acc + s.net_total, 0);
      const totalRefunds = userReturns.reduce((acc, r) => acc + r.total_refund_amount, 0);
      const cashCollected = userSales.reduce((acc, s) => acc + (s.paid_amount || 0), 0);

      if (userSales.length > 0 || userReturns.length > 0) {
        userMap.set(u.id, {
          user_id: u.id,
          username: u.username,
          full_name: u.full_name,
          invoice_count: userSales.length,
          sales_total: totalSales,
          returns: totalRefunds,
          net_sales: totalSales - totalRefunds,
          cash_collected: cashCollected
        });
      }
    }

    const users = Array.from(userMap.values()).sort((a, b) => b.net_sales - a.net_sales);

    return {
      total_invoices: users.reduce((acc, u) => acc + u.invoice_count, 0),
      total_net_sales: users.reduce((acc, u) => acc + u.net_sales, 0),
      total_cash_collected: users.reduce((acc, u) => acc + u.cash_collected, 0),
      users
    };
  }

  // ==========================================
  // 2. PURCHASE REPORTS
  // ==========================================

  /**
   * Purchase Summary Report
   */
  static getPurchasesSummary(filter?: ReportFilter, userId?: string): PurchaseSummaryReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    const purchases = state.purchases.filter((p) => {
      if (p.status === 'cancelled') return false;
      if (!this.matchesDateFilter(p.created_at, p.purchase_date, filter)) return false;
      if (filter?.supplier_id && p.supplier_id !== filter.supplier_id) return false;
      if (filter?.payment_type && p.payment_type !== filter.payment_type) return false;
      return true;
    });

    const returns = (state.purchase_returns || []).filter((r) => {
      if (r.status === 'cancelled') return false;
      if (!this.matchesDateFilter(r.created_at, undefined, filter)) return false;
      if (filter?.supplier_id && r.supplier_id !== filter.supplier_id) return false;
      return true;
    });

    let totalPurchases = 0;
    let cashPurchases = 0;
    let creditPurchases = 0;

    for (const p of purchases) {
      totalPurchases += p.net_total;
      if (p.payment_type === 'cash') {
        cashPurchases += p.net_total;
      } else {
        creditPurchases += p.net_total;
      }
    }

    const purchaseReturns = returns.reduce((acc, r) => acc + r.total_refund_amount, 0);

    return {
      total_purchases: totalPurchases,
      cash_purchases: cashPurchases,
      credit_purchases: creditPurchases,
      purchase_returns: purchaseReturns,
      net_purchases: totalPurchases - purchaseReturns,
      purchase_count: purchases.length,
      returned_count: returns.length
    };
  }

  /**
   * Purchases By Supplier Report
   */
  static getPurchasesBySupplier(filter?: ReportFilter, userId?: string): PurchasesBySupplierReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    const supplierMap = new Map<string, PurchasesBySupplierItem>();

    for (const supp of state.suppliers) {
      if (filter?.supplier_id && supp.id !== filter.supplier_id) continue;

      const suppPurchases = state.purchases.filter((p) => {
        if (p.supplier_id !== supp.id) return false;
        if (p.status === 'cancelled') return false;
        return this.matchesDateFilter(p.created_at, p.purchase_date, filter);
      });

      const totalPurchases = suppPurchases.reduce((acc, p) => acc + p.net_total, 0);

      // Payments from SupplierTransaction (source of truth)
      let payments = state.supplier_transactions
        .filter((tx) => {
          if (tx.supplier_id !== supp.id) return false;
          if (tx.transaction_type !== 'payment_voucher') return false;
          return this.matchesDateFilter(tx.created_at, tx.business_date, filter);
        })
        .reduce((acc, tx) => acc + tx.debit, 0);

      const directPaidOnPurchases = suppPurchases.reduce((acc, p) => acc + (p.paid_amount || 0), 0);
      if (payments === 0 && directPaidOnPurchases > 0) {
        payments = directPaidOnPurchases;
      }

      // Returns from SupplierTransaction (source of truth)
      const returns = state.supplier_transactions
        .filter((tx) => {
          if (tx.supplier_id !== supp.id) return false;
          if (tx.transaction_type !== 'purchase_return_credit') return false;
          return this.matchesDateFilter(tx.created_at, tx.business_date, filter);
        })
        .reduce((acc, tx) => acc + tx.debit, 0);

      // Outstanding balance from SupplierTransaction ledger source of truth
      let outstandingPayable = state.supplier_transactions
        .filter((tx) => tx.supplier_id === supp.id)
        .reduce((acc, tx) => acc + (tx.credit - tx.debit), 0);

      if (outstandingPayable === 0 && (supp.cached_balance || (supp as any).balance)) {
        outstandingPayable = supp.cached_balance ?? (supp as any).balance ?? 0;
      }

      if (suppPurchases.length > 0 || payments > 0 || returns > 0 || outstandingPayable !== 0) {
        supplierMap.set(supp.id, {
          supplier_id: supp.id,
          supplier_name: supp.name_ar || supp.name,
          phone: supp.phone,
          purchase_count: suppPurchases.length,
          purchases: totalPurchases,
          payments,
          returns,
          outstanding_payable: outstandingPayable
        });
      }
    }

    const suppliers = Array.from(supplierMap.values()).sort((a, b) => b.purchases - a.purchases);

    return {
      total_purchases: suppliers.reduce((acc, s) => acc + s.purchases, 0),
      total_payments: suppliers.reduce((acc, s) => acc + s.payments, 0),
      total_returns: suppliers.reduce((acc, s) => acc + s.returns, 0),
      total_outstanding_payable: suppliers.reduce((acc, s) => acc + s.outstanding_payable, 0),
      suppliers
    };
  }

  /**
   * Purchases By Product Report
   */
  static getPurchasesByProduct(filter?: ReportFilter, userId?: string): PurchasesByProductReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    const validPurchaseIds = new Set(
      state.purchases
        .filter((p) => {
          if (p.status === 'cancelled') return false;
          if (!this.matchesDateFilter(p.created_at, p.purchase_date, filter)) return false;
          if (filter?.supplier_id && p.supplier_id !== filter.supplier_id) return false;
          return true;
        })
        .map((p) => p.id)
    );

    const productMap = new Map<string, PurchasesByProductItem>();

    for (const item of state.purchase_items) {
      if (!validPurchaseIds.has(item.purchase_id)) continue;
      if (filter?.product_id && item.product_id !== filter.product_id) continue;

      const product = state.products.find((p) => p.id === item.product_id);
      if (filter?.category_id && product?.category_id !== filter.category_id) continue;
      if (filter?.manufacturer_id && product?.manufacturer_id !== filter.manufacturer_id) continue;

      const existing = productMap.get(item.product_id) || {
        product_id: item.product_id,
        product_name: item.product_name_snapshot || product?.name_ar || 'صنف غير محدد',
        quantity_purchased: 0,
        base_quantity: 0,
        purchase_cost_unit: item.unit_cost_base,
        total_cost: 0,
        batches: []
      };

      existing.quantity_purchased += item.quantity;
      existing.base_quantity += item.base_quantity;
      existing.total_cost += item.line_total;
      existing.batches.push({
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        quantity: item.quantity
      });

      productMap.set(item.product_id, existing);
    }

    const products = Array.from(productMap.values()).sort((a, b) => b.total_cost - a.total_cost);

    return {
      total_base_quantity: products.reduce((acc, p) => acc + p.base_quantity, 0),
      total_cost: products.reduce((acc, p) => acc + p.total_cost, 0),
      products
    };
  }

  // ==========================================
  // 3. INVENTORY REPORTS
  // ==========================================

  /**
   * Current Stock Report (Valuation derived from actual batch balances & historical costs)
   */
  static getCurrentStockReport(filter?: ReportFilter): CurrentStockReport {
    const state = db.getState();
    const today = new Date().toISOString().split('T')[0];

    const items: CurrentStockItem[] = [];
    let totalBaseUnits = 0;
    let totalAvailableUnits = 0;
    let totalQuarantinedUnits = 0;
    let totalInventoryValue = 0;

    for (const product of state.products) {
      if (!product.is_active && filter?.status === 'active') continue;
      if (filter?.category_id && product.category_id !== filter.category_id) continue;
      if (filter?.manufacturer_id && product.manufacturer_id !== filter.manufacturer_id) continue;
      if (filter?.product_id && product.id !== filter.product_id) continue;

      const batches = state.batches.filter((b) => {
        const qty = b.current_quantity ?? (b as any).current_balance ?? 0;
        return b.product_id === product.id && qty > 0;
      });

      let curQty = 0;
      let availQty = 0;
      let quarQty = 0;
      let prodValuation = 0;

      for (const b of batches) {
        const qty = b.current_quantity ?? (b as any).current_balance ?? 0;
        const cost = b.purchase_price ?? (b as any).purchase_cost ?? 0;
        curQty += qty;
        prodValuation += qty * cost;

        if (b.status === 'quarantine') {
          quarQty += qty;
        } else if ((b.status === 'active' || (b.status as any) === 'available') && b.expiry_date >= today) {
          availQty += qty;
        }
      }

      totalBaseUnits += curQty;
      totalAvailableUnits += availQty;
      totalQuarantinedUnits += quarQty;
      totalInventoryValue += prodValuation;

      items.push({
        product_id: product.id,
        product_name: product.name_ar,
        code: product.code || product.internal_code,
        base_unit: product.base_unit,
        current_quantity: curQty,
        available_quantity: availQty,
        quarantined_quantity: quarQty,
        estimated_inventory_value: prodValuation
      });
    }

    return {
      total_products_count: items.length,
      total_base_units: totalBaseUnits,
      total_available_units: totalAvailableUnits,
      total_quarantined_units: totalQuarantinedUnits,
      total_inventory_value: totalInventoryValue,
      items
    };
  }

  /**
   * Detailed Batch Report
   */
  static getBatchReport(filter?: ReportFilter): BatchReport {
    const state = db.getState();
    const batches: BatchReportItem[] = [];
    let totalUnits = 0;
    let totalValuation = 0;

    for (const b of state.batches) {
      if (filter?.status && b.status !== filter.status) continue;
      if (filter?.product_id && b.product_id !== filter.product_id) continue;

      const product = state.products.find((p) => p.id === b.product_id);
      if (filter?.category_id && product?.category_id !== filter.category_id) continue;

      const qty = b.current_quantity ?? (b as any).current_balance ?? 0;
      const cost = b.purchase_price ?? (b as any).purchase_cost ?? 0;
      const batchValue = qty * cost;
      totalUnits += qty;
      totalValuation += batchValue;

      batches.push({
        product_id: b.product_id,
        product_name: product?.name_ar || 'صنف غير معروف',
        batch_id: b.id,
        batch_number: b.batch_number,
        expiry_date: b.expiry_date,
        received_date: b.created_at,
        remaining_quantity: qty,
        current_quantity: qty,
        unit_cost: cost,
        stock_status: b.status,
        total_batch_value: batchValue,
        total_cost_value: batchValue
      });
    }

    batches.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

    return {
      total_batches: batches.length,
      total_stock_units: totalUnits,
      total_valuation: totalValuation,
      batches
    };
  }

  /**
   * Near Expiry Report (Configurable threshold days)
   */
  static getNearExpiryReport(daysThreshold: number = 60, filter?: ReportFilter): NearExpiryReport {
    const state = db.getState();
    const now = Date.now();
    const todayStr = new Date(now).toISOString().split('T')[0];
    const thresholdMs = now + daysThreshold * 24 * 60 * 60 * 1000;
    const thresholdDateStr = new Date(thresholdMs).toISOString().split('T')[0];

    const items: NearExpiryItem[] = [];
    let expiredBatchesCount = 0;
    let nearExpiryBatchesCount = 0;
    let expiredVal = 0;
    let nearExpiryVal = 0;

    for (const b of state.batches) {
      const qty = b.current_quantity ?? (b as any).current_balance ?? 0;
      const cost = b.purchase_price ?? (b as any).purchase_cost ?? 0;
      if (qty <= 0) continue;
      if (filter?.product_id && b.product_id !== filter.product_id) continue;

      const product = state.products.find((p) => p.id === b.product_id);
      if (filter?.category_id && product?.category_id !== filter.category_id) continue;

      const expDate = new Date(b.expiry_date).getTime();
      const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      const val = qty * cost;

      let category: 'expired' | 'near_expiry' | 'valid' = 'valid';

      if (b.expiry_date < todayStr || b.status === 'expired') {
        category = 'expired';
        expiredBatchesCount++;
        expiredVal += val;
      } else if (b.expiry_date <= thresholdDateStr) {
        category = 'near_expiry';
        nearExpiryBatchesCount++;
        nearExpiryVal += val;
      } else {
        category = 'valid';
      }

      if (category !== 'valid') {
        items.push({
          product_id: b.product_id,
          product_name: product?.name_ar || 'صنف غير معروف',
          batch_id: b.id,
          batch_number: b.batch_number,
          expiry_date: b.expiry_date,
          days_remaining: diffDays,
          remaining_quantity: qty,
          unit_cost: cost,
          total_value: val,
          status_category: category
        });
      }
    }

    items.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

    return {
      threshold_days: daysThreshold,
      total_expired_batches: expiredBatchesCount,
      total_near_expiry_batches: nearExpiryBatchesCount,
      total_expired_value: expiredVal,
      total_near_expiry_value: nearExpiryVal,
      items
    };
  }

  /**
   * Expired Stock Report
   */
  static getExpiredStockReport(filter?: ReportFilter): ExpiredStockReport {
    const nearExpiry = this.getNearExpiryReport(0, filter);
    const expired = nearExpiry.items.filter((it) => it.status_category === 'expired');

    const items: ExpiredStockItem[] = expired.map((e) => ({
      product_id: e.product_id,
      product_name: e.product_name,
      batch_id: e.batch_id,
      batch_number: e.batch_number,
      expiry_date: e.expiry_date,
      quantity: e.remaining_quantity,
      value: e.total_value,
      status: 'expired',
      days_expired: Math.abs(e.days_remaining),
      total_loss_value: e.total_value
    }));

    return {
      total_expired_units: items.reduce((acc, it) => acc + it.quantity, 0),
      total_expired_value: nearExpiry.total_expired_value,
      items
    };
  }

  /**
   * Stock Movement Report (Source: StockMovement)
   */
  static getStockMovementReport(filter?: ReportFilter): StockMovementReport {
    const state = db.getState();

    const movements = state.stock_movements
      .filter((m) => {
        if (!this.matchesDateFilter(m.created_at, undefined, filter)) return false;
        if (filter?.product_id && m.product_id !== filter.product_id) return false;
        if (filter?.document_type && m.reference_type !== filter.document_type) return false;
        return true;
      })
      .sort((a, b) => b.created_at - a.created_at);

    const items: StockMovementReportItem[] = movements.map((m) => {
      const prod = state.products.find((p) => p.id === m.product_id);
      const batch = state.batches.find((b) => b.id === m.batch_id);
      const user = state.users.find((u) => u.id === m.created_by);

      return {
        id: m.id,
        date: m.created_at,
        business_date: new Date(m.created_at).toISOString().split('T')[0],
        product_id: m.product_id,
        product_name: prod?.name_ar || 'صنف غير محدد',
        movement_type: m.movement_type,
        quantity_delta: m.quantity_delta,
        balance_after: m.balance_after,
        reference_document: `${m.reference_type}: ${m.reference_id}`,
        user_name: user?.full_name || 'النظام',
        batch_number: batch?.batch_number || 'عام',
        unit_cost: m.unit_cost
      };
    });

    return {
      total_movements: items.length,
      movements: items
    };
  }

  // ==========================================
  // 4. CASHBOX & FINANCIAL REPORTS
  // ==========================================

  /**
   * Cash Flow Report (Formula: Opening + IN - OUT = Closing)
   */
  static getCashFlowReport(cashboxId: string, filter?: ReportFilter, userId?: string): CashFlowReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();
    const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
    if (!cashbox) throw new Error(`الصندوق غير موجود (${cashboxId})`);

    const sDate = filter?.date_from !== undefined ? filter.date_from : 0;
    const eDate = filter?.date_to !== undefined ? filter.date_to : Date.now();

    // 1. Opening balance: Cashbox transactions before period
    const openingBalance = state.cash_transactions
      .filter((tx) => tx.cashbox_id === cashboxId && tx.created_at < sDate)
      .reduce((bal, tx) => (tx.direction === 'IN' ? bal + tx.amount : bal - tx.amount), 0);

    // 2. Period transactions
    const periodTxs = state.cash_transactions.filter((tx) => {
      if (tx.cashbox_id !== cashboxId) return false;
      if (tx.created_at < sDate || tx.created_at > eDate) return false;
      if (filter?.shift_id && tx.shift_id !== filter.shift_id) return false;
      if (filter?.business_date_from || filter?.business_date_to) {
        if (!this.matchesDateFilter(tx.created_at, tx.business_date, filter)) return false;
      }
      return true;
    });

    let totalIn = 0;
    let totalOut = 0;

    const inflowsBreakdown = {
      sales_cash: 0,
      customer_payments: 0,
      purchase_returns: 0,
      adjustments_in: 0,
      transfers_in: 0
    };

    const outflowsBreakdown = {
      purchases_cash: 0,
      supplier_payments: 0,
      expenses: 0,
      sales_returns: 0,
      adjustments_out: 0,
      transfers_out: 0
    };

    for (const tx of periodTxs) {
      const txType = tx.type || (tx as any).category;
      if (tx.direction === 'IN') {
        totalIn += tx.amount;
        if (txType === 'sale_cash' || txType === 'sale') inflowsBreakdown.sales_cash += tx.amount;
        else if (txType === 'customer_payment') inflowsBreakdown.customer_payments += tx.amount;
        else if (txType === 'purchase_return_cash' || txType === 'purchase_return') inflowsBreakdown.purchase_returns += tx.amount;
        else if (txType === 'transfer_in') inflowsBreakdown.transfers_in += tx.amount;
        else inflowsBreakdown.adjustments_in += tx.amount;
      } else {
        totalOut += tx.amount;
        if (txType === 'purchase_cash' || txType === 'purchase') outflowsBreakdown.purchases_cash += tx.amount;
        else if (txType === 'supplier_payment') outflowsBreakdown.supplier_payments += tx.amount;
        else if (txType === 'expense') outflowsBreakdown.expenses += tx.amount;
        else if (txType === 'sale_return_cash' || txType === 'sale_return') outflowsBreakdown.sales_returns += tx.amount;
        else if (txType === 'transfer_out') outflowsBreakdown.transfers_out += tx.amount;
        else outflowsBreakdown.adjustments_out += tx.amount;
      }
    }

    const closingBalance = openingBalance + totalIn - totalOut;

    return {
      cashbox_id: cashbox.id,
      cashbox_name: cashbox.name_ar,
      opening_balance: openingBalance,
      total_in: totalIn,
      total_out: totalOut,
      closing_balance: closingBalance,
      net_cash_flow: totalIn - totalOut,
      inflows_breakdown: inflowsBreakdown,
      outflows_breakdown: outflowsBreakdown,
      inflows: {
        sales: inflowsBreakdown.sales_cash,
        customer_payments: inflowsBreakdown.customer_payments,
        purchase_returns: inflowsBreakdown.purchase_returns,
        adjustments_in: inflowsBreakdown.adjustments_in,
        transfers_in: inflowsBreakdown.transfers_in,
        total: totalIn
      },
      outflows: {
        purchases: outflowsBreakdown.purchases_cash,
        supplier_payments: outflowsBreakdown.supplier_payments,
        expenses: outflowsBreakdown.expenses,
        sales_returns: outflowsBreakdown.sales_returns,
        adjustments_out: outflowsBreakdown.adjustments_out,
        transfers_out: outflowsBreakdown.transfers_out,
        total: totalOut
      }
    };
  }

  /**
   * Cash Transactions Statement with running balance
   */
  static getCashTransactionsStatement(cashboxId: string, filter?: ReportFilter, userId?: string): CashTransactionsStatementReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();
    const cashbox = state.cashboxes.find((c) => c.id === cashboxId);
    if (!cashbox) throw new Error(`الصندوق غير موجود (${cashboxId})`);

    const sDate = filter?.date_from !== undefined ? filter.date_from : 0;
    const eDate = filter?.date_to !== undefined ? filter.date_to : Date.now();

    const openingBalance = state.cash_transactions
      .filter((tx) => tx.cashbox_id === cashboxId && tx.created_at < sDate)
      .reduce((bal, tx) => (tx.direction === 'IN' ? bal + tx.amount : bal - tx.amount), 0);

    const periodTxs = state.cash_transactions
      .filter((tx) => tx.cashbox_id === cashboxId && tx.created_at >= sDate && tx.created_at <= eDate)
      .sort((a, b) => a.created_at - b.created_at);

    let running = openingBalance;
    const items = periodTxs.map((tx) => {
      running = tx.direction === 'IN' ? running + tx.amount : running - tx.amount;
      const u = state.users.find((user) => user.id === tx.created_by);
      return {
        id: tx.id,
        date: tx.created_at,
        business_date: tx.business_date || new Date(tx.created_at).toISOString().split('T')[0],
        reference: tx.reference_id || tx.reference_type,
        transaction_type: tx.type,
        description: tx.statement,
        in_amount: tx.direction === 'IN' ? tx.amount : 0,
        out_amount: tx.direction === 'OUT' ? tx.amount : 0,
        running_balance: running,
        user_name: u?.full_name || 'النظام',
        shift_id: tx.shift_id
      };
    });

    return {
      cashbox_id: cashbox.id,
      cashbox_name: cashbox.name_ar,
      opening_balance: openingBalance,
      closing_balance: running,
      items
    };
  }

  /**
   * Operating Expenses Report (Respecting non-destructive reversals)
   */
  static getExpensesReport(filter?: ReportFilter, userId?: string): {
    total_amount: number;
    total_expenses?: number;
    total_cancelled_amount: number;
    count_active: number;
    expense_count?: number;
    count_cancelled: number;
    by_category: Array<{ category_id: string; category_name: string; total: number; percentage: number }>;
    expenses: Expense[];
  } {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();

    const filtered = state.expenses.filter((e) => {
      if (!this.matchesDateFilter(e.created_at, e.business_date, filter)) return false;
      if (filter?.category_id && e.category_id !== filter.category_id) return false;
      if (filter?.status && e.status !== filter.status) return false;
      return true;
    });

    let totalActive = 0;
    let totalCancelled = 0;
    let countActive = 0;
    let countCancelled = 0;
    const catMap: Record<string, number> = {};

    for (const exp of filtered) {
      if (exp.status === 'cancelled') {
        totalCancelled += exp.amount;
        countCancelled++;
      } else {
        totalActive += exp.amount;
        countActive++;
        catMap[exp.category_id] = (catMap[exp.category_id] || 0) + exp.amount;
      }
    }

    const by_category = Object.entries(catMap).map(([catId, sum]) => {
      const cat = state.expense_categories.find((c) => c.id === catId);
      return {
        category_id: catId,
        category_name: cat?.name_ar || 'أخرى',
        total: sum,
        percentage: totalActive > 0 ? Math.round((sum / totalActive) * 10000) / 100 : 0
      };
    });

    return {
      total_amount: totalActive,
      total_expenses: totalActive,
      total_cancelled_amount: totalCancelled,
      count_active: countActive,
      expense_count: countActive,
      count_cancelled: countCancelled,
      by_category,
      expenses: filtered
    };
  }

  /**
   * Customer Statement Report (Source: CustomerTransaction)
   */
  static getCustomerStatement(customerId: string, filter?: ReportFilter, userId?: string): {
    customer: any;
    opening_balance: number;
    total_debits: number;
    total_credits: number;
    closing_balance: number;
    items: Array<CustomerTransaction & { running_balance: number }>;
  } {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();
    const customer = state.customers.find((c) => c.id === customerId);
    if (!customer) throw new Error(`العميل غير موجود (${customerId}).`);

    const sDate = filter?.date_from !== undefined ? filter.date_from : 0;
    const eDate = filter?.date_to !== undefined ? filter.date_to : Date.now();

    const opening_balance = state.customer_transactions
      .filter((tx) => tx.customer_id === customer.id && tx.created_at < sDate)
      .reduce((bal, tx) => bal + (tx.debit - tx.credit), 0);

    const periodTxs = state.customer_transactions
      .filter((tx) => tx.customer_id === customer.id && tx.created_at >= sDate && tx.created_at <= eDate)
      .sort((a, b) => a.created_at - b.created_at);

    let running = opening_balance;
    let totalDebits = 0;
    let totalCredits = 0;

    const items = periodTxs.map((tx) => {
      running = running + (tx.debit - tx.credit);
      totalDebits += tx.debit;
      totalCredits += tx.credit;
      return {
        ...tx,
        running_balance: running
      };
    });

    const effectiveClosing = items.length > 0 || opening_balance !== 0
      ? running
      : (customer.balance ?? customer.cached_balance ?? customer.current_balance ?? 0);

    return {
      customer,
      opening_balance,
      total_debits: totalDebits,
      total_credits: totalCredits,
      closing_balance: effectiveClosing,
      items
    };
  }

  /**
   * Supplier Statement Report (Source: SupplierTransaction)
   */
  static getSupplierStatement(supplierId: string, filter?: ReportFilter, userId?: string): {
    supplier: any;
    opening_balance: number;
    total_credits: number;
    total_debits: number;
    closing_balance: number;
    items: Array<SupplierTransaction & { running_balance: number }>;
  } {
    this.checkPermission(userId, ['admin', 'reports']);
    const state = db.getState();
    const supplier = state.suppliers.find((s) => s.id === supplierId);
    if (!supplier) throw new Error(`المورد غير موجود (${supplierId}).`);

    const sDate = filter?.date_from !== undefined ? filter.date_from : 0;
    const eDate = filter?.date_to !== undefined ? filter.date_to : Date.now();

    const opening_balance = state.supplier_transactions
      .filter((tx) => tx.supplier_id === supplier.id && tx.created_at < sDate)
      .reduce((bal, tx) => bal + (tx.credit - tx.debit), 0);

    const periodTxs = state.supplier_transactions
      .filter((tx) => tx.supplier_id === supplier.id && tx.created_at >= sDate && tx.created_at <= eDate)
      .sort((a, b) => a.created_at - b.created_at);

    let running = opening_balance;
    let totalCredits = 0;
    let totalDebits = 0;

    const items = periodTxs.map((tx) => {
      running = running + (tx.credit - tx.debit);
      totalCredits += tx.credit;
      totalDebits += tx.debit;
      return {
        ...tx,
        running_balance: running
      };
    });

    const effectiveClosing = items.length > 0 || opening_balance !== 0
      ? running
      : (supplier.balance ?? supplier.cached_balance ?? supplier.current_balance ?? 0);

    return {
      supplier,
      opening_balance,
      total_credits: totalCredits,
      total_debits: totalDebits,
      closing_balance: effectiveClosing,
      items
    };
  }

  /**
   * Profitability Report
   * Net Sales - Historical COGS = GROSS PROFIT
   * Clearly distinguishes Gross Profit from Operating Margin (Gross Profit - Operating Expenses).
   */
  static getProfitabilityReport(filter?: ReportFilter, userId?: string): ProfitabilityReport {
    this.checkPermission(userId, ['admin', 'reports']);
    const salesSummary = this.getSalesSummary(filter);
    const expensesReport = this.getExpensesReport(filter);

    const operatingMargin = salesSummary.gross_profit - expensesReport.total_amount;

    if (userId) {
      this.logReportAccess(userId, 'VIEW', 'profitability_report');
    }

    return {
      gross_sales: salesSummary.gross_sales,
      discounts: salesSummary.discounts,
      net_sales: salesSummary.net_sales,
      sales_returns: salesSummary.returned_sales,
      net_sales_after_returns: salesSummary.net_sales_after_returns,
      historical_cogs: salesSummary.cogs + (salesSummary.returned_invoice_count > 0 ? 0 : 0),
      cogs_reversed: 0,
      net_cogs: salesSummary.cogs,
      gross_profit: salesSummary.gross_profit,
      operating_expenses: expensesReport.total_amount,
      operating_margin: operatingMargin
    };
  }
}
