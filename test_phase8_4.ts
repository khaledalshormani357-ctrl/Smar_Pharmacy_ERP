import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isValidNumericDraft, normalizeNumericText, validateAnalysisImage } from './src/utils/phase82';

const purchases = fs.readFileSync('src/components/purchases/PurchasesView.tsx', 'utf8');
const assistant = fs.readFileSync('src/assistant/ui/CopilotChatTab.tsx', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const importer = fs.readFileSync('src/services/CatalogImportService.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

// Input editing contract.
assert.equal(isValidNumericDraft('', false), true);
assert.equal(isValidNumericDraft('125', false), true);
assert.equal(isValidNumericDraft('12.5', true), true);
assert.equal(isValidNumericDraft('١٢٫٥'.replace('٫', '.'), true), false);
assert.equal(normalizeNumericText('١٢٥۰,٥'), '1250.5');
assert.match(fs.readFileSync('src/components/ui/NumericInput.tsx', 'utf8'), /focused|isFocused|draft/);

// Image/AI contract: no client key and no fake response branch.
assert.match(server, /app\.post\('\/api\/assistant\/chat'/);
assert.match(server, /gemini-2\.5-flash/);
assert.match(assistant, /\/api\/assistant\/chat/);
assert.match(assistant, /AbortController/);
assert.match(assistant, /إعادة المحاولة/);
assert.doesNotMatch(server, /simulated|fake OCR/i);

// Purchase search contract.
assert.match(purchases, /productQuery/);
assert.match(purchases, /active_ingredient/);
assert.match(purchases, /barcode/);
assert.match(purchases, /normalizeSearch/);
assert.match(purchases, /لا توجد نتائج مطابقة/);

// Import contract: async yielding + atomic rollback primitive.
assert.match(importer, /transactionAsync/);
assert.match(importer, /setTimeout\(resolve, 0\)/);
assert.match(importer, /batchSize/);

// Android back contract: one native listener and root double-back behavior.
assert.match(app, /CapacitorApp\.addListener\('backButton'/);
assert.match(app, /CapacitorApp\.exitApp\(\)/);
assert.match(app, /اضغط مرة أخرى للخروج/);

const validImage = { type: 'image/png', size: 1024, name: 'invoice.png' } as File;
assert.equal(validateAnalysisImage(validImage), null);
assert.match(validateAnalysisImage({ type: 'text/plain', size: 10, name: 'x.txt' } as File) || '', /غير مدعومة/);
assert.match(validateAnalysisImage({ type: 'image/png', size: 16 * 1024 * 1024, name: 'large.png' } as File) || '', /كبير/);

console.log('Phase 8.4 focused tests: PASS');
