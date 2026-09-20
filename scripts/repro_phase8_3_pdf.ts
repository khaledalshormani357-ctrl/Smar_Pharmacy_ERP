import { writeFileSync } from 'node:fs';
import { PdfService } from '../src/services/PdfService';
import { DocumentData } from '../src/types';

const fixture: DocumentData = {
  document_type: 'sale_invoice',
  document_number: 'INV-AR-001',
  business_date: '2026-09-21',
  created_at: Date.now(),
  pharmacy: {
    id: 'p', name_ar: 'صيدلية الشفاء الحديثة', phone: '772722134', currency: 'ر.ي', currency_code: 'YER',
    default_profit_margin_bps: 2000, receipt_paper_size: '80mm', device_id: 'd', sync_status: 'synced', updated_at: Date.now()
  },
  party_name: 'محمد أحمد', party_phone: '777000111', responsible_user: 'أمين الصندوق',
  lines: [{ id: '1', name: 'باراسيتامول 500 mg', unit: 'حبة', quantity: 2, unit_price: 10000, discount: 0, line_total: 20000, batch_number: 'B-01' }],
  subtotal: 20000, discount_amount: 500, tax_amount: 0, net_total: 19500, paid_amount: 19500, remaining_amount: 0,
  payment_method: 'cash', payment_status: 'مسددة بالكامل', status: 'completed', notes: 'شكراً لتعاملكم'
};
const [a4, thermal] = await Promise.all([
  PdfService.generateA4Document(fixture),
  PdfService.generateThermalReceipt(fixture)
]);
writeFileSync('/tmp/phase83-a4.pdf', a4);
writeFileSync('/tmp/phase83-80mm.pdf', thermal);
console.log('generated', a4.length, thermal.length);
