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

// Lazy initialization for Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY_MISSING');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'smart-pharmacy-erp',
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

  if (errMsg.includes('GEMINI_API_KEY_MISSING') || !process.env.GEMINI_API_KEY) {
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

  // JSON Body Parser with adequate payload limit for high-res invoice images
  app.use(express.json({ limit: '30mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Real AI Provider Status Gate
  app.get('/api/assistant/status', async (_req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
    if (!hasKey) {
      return res.json({
        configured: false,
        provider: 'google-gemini',
        model: GEMINI_MODEL,
        reachable: false,
        lastError: 'AI_NOT_CONFIGURED: مفتاح GEMINI_API_KEY غير مهيأ في متغيرات بيئة الخادم.',
      });
    }

    try {
      const startTime = Date.now();
      const ai = getAI();
      // Fast lightweight ping
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
        reachable: text.length > 0,
        latencyMs: latency,
        lastError: null,
      });
    } catch (err: any) {
      const classified = classifyError(err);
      return res.json({
        configured: true,
        provider: 'google-gemini',
        model: GEMINI_MODEL,
        reachable: false,
        lastError: `${classified.code}: ${classified.message}`,
      });
    }
  });

  // AI Assistant Copilot Endpoint for Pharmacy ERP
  app.post('/api/assistant/chat', async (req, res) => {
    const startTime = Date.now();
    try {
      const { message, messages, history, context } = req.body || {};

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

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          code: 'AI_NOT_CONFIGURED',
          error: 'المساعد الذكي غير مُهيأ بعد. يرجى إعداد مفتاح API الخاص بخدمة الذكاء الاصطناعي (GEMINI_API_KEY) في متغيرات بيئة الخادم.',
        });
      }

      const ai = getAI();

      // Formulate Grounded Pharmacy Copilot System Prompt
      const systemPrompt = `أنت مساعد صيدلية ذكي ومستشار أنظمة صيدلانية متقدم (Smart Pharmacy Copilot) يعمل داخل نظام إدارة الصيدليات الفعلي (Smart Pharmacy ERP).

قواعد ومبادئ إلزامية:
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
6. أجب باللغة العربية الفصحى الواضحة والمهنية، وبأسلوب دقيق ومختصر ومباشر.

سياق النظام الحالي والبيانات المتاحة:
${context ? JSON.stringify(context, null, 2) : 'لا توجد بيانات سياقية إضافية.'}`;

      // Build conversation contents
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-8)) {
          if (h && typeof h.text === 'string' && h.text.trim()) {
            contents.push({
              role: h.sender === 'user' ? 'user' : 'model',
              parts: [{ text: h.text.trim().slice(0, 2000) }],
            });
          }
        }
      } else if (Array.isArray(messages) && messages.length > 1) {
        for (const m of messages.slice(0, -1).slice(-8)) {
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

      console.log(`[AI Assistant] Processing request, model=${GEMINI_MODEL}`);

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
          maxOutputTokens: 1200,
        },
      });

      const replyText = (response.text || '').trim();
      const latency = Date.now() - startTime;

      if (!replyText) {
        return res.status(502).json({
          code: 'AI_INVALID_RESPONSE',
          error: 'عاد مزود الذكاء الاصطناعي باستجابة فارغة.',
        });
      }

      console.log(`[AI Assistant] Response received successfully (${latency}ms)`);

      return res.json({
        text: replyText,
        provider: 'google-gemini',
        model: GEMINI_MODEL,
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

      if (!process.env.GEMINI_API_KEY) {
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
