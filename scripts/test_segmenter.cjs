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

const countrySet = new Set(COUNTRIES.map(c => c.toLowerCase()));

function isCountry(str) {
  if (!str) return false;
  return countrySet.has(str.trim().toLowerCase());
}

async function testSegmenter() {
  const data = fs.readFileSync('docs/Drug_Catalog_Source1.pdf');
  const parser = new PDFParse({ data });
  await parser.load();
  const res = await parser.getText();
  
  let totalCards = 0;
  let pageCardCounts = {};

  for (let p = 3; p <= 588; p++) {
    const raw = res.pages[p - 1].text;
    const headerMarker = "حشح ٍب حسب األسن الخجبسي";
    const headerIdx = raw.indexOf(headerMarker);
    const body = headerIdx !== -1 ? raw.slice(headerIdx + headerMarker.length).trim() : raw;
    const footerMarker = "األسخبر الذكخىس";
    const footerIdx = body.indexOf(footerMarker);
    const cleanBody = footerIdx !== -1 ? body.slice(0, footerIdx).trim() : body;
    
    const lines = cleanBody.split('\n').map(l => l.trim()).filter(Boolean);
    
    // Find country line indices
    // A country line is a line that matches isCountry()
    // BUT we must avoid false positives if any occur in dosage or indications (rare)
    const countryIndices = [];
    for (let i = 0; i < lines.length; i++) {
      if (isCountry(lines[i])) {
        // Double check it's not part of a sentence
        if (lines[i].split(/\s+/).length <= 3) {
          countryIndices.push(i);
        }
      }
    }
    
    // Sometimes Unknown / Unknown means two consecutive lines:
    // lines[i] = "Unknown" (Mfg), lines[i+1] = "Unknown" (Country)
    // In that case, lines[i+1] is the country!
    const validCountryIndices = [];
    for (let k = 0; k < countryIndices.length; k++) {
      const idx = countryIndices[k];
      if (lines[idx].toLowerCase() === 'unknown' && idx + 1 < lines.length && lines[idx+1].toLowerCase() === 'unknown') {
        // The first is Mfg, the second is Country
        validCountryIndices.push(idx + 1);
        k++; // skip next
      } else {
        validCountryIndices.push(idx);
      }
    }
    
    totalCards += validCountryIndices.length;
    const count = validCountryIndices.length;
    pageCardCounts[count] = (pageCardCounts[count] || 0) + 1;
    
    if (count !== 7 && p <= 30) {
      console.log(`Page ${p} has ${count} records. Country indices:`, validCountryIndices.map(ci => `${ci}: ${lines[ci]} (prev: ${lines[ci-1]})`));
    }
  }
  
  console.log(`\nTotal cards detected across all 586 pages: ${totalCards}`);
  console.log('Distribution of card counts per page:', pageCardCounts);
}

testSegmenter().catch(console.error);
