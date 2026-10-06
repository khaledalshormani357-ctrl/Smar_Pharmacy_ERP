export interface Env {
  GEMINI_API_KEY: string;
}

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function extractImage(image: string): { mimeType: string; data: string } {
  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('INVALID_IMAGE_FORMAT');
  return { mimeType: match[1], data: match[2] };
}

async function gemini(env: Env, model: string, contents: unknown[], config?: Record<string, unknown>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: config }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(JSON.stringify(body));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim();
  if (!text) throw new Error('EMPTY_GEMINI_RESPONSE');
  return text;
}

async function geminiWithFallback(env: Env, contents: unknown[], config?: Record<string, unknown>) {
  let lastError: unknown;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      return { text: await gemini(env, model, contents, config), model };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('GEMINI_REQUEST_FAILED');
}

function cleanJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse((match ? match[0] : text).replace(/```json/gi, '').replace(/```/g, '').trim());
}

async function handleOcr(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ code: 'IMAGE_ANALYSIS_NOT_CONFIGURED', error: 'GEMINI_API_KEY غير مضبوط في Cloudflare Secrets.' }, 503);
  const payload: any = await request.json();
  if (typeof payload.image !== 'string') return json({ code: 'INVALID_IMAGE', error: 'صورة الفاتورة مطلوبة.' }, 400);
  const { mimeType, data } = extractImage(payload.image);
  const prompt = `حلل صورة فاتورة صيدلية بدقة. أعد JSON فقط دون Markdown بهذا الهيكل:
{"supplier":"","supplier_name":"","invoice_number":"","invoice_date":"","currency":"YER","payment_type":"credit","subtotal":null,"discount":0,"tax":0,"grand_total":null,"total_amount":null,"confidence_notes":[],"items":[{"trade_name_original":"","raw_name":"","trade_name_ar":"","product_name_ar":"","product_name_en":"","quantity":0,"unit":"","unit_name":"","unit_price":null,"unit_purchase_price":null,"unit_selling_price":null,"total":null,"discount_amount":0,"barcode":"","manufacturer":"","expiry_date":"","batch_number":""}]}
لا تخترع أي قيمة غير ظاهرة؛ اترك الحقول غير المقروءة فارغة أو null، والكمية غير المقروءة 0. استخرج أرقام التشغيلات وتواريخ الانتهاء كما تظهر. تطابق المنتجات مع القائمة إن أمكن دون اختراع بيانات. المنتجات الحالية: ${JSON.stringify(payload.existingProducts || []).slice(0, 12000)}. الموردون الحاليون: ${JSON.stringify(payload.existingSuppliers || []).slice(0, 6000)}`;
  const contents = [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }];
  let result = await geminiWithFallback(env, contents, { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: 'application/json' });
  let parsed: any;
  try {
    parsed = cleanJson(result.text);
  } catch {
    // Some provider responses occasionally ignore JSON mode; retry once with the lightweight model.
    const retry = await gemini(env, FALLBACK_MODEL, contents, { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: 'application/json' });
    result = { text: retry, model: FALLBACK_MODEL };
    parsed = cleanJson(result.text);
  }
  return json({
    supplier: parsed.supplier || parsed.supplier_name || '', supplier_name: parsed.supplier_name || parsed.supplier || '',
    invoice_number: parsed.invoice_number || '', invoice_date: parsed.invoice_date || '', currency: parsed.currency || 'YER',
    payment_type: parsed.payment_type || 'credit', subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : null,
    discount: typeof parsed.discount === 'number' ? parsed.discount : 0, tax: typeof parsed.tax === 'number' ? parsed.tax : 0,
    grand_total: typeof parsed.grand_total === 'number' ? parsed.grand_total : null, total_amount: typeof parsed.total_amount === 'number' ? parsed.total_amount : null,
    confidence_notes: Array.isArray(parsed.confidence_notes) ? parsed.confidence_notes : [], model: result.model,
    items: Array.isArray(parsed.items) ? parsed.items.map((item: any) => ({ ...item, quantity: typeof item.quantity === 'number' ? item.quantity : 0, unit: item.unit || '', unit_name: item.unit_name || item.unit || '', expiry_date: item.expiry_date || '', batch_number: item.batch_number || '' })) : [],
  });
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ code: 'AI_NOT_CONFIGURED', error: 'GEMINI_API_KEY غير مضبوط في Cloudflare Secrets.' }, 503);
  const payload: any = await request.json();
  const message = String(payload.message || '').trim();
  if (!message) return json({ code: 'INVALID_REQUEST', error: 'الرسالة مطلوبة.' }, 400);
  const history = Array.isArray(payload.history) ? payload.history.slice(-10).map((item: any) => ({ role: item.sender === 'user' ? 'user' : 'model', parts: [{ text: String(item.text || '').slice(0, 2000) }] })) : [];
  const result = await geminiWithFallback(env, [...history, { role: 'user', parts: [{ text: `${message}\n\nأجب بالعربية الفصحى. لا تنفذ أي عملية مالية أو مخزنية دون تأكيد صريح.` }] }], { temperature: 0.2, maxOutputTokens: 1200 });
  return json({ text: result.text, provider: 'google-gemini', model: result.model, role: payload.role || 'general' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') return json({ status: 'ok', timestamp: Date.now() });
      if (request.method === 'GET' && url.pathname === '/api/assistant/status') return json({ configured: Boolean(env.GEMINI_API_KEY), provider: 'google-gemini', model: PRIMARY_MODEL, reachable: true });
      if (request.method === 'POST' && url.pathname === '/api/gemini/analyze-invoice') return await handleOcr(request, env);
      if (request.method === 'POST' && url.pathname === '/api/assistant/chat') return await handleChat(request, env);
      return json({ code: 'NOT_FOUND', error: 'المسار غير موجود.' }, 404);
    } catch (error: any) {
      const status = error?.status === 401 || error?.status === 403 ? 401 : error?.status === 429 ? 429 : 502;
      return json({ code: status === 429 ? 'AI_RATE_LIMITED' : status === 401 ? 'AI_UNAUTHORIZED' : 'AI_PROVIDER_ERROR', error: 'تعذر إكمال الطلب لدى مزود الذكاء الاصطناعي.' }, status);
    }
  },
};
