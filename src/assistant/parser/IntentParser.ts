// Intent & Parameter Parser for Smart Pharmacy Copilot (Phase 9)
// Deterministic Arabic natural language understanding, entity extraction, and ambiguity resolution
// Operates 100% offline-first with strict validation and no raw SQL generation

import { AssistantIntent } from '../types';
import { DomainValidator } from '../../db/validation';
import { ProductRepository, CustomerRepository, SupplierRepository } from '../../db/repositories';

export interface ParsedRequest {
  intent: AssistantIntent;
  confidence: number;
  rawText: string;
  params: Record<string, any>;
  requiresClarification?: boolean;
  clarificationPrompt?: string;
  clarificationChoices?: Array<{ id: string; title: string; description: string; params: any }>;
}

export class IntentParser {
  /**
   * Main parsing entry point: resolves natural language Arabic text to structured Intent + Parameters
   */
  static parse(text: string): ParsedRequest {
    const raw = (text || '').trim();
    const norm = DomainValidator.normalizeArabic(raw.toLowerCase());

    // 0. Greetings & Identity Queries
    if (this.isGreeting(norm)) {
      return {
        intent: 'GREETING',
        confidence: 0.99,
        rawText: raw,
        params: {}
      };
    }

    if (this.isCapabilities(norm)) {
      return {
        intent: 'CAPABILITIES',
        confidence: 0.99,
        rawText: raw,
        params: {}
      };
    }

    if (this.isPoliteFeedback(norm)) {
      return {
        intent: 'FEEDBACK',
        confidence: 0.99,
        rawText: raw,
        params: {}
      };
    }

    // 1. Help & Guide Intents
    if (this.isGuideOrHelp(norm)) {
      return this.parseGuideIntent(raw, norm);
    }

    // 2. Navigation Intents
    if (this.isNavigation(norm)) {
      return this.parseNavigationIntent(raw, norm);
    }

    // 3. Medical Safety & Clinical Inquiries
    if (this.isMedicalInquiry(norm)) {
      return this.parseMedicalInquiry(raw, norm);
    }

    // 4. Financial & Cashbox Read Queries
    if (norm.includes('رصيد الصندوق') || norm.includes('رصيد الخزينة') || norm.includes('كم في الصندوق') || norm.includes('فلوس الصندوق')) {
      return {
        intent: 'GET_CASHBOX',
        confidence: 0.95,
        rawText: raw,
        params: {}
      };
    }

    // 5. Customer & Supplier Balance Queries
    if (norm.includes('رصيد العميل') || norm.includes('حساب العميل') || norm.includes('كم على العميل') || norm.includes('مديونية')) {
      const match = raw.match(/(?:رصيد العميل|حساب العميل|كم على العميل|مديونية العميل|مديونية)\s+([^\d\n\?]+)/i);
      const customerName = match ? match[1].trim() : '';
      if (!customerName) {
        return {
          intent: 'GET_CUSTOMER_BALANCE',
          confidence: 0.7,
          rawText: raw,
          params: {},
          requiresClarification: true,
          clarificationPrompt: 'يرجى تحديد اسم العميل للاطلاع على رصيده الحسابي.'
        };
      }
      return {
        intent: 'GET_CUSTOMER_BALANCE',
        confidence: 0.9,
        rawText: raw,
        params: { query: customerName }
      };
    }

    if (norm.includes('رصيد المورد') || norm.includes('حساب المورد') || norm.includes('مستحقات المورد') || norm.includes('كم للمورد')) {
      const match = raw.match(/(?:رصيد المورد|حساب المورد|مستحقات المورد|كم للمورد)\s+([^\d\n\?]+)/i);
      const supplierName = match ? match[1].trim() : '';
      if (!supplierName) {
        return {
          intent: 'GET_SUPPLIER_BALANCE',
          confidence: 0.7,
          rawText: raw,
          params: {},
          requiresClarification: true,
          clarificationPrompt: 'يرجى تحديد اسم شركة الأدوية أو المورد للاطلاع على رصيده.'
        };
      }
      return {
        intent: 'GET_SUPPLIER_BALANCE',
        confidence: 0.9,
        rawText: raw,
        params: { query: supplierName }
      };
    }

    // 6. Sales & Report Read Queries
    if (norm.includes('مبيعات اليوم') || norm.includes('تقرير المبيعات') || norm.includes('كم بعنا اليوم') || norm.includes('ارباح اليوم')) {
      return {
        intent: 'GET_SALES',
        confidence: 0.95,
        rawText: raw,
        params: {}
      };
    }

    // 7. Inventory & Expiry Queries
    if (norm.includes('قريبة من الانتهاء') || norm.includes('منتهية الصلاحية') || norm.includes('صلاحية الادوية') || norm.includes('قريب ينتهي')) {
      return {
        intent: 'GET_EXPIRING_PRODUCTS',
        confidence: 0.95,
        rawText: raw,
        params: { days: 60 }
      };
    }

    if (norm.includes('النواقص') || norm.includes('مخزون منخفض') || norm.includes('اقل من الحد الادنى') || norm.includes('اصناف ناقصة')) {
      return {
        intent: 'GET_LOW_STOCK',
        confidence: 0.95,
        rawText: raw,
        params: {}
      };
    }

    // 8. Stock & Product Search Queries
    if (norm.startsWith('كم مخزون') || norm.startsWith('مخزون') || norm.includes('كم متبقي من') || norm.includes('كم حبة في مخزن')) {
      const match = raw.match(/(?:كم مخزون|مخزون|كم متبقي من|رصيد صنف)\s+([^?\n]+)/i);
      const prodQuery = match ? match[1].trim() : '';
      if (!prodQuery) {
        return {
          intent: 'GET_STOCK',
          confidence: 0.6,
          rawText: raw,
          params: {},
          requiresClarification: true,
          clarificationPrompt: 'ما هو اسم الصنف الدوائي الذي ترغب في فحص مخزونه؟'
        };
      }
      return this.resolveProductStockIntent(raw, prodQuery);
    }

    if (norm.startsWith('ابحث عن') || norm.startsWith('بحث عن') || norm.startsWith('اين اجد') || norm.startsWith('سعر صنف')) {
      const match = raw.match(/(?:ابحث عن|بحث عن|اين اجد|سعر صنف|سعر)\s+([^?\n]+)/i);
      const prodQuery = match ? match[1].trim() : '';
      return {
        intent: 'SEARCH_PRODUCT',
        confidence: 0.9,
        rawText: raw,
        params: { query: prodQuery || raw }
      };
    }

    // 9. Write Action: Create Expense (سجل مصروف 5000 ريال صيانة)
    if (norm.includes('سجل مصروف') || norm.includes('اضف مصروف') || norm.includes('صرف مصروف') || norm.includes('قيد مصروف')) {
      return this.parseExpenseAction(raw, norm);
    }

    // 10. Write Action: Add/Create Product (اضف صنف / اضافة دواء)
    if (norm.startsWith('اضف صنف') || norm.startsWith('اضافة صنف') || norm.startsWith('تسجيل صنف') || norm.startsWith('انشئ صنف')) {
      return this.parseProductCreationAction(raw);
    }

    // 11. Write Action: Create Sale (بيع 2 علبة باراسيتامول)
    if (norm.startsWith('بيع') || norm.startsWith('اصدر فاتورة بيع') || norm.startsWith('فاتورة بيع')) {
      return this.parseSaleAction(raw, norm);
    }

    // 12. Write Action: Customer Payment / Receipt (قبض / تحصيل دفعة)
    if (norm.includes('قبض') || norm.includes('تحصيل دفعة') || norm.includes('استلام دفعة')) {
      return this.parseCustomerPaymentAction(raw, norm);
    }

    // 13. Write Action: Supplier Payment (سداد دفعة لمورد)
    if (norm.includes('سداد') || norm.includes('دفع للمورد') || norm.includes('سداد دفعة')) {
      return this.parseSupplierPaymentAction(raw, norm);
    }

    // Fallback: If it mentions a product name directly
    const possibleProducts = ProductRepository.search(raw);
    if (possibleProducts.length > 0 && possibleProducts.length <= 3) {
      return {
        intent: 'SEARCH_PRODUCT',
        confidence: 0.75,
        rawText: raw,
        params: { query: raw }
      };
    }

    return {
      intent: 'UNKNOWN',
      confidence: 0.1,
      rawText: raw,
      params: {}
    };
  }

  // -------------------------------------------------------------
  // Private Helper Parsers
  // -------------------------------------------------------------

  private static isGreeting(norm: string): boolean {
    const greetings = [
      'مرحبا', 'مرحباً', 'اهلا', 'أهلا', 'أهلاً', 'اهلين', 'أهلين',
      'السلام عليكم', 'سلام عليكم', 'سلام', 'صباح الخير', 'مساء الخير',
      'هلا', 'هاي', 'حيّاك', 'حياك', 'أهلاً وسهلاً', 'اهلا وسهلا', 'تحياتي'
    ];
    return greetings.some((g) => norm === g || norm.startsWith(g + ' ') || norm.endsWith(' ' + g));
  }

  private static isCapabilities(norm: string): boolean {
    const patterns = [
      'من انت', 'من أنت', 'ماذا تفعل', 'ما هي وظيفتك', 'كيف تساعدني',
      'ما هي الاوامر', 'ما هي الأوامر', 'الاوامر المتاحة', 'الأوامر المتاحة',
      'تعليمات المساعد', 'ايش تسوي', 'شنو وظيفتك', 'قدرات المساعد', 'من تكون', 'ما هو دورك'
    ];
    return patterns.some((p) => norm.includes(p));
  }

  private static isPoliteFeedback(norm: string): boolean {
    const feedback = [
      'شكرا', 'شكراً', 'مشكور', 'جزاك الله خيرا', 'جزاك الله خير',
      'تسلم', 'يعطيك العافية', 'الله يعافيك', 'تمام', 'ممتاز', 'عظيم', 'أحسنت', 'احسنت'
    ];
    return feedback.some((f) => norm === f || norm.startsWith(f + ' '));
  }

  private static isGuideOrHelp(norm: string): boolean {
    return (
      norm.startsWith('كيف') ||
      norm.startsWith('طريقة') ||
      norm.startsWith('خطوات') ||
      norm.includes('اشرح لي') ||
      norm.includes('ارشدني') ||
      norm.includes('دليل') ||
      norm.includes('مساعدة') ||
      norm.includes('ماذا تفعل') ||
      norm.includes('من انت')
    );
  }

  private static parseGuideIntent(raw: string, norm: string): ParsedRequest {
    if (norm.includes('صنف') || norm.includes('دواء') || norm.includes('منتج')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'add_product' }
      };
    }
    if (norm.includes('مرتجع') || norm.includes('استرجاع')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'sale_return' }
      };
    }
    if (norm.includes('بيع') || norm.includes('فاتورة بيع') || norm.includes('pos')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'create_sale' }
      };
    }
    if (norm.includes('شراء') || norm.includes('مشتريات') || norm.includes('توريد')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'create_purchase' }
      };
    }
    if (norm.includes('مصروف') || norm.includes('مصاريف')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'record_expense' }
      };
    }
    if (norm.includes('قبض') || norm.includes('دفعة عميل')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'customer_payment' }
      };
    }
    if (norm.includes('سداد') || norm.includes('دفعة مورد')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'supplier_payment' }
      };
    }
    if (norm.includes('وردية') || norm.includes('مناوبة') || norm.includes('كاشير')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'shift_management' }
      };
    }
    if (norm.includes('جرد') || norm.includes('مطابقة مخزون')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'stock_count' }
      };
    }
    if (norm.includes('تثبيت') || norm.includes('تنزيل') || norm.includes('تحميل') || norm.includes('apk') || norm.includes('تنصيب')) {
      return {
        intent: 'GUIDE',
        confidence: 0.95,
        rawText: raw,
        params: { topic: 'app_installation' }
      };
    }

    return {
      intent: 'HELP',
      confidence: 0.9,
      rawText: raw,
      params: {}
    };
  }

  private static isNavigation(norm: string): boolean {
    return (
      norm.startsWith('افتح') ||
      norm.startsWith('انتقل الى') ||
      norm.startsWith('اذهب الى') ||
      norm.startsWith('شاشة') ||
      norm.includes('افتح شاشة')
    );
  }

  private static parseNavigationIntent(raw: string, norm: string): ParsedRequest {
    if (norm.includes('مبيعات') || norm.includes('نقطة البيع') || norm.includes('pos')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'pos', label: 'شاشة نقطة البيع (المبيعات)' }
      };
    }
    if (norm.includes('مخزون') || norm.includes('اصناف') || norm.includes('ادوية')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'inventory', label: 'شاشة الأصناف والمخزون' }
      };
    }
    if (norm.includes('مشتريات') || norm.includes('توريد')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'purchases', label: 'شاشة المشتريات وإذن التوريد' }
      };
    }
    if (norm.includes('صندوق') || norm.includes('مالية') || norm.includes('خزينة')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'more', section: 'cash', label: 'شاشة الصندوق والمالية' }
      };
    }
    if (norm.includes('عملاء') || norm.includes('ذمم')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'more', section: 'customers', label: 'شاشة العملاء والذمم' }
      };
    }
    if (norm.includes('موردين') || norm.includes('شركات')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'more', section: 'suppliers', label: 'شاشة الموردين والشركات' }
      };
    }
    if (norm.includes('تقارير')) {
      return {
        intent: 'NAVIGATE',
        confidence: 0.95,
        rawText: raw,
        params: { screen: 'more', section: 'reports', label: 'شاشة التقارير والتحليلات' }
      };
    }

    return {
      intent: 'NAVIGATE',
      confidence: 0.8,
      rawText: raw,
      params: { screen: 'dashboard', label: 'الرئيسية' }
    };
  }

  private static isMedicalInquiry(norm: string): boolean {
    return (
      norm.includes('طفل') ||
      norm.includes('اطفال') ||
      norm.includes('جرعة') ||
      norm.includes('تعارض') ||
      norm.includes('تداخل') ||
      norm.includes('حامل') ||
      norm.includes('مرضع') ||
      norm.includes('اعراض جانبية')
    );
  }

  private static parseMedicalInquiry(raw: string, norm: string): ParsedRequest {
    if (norm.includes('تعارض') || norm.includes('تداخل')) {
      return {
        intent: 'CHECK_INTERACTIONS',
        confidence: 0.9,
        rawText: raw,
        params: {}
      };
    }
    return {
      intent: 'CALCULATE_DOSE',
      confidence: 0.9,
      rawText: raw,
      params: {}
    };
  }

  private static resolveProductStockIntent(raw: string, prodQuery: string): ParsedRequest {
    const matches = ProductRepository.search(prodQuery);
    if (matches.length > 1) {
      return {
        intent: 'GET_STOCK',
        confidence: 0.8,
        rawText: raw,
        params: { query: prodQuery },
        requiresClarification: true,
        clarificationPrompt: `يوجد أكثر من صنف دوائي مطابق لـ (${prodQuery}). يرجى اختيار الصنف الدقيق:`,
        clarificationChoices: matches.slice(0, 5).map((m) => ({
          id: m.id,
          title: m.name_ar,
          description: `${m.dosage_form || 'دواء'} | ${m.active_ingredient || 'المادة الفعالة غير محددة'}`,
          params: { productId: m.id, productName: m.name_ar }
        }))
      };
    }

    return {
      intent: 'GET_STOCK',
      confidence: 0.9,
      rawText: raw,
      params: { query: prodQuery, matchedId: matches[0]?.id }
    };
  }

  private static parseExpenseAction(raw: string, norm: string): ParsedRequest {
    // Look for numbers representing amount: e.g. 5000, 5,000, 1000.50
    const amountMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    // Extract reason after words like صيانة, نظافة, كهرباء, etc.
    let reason = '';
    const cleanReason = raw
      .replace(/(?:سجل مصروف|اضف مصروف|صرف مصروف|قيد مصروف)/i, '')
      .replace(/(\d+(?:[.,]\d+)?)/, '')
      .replace(/(?:ريال|ر\.ي|دينار|جنيه|دولار)/i, '')
      .trim();

    if (cleanReason.length >= 2) {
      reason = cleanReason;
    }

    if (!amount || amount <= 0) {
      return {
        intent: 'CREATE_EXPENSE',
        confidence: 0.6,
        rawText: raw,
        params: {},
        requiresClarification: true,
        clarificationPrompt: 'كم هو مبلغ المصروف المراد تسجيله؟ (مثال: سجل مصروف 5000 ريال صيانة)'
      };
    }

    if (!reason) {
      return {
        intent: 'CREATE_EXPENSE',
        confidence: 0.7,
        rawText: raw,
        params: { amount },
        requiresClarification: true,
        clarificationPrompt: `تم تحديد المبلغ (${amount} ر.ي). ما هو سبب أو بيان هذا المصروف؟`
      };
    }

    return {
      intent: 'CREATE_EXPENSE',
      confidence: 0.95,
      rawText: raw,
      params: {
        amount,
        reason
      }
    };
  }

  private static parseProductCreationAction(raw: string): ParsedRequest {
    // e.g. "أضف صنف باراسيتامول 500 مجم" or "أضف صنف أوجمنتين"
    const afterKeyword = raw.replace(/^(?:[أإآا]ضف صنف|[أإآا]ضافة صنف|تسجيل صنف|[أإآا]نشئ صنف|اضف صنف|اضافة صنف|انشئ صنف)\s*/i, '').trim();

    if (!afterKeyword || afterKeyword.length < 2) {
      return {
        intent: 'CREATE_PRODUCT',
        confidence: 0.5,
        rawText: raw,
        params: {},
        requiresClarification: true,
        clarificationPrompt: 'يرجى تحديد الاسم التجاري للصنف الدوائي المراد إضافته.'
      };
    }

    return {
      intent: 'CREATE_PRODUCT',
      confidence: 0.9,
      rawText: raw,
      params: {
        name_ar: afterKeyword,
        base_unit: 'حبة',
        current_selling_price: 0,
        current_purchase_price: 0
      }
    };
  }

  private static parseSaleAction(raw: string, norm: string): ParsedRequest {
    // e.g. "بيع 2 علبة باراسيتامول" or "بيع علبة بنادول نقدا"
    const qtyMatch = raw.match(/(\d+)/);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    // Remove keywords and extract product text
    const cleanProdText = raw
      .replace(/^(?:بيع|اصدر فاتورة بيع|فاتورة بيع)\s*/i, '')
      .replace(/(\d+)/, '')
      .replace(/(?:علبة|باكت|شريط|حبة|قرص)/gi, '')
      .replace(/(?:نقدا|نقدي|اجل|على الحساب)/gi, '')
      .trim();

    if (!cleanProdText || cleanProdText.length < 2) {
      return {
        intent: 'CREATE_SALE',
        confidence: 0.5,
        rawText: raw,
        params: {},
        requiresClarification: true,
        clarificationPrompt: 'ما هو اسم الدواء أو الصنف المراد بيعه وكميته؟'
      };
    }

    const matches = ProductRepository.search(cleanProdText);
    if (matches.length === 0) {
      return {
        intent: 'CREATE_SALE',
        confidence: 0.6,
        rawText: raw,
        params: {},
        requiresClarification: true,
        clarificationPrompt: `عذراً، لم أجد صنفاً في المخزن مطابقاً لـ (${cleanProdText}). يرجى التأكد من اسم الصنف.`
      };
    }

    if (matches.length > 1) {
      return {
        intent: 'CREATE_SALE',
        confidence: 0.75,
        rawText: raw,
        params: { quantity },
        requiresClarification: true,
        clarificationPrompt: `يوجد أكثر من صنف مطابق لـ (${cleanProdText}). اختر الصنف المطلوب:`,
        clarificationChoices: matches.slice(0, 4).map((p) => ({
          id: p.id,
          title: p.name_ar,
          description: `السعر: ${p.current_selling_price} ر.ي | المادة: ${p.active_ingredient || '-'}`,
          params: {
            productId: p.id,
            productName: p.name_ar,
            unitPrice: p.current_selling_price,
            quantity,
            unitName: p.base_unit || 'حبة',
            saleType: norm.includes('اجل') ? 'credit' : 'cash'
          }
        }))
      };
    }

    const singleProduct = matches[0];
    const saleType: 'cash' | 'credit' = norm.includes('اجل') ? 'credit' : 'cash';

    return {
      intent: 'CREATE_SALE',
      confidence: 0.9,
      rawText: raw,
      params: {
        items: [
          {
            productId: singleProduct.id,
            productName: singleProduct.name_ar,
            quantity,
            unitPrice: singleProduct.current_selling_price,
            unitName: singleProduct.base_unit || 'حبة',
            unitFactor: 1
          }
        ],
        saleType
      }
    };
  }

  private static parseCustomerPaymentAction(raw: string, norm: string): ParsedRequest {
    const amountMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    const namePart = raw
      .replace(/(?:قبض|تحصيل دفعة|استلام دفعة|تسجيل سند قبض)/gi, '')
      .replace(/(\d+(?:[.,]\d+)?)/, '')
      .replace(/(?:من العميل|من عميل|من)/gi, '')
      .replace(/(?:ريال|ر\.ي)/gi, '')
      .trim();

    if (!amount || amount <= 0) {
      return {
        intent: 'RECEIVE_CUSTOMER_PAYMENT',
        confidence: 0.6,
        rawText: raw,
        params: {},
        requiresClarification: true,
        clarificationPrompt: 'كم هو المبلغ المقبوض من العميل؟'
      };
    }

    if (!namePart) {
      return {
        intent: 'RECEIVE_CUSTOMER_PAYMENT',
        confidence: 0.7,
        rawText: raw,
        params: { amount },
        requiresClarification: true,
        clarificationPrompt: 'ما هو اسم العميل الذي تم استلام الدفعة منه؟'
      };
    }

    const customers = CustomerRepository.search(namePart);
    if (customers.length === 0) {
      return {
        intent: 'RECEIVE_CUSTOMER_PAYMENT',
        confidence: 0.7,
        rawText: raw,
        params: { amount },
        requiresClarification: true,
        clarificationPrompt: `لم يتم العثور على عميل مسجل باسم (${namePart}).`
      };
    }

    return {
      intent: 'RECEIVE_CUSTOMER_PAYMENT',
      confidence: 0.9,
      rawText: raw,
      params: {
        customerId: customers[0].id,
        customerName: customers[0].name,
        amount
      }
    };
  }

  private static parseSupplierPaymentAction(raw: string, norm: string): ParsedRequest {
    const amountMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    const namePart = raw
      .replace(/(?:سداد|دفع للمورد|سداد دفعة|تسجيل سند صرف)/gi, '')
      .replace(/(\d+(?:[.,]\d+)?)/, '')
      .replace(/(?:للمورد|لمورد|الى|لـ)/gi, '')
      .replace(/(?:ريال|ر\.ي)/gi, '')
      .trim();

    if (!amount || amount <= 0) {
      return {
        intent: 'PAY_SUPPLIER',
        confidence: 0.6,
        rawText: raw,
        params: {},
        requiresClarification: true,
        clarificationPrompt: 'كم هو المبلغ المراد سداده للمورد؟'
      };
    }

    if (!namePart) {
      return {
        intent: 'PAY_SUPPLIER',
        confidence: 0.7,
        rawText: raw,
        params: { amount },
        requiresClarification: true,
        clarificationPrompt: 'ما هو اسم شركة الأدوية أو المورد المراد السداد له؟'
      };
    }

    const suppliers = SupplierRepository.search(namePart);
    if (suppliers.length === 0) {
      return {
        intent: 'PAY_SUPPLIER',
        confidence: 0.7,
        rawText: raw,
        params: { amount },
        requiresClarification: true,
        clarificationPrompt: `لم يتم العثور على مورد مسجل باسم (${namePart}).`
      };
    }

    return {
      intent: 'PAY_SUPPLIER',
      confidence: 0.9,
      rawText: raw,
      params: {
        supplierId: suppliers[0].id,
        supplierName: suppliers[0].name_ar,
        amount
      }
    };
  }
}
