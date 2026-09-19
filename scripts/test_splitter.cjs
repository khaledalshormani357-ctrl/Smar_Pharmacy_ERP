const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const COUNTRIES = [
  'Yemen', 'Jordan', 'Egypt', 'Syria', 'UAE', 'Saudi Arabia', 'KSA',
  'India', 'Germany', 'Thailand', 'Turkey', 'UK', 'Denmark', 'Belgium',
  'France', 'Switzerland', 'USA', 'Spain', 'Italy', 'Cyprus', 'Lebanon',
  'Oman', 'Kuwait', 'Bahrain', 'Iran', 'Pakistan', 'China', 'Netherlands',
  'Austria', 'Ireland', 'Poland', 'Greece', 'Canada', 'Japan', 'Malaysia',
  'Korea', 'South Korea', 'Portugal', 'Sweden', 'Finland', 'Norway',
  'Czech Republic', 'Hungary', 'Romania', 'Bulgaria', 'Russia', 'Ukraine',
  'Australia', 'New Zealand', 'Brazil', 'Argentina', 'Tunisia', 'Morocco',
  'Algeria', 'Sudan', 'Unknown'
];

// Compile country regex
const countryRegex = new RegExp(`^(${COUNTRIES.join('|')})$`, 'i');

async function testRecordSplitter() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  let totalExtracted = 0;
  let pagesWithNon7 = 0;

  for (let p = 3; p <= 588; p++) {
    const raw = res.pages[p - 1].text;
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = headerIdx !== -1 ? raw.slice(headerIdx + headerMarker.length).trim() : raw;
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = footerIdx !== -1 ? body.slice(0, footerIdx).trim() : body;
    
    // Split into lines
    const lines = cleanBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Identify where new records start
    // A record starts at index i if:
    // lines[i] or lines[i+1] is a Country name, AND there is a dosage form or dose following it
    const recordStartIndices = [];
    
    for (let i = 0; i < lines.length; i++) {
      // Check if lines[i] is country, or lines[i+1] is country (when line[i] is manufacturer)
      // Note: Manufacturer can be 1 or 2 lines
      const isLineCountry = countryRegex.test(lines[i]);
      const isNextCountry = i + 1 < lines.length && countryRegex.test(lines[i + 1]);
      const isNext2Country = i + 2 < lines.length && countryRegex.test(lines[i + 2]);
      
      // If lines[i] is country and i > 0, then start was i - 1 (or i - 2)
      // Let's refine how we detect record boundaries
    }
  }
}

testRecordSplitter().catch(console.error);
