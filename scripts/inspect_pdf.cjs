const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function run() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  
  const info = await parser.getInfo();
  console.log('PDF Info:', JSON.stringify(info, null, 2));

  // Check page 1 text
  const page1Text = await parser.getPageText(1);
  console.log('--- PAGE 1 TEXT ---');
  console.log(page1Text);

  // Check page 2 text
  const page2Text = await parser.getPageText(2);
  console.log('--- PAGE 2 TEXT ---');
  console.log(page2Text);

  // Check page 3 text
  const page3Text = await parser.getPageText(3);
  console.log('--- PAGE 3 TEXT ---');
  console.log(page3Text);

  // Check page 10 text
  const page10Text = await parser.getPageText(10);
  console.log('--- PAGE 10 TEXT ---');
  console.log(page10Text);

  await parser.destroy();
}

run().catch(console.error);
