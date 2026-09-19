const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const COUNTRIES = [
  'Saudi Arabia', 'Czech Republic', 'South Korea', 'New Zealand',
  'Yemen', 'Jordan', 'Egypt', 'Syria', 'UAE', 'KSA',
  'India', 'Germany', 'Thailand', 'Turkey', 'UK', 'Denmark', 'Belgium',
  'France', 'Switzerland', 'USA', 'Spain', 'Italy', 'Cyprus', 'Lebanon',
  'Oman', 'Kuwait', 'Bahrain', 'Iran', 'Pakistan', 'China', 'Netherlands',
  'Austria', 'Ireland', 'Poland', 'Greece', 'Canada', 'Japan', 'Malaysia',
  'Korea', 'Portugal', 'Sweden', 'Finland', 'Norway',
  'Hungary', 'Romania', 'Bulgaria', 'Russia', 'Ukraine',
  'Australia', 'Brazil', 'Argentina', 'Tunisia', 'Morocco',
  'Algeria', 'Sudan', 'Unknown'
];

function extractCountryAndMfg(rawStr) {
  if (!rawStr) return { manufacturer: null, country: null };
  const str = rawStr.trim();
  
  for (const c of COUNTRIES) {
    const reg = new RegExp(`(?:\\s+|^)(${c})$`, 'i');
    const match = str.match(reg);
    if (match) {
      const country = match[1];
      let mfg = str.slice(0, match.index).trim();
      if (!mfg || mfg.toLowerCase() === 'unknown') mfg = 'Unknown';
      return { manufacturer: mfg, country: country };
    }
  }
  return { manufacturer: str, country: null };
}

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

async function testExtractionRange(startPage, endPage) {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  const doc = await parser.load();
  
  let totalRows = 0;
  let problematicPages = [];

  for (let p = startPage; p <= endPage; p++) {
    const page = await doc.getPage(p);
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

    // Content items: strictly between 60 and 675
    const contentItems = items.filter(it => {
      if (it.y <= 55) return false;
      if (it.y >= 675) return false;
      if (it.str.includes('صفحة') || it.str.includes('TRADE NAME SECTION') || it.str.includes('حشح ٍب حسب األسن')) return false;
      return true;
    });

    if (contentItems.length === 0) continue;

    const maxY = Math.max(...contentItems.map(it => it.y));
    const STEP = 85.0;
    const rows = [];

    for (let r = 0; r < 7; r++) {
      const topY = maxY - (r * STEP) + 10;
      const bottomY = topY - STEP;
      
      const rowItems = contentItems.filter(it => it.y <= topY && it.y > bottomY);
      if (rowItems.length === 0) continue;
      
      const rowTopRef = topY - 10;
      
      // Col 1: x < 95
      const col1 = rowItems.filter(it => it.x < 95);
      col1.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
      
      // Categorize Col 1 by dosage form recognition or position
      let trade = [];
      let df = [];
      let pkg = [];
      
      let state = 'trade';
      for (const it of col1) {
        const isDf = DOSAGE_FORM_NAMES.some(name => name.toLowerCase() === it.str.toLowerCase());
        if (isDf) {
          state = 'df';
          df.push(it.str);
        } else if (state === 'trade') {
          // If it's still near top, it's trade name
          if (it.y - rowTopRef > -25) {
            trade.push(it.str);
          } else {
            df.push(it.str);
          }
        } else if (state === 'df') {
          state = 'pkg';
          pkg.push(it.str);
        } else {
          pkg.push(it.str);
        }
      }
      
      // Col 2: Generic (95 <= x < 180)
      const col2 = rowItems.filter(it => it.x >= 95 && it.x < 180);
      col2.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
      
      // Col 3: Category & Disease (180 <= x < 260)
      const col3 = rowItems.filter(it => it.x >= 180 && it.x < 260);
      col3.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
      const cat = col3.filter(it => (it.y - rowTopRef) > -35);
      const disease = col3.filter(it => (it.y - rowTopRef) <= -35);
      
      // Col 4: Mfg & Country (260 <= x < 330)
      const col4 = rowItems.filter(it => it.x >= 260 && it.x < 330);
      col4.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
      const mfgCountryRaw = col4.map(it => it.str).join(' ');
      const { manufacturer, country } = extractCountryAndMfg(mfgCountryRaw);
      
      // Col 5: Dose (330 <= x < 475)
      const col5 = rowItems.filter(it => it.x >= 330 && it.x < 475);
      col5.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));

      rows.push({
        source_file: 'Drug_Products_Directory_Yemen.pdf',
        source_page: p,
        source_row: r + 1,
        trade_name: trade.join(' ') || null,
        dosage_form: df.join(' ') || null,
        package: pkg.join(' ') || null,
        generic_name: col2.map(it => it.str).join(' ') || null,
        therapeutic_category: cat.map(it => it.str).join(' ') || null,
        disease: disease.map(it => it.str).join(' ') || null,
        manufacturer,
        country_of_origin: country,
        dose: col5.map(it => it.str).join(' ') || null
      });
    }

    totalRows += rows.length;
    if (rows.length !== 7) {
      problematicPages.push({ page: p, count: rows.length });
    }
  }

  console.log(`Extracted pages ${startPage} to ${endPage}: Total rows = ${totalRows}`);
  if (problematicPages.length > 0) {
    console.log('Non-7 pages:', problematicPages);
  }
}

testExtractionRange(3, 30).catch(console.error);
