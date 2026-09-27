// Arabic Phonetic Transliteration Utility for Pharmaceutical Drug Trade Names
// Smart Pharmacy ERP - Phase 8.8

export interface MigrationReport {
  productsScanned: number;
  arabicNamesGenerated: number;
  existingArabicNamesPreserved: number;
  skipped: number;
  failed: number;
  unprocessedProducts: Array<{ id: string; name_en?: string; reason: string }>;
}

// Known pharmaceutical trade name modifiers, formulations, and terms
// Phonetic transliteration (NOT semantic translation)
const PHARMA_PHONETIC_TERMS: Record<string, string> = {
  // Common Trade Modifiers
  plus: 'بلس',
  extra: 'إكسترا',
  forte: 'فورت',
  fort: 'فورت',
  max: 'ماكس',
  maximum: 'ماكسيمم',
  kids: 'كيدز',
  baby: 'بيبي',
  infant: 'انفانت',
  junior: 'جونيور',
  adult: 'أدلت',
  pediatric: 'بيدياتريك',
  ped: 'بيد',
  cold: 'كولد',
  flu: 'فلو',
  night: 'نايت',
  day: 'داي',
  sinus: 'ساينس',
  cough: 'كوف',
  fast: 'فاست',
  rapid: 'رابد',
  direct: 'دايركت',
  care: 'كير',
  protect: 'بروتكت',
  ultra: 'ألترا',
  super: 'سوبر',
  mega: 'ميجا',
  pro: 'برو',
  neo: 'نيو',
  advance: 'أدفانس',
  advanced: 'أدفانسد',
  active: 'أكتيف',
  action: 'أكشن',
  act: 'أكت',
  total: 'توتال',
  complete: 'كومبليت',
  duo: 'دو',
  trio: 'تريو',
  combi: 'كومبي',
  comp: 'كومب',
  compound: 'كومباوند',
  retard: 'ريتارد',
  depot: 'ديبو',
  long: 'لونج',
  chrono: 'كرونو',
  xr: 'إكس آر',
  sr: 'إس آر',
  cr: 'سي آر',
  mr: 'إم آر',
  er: 'إي آر',
  xl: 'إكس إل',
  la: 'إل إيه',
  dr: 'دي آر',
  ir: 'آي آر',
  od: 'أو دي',
  ds: 'دي إس',
  forte_plus: 'فورت بلس',
  effervescent: 'إفرفيسنت',
  sugar_free: 'شوجر فري',

  // Formulations
  drops: 'دروبس',
  drop: 'دروب',
  syrup: 'سيرب',
  suspension: 'ساسبنشن',
  susp: 'ساسب',
  gel: 'جل',
  cream: 'كريم',
  ointment: 'مرهم',
  lotion: 'لوشن',
  spray: 'سبراي',
  inhalation: 'استنشاق',
  solution: 'سوليوشن',
  sol: 'سول',
  sachet: 'ساشيت',
  sachets: 'ساشيتس',
  tablet: 'تابلت',
  tablets: 'تابلتس',
  tab: 'تاب',
  tabs: 'تابس',
  capsule: 'كبسول',
  capsules: 'كبسولات',
  cap: 'كاب',
  caps: 'كابس',
  ampoule: 'أمبول',
  ampoules: 'أمبولات',
  amp: 'أمبول',
  amps: 'أمبولات',
  vial: 'فيال',
  vials: 'فيالات',
  injection: 'حقن',
  inj: 'حقن',
  infusion: 'إنفيوجن',
  suppository: 'تحاميل',
  supp: 'تحاميل',
  mouthwash: 'غسول فم',

  // Vitamins & Elements
  vitamin: 'فيتامين',
  vit: 'فيت',
  calcium: 'كالسيوم',
  zinc: 'زنك',
  iron: 'حديد',
  ferro: 'فيرو',
  magnesium: 'مغنيسيوم',
  omega: 'أوميجا',
  folic: 'فوليك',
  acid: 'أسيد',
};

// Known common pharmaceutical trade brands for 100% precision
const PHARMA_BRAND_STEMS: Record<string, string> = {
  trazol: 'ترازول',
  panadol: 'بانادول',
  paracetamol: 'باراسيتامول',
  amoxil: 'أموكسيل',
  amoxicillin: 'أموكسيسيلين',
  augmentin: 'أوجمنتين',
  cataflam: 'كتافلام',
  voltaren: 'فولتارين',
  brufen: 'بروفين',
  ibuprofen: 'إيبوبروفين',
  omeprazole: 'أوميبرازول',
  losec: 'لوسك',
  nexium: 'نيكسيوم',
  esomeprazole: 'إيزوميبرازول',
  zithromax: 'زيثروماكس',
  azithromycin: 'أزيثرومايسين',
  cipro: 'سيبرو',
  ciprofloxacin: 'سيبروفلوكساسين',
  flagyl: 'فلاجيل',
  metronidazole: 'ميترونيدازول',
  cefix: 'سيفكس',
  cefixime: 'سيفيكسيم',
  rocephin: 'روسيفين',
  ceftriaxone: 'سيفترياكسون',
  klavox: 'كلافوكس',
  curam: 'كورام',
  megamox: 'ميجاموكس',
  spasmo: 'سبازمو',
  antinal: 'أنتينال',
  strepsils: 'ستربسلز',
  adol: 'أدول',
  fevadol: 'فيفادول',
  cetamol: 'سيتامول',
  fludrex: 'فلودريكس',
  congestal: 'كونجستال',
  comtrex: 'كومتركس',
  otrivin: 'أوترفين',
  ventolin: 'فنتولين',
  salbutamol: 'سالبوتامول',
  mucosolvan: 'موكوسولفان',
  ambroxol: 'أمبروكسول',
  bisolvon: 'بيسولفون',
  prospan: 'بروسبان',
  gaviscon: 'جافيسكون',
  maalox: 'مالوكس',
  rennie: 'ريني',
  motilium: 'موتيليوم',
  domperidone: 'دومبيريدون',
  primperan: 'بريمبران',
  metoclopramide: 'ميتوكلوبراميد',
  buscopan: 'بسكوبان',
  hyoscine: 'هيوسين',
  colospa: 'كولوسبا',
  mebeverine: 'ميبفرين',
  duspatalin: 'دسباتالين',
  lipitor: 'ليبيتور',
  atorvastatin: 'أتورفاستاتين',
  crestor: 'كريستور',
  rosuvastatin: 'روستاتين',
  concor: 'كونكور',
  bisoprolol: 'بيسوبرولول',
  norvasc: 'نورفاسك',
  amlodipine: 'أملوديبين',
  exforge: 'إكسفورج',
  diovan: 'ديوفان',
  valsartan: 'فالسارتان',
  zestril: 'زيستريل',
  lisinopril: 'ليسينوبريل',
  capoten: 'كابوتن',
  captopril: 'كابتوبريل',
  glucophage: 'جلوكوفاج',
  metformin: 'ميتفورمين',
  januvia: 'جانوفيا',
  sitagliptin: 'سيتاجليبتين',
  galvus: 'جالفوس',
  vildagliptin: 'فيلداجليبتين',
  amaryl: 'أماريل',
  glimepiride: 'جليمبيريد',
  daonil: 'داونيل',
  glibenclamide: 'جليبينكلاميد',
  diamicron: 'داياميكرون',
  gliclazide: 'جليكلازيد',
  lantus: 'لانتوس',
  insulin: 'إنسولين',
  novorapid: 'نوفورابد',
  mixtard: 'مكستارد',
  humalog: 'هومالوج',
  eltroxin: 'ألتروكسين',
  thyroxine: 'ثيروكسين',
  levothyroxine: 'ليفوثيروكسين',
  tegretol: 'تيجريتول',
  carbamazepine: 'كاربامازيبين',
  depakine: 'ديباكين',
  neurobion: 'نيوروبيون',
  neurorubine: 'نيوروربين',
  milga: 'ميلجا',
  becozyme: 'بيكوزيم',
  centrum: 'سنتروم',
  feroglobin: 'فيروجلوبين',
  fefol: 'فيفول',
  aspirin: 'أسبرين',
  disprin: 'ديسبرين',
  plavix: 'بلافيكس',
  clopidogrel: 'كلوبيدوجريل',
  claritin: 'كلاريتين',
  loratadine: 'لوراتادين',
  zyrtec: 'زيرتيك',
  cetirizine: 'سيتريزين',
  telfast: 'تلفاست',
  fexofenadine: 'فيكسوفينادين',
  aerius: 'إيريوس',
  desloratadine: 'ديسلوراتادين',
  prednisolone: 'بريدنيزولون',
  dexamethasone: 'ديكساميثازون',
  decadron: 'ديكادرون',
  diflucan: 'ديفلوكان',
  fluconazole: 'فلوكونازول',
  daktarin: 'داكتارين',
  miconazole: 'ميكونازول',
  canesten: 'كانيستين',
  clotrimazole: 'كلوتريمازول',
  nizoral: 'نيزورال',
  ketoconazole: 'كيتوكونازول',
  fucidin: 'فيوسيدين',
  garamycin: 'جارامايسين',
  gentamicin: 'جنتامايسين',
  neomycin: 'نيومايسين',
  terramycin: 'تيرامايسين',
  oxytetracycline: 'أوكسيتيتراسيكلين',
  zovirax: 'زوفيراكس',
  acyclovir: 'أسيكلوفير',
  pantozol: 'بانتوزول',
  pantoprazole: 'بانتوبرازول',
  controloc: 'كونترولوك',
  pariet: 'باريات',
  rabeprazole: 'رابيبرازول',
  dexilant: 'ديكسيلانت',
  dexlansoprazole: 'ديكسلانسوبرازول',
};

/**
 * Phonetically transliterates a single English pharmaceutical word into Arabic.
 */
function transliterateSingleWord(word: string): string {
  const clean = word.toLowerCase().trim();
  if (!clean) return '';

  // 1. Direct dictionary match
  if (PHARMA_PHONETIC_TERMS[clean]) {
    return PHARMA_PHONETIC_TERMS[clean];
  }
  if (PHARMA_BRAND_STEMS[clean]) {
    return PHARMA_BRAND_STEMS[clean];
  }

  // 2. Numeric / dosage / unit tokens (e.g., 500mg, 10ml, 20%)
  if (/^\d+(\.\d+)?(mg|ml|g|mcg|iu|%|cc)?$/i.test(clean)) {
    return clean;
  }

  // 3. Rule-based phonetic transliteration
  let w = clean;

  // Initial silent letters
  w = w.replace(/^ps/, 's');
  w = w.replace(/^pn/, 'n');
  w = w.replace(/^pt/, 't');
  w = w.replace(/^kn/, 'n');
  w = w.replace(/^wr/, 'r');

  let result = '';
  let i = 0;

  while (i < w.length) {
    const c = w[i];
    const next1 = w[i + 1] || '';
    const next2 = w[i + 2] || '';
    const next3 = w[i + 3] || '';
    const prev = i > 0 ? w[i - 1] : '';

    // 4-letter chunks
    if (c === 't' && next1 === 'i' && next2 === 'o' && next3 === 'n') {
      result += 'شن';
      i += 4;
      continue;
    }
    if (c === 's' && next1 === 'i' && next2 === 'o' && next3 === 'n') {
      result += 'شن';
      i += 4;
      continue;
    }

    // 3-letter chunks
    if (c === 'p' && next1 === 'h' && next2 === 'y') {
      result += 'في';
      i += 3;
      continue;
    }
    if (c === 'c' && next1 === 'h' && (next2 === 'l' || next2 === 'r' || next2 === 'a' || next2 === 'o')) {
      // chemical ch as k (chlor, chrom, chol)
      result += 'كل';
      i += 2;
      continue;
    }

    // 2-letter chunks
    if (c === 'p' && next1 === 'h') {
      result += 'ف';
      i += 2;
      continue;
    }
    if (c === 't' && next1 === 'h') {
      result += 'ث';
      i += 2;
      continue;
    }
    if (c === 's' && next1 === 'h') {
      result += 'ش';
      i += 2;
      continue;
    }
    if (c === 'c' && next1 === 'h') {
      result += 'ش';
      i += 2;
      continue;
    }
    if (c === 'k' && next1 === 'h') {
      result += 'خ';
      i += 2;
      continue;
    }
    if (c === 'g' && next1 === 'h') {
      result += 'غ';
      i += 2;
      continue;
    }
    if (c === 'c' && next1 === 'k') {
      result += 'ك';
      i += 2;
      continue;
    }
    if (c === 'q' && next1 === 'u') {
      result += 'كو';
      i += 2;
      continue;
    }
    if (c === 'e' && next1 === 'e') {
      result += 'ي';
      i += 2;
      continue;
    }
    if (c === 'e' && next1 === 'a') {
      result += 'ي';
      i += 2;
      continue;
    }
    if (c === 'o' && next1 === 'o') {
      result += 'و';
      i += 2;
      continue;
    }
    if (c === 'o' && next1 === 'u') {
      result += 'و';
      i += 2;
      continue;
    }
    if (c === 'a' && (next1 === 'i' || next1 === 'y')) {
      result += 'اي';
      i += 2;
      continue;
    }
    if (c === 'e' && (next1 === 'i' || next1 === 'y')) {
      result += 'اي';
      i += 2;
      continue;
    }
    if (c === 'a' && (next1 === 'u' || next1 === 'w')) {
      result += 'أو';
      i += 2;
      continue;
    }

    // Soft / hard C
    if (c === 'c') {
      if (next1 === 'e' || next1 === 'i' || next1 === 'y') {
        result += 'س';
      } else {
        result += 'ك';
      }
      i++;
      continue;
    }

    // Soft / hard G
    if (c === 'g') {
      if (next1 === 'e' || next1 === 'i' || next1 === 'y') {
        result += 'ج';
      } else {
        result += 'ج';
      }
      i++;
      continue;
    }

    // X
    if (c === 'x') {
      if (i === 0) {
        result += 'ز';
      } else {
        result += 'كس';
      }
      i++;
      continue;
    }

    // Single Consonants
    if (c === 'b' || c === 'p') {
      result += 'ب';
      i++;
      continue;
    }
    if (c === 't') {
      result += 'ت';
      i++;
      continue;
    }
    if (c === 'd') {
      result += 'د';
      i++;
      continue;
    }
    if (c === 'f' || c === 'v') {
      result += 'ف';
      i++;
      continue;
    }
    if (c === 'h') {
      result += 'ه';
      i++;
      continue;
    }
    if (c === 'j') {
      result += 'ج';
      i++;
      continue;
    }
    if (c === 'k' || c === 'q') {
      result += 'ك';
      i++;
      continue;
    }
    if (c === 'l') {
      result += 'ل';
      i++;
      continue;
    }
    if (c === 'm') {
      result += 'م';
      i++;
      continue;
    }
    if (c === 'n') {
      result += 'ن';
      i++;
      continue;
    }
    if (c === 'r') {
      result += 'ر';
      i++;
      continue;
    }
    if (c === 's') {
      result += 'س';
      i++;
      continue;
    }
    if (c === 'w') {
      result += 'و';
      i++;
      continue;
    }
    if (c === 'z') {
      result += 'ز';
      i++;
      continue;
    }

    // Vowels
    if (c === 'a') {
      if (i === 0) {
        result += 'أ';
      } else {
        result += 'ا';
      }
      i++;
      continue;
    }
    if (c === 'e') {
      if (i === 0) {
        result += 'إ';
      } else if (i === w.length - 1 && w.length > 3) {
        // Silent trailing e in English
        // Do not add vowel unless preceding is consonant without vowel
      } else {
        result += 'ي';
      }
      i++;
      continue;
    }
    if (c === 'i') {
      if (i === 0) {
        result += 'إ';
      } else {
        result += 'ي';
      }
      i++;
      continue;
    }
    if (c === 'o') {
      if (i === 0) {
        result += 'أو';
      } else {
        result += 'و';
      }
      i++;
      continue;
    }
    if (c === 'u') {
      if (i === 0) {
        result += 'أو';
      } else {
        result += 'و';
      }
      i++;
      continue;
    }
    if (c === 'y') {
      result += 'ي';
      i++;
      continue;
    }

    // Fallback for non-alpha
    result += c;
    i++;
  }

  // Final cleanup of redundant Arabic characters
  return result
    .replace(/اا+/g, 'ا')
    .replace(/يي+/g, 'ي')
    .replace(/وو+/g, 'و');
}

/**
 * Phonetically transliterates a complete English trade name into Arabic.
 * Examples:
 *   "Trazol Plus" -> "ترازول بلس"
 *   "Panadol Extra" -> "بانادول إكسترا"
 *   "Forte" -> "فورت"
 *   "Max" -> "ماكس"
 *   "Kids" -> "كيدز"
 *   "Baby" -> "بيبي"
 */
export function transliterateDrugTradeName(englishName: string): string {
  if (!englishName || !englishName.trim()) return '';

  const raw = englishName.trim();

  // If already contains significant Arabic characters, return as is
  if (/[\u0600-\u06FF]/.test(raw) && raw.replace(/[^\u0600-\u06FF]/g, '').length > 3) {
    return raw;
  }

  // Split into tokens preserving hyphens and slashes
  const tokens = raw.split(/([ \t\-/+]+)/);

  const translatedTokens = tokens.map((tok) => {
    // Delimiters
    if (/^[ \t\-/+]+$/.test(tok)) {
      return tok;
    }
    // Check if token has subparts (like Co-Diovan)
    return transliterateSingleWord(tok);
  });

  const joined = translatedTokens.join('').trim();
  // Normalize whitespace
  return joined.replace(/\s+/g, ' ');
}

/**
 * Safe catalog migration and backfill process (Part B6)
 * Generates phonetic trade_name_ar for existing products where trade_name_en != empty and trade_name_ar == empty.
 * Never overwrites existing non-empty Arabic names.
 * Never deletes English names.
 */
export function migrateArabicTradeNames(products: any[]): MigrationReport {
  let productsScanned = 0;
  let arabicNamesGenerated = 0;
  let existingArabicNamesPreserved = 0;
  let skipped = 0;
  let failed = 0;
  const unprocessedProducts: Array<{ id: string; name_en?: string; reason: string }> = [];

  for (const product of products) {
    productsScanned++;

    const engSource = (product.trade_name_en || product.name_en || '').trim();
    const existingAr = (product.trade_name_ar || product.name_ar || '').trim();

    // Check if product already has valid Arabic name
    if (existingAr && /[\u0600-\u06FF]/.test(existingAr)) {
      existingArabicNamesPreserved++;
      // Ensure trade_name_ar is populated if missing
      if (!product.trade_name_ar) {
        product.trade_name_ar = existingAr;
      }
      if (!product.trade_name_en && engSource) {
        product.trade_name_en = engSource;
      }
      continue;
    }

    // If no English source available
    if (!engSource) {
      skipped++;
      continue;
    }

    try {
      const generatedArabic = transliterateDrugTradeName(engSource);
      if (!generatedArabic || generatedArabic.length === 0) {
        failed++;
        unprocessedProducts.push({
          id: product.id,
          name_en: engSource,
          reason: 'Transliteration returned empty string',
        });
        continue;
      }

      product.trade_name_ar = generatedArabic;
      if (!product.name_ar || !/[\u0600-\u06FF]/.test(product.name_ar)) {
        product.name_ar = generatedArabic;
      }
      if (!product.trade_name_en) {
        product.trade_name_en = engSource;
      }
      arabicNamesGenerated++;
    } catch (err: any) {
      failed++;
      unprocessedProducts.push({
        id: product.id,
        name_en: engSource,
        reason: err.message || 'Error during transliteration',
      });
    }
  }

  return {
    productsScanned,
    arabicNamesGenerated,
    existingArabicNamesPreserved,
    skipped,
    failed,
    unprocessedProducts,
  };
}
