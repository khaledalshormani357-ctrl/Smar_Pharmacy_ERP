const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Known dosage forms in English / catalog
const DOSAGE_FORMS = [
  'Tablets', 'Tablet', 'Tab', 'Film Coated Tablets', 'Chewable Tablets', 'Effervescent Tablets',
  'Dispersible Tablets', 'Sublingual Tablets', 'Controlled Release Tablets', 'Sustained Release Tablets',
  'Capsules', 'Capsule', 'Cap', 'Soft Gelatin Capsules', 'Softgel', 'Hard Gelatin Capsules',
  'Syrup', 'Suspension', 'pediatric oral suspensiobn', 'Oral Suspension', 'Oral Solution', 'Oral Drops',
  'Vial', 'Ampoules', 'Ampules', 'Amp', 'Injection', 'Infusion', 'IV Infusion', 'Vials',
  'Cream', 'Ointment', 'Gel', 'Lotion', 'Solution', 'Emulsion', 'Liniment',
  'Drops', 'Eye Drops', 'Ear Drops', 'Nasal Drops', 'Eye Ointment', 'Ear/Eye Drops',
  'Sachets', 'Sachet', 'Powder', 'Powder for Suspension', 'Strips', 'Suppositoris', 'Suppositories',
  'Inhlaer', 'Inhaler', 'Spray', 'Nasal Spray', 'Aerosol', 'Tube', 'Pessaries', 'Mouthwash',
  'Gargle', 'Enema', 'Soap', 'Shampoo', 'Lozenges', 'Lozenge', 'Patch'
];

// Build regex matching dosage forms, case-insensitive, surrounded by tabs, newlines or boundary
const dfRegex = new RegExp(`(?:\\t|\\n|^)(${DOSAGE_FORMS.join('|')})(?:\\t|\\n|$)`, 'i');

async function testDosageForms() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  let totalDfMatches = 0;
  const pageMatches = [];

  for (let p = 3; p <= 588; p++) {
    const raw = res.pages[p - 1].text;
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = headerIdx !== -1 ? raw.slice(headerIdx + headerMarker.length).trim() : raw;
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = footerIdx !== -1 ? body.slice(0, footerIdx).trim() : body;
    
    // Find all dosage form occurrences in cleanBody
    const regex = new RegExp(`(?:\\t|\\n|^)(${DOSAGE_FORMS.join('|')})(?=\\t|\\n|\\s[A-Z0-9])`, 'gi');
    let match;
    let count = 0;
    while ((match = regex.exec(cleanBody)) !== null) {
      count++;
    }
    totalDfMatches += count;
    pageMatches.push({ page: p, count });
  }
  
  console.log(`Total Dosage Form matches across 586 pages: ${totalDfMatches}`);
  const counts = {};
  pageMatches.forEach(m => counts[m.count] = (counts[m.count] || 0) + 1);
  console.log('Distribution of counts:', counts);
}

testDosageForms().catch(console.error);
