// Assistant Orchestrator for Smart Pharmacy Copilot (Phase 9)
// Coordinates conversation flow, intent dispatch, RBAC validation, confirmation policies, and real execution

import {
  AssistantContext,
  AssistantMessage,
  ConfirmationRequestData,
  AmbiguityChoice
} from '../types';
import { IntentParser } from '../parser/IntentParser';
import { ActionRegistry } from '../registry/ActionRegistry';
import { APP_SCREENS_KNOWLEDGE } from '../knowledge/screens';
import { APP_GUIDES } from '../knowledge/guides';
import { db } from '../../db/sqlite';

export class AssistantOrchestrator {
  private static pendingConfirmations: Map<
    string,
    {
      actionId: string;
      params: any;
      expiresAt: number;
    }
  > = new Map();

  /**
   * Main entry point to process a natural language query from user
   */
  static async processMessage(
    text: string,
    context: AssistantContext
  ): Promise<AssistantMessage> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        id: 'msg-' + Date.now(),
        sender: 'assistant',
        timestamp: Date.now(),
        text: 'مرحباً بك، كيف يمكنني مساعدتك في إدارة الصيدلية اليوم؟',
        responseType: 'TEXT'
      };
    }

    try {
      // 1. Parse natural language into structured intent and parameters
      const parsed = IntentParser.parse(trimmed);

      // 2. Check if clarification is required (ambiguity or missing critical fields)
      if (parsed.requiresClarification) {
        if (parsed.clarificationChoices && parsed.clarificationChoices.length > 0) {
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: parsed.clarificationPrompt || 'يرجى اختيار الصنف المطلوب:',
            responseType: 'AMBIGUITY',
            data: {
              ambiguity: {
                prompt: parsed.clarificationPrompt || '',
                choices: parsed.clarificationChoices
              }
            }
          };
        }
        return {
          id: 'msg-' + Date.now(),
          sender: 'assistant',
          timestamp: Date.now(),
          text: parsed.clarificationPrompt || 'يرجى تزويدي بمزيد من التفاصيل لإتمام طلبك.',
          responseType: 'TEXT'
        };
      }

      // 3. Dispatch by intent
      switch (parsed.intent) {
        // --- GUIDE & HELP ---
        case 'GUIDE': {
          const topicKey = parsed.params.topic || 'add_product';
          const guideData = APP_GUIDES[topicKey] || APP_GUIDES.add_product;
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: guideData.summary,
            responseType: 'GUIDE',
            data: { guide: guideData }
          };
        }

        case 'HELP': {
          const screenInfo = APP_SCREENS_KNOWLEDGE[context.currentScreen] || APP_SCREENS_KNOWLEDGE.dashboard;
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `أنا مساعد الصيدلية الذكي. أنت متواجد حالياً في (${screenInfo.name_ar}).\n\nوظيفتها: ${screenInfo.purpose_ar}\n\nالإجراءات المتاحة:\n• ${screenInfo.availableActions_ar.join('\n• ')}`,
            responseType: 'TEXT'
          };
        }

        // --- NAVIGATION ---
        case 'NAVIGATE': {
          const screen = parsed.params.screen || 'dashboard';
          const section = parsed.params.section;
          context.navigateTo(screen, section);
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `تم فتح ${parsed.params.label || screen} بنجاح.`,
            responseType: 'NAVIGATION',
            data: {
              navigation: {
                screen,
                section,
                label: parsed.params.label || screen
              }
            }
          };
        }

        // --- READ: PRODUCT SEARCH ---
        case 'SEARCH_PRODUCT': {
          const products = await ActionRegistry.searchProducts(parsed.params.query);
          if (products.length === 0) {
            return {
              id: 'msg-' + Date.now(),
              sender: 'assistant',
              timestamp: Date.now(),
              text: `لم أجد أي أصناف مسجلة تطابق البحث: "${parsed.params.query}".`,
              responseType: 'TEXT'
            };
          }
          if (products.length === 1) {
            return {
              id: 'msg-' + Date.now(),
              sender: 'assistant',
              timestamp: Date.now(),
              text: `وجدت الصنف التالي: (${products[0].name_ar}). الرصيد المتاح: ${products[0].total_stock} ${products[0].base_unit}.`,
              responseType: 'PRODUCT_CARD',
              data: { product: products[0] }
            };
          }
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `تم العثور على ${products.length} أصناف مطابقة:`,
            responseType: 'PRODUCT_LIST',
            data: { products }
          };
        }

        // --- READ: PRODUCT STOCK ---
        case 'GET_STOCK': {
          const { product, totalStock } = await ActionRegistry.getProductStock(parsed.params.matchedId || parsed.params.query);
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `مخزون صنف (${product.name_ar}): المتوفر حالياً ${totalStock} ${product.base_unit} عبر ${product.batches.length} تشغيلات.`,
            responseType: 'PRODUCT_CARD',
            data: { product }
          };
        }

        // --- READ: LOW STOCK ---
        case 'GET_LOW_STOCK': {
          const lowProducts = await ActionRegistry.getLowStockProducts();
          if (lowProducts.length === 0) {
            return {
              id: 'msg-' + Date.now(),
              sender: 'assistant',
              timestamp: Date.now(),
              text: 'جميع الأصناف في الصيدلية متوفرة بأرصدة تتجاوز حد الطلب الأدنى. لا توجد نواقص حرجة حالياً.',
              responseType: 'TEXT'
            };
          }
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `يوجد ${lowProducts.length} صنفاً وصل رصيدها إلى حد الطلب الأدنى أو أقل:`,
            responseType: 'PRODUCT_LIST',
            data: { products: lowProducts }
          };
        }

        // --- READ: EXPIRING PRODUCTS ---
        case 'GET_EXPIRING_PRODUCTS': {
          const expiring = await ActionRegistry.getExpiringProducts(60);
          if (expiring.length === 0) {
            return {
              id: 'msg-' + Date.now(),
              sender: 'assistant',
              timestamp: Date.now(),
              text: 'لا توجد أي أدوية قريبة من الانتهاء خلال الـ 60 يوماً القادمة. جميع التشغيلات في حالة سليمة.',
              responseType: 'TEXT'
            };
          }
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `تم رصد ${expiring.length} تشغيلة دوائية قريبة من الانتهاء خلال 60 يوماً:\n` +
              expiring.slice(0, 5).map((e) => `• ${e.product_name} (تشغيلة: ${e.batch_number}) - تنتهي في ${e.expiry_date} (متبقي ${e.days_remaining} يوم)`).join('\n'),
            responseType: 'TEXT'
          };
        }

        // --- READ: CASHBOX BALANCE ---
        case 'GET_CASHBOX': {
          const card = await ActionRegistry.getCashboxBalance();
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `الرصيد الفعلي للصندوق (${card.name}) هو: ${card.balance.toLocaleString()} ${card.currency}.`,
            responseType: 'BALANCE_CARD',
            data: { balance: card }
          };
        }

        // --- READ: CUSTOMER BALANCE ---
        case 'GET_CUSTOMER_BALANCE': {
          const card = await ActionRegistry.getCustomerBalance(parsed.params.query);
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `الرصيد المستحق على العميل (${card.name}) هو: ${card.balance.toLocaleString()} ${card.currency}.`,
            responseType: 'BALANCE_CARD',
            data: { balance: card }
          };
        }

        // --- READ: SUPPLIER BALANCE ---
        case 'GET_SUPPLIER_BALANCE': {
          const card = await ActionRegistry.getSupplierBalance(parsed.params.query);
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `مستحقات المورد (${card.name}) هي: ${card.balance.toLocaleString()} ${card.currency}.`,
            responseType: 'BALANCE_CARD',
            data: { balance: card }
          };
        }

        // --- READ: DAILY SALES ---
        case 'GET_SALES': {
          const report = await ActionRegistry.getDailySalesSummary();
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: report.title,
            responseType: 'REPORT_CARD',
            data: { report }
          };
        }

        // --- WRITE: CREATE EXPENSE (Requires Confirmation) ---
        case 'CREATE_EXPENSE': {
          // Check permission first
          ActionRegistry.checkPermission(context, ['all', 'receipts'], 'تسجيل المصروفات');

          const conf = ActionRegistry.buildExpenseConfirmation(
            parsed.params.amount,
            parsed.params.reason
          );

          this.pendingConfirmations.set(conf.operationKey, {
            actionId: 'create_expense',
            params: conf.params,
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
          });

          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: conf.summary,
            responseType: 'CONFIRMATION',
            data: { confirmation: conf }
          };
        }

        // --- WRITE: CREATE SALE (Requires Confirmation) ---
        case 'CREATE_SALE': {
          ActionRegistry.checkPermission(context, ['all', 'sales'], 'إصدار فواتير المبيعات');

          const conf = ActionRegistry.buildSaleConfirmation(
            parsed.params.items,
            parsed.params.saleType,
            parsed.params.customerId
          );

          this.pendingConfirmations.set(conf.operationKey, {
            actionId: 'create_sale',
            params: { ...conf.params, idempotencyKey: conf.operationKey },
            expiresAt: Date.now() + 5 * 60 * 1000
          });

          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: conf.summary,
            responseType: 'CONFIRMATION',
            data: { confirmation: conf }
          };
        }

        // --- WRITE: CREATE PRODUCT (Requires Confirmation) ---
        case 'CREATE_PRODUCT': {
          ActionRegistry.checkPermission(context, ['all', 'inventory'], 'إضافة أصناف جديدة');

          const conf = ActionRegistry.buildProductCreationConfirmation(parsed.params);

          this.pendingConfirmations.set(conf.operationKey, {
            actionId: 'create_product',
            params: conf.params,
            expiresAt: Date.now() + 5 * 60 * 1000
          });

          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: conf.summary,
            responseType: 'CONFIRMATION',
            data: { confirmation: conf }
          };
        }

        // --- MEDICAL SAFETY INQUIRIES ---
        case 'CHECK_INTERACTIONS': {
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: 'لفحص التعارضات الدوائية بدقة عالية، يُرجى استخدام تبويب [البدائل والجرعات والتعارضات] المدمج لاختيار الصنفين والتحقق من التداخل الدوائي وفق المراجع الصيدلانية السريرية المعتمدة.',
            responseType: 'TEXT'
          };
        }

        case 'CALCULATE_DOSE': {
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: '⚠️ تنبيه سريري: لسلامة المريض، حساب جرعات الأطفال يعتمد بدقة على وزن الطفل بالكيلوجرام، عمره، وتاريخه المرضي. يمكنك فتح حاسبة الجرعات المدمجة في تبويب المساعد لإجراء الحساب الدقيق.',
            responseType: 'TEXT'
          };
        }

        default: {
          return {
            id: 'msg-' + Date.now(),
            sender: 'assistant',
            timestamp: Date.now(),
            text: `أنا هنا لمساعدتك. يمكنك سؤالي عن كيفية استخدام التطبيق (مثل: "كيف أضيف صنف؟")، أو الاستفسار عن الأرصدة (مثل: "ما رصيد الصندوق؟") أو تنفيذ عمليات مثل تسجيل المصروفات وفواتير البيع.`,
            responseType: 'TEXT'
          };
        }
      }
    } catch (err: any) {
      console.error('Assistant Orchestrator Error:', err);
      return {
        id: 'msg-' + Date.now(),
        sender: 'assistant',
        timestamp: Date.now(),
        text: `تعذر إتمام العملية: ${err.message || 'حدث خطأ غير متوقع.'}`,
        responseType: 'ERROR',
        data: { errorReason: err.message }
      };
    }
  }

  /**
   * User clicked "Confirm Execution" on a structured confirmation card
   */
  static async confirmAction(
    operationKey: string,
    context: AssistantContext
  ): Promise<AssistantMessage> {
    const pending = this.pendingConfirmations.get(operationKey);
    if (!pending) {
      return {
        id: 'msg-' + Date.now(),
        sender: 'assistant',
        timestamp: Date.now(),
        text: 'انتهت صلاحية أمر التأكيد أو تم تنفيذه مسبقاً. يرجى إعادة إرسال الطلب.',
        responseType: 'ERROR'
      };
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingConfirmations.delete(operationKey);
      return {
        id: 'msg-' + Date.now(),
        sender: 'assistant',
        timestamp: Date.now(),
        text: 'انتهت مهلة تأكيد العملية (5 دقائق). تم إلغاء الأمر لأسباب أمنية.',
        responseType: 'ERROR'
      };
    }

    try {
      let result;
      switch (pending.actionId) {
        case 'create_expense': {
          result = await ActionRegistry.executeCreateExpense(context, {
            ...pending.params,
            idempotencyKey: operationKey
          });
          break;
        }
        case 'create_sale': {
          result = await ActionRegistry.executeCreateSale(context, {
            ...pending.params,
            idempotencyKey: operationKey
          });
          break;
        }
        case 'create_product': {
          result = await ActionRegistry.executeCreateProduct(context, pending.params);
          break;
        }
        case 'customer_payment': {
          result = await ActionRegistry.executeCustomerPayment(context, {
            ...pending.params,
            idempotencyKey: operationKey
          });
          break;
        }
        case 'supplier_payment': {
          result = await ActionRegistry.executeSupplierPayment(context, {
            ...pending.params,
            idempotencyKey: operationKey
          });
          break;
        }
        default:
          throw new Error(`عملية غير مدعومة (${pending.actionId}).`);
      }

      // Remove pending after successful execution
      this.pendingConfirmations.delete(operationKey);

      return {
        id: 'msg-' + Date.now(),
        sender: 'assistant',
        timestamp: Date.now(),
        text: result.message,
        responseType: 'ACTION_RESULT',
        data: { actionResult: result }
      };
    } catch (err: any) {
      // Keep or remove based on error type
      this.pendingConfirmations.delete(operationKey);
      return {
        id: 'msg-' + Date.now(),
        sender: 'assistant',
        timestamp: Date.now(),
        text: `فشل تنفيذ العملية في النظام: ${err.message}`,
        responseType: 'ERROR',
        data: { errorReason: err.message }
      };
    }
  }

  /**
   * User clicked "Cancel" on a structured confirmation card
   */
  static cancelAction(operationKey: string): AssistantMessage {
    this.pendingConfirmations.delete(operationKey);
    return {
      id: 'msg-' + Date.now(),
      sender: 'assistant',
      timestamp: Date.now(),
      text: 'تم إلغاء تنفيذ العملية بنجاح ولم يطرأ أي تعديل على قاعدة البيانات.',
      responseType: 'TEXT'
    };
  }
}
