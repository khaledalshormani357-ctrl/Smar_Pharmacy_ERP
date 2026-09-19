const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const COUNTRIES = new Set([
  'Yemen', 'Jordan', 'Egypt', 'Syria', 'UAE', 'Saudi Arabia', 'KSA',
  'India', 'Germany', 'Thailand', 'Turkey', 'UK', 'Denmark', 'Belgium',
  'France', 'Switzerland', 'USA', 'Spain', 'Italy', 'Cyprus', 'Lebanon',
  'Oman', 'Kuwait', 'Bahrain', 'Iran', 'Pakistan', 'China', 'Netherlands',
  'Austria', 'Ireland', 'Poland', 'Greece', 'Canada', 'Japan', 'Malaysia',
  'Korea', 'South Korea', 'Portugal', 'Sweden', 'Finland', 'Norway',
  'Czech Republic', 'Hungary', 'Romania', 'Bulgaria', 'Russia', 'Ukraine',
  'Australia', 'New Zealand', 'Brazil', 'Argentina', 'Tunisia', 'Morocco',
  'Algeria', 'Sudan', 'Unknown'
]);

async function findCountries() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  const foundCountries = new Map();
  
  for (let i = 2; i < res.pages.length; i++) {
    const raw = res.pages[i].text;
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = raw.slice(headerIdx + headerMarker.length).trim();
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = body.slice(0, footerIdx).trim();
    
    const lines = cleanBody.split('\n').map(l => l.trim());
    for (const l of lines) {
      if (COUNTRIES.has(l)) {
        foundCountries.set(l, (foundCountries.get(l) || 0) + 1);
      }
    }
  }
  
  console.log('Found Countries and counts:');
  for (const [c, count] of foundCountries.entries()) {
    console.log(`  ${c}: ${count}`);
  }
}

findCountries().catch(console.error);
