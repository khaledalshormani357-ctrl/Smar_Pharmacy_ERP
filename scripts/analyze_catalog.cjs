const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function analyze() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  console.log('Total pages loaded:', res.pages.length);
  
  // Header pattern to strip:
  // صفحة\tN\tمن\t588 ... TRADE NAME SECTION حشح ٍب حسب األسن الخجبسي
  // Footer pattern to strip:
  // األسخبر الذكخىس ...
  
  let totalCardsFound = 0;
  const pageStats = [];

  for (let p = 3; p <= 15; p++) {
    const raw = res.pages[p - 1].text;
    console.log(`\n=================== ANALYZING PAGE ${p} ===================`);
    
    // Find header end
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = headerIdx !== -1 ? raw.slice(headerIdx + headerMarker.length).trim() : raw;
    
    // Find footer start
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = footerIdx !== -1 ? body.slice(0, footerIdx).trim() : body;
    
    console.log('Clean body length:', cleanBody.length);
    console.log('Clean body snippet:\n', cleanBody.slice(0, 500));
  }
}

analyze().catch(console.error);
