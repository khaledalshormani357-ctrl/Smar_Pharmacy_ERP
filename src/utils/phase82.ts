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

export function classifyImageAnalysisError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message === 'TIMEOUT') return 'انتهت مهلة تحليل الصورة. حاول مرة أخرى.';
  if (message === 'OFFLINE' || /network|failed to fetch|offline/i.test(message)) {
    return 'تعذر الاتصال بخدمة تحليل الصور. تحقق من الاتصال وحاول مرة أخرى.';
  }
  if (/unsupported|image.*support/i.test(message)) return 'تحليل الصور غير متاح لهذا النوع من الصور.';
  if (/invalid|decode|load/i.test(message)) return 'تعذر تحميل الصورة. اختر صورة أخرى.';
  return 'تعذر تحليل الصورة حاليًا. يمكنك إعادة المحاولة أو متابعة العمل النصي.';
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر تحميل الصورة'));
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
        reject(new Error('الصورة غير مدعومة'));
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
