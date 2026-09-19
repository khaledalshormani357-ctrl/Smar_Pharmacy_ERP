const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function testExtractorOnPages() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  const doc = await parser.load();
  
  const testPages = [3, 4, 15, 50, 100, 200, 300, 400, 500, 580];
  
  for (const p of testPages) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    
    // Filter out empty items
    const items = textContent.items
      .filter(it => it.str && it.str.trim().length > 0)
      .map(it => ({
        str: it.str.trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
        w: Math.round(it.width),
        h: Math.round(it.height)
      }));

    // Exclude page header (y >= 670) and footer (y <= 45)
    const contentItems = items.filter(it => it.y < 670 && it.y > 45);

    // Group items into cards by detecting Y clusters
    // Each card detail band starts with an item in x < 95 (Trade name) or x in [260, 330] (Manufacturer)
    // In fact, the card height is typically ~85 points. Let's find the card starts:
    // The top line of a card has y values that drop by at least ~40-50 from previous card
    
    // Let's sort items by y descending
    contentItems.sort((a, b) => b.y - a.y);
    
    // Find all distinct y clusters for "top of card" (e.g. where trade_name or manufacturer starts)
    // Let's inspect the y coordinates of items in x < 95
    const col1Items = contentItems.filter(it => it.x < 95);
    
    console.log(`\n=== PAGE ${p}: ${contentItems.length} items ===`);
    console.log(`Col 1 (Trade/DF/Pkg) has ${col1Items.length} items:`);
    col1Items.forEach(it => console.log(`  y=${it.y}, x=${it.x}: "${it.str}"`));
  }
}

testExtractorOnPages().catch(console.error);
