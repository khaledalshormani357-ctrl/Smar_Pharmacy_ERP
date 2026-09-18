import assert from 'node:assert/strict';
import {
  classifyImageAnalysisError,
  isValidNumericDraft,
  normalizeNumericText,
  validateAnalysisImage,
} from './src/utils/phase82.ts';

// Input regression cases: empty drafts are allowed while editing.
assert.equal(normalizeNumericText('١٢٣'), '123');
assert.equal(normalizeNumericText('۱۲٫۵'.replace('٫', '،')), '12.5');
assert.equal(isValidNumericDraft('12', true), true);
assert.equal(isValidNumericDraft('', true), true);
assert.equal(isValidNumericDraft('.', true), true);
assert.equal(isValidNumericDraft('12.5', true), true);
assert.equal(isValidNumericDraft('12..5', true), false);
assert.equal(isValidNumericDraft('12.5', false), false);

// Image pipeline validation cases.
const valid = { type: 'image/jpeg', size: 1024, name: 'invoice.jpg' };
assert.equal(validateAnalysisImage(valid), null);
assert.match(validateAnalysisImage({ type: 'application/pdf', size: 1024, name: 'invoice.pdf' }) || '', /غير مدعومة/);
assert.match(validateAnalysisImage({ type: 'image/jpeg', size: 16 * 1024 * 1024, name: 'large.jpg' }) || '', /كبير/);
assert.match(classifyImageAnalysisError(new Error('TIMEOUT')), /مهلة/);
assert.match(classifyImageAnalysisError(new Error('Failed to fetch')), /الاتصال/);

console.log('PHASE 8.2 focused tests: PASS');
