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

async function testPage3() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  const doc = await parser.load();
  
  const page = await doc.getPage(3);
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

  const headerWords = new Set([
    'TRADE', 'NAME', 'SECTION', 'Manufactrer', 'Dose', 'الجشعت',
    'Dosage', 'forms', 'Dosage forms', 'Trade', 'name', 'Trade name',
    'Package', 'Disease', 'Therapeutic', 'Category', 'Generic',
    'Name', 'and', 'Name and', 'Composition', 'Country',
    'صىسة', 'الذواء', 'صىسة الذواء', 'Product', 'Picture', 'Product Picture'
  ]);
  
  const contentItems = items.filter(it => {
    if (it.y <= 45) return false;
    if (it.str === 'صفحة' || it.str === 'من' || it.str === '588' || it.str === '3') return false;
    if (it.str.includes('حشح ٍب حسب األسن الخجبسي') || it.str.includes('السببح')) return false;
    if (it.y >= 665 && headerWords.has(it.str)) return false;
    return true;
  });

  const maxY = Math.max(...contentItems.map(it => it.y));
  const STEP = 85.0;
  const rows = [];

  for (let r = 0; r < 7; r++) {
    const topY = maxY - (r * STEP) + 8;
    const bottomY = topY - STEP;
    
    const rowItems = contentItems.filter(it => it.y <= topY && it.y > bottomY);
    if (rowItems.length === 0) continue;
    
    const rowTopRef = topY - 8;
    
    // Col 1: x < 95
    const col1 = rowItems.filter(it => it.x < 95);
    col1.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
      return a.x - b.x;
    });
    
    const tradeItems = col1.filter(it => (it.y - rowTopRef) > -24);
    const dfItems = col1.filter(it => (it.y - rowTopRef) <= -24 && (it.y - rowTopRef) > -45);
    const pkgItems = col1.filter(it => (it.y - rowTopRef) <= -45);
    
    // Col 2: Generic
    const col2 = rowItems.filter(it => it.x >= 95 && it.x < 180);
    col2.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
    
    // Col 3: Category & Disease
    const col3 = rowItems.filter(it => it.x >= 180 && it.x < 260);
    col3.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
    const catItems = col3.filter(it => (it.y - rowTopRef) > -35);
    const diseaseItems = col3.filter(it => (it.y - rowTopRef) <= -35);
    
    // Col 4: Mfg & Country
    const col4 = rowItems.filter(it => it.x >= 260 && it.x < 330);
    col4.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
    const mfgCountryRaw = col4.map(it => it.str).join(' ');
    const { manufacturer, country } = extractCountryAndMfg(mfgCountryRaw);
    
    // Col 5: Dose
    const col5 = rowItems.filter(it => it.x >= 330 && it.x < 475);
    col5.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
    
    rows.push({
      page: 3,
      row: r + 1,
      trade_name: tradeItems.map(it => it.str).join(' ') || null,
      dosage_form: dfItems.map(it => it.str).join(' ') || null,
      package: pkgItems.map(it => it.str).join(' ') || null,
      generic_name: col2.map(it => it.str).join(' ') || null,
      category: catItems.map(it => it.str).join(' ') || null,
      disease: diseaseItems.map(it => it.str).join(' ') || null,
      manufacturer,
      country,
      dose: col5.map(it => it.str).join(' ') || null
    });
  }
  
  console.log(`Page 3 extracted ${rows.length} rows:`);
  rows.forEach(rw => {
    console.log(`Row ${rw.row}: [Trade: "${rw.trade_name}"] [DF: "${rw.dosage_form}"] [Pkg: "${rw.package}"] [Generic: "${rw.generic_name}"] [Mfg: "${rw.manufacturer}"] [Country: "${rw.country}"]`);
  });
}

testPage3().catch(console.error);
