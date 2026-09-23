// Arabic Catalog Text Repair Utility
// Solves DEFECT 04 / Phase 8.5: Accurate Arabic Reconstruction for Drug Catalog

export const ARABIC_RECONSTRUCTION_MAP: Record<string, string> = {
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

export function reconstructArabicText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (ARABIC_RECONSTRUCTION_MAP[trimmed]) {
    return ARABIC_RECONSTRUCTION_MAP[trimmed];
  }
  // If text contains known corrupted fragments, replace them
  let result = trimmed;
  for (const [corrupt, clean] of Object.entries(ARABIC_RECONSTRUCTION_MAP)) {
    if (result.includes(corrupt)) {
      result = result.replace(corrupt, clean);
    }
  }
  return result;
}
