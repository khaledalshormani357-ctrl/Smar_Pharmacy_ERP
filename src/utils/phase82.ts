export const MAX_ANALYSIS_IMAGE_BYTES = 15 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function normalizeNumericText(value: string): string {
  return value
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9')
    .replace(/[،,]/g, '.');
}

export function isValidNumericDraft(value: string, allowDecimals: boolean): boolean {
  return (allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/).test(value);
}

export function validateAnalysisImage(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (!file.type || !SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return 'الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.';
  }
  if (file.size <= 0) {
    return 'تعذر تحميل الصورة.';
  }
  if (file.size > MAX_ANALYSIS_IMAGE_BYTES) {
    return 'حجم الصورة كبير جدًا. الحد الأقصى 15 ميجابايت.';
  }
  return null;
}

export type OcrErrorCode =
  | 'IMAGE_INVALID'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_READ_FAILED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'AUTH_ERROR'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMIT'
  | 'INVALID_AI_RESPONSE'
  | 'JSON_PARSE_ERROR'
  | 'NO_ITEMS_DETECTED'
  | 'UNKNOWN_ERROR';

export const OCR_ERROR_MESSAGES: Record<OcrErrorCode, string> = {
  IMAGE_INVALID: 'الصورة غير مدعومة أو تالفة. يرجى اختيار صورة JPG أو PNG أو WEBP صالحة.',
  IMAGE_TOO_LARGE: 'حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 15 ميجابايت.',
  IMAGE_READ_FAILED: 'تعذر قراءة ملف الصورة. تأكد من سلامة الملف وحاول مرة أخرى.',
  NETWORK_ERROR: 'تعذر الاتصال بخدمة تحليل الصور. يرجى التحقق من اتصال الإنترنت وحاول ثانية.',
  TIMEOUT: 'انتهت مهلة تحليل الصورة (90 ثانية). تحقق من سرعة الاتصال وحاول مرة أخرى.',
  AUTH_ERROR: 'لم يتم تفعيل صلاحيات مزود تحليل الصور أو أن المفتاح غير صالح.',
  PROVIDER_ERROR: 'مزود الذكاء الاصطناعي يواجه ضغطاً مؤقتاً. يرجى إعادة المحاولة بعد لحظات.',
  RATE_LIMIT: 'تم تجاوز الحد المسموح للاستخدام لدى مزود الذكاء الاصطناعي. يرجى الانتظار قليلاً.',
  INVALID_AI_RESPONSE: 'عاد مزود تحليل الصور باستجابة غير صالحة. يرجى إعادة المحاولة.',
  JSON_PARSE_ERROR: 'تعذر استخراج هيكل البيانات من استجابة الفاتورة. يرجى إعادة المحاولة.',
  NO_ITEMS_DETECTED: 'لم يتم اكتشاف أية أصناف أو بيانات قابلة للقراءة في الفاتورة. تأكد من وضوح الصورة.',
  UNKNOWN_ERROR: 'تعذر إتمام تحليل الفاتورة حالياً. يرجى إعادة المحاولة أو التحقق من وضوح الصورة.'
};

export function classifyImageAnalysisError(error: unknown): string {
  const code = (error as any)?.code;
  if (code && typeof code === 'string' && (OCR_ERROR_MESSAGES as any)[code]) {
    return (OCR_ERROR_MESSAGES as any)[code];
  }

  const message = error instanceof Error ? error.message : String(error || '');
  if (message === 'TIMEOUT' || /timeout|deadline|timed out/i.test(message)) {
    return OCR_ERROR_MESSAGES.TIMEOUT;
  }
  if (message === 'OFFLINE' || /network|failed to fetch|offline|econnrefused|enotfound/i.test(message)) {
    return OCR_ERROR_MESSAGES.NETWORK_ERROR;
  }
  if (/auth|unauthorized|forbidden|api[ _-]?key|401|403/i.test(message)) {
    return OCR_ERROR_MESSAGES.AUTH_ERROR;
  }
  if (/quota|rate[ _-]?limit|429/i.test(message)) {
    return OCR_ERROR_MESSAGES.RATE_LIMIT;
  }
  if (/no.*items|أصناف قابلة للقراءة/i.test(message)) {
    return OCR_ERROR_MESSAGES.NO_ITEMS_DETECTED;
  }
  if (/json|parse|syntaxerror/i.test(message)) {
    return OCR_ERROR_MESSAGES.JSON_PARSE_ERROR;
  }
  if (/unsupported|image.*support|غير مدعومة/i.test(message)) {
    return OCR_ERROR_MESSAGES.IMAGE_INVALID;
  }
  if (/oversized|large|15\s*mb|كبير/i.test(message)) {
    return OCR_ERROR_MESSAGES.IMAGE_TOO_LARGE;
  }
  if (/invalid|decode|load|read/i.test(message)) {
    return OCR_ERROR_MESSAGES.IMAGE_READ_FAILED;
  }
  if (/unavailable|503|502|high demand/i.test(message)) {
    return OCR_ERROR_MESSAGES.PROVIDER_ERROR;
  }

  // If already in meaningful Arabic from server
  if (/[\u0600-\u06FF]/.test(message) && message.length > 10) {
    return message;
  }

  return OCR_ERROR_MESSAGES.UNKNOWN_ERROR;
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.onabort = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
        reject(new Error('IMAGE_INVALID'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}
