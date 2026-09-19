// Action Registry for Smart Pharmacy Copilot (Phase 9)
// Central authorization, validation, confirmation enforcement, and execution orchestrator
// Strictly invokes existing Domain Services (SalesService, PurchaseService, FinanceService, InventoryService, ReportService)

import { db } from '../../db/sqlite';
import { TransactionManager } from '../../db/transaction';
import { AuditManager } from '../../db/audit';
import { FinanceService } from '../../services/FinanceService';
import { SalesService } from '../../services/SalesService';
import { PurchaseService } from '../../services/PurchaseService';
import { InventoryService } from '../../services/InventoryService';
import { ReportService } from '../../services/ReportService';
import { StockService } from '../../services/StockService';
import {
  ProductRepository,
  CustomerRepository,
  SupplierRepository,
  CashboxRepository,
  SaleRepository,
  BatchRepository
} from '../../db/repositories';
import {
  AssistantActionDef,
  AssistantContext,
  ActionResultData,
  ConfirmationRequestData,
  ProductCardData,
  BalanceCardData,
  InvoiceSummaryData,
  ReportCardData
} from '../types';
import { APP_SCREENS_KNOWLEDGE } from '../knowledge/screens';
import { APP_GUIDES } from '../knowledge/guides';

export class ActionRegistry {
  private static actions: Map<string, AssistantActionDef> = new Map();

  static register(action: AssistantActionDef) {
    this.actions.set(action.id, action);
  }

  static getAction(actionId: string): AssistantActionDef | undefined {
    return this.actions.get(actionId);
  }

  static getAllActions(): AssistantActionDef[] {
    return Array.from(this.actions.values());
  }

  /**
   * RBAC Permission check strictly utilizing the system's role definitions
   */
  static checkPermission(context: AssistantContext, requiredPermissions: string[], actionName: string): void {
    const user = context.currentUser;
    if (!user || !user.is_active) {
      throw new Error(`المستخدم غير نشط أو غير مسجل في النظام.`);
    }

    const state = db.getState();
    const role = state.roles.find((r) => r.id === user.role_id);
    if (!role) {
      throw new Error(`الدور الوظيفي للمستخدم غير معرّف (${user.role_id}).`);
    }

    const hasPermission =
      role.permissions.includes('all') ||
      requiredPermissions.some((perm) => role.permissions.includes(perm));

    if (!hasPermission) {
      throw new Error(
        `عذراً، لا تملك الصلاحية لتنفيذ [${actionName}]. الصلاحيات المطلوبة: [${requiredPermissions.join(', ')}]. دورك الحالي: (${role.title_ar}).`
      );
    }
  }

  /**
   * Creates an audit log marking the assistant as the action origin
   */
  private static logAssistantAction(
    userId: string,
    actionType: string,
    entityType: string,
    entityId: string,
    details?: any
  ) {
    const state = db.getState();
    state.audit_logs.push(
      AuditManager.createLog(userId, actionType, entityType, entityId, state.profile.device_id || 'DEVICE-LOCAL', {
        reason: 'executed_by_assistant',
        payloadAfter: {
          source: 'assistant',
          action_source: 'assistant',
          ...details
        }
      })
    );
  }

  // ==========================================
  // READ ACTIONS (Immediate, No Confirmation)
  // ==========================================

  static async searchProducts(query: string): Promise<ProductCardData[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];
    const products = ProductRepository.search(trimmed);
    const state = db.getState();

    return products.slice(0, 10).map((p) => {
      const batches = state.batches
        .filter((b) => b.product_id === p.id && b.current_quantity > 0)
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      const totalStock = batches.reduce((sum, b) => sum + b.current_quantity, 0);

      return {
        id: p.id,
        name_ar: p.name_ar,
        name_en: p.name_en,
        active_ingredient: p.active_ingredient,
        dosage_form: p.dosage_form,
        barcode: p.barcode,
        current_selling_price: p.current_selling_price,
        current_purchase_price: p.current_purchase_price,
        total_stock: totalStock,
        base_unit: p.base_unit,
        batches: batches.map((b) => ({
          batch_number: b.batch_number,
          expiry_date: b.expiry_date,
          quantity: b.current_quantity
        }))
      };
    });
  }

  static async getProductStock(productIdOrName: string): Promise<{ product: ProductCardData; totalStock: number }> {
    const state = db.getState();
    let product = ProductRepository.getById(productIdOrName);
    if (!product) {
      const matches = ProductRepository.search(productIdOrName);
      if (matches.length > 0) {
        product = matches[0];
      }
    }
    if (!product) {
      throw new Error(`لم يتم العثور على الصنف (${productIdOrName}) في قاعدة البيانات.`);
    }

    const batches = state.batches
      .filter((b) => b.product_id === product!.id && b.current_quantity > 0)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    const totalStock = batches.reduce((sum, b) => sum + b.current_quantity, 0);

    const card: ProductCardData = {
      id: product.id,
      name_ar: product.name_ar,
      name_en: product.name_en,
      active_ingredient: product.active_ingredient,
      dosage_form: product.dosage_form,
      barcode: product.barcode,
      current_selling_price: product.current_selling_price,
      current_purchase_price: product.current_purchase_price,
      total_stock: totalStock,
      base_unit: product.base_unit,
      batches: batches.map((b) => ({
        batch_number: b.batch_number,
        expiry_date: b.expiry_date,
        quantity: b.current_quantity
      }))
    };

    return { product: card, totalStock };
  }

  static async getLowStockProducts(): Promise<ProductCardData[]> {
    const state = db.getState();
    const lowProducts: ProductCardData[] = [];

    for (const p of state.products) {
      if (p.deleted_at || !p.is_active) continue;
      const batches = state.batches.filter((b) => b.product_id === p.id && b.current_quantity > 0);
      const totalStock = batches.reduce((sum, b) => sum + b.current_quantity, 0);
      if (totalStock <= (p.min_stock_level || 5)) {
        lowProducts.push({
          id: p.id,
          name_ar: p.name_ar,
          name_en: p.name_en,
          active_ingredient: p.active_ingredient,
          dosage_form: p.dosage_form,
          barcode: p.barcode,
          current_selling_price: p.current_selling_price,
          current_purchase_price: p.current_purchase_price,
          total_stock: totalStock,
          base_unit: p.base_unit,
          batches: batches.map((b) => ({
            batch_number: b.batch_number,
            expiry_date: b.expiry_date,
            quantity: b.current_quantity
          }))
        });
      }
    }
    return lowProducts.slice(0, 15);
  }

  static async getExpiringProducts(days = 60): Promise<any> {
    return ReportService.getNearExpiryReport(days);
  }

  static async getCashboxBalance(cashboxId?: string): Promise<BalanceCardData> {
    const state = db.getState();
    let targetBox = cashboxId ? state.cashboxes.find((c) => c.id === cashboxId) : state.cashboxes[0];
    if (!targetBox) {
      targetBox = state.cashboxes[0];
    }
    if (!targetBox) {
      throw new Error('لا يوجد صناديق نقدية مسجلة في النظام.');
    }

    const realBalance = FinanceService.getCashboxBalance(targetBox.id);
    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';
    const isMain = targetBox.type === 'main' || (targetBox as any).is_main;

    return {
      entityType: 'cashbox',
      entityId: targetBox.id,
      title: 'رصيد الصندوق الفعلي',
      name: targetBox.name_ar,
      balance: realBalance,
      currency: sym,
      subtitle: `النوع: ${isMain ? 'الصندوق الرئيسي' : 'صندوق فرعي'}`,
      details: [
        { label: 'الرصيد الدفتري المسجل', value: `${realBalance} ${sym}` },
        { label: 'الحالة', value: targetBox.is_active ? 'نشط' : 'معطل' }
      ]
    };
  }

  static async getCustomerBalance(query: string): Promise<BalanceCardData> {
    const state = db.getState();
    const customers = CustomerRepository.search(query);
    if (customers.length === 0) {
      throw new Error(`لم يتم العثور على عميل مطابق لـ (${query}).`);
    }
    const customer = customers[0];
    const trueBalance = FinanceService.getCustomerBalance(customer.id);
    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      entityType: 'customer',
      entityId: customer.id,
      title: 'رصيد حساب العميل (الذمة المدينة)',
      name: customer.name,
      balance: trueBalance,
      currency: sym,
      subtitle: customer.phone ? `هاتف: ${customer.phone}` : undefined,
      details: [
        { label: 'المبلغ المستحق على العميل', value: `${trueBalance} ${sym}` },
        { label: 'سقف الائتمان', value: `${customer.credit_limit || 0} ${sym}` },
        { label: 'حالة الحساب', value: customer.is_active ? 'نشط' : 'معطل' }
      ]
    };
  }

  static async getSupplierBalance(query: string): Promise<BalanceCardData> {
    const state = db.getState();
    const suppliers = SupplierRepository.search(query);
    if (suppliers.length === 0) {
      throw new Error(`لم يتم العثور على مورد مطابق لـ (${query}).`);
    }
    const supplier = suppliers[0];
    const trueBalance = FinanceService.getSupplierBalance(supplier.id);
    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      entityType: 'supplier',
      entityId: supplier.id,
      title: 'مستحقات المورد (الذمة الدائنة)',
      name: supplier.name_ar,
      balance: trueBalance,
      currency: sym,
      subtitle: supplier.phone ? `هاتف: ${supplier.phone}` : undefined,
      details: [
        { label: 'المبلغ المستحق للمورد', value: `${trueBalance} ${sym}` },
        { label: 'السجل الضريبي', value: supplier.tax_number || 'غير مسجل' }
      ]
    };
  }

  static async getDailySalesSummary(): Promise<ReportCardData> {
    const today = new Date().toISOString().split('T')[0];
    const report = ReportService.getSalesSummary();
    const sym = (db.getState().profile as any).currency_symbol || db.getState().profile.currency || 'ر.ي';

    return {
      reportType: 'daily_sales',
      title: `ملخص مبيعات اليوم (${today})`,
      metrics: [
        { label: 'إجمالي المبيعات', value: `${report.gross_sales} ${sym}`, color: 'emerald' },
        { label: 'صافي المبيعات', value: `${report.net_sales} ${sym}`, color: 'blue' },
        { label: 'عدد الفواتير', value: report.invoice_count },
        { label: 'إجمالي الخصومات', value: `${report.discounts} ${sym}` },
        { label: 'تكلفة البضاعة المباعة (COGS)', value: `${report.cogs} ${sym}` },
        { label: 'إجمالي الربح التقديري', value: `${report.gross_profit} ${sym}`, color: 'amber' }
      ],
      summaryNotes: 'البيانات مستخرجة بدقة من سجل فواتير نقطة البيع وحسابات FEFO الفعلية.'
    };
  }

  // ==========================================
  // CONFIRMATION BUILDERS FOR SENSITIVE ACTIONS
  // ==========================================

  static buildExpenseConfirmation(
    amount: number,
    reason: string,
    cashboxId?: string
  ): ConfirmationRequestData {
    const state = db.getState();
    const box = cashboxId ? state.cashboxes.find((c) => c.id === cashboxId) : state.cashboxes[0];
    const boxName = box ? box.name_ar : 'الصندوق الرئيسي';
    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      actionId: 'create_expense',
      actionName: 'تسجيل مصروف مالي',
      operationKey: `exp-conf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      impactLevel: 'financial',
      summary: `هل تريد بالتأكيد تسجيل مصروف بقيمة ${amount} ${sym} من ${boxName}؟`,
      details: [
        { label: 'المبلغ المراد صرفه', value: `${amount} ${sym}` },
        { label: 'سبب / بيان المصروف', value: reason },
        { label: 'الصندوق المنصرف منه', value: boxName }
      ],
      params: {
        amount,
        reason,
        cashbox_id: box ? box.id : undefined
      }
    };
  }

  static buildSaleConfirmation(
    items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; unitName: string }>,
    saleType: 'cash' | 'credit',
    customerId?: string
  ): ConfirmationRequestData {
    const state = db.getState();
    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const customer = customerId ? CustomerRepository.getById(customerId) : undefined;

    return {
      actionId: 'create_sale',
      actionName: 'إصدار فاتورة بيع',
      operationKey: `sale-conf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      impactLevel: 'financial',
      summary: `هل تريد تأكيد إصدار فاتورة بيع بقيمة ${total} ${sym} (${saleType === 'cash' ? 'نقدي' : 'آجل'})؟`,
      details: [
        { label: 'نوع البيع', value: saleType === 'cash' ? 'نقدي' : `آجل (العميل: ${customer?.name || 'غير محدد'})` },
        { label: 'عدد الأصناف', value: items.length },
        { label: 'إجمالي الفاتورة', value: `${total} ${sym}` },
        { label: 'الأصناف', value: items.map((i) => `${i.productName} (${i.quantity} ${i.unitName})`).join('، ') }
      ],
      params: {
        items,
        saleType,
        customerId
      }
    };
  }

  static buildProductCreationConfirmation(
    productData: Partial<any>
  ): ConfirmationRequestData {
    const sym = (db.getState().profile as any).currency_symbol || db.getState().profile.currency || 'ر.ي';
    return {
      actionId: 'create_product',
      actionName: 'إضافة صنف دوائي جديد',
      operationKey: `prod-conf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      impactLevel: 'inventory',
      summary: `هل تريد بالتأكيد إضافة الصنف الدوائي (${productData.name_ar}) إلى دليل الأدوية؟`,
      details: [
        { label: 'الاسم التجاري', value: productData.name_ar },
        { label: 'المادة الفعالة', value: productData.active_ingredient || 'غير محدد' },
        { label: 'الوحدة الأساسية', value: productData.base_unit || 'حبة' },
        { label: 'سعر البيع المقترح', value: `${productData.current_selling_price || 0} ${sym}` },
        { label: 'سعر الشراء المقترح', value: `${productData.current_purchase_price || 0} ${sym}` }
      ],
      params: productData
    };
  }

  // ==========================================
  // WRITE EXECUTIONS (After Confirmation & RBAC)
  // ==========================================

  static async executeCreateExpense(
    context: AssistantContext,
    params: { amount: number; reason: string; categoryId?: string; cashboxId?: string; idempotencyKey?: string }
  ): Promise<ActionResultData> {
    this.checkPermission(context, ['all', 'receipts'], 'تسجيل المصروفات');

    if (!params.amount || params.amount <= 0) {
      throw new Error('مبلغ المصروف يجب أن يكون رقماً موجباً أكبر من الصفر.');
    }
    if (!params.reason || !params.reason.trim()) {
      throw new Error('بيان المصروف إلزامي.');
    }

    const state = db.getState();
    const targetBox = params.cashboxId
      ? state.cashboxes.find((c) => c.id === params.cashboxId)
      : state.cashboxes[0];
    if (!targetBox) {
      throw new Error('الصندوق المحدد غير موجود.');
    }

    let catId = params.categoryId;
    if (!catId) {
      if (!state.expense_categories || state.expense_categories.length === 0) {
        state.expense_categories = [
          {
            id: 'cat-general-01',
            name_ar: 'مصروفات عامة وتشغيلية',
            name_en: 'General Operating Expenses',
            is_active: true
          }
        ];
      }
      catId = state.expense_categories[0].id;
    }

    // Call domain service
    const result = FinanceService.addExpense({
      user_id: context.currentUser.id,
      cashbox_id: targetBox.id,
      category_id: catId,
      amount: Math.round(params.amount),
      statement: params.reason.trim(),
      idempotency_key: params.idempotencyKey
    });

    const exp = result.expense;

    this.logAssistantAction(context.currentUser.id, 'CREATE_EXPENSE', 'expense', exp.id, {
      amount: params.amount,
      reason: params.reason
    });

    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      success: true,
      actionId: 'create_expense',
      actionName: 'تسجيل مصروف',
      entityId: exp.id,
      entityType: 'expense',
      referenceNumber: exp.expense_number,
      message: `تم تسجيل المصروف بنجاح برقم (${exp.expense_number}) وخصم ${params.amount} ${sym} من ${targetBox.name_ar}.`,
      financialImpact: {
        cashboxId: targetBox.id,
        amount: params.amount,
        direction: 'out'
      }
    };
  }

  static async executeCreateProduct(
    context: AssistantContext,
    params: any
  ): Promise<ActionResultData> {
    this.checkPermission(context, ['all', 'inventory'], 'إضافة وتعديل الأصناف');

    if (!params.name_ar || !params.name_ar.trim()) {
      throw new Error('الاسم التجاري للصنف بالعربية إلزامي.');
    }
    if (!params.base_unit || !params.base_unit.trim()) {
      params.base_unit = 'حبة';
    }

    const state = db.getState();
    const defaultCatId = state.categories[0]?.id || 'cat-01';

    const productId = InventoryService.saveProduct(
      {
        category_id: params.category_id || defaultCatId,
        name_ar: params.name_ar.trim(),
        name_en: params.name_en?.trim(),
        generic_name: params.generic_name?.trim(),
        active_ingredient: params.active_ingredient?.trim(),
        dosage_form: params.dosage_form || 'tablet',
        base_unit: params.base_unit.trim(),
        current_selling_price: params.current_selling_price || 0,
        current_purchase_price: params.current_purchase_price || 0,
        min_stock_level: params.min_stock_level || 5,
        barcode: params.barcode?.trim()
      },
      params.units || [],
      context.currentUser.id
    );

    this.logAssistantAction(context.currentUser.id, 'CREATE_PRODUCT', 'product', productId, {
      name_ar: params.name_ar
    });

    return {
      success: true,
      actionId: 'create_product',
      actionName: 'إضافة صنف',
      entityId: productId,
      entityType: 'product',
      message: `تمت إضافة الصنف الدوائي (${params.name_ar}) بنجاح إلى قاعدة البيانات برمز (${productId}).`
    };
  }

  static async executeCreateSale(
    context: AssistantContext,
    params: {
      items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        unitName: string;
        unitFactor?: number;
      }>;
      saleType: 'cash' | 'credit';
      customerId?: string;
      cashboxId?: string;
      discountAmount?: number;
      idempotencyKey?: string;
    }
  ): Promise<ActionResultData> {
    this.checkPermission(context, ['all', 'sales'], 'إصدار فواتير المبيعات');

    if (!params.items || params.items.length === 0) {
      throw new Error('لا يمكن إنشاء فاتورة بدون أصناف.');
    }

    const state = db.getState();
    const cartItems: any[] = params.items.map((item) => {
      const p = ProductRepository.getById(item.productId);
      const batches = state.batches.filter((b) => b.product_id === item.productId && b.current_quantity > 0);
      const totalStock = batches.reduce((sum, b) => sum + b.current_quantity, 0);

      return {
        productId: item.productId,
        productName: item.productName,
        unitName: item.unitName || 'حبة',
        unitFactor: item.unitFactor || 1,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice),
        discountAmount: 0,
        totalPrice: Math.round(item.quantity * item.unitPrice),
        availableUnits: [{ unitName: item.unitName || p?.base_unit || 'حبة', factor: 1, price: Math.round(item.unitPrice) }],
        availableStockBase: totalStock
      };
    });

    const targetBox = params.cashboxId || state.cashboxes[0]?.id;

    const sale = SalesService.createSale({
      user_id: context.currentUser.id,
      sale_type: params.saleType,
      customer_id: params.customerId,
      cashbox_id: targetBox,
      items: cartItems,
      discount_amount: params.discountAmount || 0,
      idempotency_key: params.idempotencyKey
    });

    this.logAssistantAction(context.currentUser.id, 'CREATE_SALE', 'sale', sale.id, {
      invoiceNumber: sale.invoice_number,
      netTotal: sale.net_total
    });

    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      success: true,
      actionId: 'create_sale',
      actionName: 'إصدار فاتورة بيع',
      entityId: sale.id,
      entityType: 'sale',
      referenceNumber: sale.invoice_number,
      message: `تم إصدار الفاتورة بنجاح برقم (${sale.invoice_number}) بإجمالي ${sale.net_total} ${sym}.`,
      financialImpact: {
        cashboxId: targetBox,
        amount: sale.paid_amount,
        direction: 'in'
      },
      details: {
        invoiceNumber: sale.invoice_number,
        total: sale.net_total,
        paid: sale.paid_amount,
        itemCount: params.items.length
      }
    };
  }

  static async executeCustomerPayment(
    context: AssistantContext,
    params: { customerId: string; amount: number; cashboxId?: string; notes?: string; idempotencyKey?: string }
  ): Promise<ActionResultData> {
    this.checkPermission(context, ['all', 'receipts', 'sales'], 'تحصيل دفعات العملاء');

    const state = db.getState();
    const customer = CustomerRepository.getById(params.customerId);
    if (!customer) {
      throw new Error('العميل المحدد غير مسجل.');
    }

    const targetBox = params.cashboxId ? state.cashboxes.find((c) => c.id === params.cashboxId) : state.cashboxes[0];
    if (!targetBox) throw new Error('الصندوق غير موجود.');

    const receipt = FinanceService.addCustomerReceipt({
      user_id: context.currentUser.id,
      customer_id: customer.id,
      cashbox_id: targetBox.id,
      amount: params.amount,
      notes: params.notes || 'سند قبض عبر المساعد الذكي',
      idempotency_key: params.idempotencyKey
    });

    this.logAssistantAction(context.currentUser.id, 'CUSTOMER_PAYMENT', 'customer_transaction', receipt.customer_transaction.id, {
      customer: customer.name,
      amount: params.amount
    });

    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      success: true,
      actionId: 'customer_payment',
      actionName: 'تحصيل دفعة عميل',
      entityId: receipt.customer_transaction.id,
      entityType: 'receipt',
      referenceNumber: receipt.receipt_number,
      message: `تم تسجيل سند القبض برقم (${receipt.receipt_number}) بقيمة ${params.amount} ${sym} من العميل (${customer.name}) وإيداعها في (${targetBox.name_ar}).`,
      financialImpact: {
        cashboxId: targetBox.id,
        amount: params.amount,
        direction: 'in'
      }
    };
  }

  static async executeSupplierPayment(
    context: AssistantContext,
    params: { supplierId: string; amount: number; cashboxId?: string; notes?: string; idempotencyKey?: string }
  ): Promise<ActionResultData> {
    this.checkPermission(context, ['all', 'purchases'], 'سداد مستحقات الموردين');

    const state = db.getState();
    const supplier = SupplierRepository.getById(params.supplierId);
    if (!supplier) {
      throw new Error('المورد المحدد غير مسجل.');
    }

    const targetBox = params.cashboxId ? state.cashboxes.find((c) => c.id === params.cashboxId) : state.cashboxes[0];
    if (!targetBox) throw new Error('الصندوق غير موجود.');

    const payment = FinanceService.addSupplierPayment({
      user_id: context.currentUser.id,
      supplier_id: supplier.id,
      cashbox_id: targetBox.id,
      amount: params.amount,
      notes: params.notes || 'سند صرف عبر المساعد الذكي',
      idempotency_key: params.idempotencyKey
    });

    this.logAssistantAction(context.currentUser.id, 'SUPPLIER_PAYMENT', 'supplier_transaction', payment.supplier_transaction.id, {
      supplier: supplier.name_ar,
      amount: params.amount
    });

    const sym = (state.profile as any).currency_symbol || state.profile.currency || 'ر.ي';

    return {
      success: true,
      actionId: 'supplier_payment',
      actionName: 'سداد دفعة مورد',
      entityId: payment.supplier_transaction.id,
      entityType: 'payment',
      referenceNumber: payment.voucher_number,
      message: `تم تسجيل سند الصرف برقم (${payment.voucher_number}) بقيمة ${params.amount} ${sym} للمورد (${supplier.name_ar}) وصرفها من (${targetBox.name_ar}).`,
      financialImpact: {
        cashboxId: targetBox.id,
        amount: params.amount,
        direction: 'out'
      }
    };
  }
}
