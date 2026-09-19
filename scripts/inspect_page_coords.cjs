const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function inspectPageCoordinates() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  const doc = await parser.load();
  
  const page = await doc.getPage(3);
  const textContent = await page.getTextContent();
  
  // Filter out empty strings
  const items = textContent.items
    .filter(it => it.str && it.str.trim().length > 0)
    .map(it => ({
      str: it.str.trim(),
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
      w: Math.round(it.width),
      h: Math.round(it.height)
    }));

  // Sort descending by y (top of page to bottom), then ascending by x (left to right)
  items.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) {
      return b.y - a.y; // top first
    }
    return a.x - b.x; // left first
  });

  console.log(`--- Page 3 items count: ${items.length} ---`);
  // Group into horizontal bands (rows)
  const rows = [];
  let currentRow = [];
  let currentY = null;

  for (const it of items) {
    if (currentY === null || Math.abs(it.y - currentY) <= 6) {
      currentRow.push(it);
      currentY = it.y;
    } else {
      rows.push({ y: currentY, items: currentRow });
      currentRow = [it];
      currentY = it.y;
    }
  }
  if (currentRow.length > 0) {
    rows.push({ y: currentY, items: currentRow });
  }

  console.log(`Found ${rows.length} visual text lines/bands on page 3:`);
  rows.forEach((r, idx) => {
    const textBand = r.items.map(it => `[x=${it.x}] "${it.str}"`).join('  |  ');
    console.log(`Band ${idx} (y=${r.y}): ${textBand}`);
  });
}

inspectPageCoordinates().catch(console.error);
