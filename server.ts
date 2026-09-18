import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser with adequate payload limit for high-res invoice images
  app.use(express.json({ limit: '30mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Lazy initialization for Gemini client
  let aiClient: GoogleGenAI | null = null;
  function getAI(): GoogleGenAI {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error('مفتاح GEMINI_API_KEY غير متوفر في متغيرات البيئة.');
      }
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

  // Invoice OCR & Analysis API Endpoint using a vision-capable Gemini model
  app.post('/api/gemini/analyze-invoice', async (req, res) => {
    try {
      const { image, mimeType, existingProducts, existingSuppliers } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: 'يرجى إرسال صورة الفاتورة المراد تحليلها.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: 'تحليل الصور غير متاح حاليًا. لم يتم تفعيل مزود تحليل الصور.' });
      }

      // Extract raw base64 data and mime type
      const dataUrlMatch = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ error: 'الصورة غير مدعومة. أرسل صورة JPG أو PNG أو WEBP.' });
      }
      const base64Data = dataUrlMatch[2];
      let detectedMime = mimeType || 'image/jpeg';
      if (!/^image\/(jpeg|png|webp|gif)$/.test(detectedMime)) detectedMime = dataUrlMatch[1];

      const ai = getAI();
      const prompt = `أنت خبير صيدلاني وأنظمة إدارة الصيدليات (Pharmacy ERP).
قم بتحليل صورة فاتورة مشتريات وتوريد الأدوية المرفقة واستخرج البيانات الصيدلانية والمالية بدقة عالية بتنسيق JSON حصراً:

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
   - "batch_number": رقم التشغيلة/الدفعة (Batch / Lot No). إذا لم يوجد اقترح رمزا مناسبا مثل BN-12345.
   - "expiry_date": تاريخ انتهاء الصلاحية بصيغة YYYY-MM-DD (مثال: 2027-05-31).
   - "quantity": الكمية الموردة كعدد صحيح موجب.
   - "unit_name": اسم الوحدة الموردة (مثل "باكت", "علبة", "شريط", "أمبولة", "قارورة").
   - "unit_purchase_price": سعر شراء الوحدة أو التكلفة كرقم عادي (مثال 2500 أو 120.5).
   - "unit_selling_price": سعر بيع الوحدة للجمهور المقترح أو المسجل كرقم عادي.
   - "discount_amount": مبلغ الخصم إن وجد.

قائمة الموردين المسجلين حالياً للمطابقة إن أمكن:
${JSON.stringify((existingSuppliers || []).slice(0, 25))}

قائمة الأدوية المسجلة حالياً للمطابقة إن أمكن:
${JSON.stringify((existingProducts || []).slice(0, 60).map((p: any) => ({ id: p.id, name_ar: p.name_ar, name_en: p.name_en })))}

إذا كان الصنف يطابق أحد أصناف الصيدلية المذكورة، أضف حقل "matched_product_id" بمعرف الصنف.
إذا كان المورد يطابق أحد موردي الصيدلية، أضف حقل "matched_supplier_id" بمعرف المورد.

أرجع فقط كائن JSON صحيح وبدون أي نصوص إضافية أو كتل Markdown.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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

      const rawText = response.text || '{}';
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return res.json(parsed);
    } catch (err: any) {
      console.error('Invoice Analysis Error:', err);
      return res.status(500).json({
        error: err.message || 'حدث خطأ أثناء معالجة صورة الفاتورة بالذكاء الاصطناعي.',
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
