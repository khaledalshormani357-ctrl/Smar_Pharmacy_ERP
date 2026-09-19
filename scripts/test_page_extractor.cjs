const fs = require('fs');
const { PDFParse } = require('pdf-parse');

// Known dosage forms in English / catalog
const DOSAGE_FORM_NAMES = [
  'Tablets', 'Tablet', 'Tab', 'Film Coated Tablets', 'Chewable Tablets', 'Effervescent Tablets',
  'Dispersible Tablets', 'Sublingual Tablets', 'Controlled Release Tablets', 'Sustained Release Tablets',
  'Capsules', 'Capsule', 'Cap', 'Soft Gelatin Capsules', 'Softgel', 'Hard Gelatin Capsules',
  'Syrup', 'Dry syrup', 'Suspension', 'pediatric oral suspensiobn', 'Oral Suspension', 'Oral Solution', 'Oral Drops',
  'Vial', 'Ampoules', 'Ampules', 'Amp', 'Injection', 'Infusion', 'IV Infusion', 'Vials',
  'Cream', 'Ointment', 'Gel', 'Lotion', 'Solution', 'Emulsion', 'Liniment',
  'Drops', 'Eye Drops', 'Ear Drops', 'Nasal Drops', 'Eye Ointment', 'Ear/Eye Drops',
  'Sachets', 'Sachet', 'Powder', 'Powder for Suspension', 'Strips', 'Suppositoris', 'Suppositories',
  'Inhlaer', 'Inhaler', 'Spray', 'Nasal Spray', 'Aerosol', 'Tube', 'Pessaries', 'Mouthwash',
  'Gargle', 'Enema', 'Soap', 'Shampoo', 'Lozenges', 'Lozenge', 'Patch'
];

async function testExtractPage(pageNum) {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  const doc = await parser.load();
  
  const page = await doc.getPage(pageNum);
  const textContent = await page.getTextContent();
  
  const items = textContent.items
    .filter(it => it.str && it.str.trim().length > 0)
    .map(it => ({
      str: it.str.trim(),
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
      w: Math.round(it.width),
      h: Math.round(it.height)
    }));

  // Exclude footer (y <= 50) and page header (y > 685, or matching header strings)
  const headerTexts = new Set(['TRADE NAME SECTION', 'Manufactrer', 'Dose', 'الجشعت', 'Dosage forms', 'Trade name', 'Package', 'Disease', 'Therapeutic', 'Category', 'Generic', 'Name and', 'Composition', 'Country', 'صىسة الذواء', 'Product Picture']);
  
  const contentItems = items.filter(it => {
    if (it.y <= 50) return false;
    if (it.str === 'صفحة' || it.str === 'من' || it.str === '588' || it.str === String(pageNum)) return false;
    if (it.str.includes('حشح ٍب حسب األسن الخجبسي')) return false;
    if (it.y > 680 && headerTexts.has(it.str)) return false;
    return true;
  });

  // Find row starts: items in x < 95 that are Trade Names or Dosage forms, or items in x 260-330 (Manufacturers)
  // Since each row is ~85 pt, let's find the max Y of contentItems
  const maxY = Math.max(...contentItems.map(it => it.y));
  
  // Create 7 bins with step 85 downwards from maxY
  const rows = [];
  const STEP = 85.0;
  // Bins: [maxY, maxY - 85], [maxY - 85, maxY - 170], ...
  for (let r = 0; r < 7; r++) {
    const topY = maxY - (r * STEP) + 12; // small tolerance
    const bottomY = topY - STEP;
    
    const rowItems = contentItems.filter(it => it.y <= topY && it.y > bottomY);
    if (rowItems.length === 0) continue;
    
    // Sort items inside row by x
    rowItems.sort((a, b) => a.x - b.x);
    
    // Col 1: x < 95 (Trade name, Dosage form, Package)
    const col1 = rowItems.filter(it => it.x < 95);
    // Col 2: 95 <= x < 180 (Generic Name / Composition)
    const col2 = rowItems.filter(it => it.x >= 95 && it.x < 180);
    // Col 3: 180 <= x < 260 (Therapeutic Category, Disease)
    const col3 = rowItems.filter(it => it.x >= 180 && it.x < 260);
    // Col 4: 260 <= x < 330 (Manufacturer, Country)
    const col4 = rowItems.filter(it => it.x >= 260 && it.x < 330);
    // Col 5: 330 <= x < 475 (Dose)
    const col5 = rowItems.filter(it => it.x >= 330 && it.x < 475);
    
    // Process Col 1 (Trade Name, Dosage Form, Package)
    // Sort Col 1 by y descending (top to bottom)
    col1.sort((a, b) => b.y - a.y);
    
    // Identify trade name, dosage form, package
    // Usually:
    // Top-most item(s) are Trade Name
    // Middle item matching dosage forms is Dosage Form
    // Bottom item(s) are Package
    let tradeNameParts = [];
    let dosageFormParts = [];
    let packageParts = [];
    
    let state = 'trade';
    for (const it of col1) {
      const isDf = DOSAGE_FORM_NAMES.some(df => it.str.toLowerCase() === df.toLowerCase());
      if (isDf) {
        state = 'dosage_form';
        dosageFormParts.push(it.str);
      } else if (state === 'dosage_form') {
        state = 'package';
        packageParts.push(it.str);
      } else if (state === 'package') {
        packageParts.push(it.str);
      } else {
        tradeNameParts.push(it.str);
      }
    }
    
    // Process Col 4 (Manufacturer, Country)
    // Top-most is Manufacturer, bottom-most is Country
    col4.sort((a, b) => b.y - a.y);
    let mfgParts = [];
    let countryParts = [];
    if (col4.length === 1) {
      mfgParts.push(col4[0].str);
    } else if (col4.length > 1) {
      countryParts.push(col4[col4.length - 1].str);
      mfgParts = col4.slice(0, col4.length - 1).map(it => it.str);
    }
    
    // Col 2: Generic Name
    col2.sort((a, b) => b.y - a.y);
    const genericName = col2.map(it => it.str).join(' ');
    
    // Col 3: Category & Disease
    col3.sort((a, b) => b.y - a.y);
    const catAndDisease = col3.map(it => it.str).join(' ');
    
    // Col 5: Dose
    col5.sort((a, b) => b.y - a.y || a.x - b.x);
    const dose = col5.map(it => it.str).join(' ');
    
    rows.push({
      row_index: r + 1,
      trade_name: tradeNameParts.join(' ') || null,
      dosage_form: dosageFormParts.join(' ') || null,
      package: packageParts.join(' ') || null,
      generic_name: genericName || null,
      category_and_disease: catAndDisease || null,
      manufacturer: mfgParts.join(' ') || null,
      country: countryParts.join(' ') || null,
      dose: dose || null
    });
  }
  
  console.log(`Page ${pageNum} extracted ${rows.length} rows:`);
  console.log(JSON.stringify(rows, null, 2));
}

async function run() {
  await testExtractPage(3);
  await testExtractPage(4);
}

run().catch(console.error);
