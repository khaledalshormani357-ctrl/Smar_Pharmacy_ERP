// Pure TypeScript Arabic Reshaper & BiDi algorithm for PDF rendering
// Converts logical Arabic strings into visual presentation forms (Unicode Arabic Presentation Forms-B: 0xFE80 - 0xFEFC)
// Handles letter connecting rules (isolated, initial, medial, final) and Lam-Alef ligatures.

interface GlyphForms {
  isolated: number;
  initial?: number;
  medial?: number;
  final?: number;
}

// Arabic characters to Presentation Forms-B mapping
const ARABIC_GLYPH_TABLE: Record<number, GlyphForms> = {
  0x0621: { isolated: 0xFE80 }, // Hamza
  0x0622: { isolated: 0xFE81, final: 0xFE82 }, // Alef with Madda Above
  0x0623: { isolated: 0xFE83, final: 0xFE84 }, // Alef with Hamza Above
  0x0624: { isolated: 0xFE85, final: 0xFE86 }, // Waw with Hamza Above
  0x0625: { isolated: 0xFE87, final: 0xFE88 }, // Alef with Hamza Below
  0x0626: { isolated: 0xFE89, final: 0xFE8A, initial: 0xFE8B, medial: 0xFE8C }, // Yeh with Hamza Above
  0x0627: { isolated: 0xFE8D, final: 0xFE8E }, // Alef
  0x0628: { isolated: 0xFE8F, final: 0xFE90, initial: 0xFE91, medial: 0xFE92 }, // Beh
  0x0629: { isolated: 0xFE93, final: 0xFE94 }, // Teh Marbuta
  0x062A: { isolated: 0xFE95, final: 0xFE96, initial: 0xFE97, medial: 0xFE98 }, // Teh
  0x062B: { isolated: 0xFE99, final: 0xFE9A, initial: 0xFE9B, medial: 0xFE9C }, // Theh
  0x062C: { isolated: 0xFE9D, final: 0xFE9E, initial: 0xFE9F, medial: 0xFEA0 }, // Jeem
  0x062D: { isolated: 0xFEA1, final: 0xFEA2, initial: 0xFEA3, medial: 0xFEA4 }, // Hah
  0x062E: { isolated: 0xFEA5, final: 0xFEA6, initial: 0xFEA7, medial: 0xFEA8 }, // Khah
  0x062F: { isolated: 0xFEA9, final: 0xFEAA }, // Dal
  0x0630: { isolated: 0xFEAB, final: 0xFEAC }, // Thal
  0x0631: { isolated: 0xFEAD, final: 0xFEAE }, // Reh
  0x0632: { isolated: 0xFEAF, final: 0xFEB0 }, // Zain
  0x0633: { isolated: 0xFEB1, final: 0xFEB2, initial: 0xFEB3, medial: 0xFEB4 }, // Seen
  0x0634: { isolated: 0xFEB5, final: 0xFEB6, initial: 0xFEB7, medial: 0xFEB8 }, // Sheen
  0x0635: { isolated: 0xFEB9, final: 0xFEBA, initial: 0xFEBB, medial: 0xFEBC }, // Sad
  0x0636: { isolated: 0xFEBD, final: 0xFEBE, initial: 0xFEBF, medial: 0xFEC0 }, // Dad
  0x0637: { isolated: 0xFEC1, final: 0xFEC2, initial: 0xFEC3, medial: 0xFEC4 }, // Tah
  0x0638: { isolated: 0xFEC5, final: 0xFEC6, initial: 0xFEC7, medial: 0xFEC8 }, // Zah
  0x0639: { isolated: 0xFEC9, final: 0xFECA, initial: 0xFECB, medial: 0xFECC }, // Ain
  0x063A: { isolated: 0xFECD, final: 0xFECE, initial: 0xFECF, medial: 0xFED0 }, // Ghain
  0x0641: { isolated: 0xFED1, final: 0xFED2, initial: 0xFED3, medial: 0xFED4 }, // Feh
  0x0642: { isolated: 0xFED5, final: 0xFED6, initial: 0xFED7, medial: 0xFED8 }, // Qaf
  0x0643: { isolated: 0xFED9, final: 0xFEDA, initial: 0xFEDB, medial: 0xFEDC }, // Kaf
  0x0644: { isolated: 0xFEDD, final: 0xFEDE, initial: 0xFEDF, medial: 0xFEE0 }, // Lam
  0x0645: { isolated: 0xFEE1, final: 0xFEE2, initial: 0xFEE3, medial: 0xFEE4 }, // Meem
  0x0646: { isolated: 0xFEE5, final: 0xFEE6, initial: 0xFEE7, medial: 0xFEE8 }, // Noon
  0x0647: { isolated: 0xFEE9, final: 0xFEEA, initial: 0xFEEB, medial: 0xFEEC }, // Heh
  0x0648: { isolated: 0xFEED, final: 0xFEEE }, // Waw
  0x0649: { isolated: 0xFEEF, final: 0xFEF0 }, // Alef Maksura
  0x064A: { isolated: 0xFEF1, final: 0xFEF2, initial: 0xFEF3, medial: 0xFEF4 }  // Yeh
};

// Lam-Alef ligatures
const LAM_ALEF_MAP: Record<number, { isolated: number; final: number }> = {
  0x0622: { isolated: 0xFEF5, final: 0xFEF6 }, // Lam + Alef with Madda
  0x0623: { isolated: 0xFEF7, final: 0xFEF8 }, // Lam + Alef with Hamza Above
  0x0625: { isolated: 0xFEF9, final: 0xFEFA }, // Lam + Alef with Hamza Below
  0x0627: { isolated: 0xFEFB, final: 0xFEFC }  // Lam + Alef Plain
};

function connectsToNext(code: number): boolean {
  const forms = ARABIC_GLYPH_TABLE[code];
  return !!forms && (forms.initial !== undefined || forms.medial !== undefined);
}

function connectsToPrev(code: number): boolean {
  const forms = ARABIC_GLYPH_TABLE[code];
  return !!forms && (forms.final !== undefined || forms.medial !== undefined);
}

function isArabic(code: number): boolean {
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

/**
 * Shapes an Arabic string into its connected contextual glyphs.
 */
export function shapeArabic(text: string): string {
  if (!text) return '';

  const chars: number[] = [];
  for (let i = 0; i < text.length; i++) {
    chars.push(text.charCodeAt(i));
  }

  const result: number[] = [];

  for (let i = 0; i < chars.length; i++) {
    const current = chars[i];

    // Check Lam-Alef ligatures
    if (current === 0x0644 && i + 1 < chars.length && LAM_ALEF_MAP[chars[i + 1]]) {
      const alef = chars[i + 1];
      const lig = LAM_ALEF_MAP[alef];
      const prev = i > 0 ? chars[i - 1] : 0;
      const prevConnects = connectsToNext(prev);

      result.push(prevConnects ? lig.final : lig.isolated);
      i++; // skip alef
      continue;
    }

    const forms = ARABIC_GLYPH_TABLE[current];
    if (!forms) {
      result.push(current);
      continue;
    }

    const prev = i > 0 ? chars[i - 1] : 0;
    const next = i + 1 < chars.length ? chars[i + 1] : 0;

    const prevConnected = connectsToNext(prev);
    const nextConnected = connectsToPrev(next);

    if (prevConnected && nextConnected && forms.medial !== undefined) {
      result.push(forms.medial);
    } else if (prevConnected && forms.final !== undefined) {
      result.push(forms.final);
    } else if (nextConnected && forms.initial !== undefined) {
      result.push(forms.initial);
    } else {
      result.push(forms.isolated);
    }
  }

  return String.fromCharCode(...result);
}

import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

/**
 * BiDi reversal: Takes shaped text and applies Unicode Bidirectional Algorithm (UBA)
 * so that the final string prints correctly when drawn in PDF engines.
 */
export function processBidiForPdf(text: string): string {
  if (!text) return '';
  const shaped = shapeArabic(text);
  const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
  return bidi.getReorderedString(shaped, levels);
}

export class ArabicShaper {
  static shape(text: string): string {
    return shapeArabic(text);
  }

  static processText(text: string): string {
    return processBidiForPdf(text);
  }
}

