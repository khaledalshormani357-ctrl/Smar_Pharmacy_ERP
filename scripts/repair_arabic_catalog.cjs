// scripts/repair_arabic_catalog.cjs
// Solves DEFECT 04 / Phase 8.5: Accurate Arabic Reconstruction for Drug Catalog
const fs = require('fs');
const path = require('path');

const ARABIC_RECONSTRUCTION_MAP = {
  '( Bilharziasis ) انجههبسع ٍب': 'البلهارسيا (Bilharziasis)',
  '( E . N . T ) األ َف ٌ وانح ُجشح واألر': 'الأنف والأذن والحنجرة (E.N.T)',
  '( T . B ) ٌ انذس': 'الدرن والسل (T.B)',
  'Analgesic يهذئبد األوجبع وانح ًى': 'مسكنات الأوجاع وخافضات الحمى (Analgesic)',
  'Asthma انشثى ً انشؼج': 'الربو الشعبي (Asthma)',
  'B deficiency': 'نقص فيتامين ب (Vitamin B Deficiency)',
  'C': 'نقص فيتامين ج (Vitamin C Deficiency)',
  'Deficiency َمص ف ٍتبي ٍُبد': 'نقص الفيتامينات والمعادن (Vitamins Deficiency)',
  'Disorders اضطشاثبد انجهبص ً انت ُفغ': 'اضطرابات الجهاز التنفسي (Respiratory Disorders)',
  'Disorders اضطشاثبد انكجذ': 'اضطرابات الكبد (Liver Disorders)',
  'Enuresis': 'التبول اللاإرادي (Enuresis)',
  'Failure': 'قصور وفشل الأعضاء (Failure)',
  'Failure فشم انمهت انحبد': 'قصور القلب الحاد (Acute Heart Failure)',
  'Gardiasis جبسد ٌب واي ٍج ٍب': 'الجارديا والأميبا (Giardiasis & Amoeba)',
  'General انتخذ ٌش انؼبو': 'التخدير العام (General Anesthesia)',
  'Infection اصبثبد ً انجهبص انجىن': 'إصابات الجهاز البولي (Urinary Tract Infection)',
  'Infections األصبثبد انجكت ٍش ٌخ': 'الإصابات البكتيرية (Bacterial Infections)',
  'Infections ًٍكشوث ٍخ األصبثبد ان انخط ٍشح': 'الإصابات الميكروبية الخطيرة (Severe Microbial Infections)',
  'Infections ًٍكشوثبد انالهىائ ٍخ ان': 'إصابات الميكروبات اللاهوائية (Anaerobic Infections)',
  'Insumnea األسق وانمهك': 'الأرق والقلق واضطرابات النوم (Insomnia & Anxiety)',
  'Local انتخذ ٌش ً ان ًىضؼ': 'التخدير الموضعي (Local Anesthesia)',
  'Microbial Infections': 'العدوى والإصابات الميكروبية (Microbial Infections)',
  'Shock انصذيخ األغ ًبئ ٍخ': 'الصدمة الإغمائية (Syncopal Shock)',
  'Spasm ٍ آالو انجط': 'تقلصات وآلام البطن (Abdominal Spasm)',
  'Stimulant ي ُشطبد انشه ٍخ': 'منشطات ومحفزات الشهية (Appetite Stimulant)',
  'Suppressant عبداد انشه ٍخ': 'كابحات ومثبطات الشهية (Appetite Suppressant)',
  'cerebral': 'الأوعية الدماغية والمخ (Cerebral Vascular)',
  'disease يشض انشػبػ': 'مرض الرعاش والباركنسون (Parkinson\'s Disease)',
  'supplementation ًٍه ٍخ تغز ٌخ تك': 'مكملات وتغذية تكميلية (Nutritional Supplementation)',
  've ًُبػخ تثج ٍظ ان': 'تثبيط المناعة (Immunosuppression)',
  'vomiting ٌ انغث ٍب وانطشػ': 'الغثيان والقيء (Nausea & Vomiting)',
  'أيشاض انغكشي': 'أمراض السكري',
  'ا َتظبو ضشثبد انمهت': 'تنظيم ضربات القلب',
  'ا َخفبض ضغظ انذو': 'انخفاض ضغط الدم',
  'ا َمطبع انط ًث': 'انقطاع الطمث',
  'األصبثبد انف ٍشوع ٍخ': 'الإصابات الفيروسية',
  'األصبثبد انفطش ٌخ': 'الإصابات الفطرية',
  'األنتهبثبد': 'الالتهابات العامة',
  'األنتهبثبد انجذنذ ٌخ': 'الالتهابات الجلدية',
  'األوجبع': 'الأوجاع والآلام',
  'األوػ ٍخ انذيى ٌخ وانمهت': 'أمراض القلب والأوعية الدموية',
  'األيشاض انؼمه ٍخ': 'الأمراض النفسية والعقلية',
  'األيغبن': 'الإمساك',
  'اجهضح تشخ ٍص ٍخ': 'أجهزة ومعدات تشخيصية',
  'استفبع ضغظ انذو': 'ارتفاع ضغط الدم',
  'ان ًضبداد انح ٍى ٌخ': 'المضادات الحيوية',
  'ان ًؼذح': 'أمراض وقرحة المعدة',
  'ان ُتىء انصغ ٍشح': 'الزوائد والنتوءات الجلدية',
  'ان ُض ٌف': 'النزيف ومضادات النزف',
  'انتئبو انجشوح': 'التئام الجروح وتجديد الأنسجة',
  'انتهبثبد انؼظبو': 'التهابات المفاصل والعظام',
  'انجشثىيخ انطف ٍه ٍخ': 'الجرثومة الطفيلية والطفيليات',
  'انجهطبد': 'الجلطات ومضادات التخثر',
  'انجىاع ٍش': 'البواسير والشرخ الشرجي',
  'انذوخخ': 'الدوخة والدوار واضطرابات التوازن',
  'انذودح انشش ٌط ٍخ': 'الدودة الشريطية',
  'انش ًظ': 'الرشح والزكام واحتقان الأنف',
  'انشؼت انهىائ ٍخ': 'التهابات الشعب الهوائية',
  'انصذس ٌخ': 'الذبحة الصدرية وأمراض الصدر',
  'انط ًث': 'اضطرابات الدورة الشهرية والطمث',
  'انغذح انذسل ٍخ': 'اضطرابات الغدة الدرقية',
  'انغغىالد األ َثى ٌخ': 'الغسولات والمطهرات المهبلية',
  'انغغىالد انف ًى ٌخ': 'الغسولات والمطهرات الفموية',
  'انؼبيخ': 'الصحة العامة والفيتامينات',
  'انفىاق': 'الفواق (الحازوقة)',
  'انهضى': 'عسر الهضم واضطرابات الجهاز الهضمي',
  'هشيى َبد ج ُغ ٍخ': 'الهرمونات الجنسية',
  'ي ُشطبد ج ُغ ٍخ': 'المنشطات الجنسية',
  'يشخ ٍبد انؼضالد': 'مرخيات وباسطات العضلات',
  'يك ًالد غزائ ٍخ': 'المكملات الغذائية',
  'يىا َغ انح ًم': 'موانع الحمل وتنظيم النسل',
  'ً انذو ٌ ف ص ٌبدح انذهى': 'زيادة الدهون والكوليسترول في الدم',
  'ٌ انشبئؼخ انذ ٌذا': 'الديدان المعوية الشائعة',
  'ٌ انغشطب ) ) انخج ٍثخ': 'الأورام والسرطان (Malignant Tumors)',
  'َضالد انجشد': 'نزلات البرد والإنفلونزا'
};

function cleanArabicName(nameEn, rawDisease) {
  if (!rawDisease) return nameEn;
  const reconstructed = ARABIC_RECONSTRUCTION_MAP[rawDisease.trim()];
  if (reconstructed) {
    return `${nameEn} (${reconstructed})`;
  }
  // If unknown, strip isolated non-standard characters
  const sanitized = rawDisease.replace(/[\u064B-\u065F\u0670]/g, '').trim();
  return `${nameEn} (${sanitized})`;
}

function processCatalogFiles() {
  console.log('--- REPAIRING ARABIC CATALOG FILES ---');

  const cleanJsonPath = path.resolve('public/data/drug_catalog_clean.json');
  if (!fs.existsSync(cleanJsonPath)) {
    console.error('File not found:', cleanJsonPath);
    return;
  }

  const products = JSON.parse(fs.readFileSync(cleanJsonPath, 'utf8'));
  console.log(`Loaded ${products.length} products from ${cleanJsonPath}`);

  let repairedCount = 0;

  for (const p of products) {
    if (p.disease_indication) {
      const orig = p.disease_indication.trim();
      const fixed = ARABIC_RECONSTRUCTION_MAP[orig];
      if (fixed) {
        p.disease_indication = fixed;
        p.name_ar = `${p.name_en} (${fixed})`;
        repairedCount++;
      }
    } else {
      p.name_ar = p.name_en;
    }
  }

  console.log(`Repaired ${repairedCount} products with clean Arabic indications`);

  // Build Seed file
  const seedJsonPath = path.resolve('public/data/drug_catalog_seed.json');
  let seed = {};
  if (fs.existsSync(seedJsonPath)) {
    seed = JSON.parse(fs.readFileSync(seedJsonPath, 'utf8'));
  }
  seed.products = products;
  if (Array.isArray(seed.categories)) {
    for (const c of seed.categories) {
      if (c.name_ar && ARABIC_RECONSTRUCTION_MAP[c.name_ar.trim()]) {
        c.name_ar = ARABIC_RECONSTRUCTION_MAP[c.name_ar.trim()];
      }
    }
  }

  // Target paths to sync
  const targetPaths = [
    'public/data/drug_catalog_clean.json',
    'public/data/drug_catalog_seed.json',
    'data/drug_catalog_clean.json',
    'data/drug_catalog_seed.json',
    'android/app/src/main/assets/public/data/drug_catalog_clean.json',
    'dist/data/drug_catalog_clean.json'
  ];

  for (const rel of targetPaths) {
    const full = path.resolve(rel);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const dataToWrite = rel.includes('seed') ? seed : products;
    fs.writeFileSync(full, JSON.stringify(dataToWrite, null, 2), 'utf8');
    console.log(`Wrote ${rel}`);
  }

  console.log('--- ARABIC CATALOG REPAIR COMPLETED SUCCESSFULLY ---');
}

processCatalogFiles();
