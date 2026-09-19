const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function testExtractRefined() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  const doc = await parser.load();
  
  for (let pageNum of [3, 4, 5, 6, 7]) {
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

    const headerTexts = new Set(['TRADE NAME SECTION', 'Manufactrer', 'Dose', 'الجشعت', 'Dosage forms', 'Trade name', 'Package', 'Disease', 'Therapeutic', 'Category', 'Generic', 'Name and', 'Composition', 'Country', 'صىسة الذواء', 'Product Picture']);
    
    const contentItems = items.filter(it => {
      if (it.y <= 50) return false;
      if (it.str === 'صفحة' || it.str === 'من' || it.str === '588' || it.str === String(pageNum)) return false;
      if (it.str.includes('حشح ٍب حسب األسن الخجبسي') || it.str.includes('السببح')) return false;
      if (it.y > 675 && headerTexts.has(it.str)) return false;
      return true;
    });

    const maxY = Math.max(...contentItems.map(it => it.y));
    const STEP = 85.0;
    const rows = [];

    for (let r = 0; r < 7; r++) {
      const topY = maxY - (r * STEP) + 12;
      const bottomY = topY - STEP;
      
      const rowItems = contentItems.filter(it => it.y <= topY && it.y > bottomY);
      if (rowItems.length === 0) continue;
      
      // Sub-divisions inside row:
      // Row top reference:
      const rowTopRef = topY - 12;
      
      // Col 1: x < 95
      const col1 = rowItems.filter(it => it.x < 95);
      // Sort Col 1 by y descending, then x ascending
      col1.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });
      
      // Sub-cell partitions:
      // Trade Name: relative Y from rowTopRef is [0, -23]
      // Dosage Form: relative Y from rowTopRef is [-24, -45]
      // Package: relative Y from rowTopRef is [-46, -85]
      const tradeItems = col1.filter(it => (it.y - rowTopRef) > -24);
      const dfItems = col1.filter(it => (it.y - rowTopRef) <= -24 && (it.y - rowTopRef) > -45);
      const pkgItems = col1.filter(it => (it.y - rowTopRef) <= -45);
      
      // Col 2: Generic Name / Composition (95 <= x < 180)
      const col2 = rowItems.filter(it => it.x >= 95 && it.x < 180);
      col2.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });
      
      // Col 3: Category (top) & Disease (bottom) (180 <= x < 260)
      const col3 = rowItems.filter(it => it.x >= 180 && it.x < 260);
      col3.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });
      const catItems = col3.filter(it => (it.y - rowTopRef) > -35);
      const diseaseItems = col3.filter(it => (it.y - rowTopRef) <= -35);
      
      // Col 4: Manufacturer (top) & Country (bottom) (260 <= x < 330)
      const col4 = rowItems.filter(it => it.x >= 260 && it.x < 330);
      col4.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });
      const mfgItems = col4.filter(it => (it.y - rowTopRef) > -40);
      const countryItems = col4.filter(it => (it.y - rowTopRef) <= -40);
      
      // Col 5: Dose (330 <= x < 475)
      const col5 = rowItems.filter(it => it.x >= 330 && it.x < 475);
      col5.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });
      
      rows.push({
        page: pageNum,
        row: r + 1,
        trade_name: tradeItems.map(it => it.str).join(' ') || null,
        dosage_form: dfItems.map(it => it.str).join(' ') || null,
        package: pkgItems.map(it => it.str).join(' ') || null,
        generic_name: col2.map(it => it.str).join(' ') || null,
        category: catItems.map(it => it.str).join(' ') || null,
        disease: diseaseItems.map(it => it.str).join(' ') || null,
        manufacturer: mfgItems.map(it => it.str).join(' ') || null,
        country: countryItems.map(it => it.str).join(' ') || null,
        dose: col5.map(it => it.str).join(' ') || null
      });
    }
    
    console.log(`\n================== PAGE ${pageNum} (${rows.length} rows) ==================`);
    rows.forEach(rw => {
      console.log(`Row ${rw.row}: [Trade: "${rw.trade_name}"] [DF: "${rw.dosage_form}"] [Pkg: "${rw.package}"] [Generic: "${rw.generic_name}"] [Mfg: "${rw.manufacturer}"] [Country: "${rw.country}"]`);
    });
  }
}

testExtractRefined().catch(console.error);
