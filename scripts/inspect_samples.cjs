const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function inspectSamplePages() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  console.log('Total pages:', res.pages.length);
  const samplePageNumbers = [3, 4, 5, 15, 50, 100];
  
  for (const pageNum of samplePageNumbers) {
    const pageText = res.pages[pageNum - 1].text;
    console.log(`\n================== PAGE ${pageNum} ==================`);
    console.log(pageText.slice(0, 1200));
  }
}

inspectSamplePages().catch(console.error);
