const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function testRecordBoundaries() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  // Let's inspect page texts and find common patterns
  console.log(`Analyzing all ${res.pages.length} pages...`);
  
  // How many pages have the header marker?
  let pagesWithHeader = 0;
  let pagesWithFooter = 0;
  
  for (let i = 2; i < res.pages.length; i++) {
    const text = res.pages[i].text;
    if (text.includes("TRADE NAME SECTION") || text.includes("حشح ٍب حسب األسن الخجبسي")) {
      pagesWithHeader++;
    }
    if (text.includes("األسخبر الذكخىس") || text.includes("السببح")) {
      pagesWithFooter++;
    }
  }
  console.log(`Pages 3-588 (total ${res.pages.length - 2}): with header: ${pagesWithHeader}, with footer: ${pagesWithFooter}`);
}

testRecordBoundaries().catch(console.error);
