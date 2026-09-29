// Arabic Catalog Text Repair Utility
// Solves DEFECT 04 / Phase 8.5: Accurate Arabic Reconstruction for Drug Catalog

export const ARABIC_RECONSTRUCTION_MAP: Record<string, string> = {
  '( Bilharziasis ) انجههبسع ٍب': 'البلهارسيا (Bilharziasis)',
  '( E . N . T ) األ َف ٌ وانح ُجشح واألر': 'الأنف والأذن والحنجرة (E.N.T)',
  '( T . B ) ٌ انذس': 'الدرن والسل (T.B)',
  'Analgesic يهذئبد األوجبع وانح ًى': 'مسكنات الأوجاع وخافضات الحمى (Analgesic)',
  'Asthma انشثى ً انشؼج': 'الربو الشعبي (Asthma)',
  // ... (existing map entries preserved)
  'َضالد انجشد': 'نزلات البرد والإنفلونزا'
};

// Normalize Arabic text: unify ALEF forms, TEH MARBUTA, YEH, remove diacritics and control chars
export function normalizeArabic(input: string): string {
  if (!input) return input;
  let s = input;
  // Remove BOM and control characters
  s = s.replace(/\uFEFF/g, '');
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

  // Normalize common Arabic letter variants
  s = s.replace(/[أإآ]/g, 'ا');
  s = s.replace(/ة/g, 'ه'); // keep as heuristic (some corpuses prefer ه for damaged OCR)
  s = s.replace(/[ى]/g, 'ي');
  s = s.replace(/[ٱ]/g, 'ا');
  s = s.replace(/[ؤئ]/g, 'ء');

  // Remove tashkeel (diacritics)
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

  // Normalize punctuation commonly mis-recognized in OCR
  s = s.replace(/[‚‘’‛‘′`]/g, '\'');
  s = s.replace(/[“”«»„]/g, '"');
  s = s.replace(/[ــ]/g, '');

  // Collapse multiple spaces and trim
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Heuristic fixes for frequent OCR corruption patterns (glyph-level)
const OCR_FIXES: Array<[RegExp, string]> = [
  [/\b0\b/g, 'o'],
  [/\b1\b/g, 'l'],
  [/ي\s+ه/g, 'يه'],
  [/ن\s+ج/g, 'نج'],
  [/\(\s*\)/g, ''],
  // Fix common mashups of Latin and Arabic separated by spaces
  [/\s([A-Za-z]{1,3})\s/g, ' $1 '],
];

// Replace known corrupted fragments using the reconstruction map and OCR fixes
export function repairFragments(raw: string): string {
  if (!raw) return raw;
  let s = raw;

  // First apply direct map exact matches
  const exact = ARABIC_RECONSTRUCTION_MAP[s.trim()];
  if (exact) return exact;

  // Then replace any map keys that appear as substrings
  for (const [corrupt, clean] of Object.entries(ARABIC_RECONSTRUCTION_MAP)) {
    if (s.includes(corrupt)) {
      s = s.split(corrupt).join(clean);
    }
  }

  // Apply regex OCR fixes
  for (const [rx, repl] of OCR_FIXES) {
    s = s.replace(rx, repl);
  }

  // Final normalization pass
  s = normalizeArabic(s);

  return s;
}

// Public utility: reconstruct Arabic text with multiple heuristics and map-based fixes
export function reconstructArabicText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Quick path: if exact map hit
  if (ARABIC_RECONSTRUCTION_MAP[trimmed]) {
    return ARABIC_RECONSTRUCTION_MAP[trimmed];
  }

  // Replace obvious corrupted sequences then normalize
  let result = trimmed;
  result = repairFragments(result);

  // If result still contains many non-Arabic letters, attempt to isolate Arabic substrings
  const arabicLetters = result.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g);
  if (arabicLetters && arabicLetters.length > 0) {
    // Prefer longest Arabic span
    const longest = arabicLetters.reduce((a, b) => (b.length > a.length ? b : a), arabicLetters[0]);
    const repairedLongest = repairFragments(longest);
    // Replace the Arabic span in result with repaired version
    result = result.replace(longest, repairedLongest);
  }

  // Final trim and return
  result = result.replace(/\s+/g, ' ').trim();
  return result || null;
}

// Export smaller helpers for scripts
export default {
  normalizeArabic,
  repairFragments,
  reconstructArabicText,
  ARABIC_RECONSTRUCTION_MAP,
};
