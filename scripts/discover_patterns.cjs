const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function discoverPatterns() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  // Let's inspect pages 3 to 20 to see how cards can be segmented
  const samplePages = [3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 50, 100, 200, 300, 400, 500, 580];
  
  for (const p of samplePages) {
    const raw = res.pages[p - 1].text;
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = raw.slice(headerIdx + headerMarker.length).trim();
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = body.slice(0, footerIdx).trim();
    
    // Look at lines
    const lines = cleanBody.split('\n').map(l => l.trim()).filter(Boolean);
    console.log(`Page ${p}: cleanBody length = ${cleanBody.length}, line count = ${lines.length}`);
  }
}

discoverPatterns().catch(console.error);
