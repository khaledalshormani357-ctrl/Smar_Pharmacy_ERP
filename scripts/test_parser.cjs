const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Known dosage forms keywords in catalog
const DOSAGE_FORM_PATTERNS = [
  'Tablets', 'Tablet', 'Tab', 'Film Coated Tablets', 'Chewable Tablets',
  'Capsules', 'Capsule', 'Cap', 'Soft Gelatin Capsules',
  'Syrup', 'Suspension', 'pediatric oral suspensiobn',
  'Vial', 'Ampoules', 'Ampules', 'Amp', 'Injection', 'Infusion',
  'Cream', 'Ointment', 'Gel', 'Lotion', 'Solution', 'Suspension',
  'Drops', 'Eye Drops', 'Ear Drops', 'Nasal Drops', 'Eye Ointment',
  'Sachets', 'Sachet', 'Powder', 'Strips', 'Suppositoris', 'Suppositories',
  'Inhlaer', 'Inhaler', 'Spray', 'Aerosol', 'Tube', 'Pessaries', 'Mouthwash'
];

async function testExtraction() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  console.log(`Total Pages: ${res.pages.length}`);
  
  // Let's test parser on pages 3 to 10
  for (let p = 3; p <= 6; p++) {
    const raw = res.pages[p - 1].text;
    console.log(`\n---------------- PAGE ${p} ----------------`);
    
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = headerIdx !== -1 ? raw.slice(headerIdx + headerMarker.length).trim() : raw;
    
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = footerIdx !== -1 ? body.slice(0, footerIdx).trim() : body;
    
    console.log(cleanBody);
  }
}

testExtraction().catch(console.error);
