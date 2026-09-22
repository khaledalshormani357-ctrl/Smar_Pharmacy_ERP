/**
 * Centralized Typography & Bidirectional System for Smart Pharmacy ERP
 * Matches the reference application typography characteristics:
 * - Primary Arabic: Cairo (Geometry, balance, high legibility in dense tables)
 * - Primary Latin: Inter / system-ui (Clean, modern, crisp)
 * - Monospace & Numeric: JetBrains Mono / tabular-nums (Fixed-width numeric alignment, clear decimal/barcode reading)
 */

export const TYPOGRAPHY = {
  fontFamily: {
    arabic: "'Cairo', 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif",
    latin: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    numeric: "'JetBrains Mono', 'Roboto Mono', 'SF Mono', Consolas, monospace",
    code: "'JetBrains Mono', monospace",
  },
  fontSize: {
    '2xs': 'text-[10px] leading-[14px]',
    xs: 'text-xs leading-4',         // 12px
    sm: 'text-sm leading-5',         // 14px
    base: 'text-base leading-6',     // 16px (minimum body baseline)
    lg: 'text-lg leading-7',         // 18px
    xl: 'text-xl leading-7',         // 20px
    '2xl': 'text-2xl leading-8',     // 24px
    '3xl': 'text-3xl leading-9',     // 30px
  },
  fontWeight: {
    regular: 'font-normal',          // 400
    medium: 'font-medium',           // 500
    semibold: 'font-semibold',       // 600
    bold: 'font-bold',               // 700
    black: 'font-black',             // 800-900
  },
  letterSpacing: {
    tighter: 'tracking-tighter',
    tight: 'tracking-tight',
    normal: 'tracking-normal',
    wide: 'tracking-wide',
  },
} as const;

/**
 * Wraps Latin terms or identifiers (e.g. Barcode, SKU, POS, ERP, API)
 * in Unicode Bidirectional Isolation (<bdi> or LTR span) to prevent RTL glyph flipping
 */
export function formatBidiCode(text: string | number): string {
  return String(text);
}

/**
 * Normalizes Eastern Arabic (٠١٢٣٤٥٦٧٨٩) and Persian (۰۱۲۳۴۵۶۷۸۹) digits
 * to standard Western Arabic digits (0123456789)
 */
export function normalizeNumerals(input: string): string {
  if (!input) return '';
  return input
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

/**
 * Format decimal values cleanly with fixed fraction digits
 */
export function formatDecimal(val: number, decimals: number = 2): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
