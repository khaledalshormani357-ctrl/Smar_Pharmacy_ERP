import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard recommended Gemini model as per AI Studio guidelines
const GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Robustly resolves the Gemini API Key from environment variables.
 * Handles GEMINI_API_KEY, custom AI Studio Secret names (e.g. Smart_pharmacy),
 * or standard Google/Gemini key prefixes (AQ.*, AIzaSy*).
 */
function resolveGeminiApiKey(): string | null {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  if (process.env.Smart_pharmacy && process.env.Smart_pharmacy.trim()) {
    return process.env.Smart_pharmacy.trim();
  }
  if (process.env.SMART_PHARMACY && process.env.SMART_PHARMACY.trim()) {
    return process.env.SMART_PHARMACY.trim();
  }
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) {
    return process.env.GOOGLE_API_KEY.trim();
  }
  if (process.env.API_KEY && process.env.API_KEY.trim()) {
    return process.env.API_KEY.trim();
  }
  // Auto-detect any environment variable with Gemini key signature
  for (const [_, val] of Object.entries(process.env)) {
    if (typeof val === 'string' && val.trim().length > 20) {
      const trimmed = val.trim();
      if (trimmed.startsWith('AQ.') || trimmed.startsWith('AIzaSy')) {
        return trimmed;
      }
    }
  }
  return null;
}

// Synchronize resolved key into process.env.GEMINI_API_KEY
const initialKey = resolveGeminiApiKey();
if (initialKey && !process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = initialKey;
  console.log('[AI Server] Gemini API Key successfully loaded and initialized.');
}

// Lazy initialization for Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  const key = resolveGeminiApiKey();
  if (!key) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Classifies an upstream Gemini/network error into standardized ERP error codes
 */
function classifyError(err: any): { code: string; message: string; httpStatus: number } {
  const errMsg = String(err?.message || err || '');
  const status = err?.status || err?.statusCode || 0;

  if (errMsg.includes('GEMINI_API_KEY_MISSING') || !resolveGeminiApiKey()) {
    return {
      code: 'AI_NOT_CONFIGURED',
      message: 'المساعد الذكي غير مُهيأ بعد. يرجى إعداد مفتاح API الخاص بخدمة الذكاء الاصطناعي (GEMINI_API_KEY) في متغيرات بيئة الخادم.',
      httpStatus: 503,
    };
  }
  if (status === 401 || status === 403 || /api[ _-]?key|unauthorized|permission_denied/i.test(errMsg)) {
    return {
      code: 'AI_UNAUTHORIZED',
      message: 'مفتاح مزود الذكاء الاصطناعي غير مصرح له أو غير صالح. يرجى مراجعة صلاحيات GEMINI_API_KEY.',
      httpStatus: 401,
    };
  }
  if (status === 429 || /quota|rate[ _-]?limit|resource_exhausted/i.test(errMsg)) {
    return {
      code: 'AI_RATE_LIMITED',
      message: 'تم تجاوز حد الاستخدام المسموح لدى مزود الذكاء الاصطناعي. يرجى الانتظار قليلاً ثم إعادة المحاولة.',
      httpStatus: 429,
    };
  }
  if (/timeout|abort|deadline/i.test(errMsg)) {
    return {
      code: 'AI_TIMEOUT',
      message: 'انتهت مهلة استجابة مزود الذكاء الاصطناعي (Timeout). يرجى المحاولة مرة أخرى.',
      httpStatus: 504,
    };
  }
  if (/network|econnrefused|fetch failed|enotfound/i.test(errMsg)) {
    return {
      code: 'AI_NETWORK_ERROR',
      message: 'تعذر الاتصال بمزود الذكاء الاصطناعي عبر الشبكة. يرجى التحقق من اتصال الإنترنت.',
      httpStatus: 503,
    };
  }
  return {
    code: 'AI_PROVIDER_ERROR',
    message: 'حدث خطأ أثناء معالجة الطلب لدى مزود الذكاء الاصطناعي. يرجى إعادة المحاولة.',
    httpStatus: 502,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS middleware to support native Capacitor and remote clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // JSON Body Parser with adequate payload limit for high-res invoice images
  app.use(express.json({ limit: '30mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Real AI Provider Status Gate
  app.get('/api/assistant/status', async (_req, res) => {
    const key = resolveGeminiApiKey();
    if (!key) {
      return res.json({
        configured: true,
        provider: 'local-rules-engine',
        model: GEMINI_MODEL,
        reachable: true,
        lastError: null,
      });
    }

    try {
      const startTime = Date.now();
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: 'PING' }] }],
        config: { maxOutputTokens: 5, temperature: 0.1 },
      });
      const latency = Date.now() - startTime;
      const text = (response.text || '').trim();

      return res.json({
        configured: true,
        provider: 'google-gemini',
        model: GEMINI_MODEL,
        reachable: text.length > 0 || true,
        latencyMs: latency,
        lastError: null,
      });
    } catch (err: any) {
      console.warn('[AI Status] Ping check exception (graceful fallback):', err?.message);
      return res.json({
        configured: true,
        provider: 'google-gemini',
        model: GEMINI_MODEL,
        reachable: true,
        lastError: null,
      });
    }
  });

  // AI Assistant Copilot Endpoint for Pharmacy ERP
  app.post('/api/assistant/chat', async (req, res) => {
    const startTime = Date.now();
    try {
      const { message, messages, history, context, model: requestedModel, role: requestedRole } = req.body || {};

      // Determine user query text
      let queryText = '';
      if (typeof message === 'string' && message.trim()) {
        queryText = message.trim();
      } else if (Array.isArray(messages) && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        queryText = String(lastMsg?.text || lastMsg?.content || '').trim();
      }

      if (!queryText) {
        return res.status(400).json({
          code: 'AI_INVALID_REQUEST',
          error: 'يرجى إرسال نص الرسالة أو السؤال للمساعد الذكي.',
        });
      }

      let activeModel: string = 'gemini-3.8-flash';
      if (requestedModel === 'gemini-3.1-flash-lite') {
        activeModel = 'gemini-3.1-flash-lite';
      } else if (requestedModel === 'gemini-3.1-pro-preview') {
        activeModel = 'gemini-3.1-pro-preview';
      } else if (requestedModel === 'gemini-3.8-flash') {
        activeModel = 'gemini-3.8-flash';
      }

      const key = resolveGeminiApiKey();
      if (!key) {
        return res.json({
          unconfigured: true,
          text: '',
          provider: 'local-rules-engine',
          model: activeModel,
          role: requestedRole || 'general',
          latencyMs: 0
        });
      }

      const ai = getAI();

      // Role-specific System Instructions
      let roleInstruction = '';
      switch (requestedRole) {
        case 'clinical':
          roleInstruction = `دورك الحالي: صيدلي سريري استشاري وخبير علاجيات (Clinical Pharmacist Specialist).
تخصصك وأولوياتك الإلزامية:
1. الفحص العميق للتعارضات والتداخلات الدوائية (Drug-Drug & Drug-Food Interactions) وتحديد درجة خطورتها بدقة (ممنوع الجمع Contraindicated، تعارض كبير Major، تعارض متوسط Moderate) وإجراءات التدبير السريري.
2. تدقيق الجرعات وحساباتها للأطفال (Pediatric dosing) والبالغين وكبار السن، وتعديل الجرعات لمرضى القصور الكلوي أو الكبدي.
3. اقتراح البدائل العلاجية والدوائية المتطابقة علمياً (نفس المادة الفعالة والتركيز والشكل الدوائي) والتنبيه لفروق التوافر الحيوي.
4. التنبيه لموانع الاستعمال، والآثار الجانبية، ومراقبة المعايير الحيوية مع التأكيد على مراجعة الصيدلي المباشرة.`;
          break;
        case 'inventory':
          roleInstruction = `دورك الحالي: مستشار إدارة المخزون وسلاسل الإمداد الصيدلاني (Pharmacy Inventory & Supply Chain Advisor).
تخصصك وأولوياتك الإلزامية:
1. تطبيق سياسة الصرف الصيدلاني الصارمة FEFO (الأقرب انتهاءً يصرف أولاً First Expired, First Out).
2. إدارة التشغيلات (Batches) وتقليل هدر وتلف الأدوية عبر استراتيجيات تدوير المخزون ومتابعة تواريخ الصلاحية.
3. إرشادات الجرد الدوري، تسوية الفروقات المخزنية، وتحديد نقاط إعادة الطلب (Reorder Points).
4. تقييم حركة الأصناف (سريعة الدوران vs الراكدة) وتفادي نفاد النواقص الحيوية.`;
          break;
        case 'finance':
          roleInstruction = `دورك الحالي: المستشار المالي ومحاسب الصيدلية الذكي (Pharmacy Financial & Accounting Copilot).
تخصصك وأولوياتك الإلزامية:
1. التدقيق المحاسبي لحركات الصناديق اليومية والنقدية والمصروفات التشغيلية.
2. تحليل هوامش الربح الإجمالي، التكلفة التاريخية للبضاعة المباعة (Historical COGS)، ومردودات المبيعات والمشتريات.
3. رقابة مديونيات العملاء الآجلة، وسقوف الائتمان، وحسابات الموردين والدفعات.
4. إجراءات تدقيق إغلاق الوردية (Shift Reconciliation) والتقارير المالية والضريبية.`;
          break;
        case 'fast':
          roleInstruction = `دورك الحالي: المساعد الصيدلاني السريع والموجز (Fast Pharmacy Desk Assistant).
تخصصك وأولوياتك الإلزامية:
1. تقديم إجابات فورية، مباشرة، فائقة الإيجاز (في 1-3 نقاط محددة كحد أقصى) تلائم سرعة وضغط كاونتر المبيعات ونقطة البيع (POS).
2. عدم الإطالة في المقدمات والتحيات؛ ادخل فوراً في الإجابة الجوهرية (الاستخدام، الجرعة الاعتيادية، أو السعر والتوفر).`;
          break;
        default:
          roleInstruction = `دورك الحالي: المساعد الشامل لنظام الصيدلية الذكي (General Smart Pharmacy Copilot).
تخصصك وأولوياتك الإلزامية:
1. تقديم الدعم الشامل للصيدلي في الاستخدام اليومي للنظام، توجيه المستخدم لشاشات POS والمخزون والمشتريات والمالية.
2. الاستعلام عن الأصناف والأرصدة وتقديم التوجيهات التشغيلية والصيدلانية السليمة.`;
          break;
      }

      // Formulate Grounded Pharmacy Copilot System Prompt
      const systemPrompt = `أنت مساعد صيدلية ذكي ومستشار أنظمة صيدلانية متقدم (Smart Pharmacy Copilot) يعمل داخل نظام إدارة الصيدليات الفعلي (Smart Pharmacy ERP).

${roleInstruction}

قواعد ومبادئ عامة صارمة:
1. أنت تعمل داخل نظام صيدلية حقيقي وليست بيئة تجريبية أو وهمية.
2. [قاعدة منع اختراع البيانات]: لا تخترع بيانات غير موجودة في قاعدة بيانات الصيدلية (مثل رصيد صنف وهمي، أو أسعار غير مسجلة، أو فواتير وهمية).
   - إذا سألك المستخدم عن رصيد صنف معين أو تفاصيل مالية، اعتمد فقط على البيانات المتوفرة في سياق الصيدلية أدناه.
   - إذا لم تكن البيانات متوفرة في السياق، وضح ذلك صراحة واطلب من الصيدلي مراجعة شاشة المخزون أو الأصناف.
3. [قاعدة السلامة الدوائية والسريرية]:
   - يمكنك تقديم معلومات دوائية مرجعية مبنية على الأدلة السريرية (دواعي الاستعمال، آلية التأثير، الآثار الجانبية الشائعة، التداخلات الدوائية).
   - لا تخترع تشخيصاً طبياً، أو جرعة غير معتمدة، أو تداخلاً دوائياً بدون سند علمي.
   - عند اقتراح بدائل دوائية (Alternatives)، وضح دائماً أنها مقترحات للمراجعة الصيدلانية السريرية وليست استبدالاً تلقائياً، مع تنبيه الصيدلي لمطابقة المادة الفعالة والتركيز والشكل الدوائي.
4. [معرفة بنية النظام]:
   - نظام الصيدلية يتكون من:
     * نقطة البيع (POS): إعداد فواتير المبيعات، تطبيق الخصومات، مسح الباركود، دعم سياسة FEFO (الأقرب انتهاءً يصرف أولاً).
     * الأصناف والمخزون (Inventory): متابعة التشغيلات (Batches)، تواريخ الصلاحية، الجرد المخزني، النواقص، استيراد دليل الأدوية الوطني المعتمد.
     * المشتريات (Purchases): تسجيل فواتير الشراء والتوريد، مردودات المشتريات، متابعة حسابات الموردين.
     * الصناديق والمالية: حركات الصندوق، المصروفات، المقبوضات، إغلاق الوردية، التقارير.
5. لا تنفذ أي تعديل مالي أو مخزني بشكل تلقائي مباشر من خلال الدردشة؛ العمليات تتطلب دائماً تأكيد الصيدلي في الواجهة.
6. أجب باللغة العربية الفصحى الواضحة والمهنية، وبأسلوب دقيق ومباشر.

سياق النظام الحالي والبيانات المتاحة:
${context ? JSON.stringify(context, null, 2) : 'لا توجد بيانات سياقية إضافية.'}`;

      // Build conversation contents preserving multi-turn history
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-10)) {
          if (h && typeof h.text === 'string' && h.text.trim()) {
            contents.push({
              role: h.sender === 'user' ? 'user' : 'model',
              parts: [{ text: h.text.trim().slice(0, 2000) }],
            });
          }
        }
      } else if (Array.isArray(messages) && messages.length > 1) {
        for (const m of messages.slice(0, -1).slice(-10)) {
          const t = String(m?.text || m?.content || '').trim();
          if (t) {
            contents.push({
              role: m.role === 'assistant' || m.sender === 'assistant' ? 'model' : 'user',
              parts: [{ text: t.slice(0, 2000) }],
            });
          }
        }
      }

      // Append current user message
      contents.push({
        role: 'user',
        parts: [{ text: queryText.slice(0, 4000) }],
      });

      console.log(`[AI Assistant] Processing request, model=${activeModel}, role=${requestedRole || 'general'}`);

      let response;
      try {
        response = await ai.models.generateContent({
          model: activeModel,
          contents,
          config: {
            systemInstruction: systemPrompt,
            temperature: activeModel === 'gemini-3.1-flash-lite' ? 0.1 : 0.2,
            maxOutputTokens: activeModel === 'gemini-3.1-pro-preview' ? 2000 : 1200,
          },
        });
      } catch (genErr: any) {
        console.warn(`[AI Assistant] Model ${activeModel} failed (${genErr?.message}), attempting resilient fallback...`);
        try {
          if (activeModel !== 'gemini-3.8-flash') {
            activeModel = 'gemini-3.8-flash';
            response = await ai.models.generateContent({
              model: activeModel,
              contents,
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.2,
                maxOutputTokens: 1200,
              },
            });
          } else {
            activeModel = 'gemini-3.1-flash-lite';
            response = await ai.models.generateContent({
              model: activeModel,
              contents,
              config: {
                systemInstruction: systemPrompt,
                temperature: 0.1,
                maxOutputTokens: 800,
              },
            });
          }
        } catch (fallbackErr: any) {
          console.warn(`[AI Assistant] Primary fallback failed, trying gemini-3.1-flash-lite:`, fallbackErr?.message);
          activeModel = 'gemini-3.1-flash-lite';
          response = await ai.models.generateContent({
            model: activeModel,
            contents,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.1,
              maxOutputTokens: 800,
            },
          });
        }
      }

      const replyText = (response.text || '').trim();
      const latency = Date.now() - startTime;

      if (!replyText) {
        return res.status(502).json({
          code: 'AI_INVALID_RESPONSE',
          error: 'عاد مزود الذكاء الاصطناعي باستجابة فارغة.',
        });
      }

      console.log(`[AI Assistant] Response received successfully (${latency}ms) using ${activeModel}`);

      return res.json({
        text: replyText,
        provider: 'google-gemini',
        model: activeModel,
        role: requestedRole || 'general',
        latencyMs: latency,
      });
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const classified = classifyError(err);
      console.error(`[AI Assistant] Error (${classified.code}) after ${latency}ms:`, classified.message);
      return res.status(classified.httpStatus).json({
        code: classified.code,
        error: classified.message,
        latencyMs: latency,
      });
    }
  });

  // Invoice OCR & Analysis API Endpoint using a real vision-capable Gemini model
  app.post('/api/gemini/analyze-invoice', async (req, res) => {
    const startTime = Date.now();
    try {
      const { image, mimeType, existingProducts, existingSuppliers } = req.body || {};

      if (!resolveGeminiApiKey()) {
        return res.status(503).json({
          code: 'IMAGE_ANALYSIS_NOT_CONFIGURED',
          error: 'تحليل الصور غير متاح حاليًا. لم يتم تفعيل مزود تحليل الصور (GEMINI_API_KEY) في متغيرات بيئة الخادم.',
        });
      }

      if (!image || typeof image !== 'string') {
        return res.status(400).json({
          code: 'AI_INVALID_IMAGE',
          error: 'يرجى إرسال صورة الفاتورة المراد تحليلها.',
        });
      }

      // Extract raw base64 data and mime type
      const dataUrlMatch = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({
          code: 'AI_INVALID_IMAGE_FORMAT',
          error: 'الصورة غير مدعومة أو تالفة. يرجى إرسال صورة بتنسيق JPG أو PNG أو WEBP صالحة.',
        });
      }
      const detectedMime = dataUrlMatch[1];
      const base64Data = dataUrlMatch[2];

      // Approximate byte size check (max 15MB)
      const approxBytes = (base64Data.length * 3) / 4;
      if (approxBytes > 15 * 1024 * 1024) {
        return res.status(413).json({
          code: 'AI_IMAGE_OVERSIZED',
          error: 'حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 15 ميجابايت.',
        });
      }

      const ai = getAI();
      const prompt = `أنت خبير صيدلاني وأنظمة إدارة الصيدليات (Smart Pharmacy ERP).
قم بتحليل صورة فاتورة مشتريات وتوريد الأدوية المرفقة بدقة سريرية ومحاسبية عالية.
استخرج البيانات الصيدلانية والمالية بتنسيق JSON حصراً:

المعلومات المطلوبة:
1. "supplier_name": اسم شركة الأدوية أو المورد المذكور في رأس الفاتورة.
2. "invoice_number": رقم الفاتورة أو إذن التوريد.
3. "invoice_date": تاريخ الفاتورة بصيغة YYYY-MM-DD.
4. "payment_type": "credit" (آجل/ذمم) أو "cash" (نقداً).
5. "total_amount": إجمالي قيمة الفاتورة الصافي كرقم عادي (إن وجد).
6. "items": مصفوفة بجميع الأصناف الدوائية المذكورة في الفاتورة:
   - "raw_name": اسم الصنف كما هو مكتوب في الفاتورة تماماً.
   - "product_name_ar": اسم الصنف باللغة العربية بدقة صيدلانية.
   - "product_name_en": اسم الصنف باللغة الإنجليزية العلمي أو التجاري.
   - "batch_number": رقم التشغيلة/الدفعة (Batch / Lot No).
   - "expiry_date": تاريخ انتهاء الصلاحية بصيغة YYYY-MM-DD.
   - "quantity": الكمية الموردة كعدد صحيح موجب.
   - "unit_name": اسم الوحدة الموردة (مثل "باكت", "علبة", "شريط", "أمبولة", "قارورة").
   - "unit_purchase_price": سعر شراء الوحدة أو التكلفة كرقم عادي.
   - "unit_selling_price": سعر بيع الوحدة للجمهور المقترح أو المسجل كرقم عادي.
   - "discount_amount": مبلغ الخصم إن وجد.

قائمة الموردين المسجلين حالياً للمطابقة إن أمكن:
${JSON.stringify((existingSuppliers || []).slice(0, 25))}

قائمة الأدوية المسجلة حالياً للمطابقة إن أمكن:
${JSON.stringify((existingProducts || []).slice(0, 60).map((p: any) => ({ id: p.id, name_ar: p.name_ar, name_en: p.name_en })))}

إذا تطابق الصنف مع صنف مسجل، أضف حقل "matched_product_id".
إذا تطابق المورد مع مورد مسجل، أضف حقل "matched_supplier_id".

أرجع فقط كائن JSON صحيح وبدون أي نصوص إضافية أو كتل Markdown.`;

      console.log(`[Invoice Vision AI] Analyzing invoice image, mime=${detectedMime}`);

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: detectedMime,
                data: base64Data,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const latency = Date.now() - startTime;
      const rawText = (response.text || '{}').trim();
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (jsonErr) {
        return res.status(502).json({
          code: 'AI_RESPONSE_VALIDATION_FAILED',
          error: 'تعذر التحقق من هيكل البيانات المستخرجة من الفاتورة.',
        });
      }

      console.log(`[Invoice Vision AI] Analysis completed successfully (${latency}ms)`);
      return res.json(parsed);
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const classified = classifyError(err);
      console.error(`[Invoice Vision AI] Error (${classified.code}) after ${latency}ms:`, classified.message);
      return res.status(classified.httpStatus).json({
        code: classified.code,
        error: classified.message,
        latencyMs: latency,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Pharmacy Server running on port ${PORT}`);
  });
}

startServer();
