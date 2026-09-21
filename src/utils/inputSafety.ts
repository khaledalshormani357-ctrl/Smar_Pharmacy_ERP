// Comprehensive Input Safety and Normalization Utilities for Smart Pharmacy ERP
// Solves Android WebView Backspace / Delete / Composition / Arabic-Persian Numeral synchronization defects

/**
 * Maps Arabic and Persian numerals to standard Latin digits,
 * and normalizes Arabic comma/decimal marks to standard periods.
 */
export function normalizeInputText(raw: string): string {
  if (!raw) return '';
  return raw
    // Arabic numerals ٠-٩
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    // Persian numerals ۰-۹
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    // Arabic decimal separator ٫ and Arabic comma ،
    .replace(/[\u066B\u060C]/g, '.')
    // Non-breaking spaces and zero-width spaces
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
}

/**
 * Cleans a numeric draft while user is actively typing.
 * Preserves incomplete valid states like "", "-", "0.", "12."
 */
export function cleanNumericDraft(text: string, allowDecimals = true): string {
  const normalized = normalizeInputText(text).trim();
  if (!normalized) return '';

  let result = '';
  let hasDecimal = false;
  let hasSign = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '-' && i === 0 && !hasSign) {
      result += '-';
      hasSign = true;
    } else if (char === '.' || char === ',') {
      if (allowDecimals && !hasDecimal) {
        result += '.';
        hasDecimal = true;
      }
    } else if (char >= '0' && char <= '9') {
      result += char;
    }
  }

  return result;
}

/**
 * Safely parses a numeric string into a finite JavaScript number.
 * If draft is incomplete ("", "-", "."), returns the provided fallback (default 0).
 */
export function parseSafeNumber(text: string, fallback = 0): number {
  const cleaned = cleanNumericDraft(text, true);
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return fallback;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Arabic text normalization for search queries (Trade names, Generic names, Ingredients)
 * Normalizes Hamzas, Taa Marbuta, Alif Maqsura, Tashkeel, Tatweel.
 */
export function normalizeArabicSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    // Remove Tashkeel (diacritics)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Tatweel (kashida)
    .replace(/\u0640/g, '')
    // Normalize Hamzas (أ, إ, آ -> ا)
    .replace(/[أإآ]/g, 'ا')
    // Normalize Taa Marbuta (ة -> ه)
    .replace(/ة/g, 'ه')
    // Normalize Alif Maqsura (ى -> ي)
    .replace(/ى/g, 'ي')
    // Normalize Persian Yeh / Waw
    .replace(/ي/g, 'ي')
    .replace(/ك/g, 'ك')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ');
}
