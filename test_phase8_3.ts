import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PdfService } from './src/services/PdfService';
import { processBidiForPdf } from './src/utils/arabicShaper';
import { Money } from './src/utils/money';

const fontSource = fs.readFileSync('src/utils/arabicFontData.ts', 'utf8');
assert.ok(fontSource.length > 900_000, 'PDF must embed a real mixed-script font, not the incomplete 62KB font');
assert.match(fontSource, /DejaVu|Noto|TrueType/i);

const shaped = processBidiForPdf('صيدلية الشفاء الحديثة INV-001');
assert.ok(shaped.length > 0);
assert.notEqual(shaped, '');

const fixture: any = {
  document_type: 'sale_invoice', document_number: 'INV-AR-001', business_date: '2026-09-21', created_at: Date.now(),
  pharmacy: { id: 'p', name_ar: 'صيدلية الشفاء', phone: '777123456', currency: 'ر.ي', currency_code: 'YER', default_profit_margin_bps: 2000, receipt_paper_size: '80mm', device_id: 'd', sync_status: 'synced', updated_at: Date.now() },
  party_name: 'محمد أحمد', responsible_user: 'أمين الصندوق',
  lines: [{ id: '1', name: 'باراسيتامول 500 mg', unit: 'حبة', quantity: 2, unit_price: 10000, discount: 0, line_total: 20000 }],
  subtotal: 20000, discount_amount: 500, tax_amount: 0, net_total: 19500, paid_amount: 19500, remaining_amount: 0,
  payment_method: 'cash', payment_status: 'مسددة بالكامل', status: 'completed'
};
const [a4, receipt] = await Promise.all([PdfService.generateA4Document(fixture), PdfService.generateThermalReceipt(fixture)]);
for (const pdf of [a4, receipt]) {
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), '%PDF');
  assert.ok(pdf.length > 20_000, 'generated PDF must contain embedded font and content');
}

assert.equal(Money.toMinor('12.50'), 1250);
assert.equal(Money.toMajor(19500), 195);
assert.equal(Money.formatNumber(19500), '١٩٥٫٠٠');

const review = fs.readFileSync('public/data/drug_catalog_review.csv', 'utf8');
assert.ok(review.startsWith('source_file,source_page,source_row,reason,original_record'));
const importBuilder = fs.readFileSync('scripts/build_catalog_artifacts.cjs', 'utf8');
assert.match(importBuilder, /requires visual\/source review/);
assert.match(importBuilder, /raw\.raw_disease\.trim\(\)/);

console.log('Phase 8.3 tests passed: PDF font/render gate, money calculations, and source-fidelity review policy');
