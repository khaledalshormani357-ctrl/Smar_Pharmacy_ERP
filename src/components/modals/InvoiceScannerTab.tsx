import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  ScanLine,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  Info,
  Check,
  ExternalLink
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PurchaseService } from '../../services/PurchaseService';
import { Money } from '../../utils/money';
import { Product, Supplier } from '../../types';

interface ExtractedItem {
  id: string;
  raw_name: string;
  product_name_ar: string;
  product_name_en?: string;
  matched_product_id?: string;
  is_new_product?: boolean;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_name: string;
  unit_purchase_price: number; // in normal currency (e.g. 1500)
  unit_selling_price: number;  // in normal currency (e.g. 2000)
  discount_amount?: number;
}

interface ExtractedInvoice {
  supplier_name: string;
  matched_supplier_id?: string;
  is_new_supplier?: boolean;
  invoice_number: string;
  invoice_date: string;
  payment_type: 'cash' | 'credit';
  total_amount?: number;
  items: ExtractedItem[];
  simulated?: boolean;
}

export const InvoiceScannerTab: React.FC = () => {
  const state = db.getState();
  const products = state.products;
  const suppliers = state.suppliers;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<ExtractedInvoice | null>(null);
  const [postingSuccess, setPostingSuccess] = useState<{ invoiceId: string; invoiceNumber: string; totalAmount: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Helper to handle image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('يرجى اختيار ملف صورة صالح (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setError(null);
      setInvoiceData(null);
      setPostingSuccess(null);
    };
    reader.readAsDataURL(file);
  };

  // Sample Invoices for quick test
  const handleLoadSample = (sampleType: 'pharma1' | 'pharma2') => {
    setPostingSuccess(null);
    setError(null);
    setInvoiceData(null);

    // Create a high-contrast canvas image representing a medical invoice
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 800, 1000);

      // Header
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, 800, 120);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.textAlign = 'center';
      const supplierName = sampleType === 'pharma1' ? 'شركة الأمل الدولية للأدوية والمستلزمات' : 'مؤسسة الشفاء لتوزيع الأدوية الحديثة';
      ctx.fillText(supplierName, 400, 50);

      ctx.font = '16px Arial, sans-serif';
      ctx.fillText('فاتورة مبيعات توريد صيدلاني - إذن استلام بضاعة', 400, 85);

      // Metadata
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'right';
      const invNum = sampleType === 'pharma1' ? 'INV-PH-98421' : 'PUR-SH-55109';
      const invDate = new Date().toISOString().split('T')[0];

      ctx.fillText(`رقم الفاتورة: ${invNum}`, 750, 160);
      ctx.fillText(`التاريخ: ${invDate}`, 750, 195);
      ctx.fillText('العميل: صيدلية المركز الذكية', 750, 230);
      ctx.fillText('شروط الدفع: آجل (Credit 30 Days)', 750, 265);

      // Table Header
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(50, 290, 700, 40);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(50, 290, 700, 40);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillText('الصنف الدوائي', 730, 315);
      ctx.fillText('التشغيلة (Batch)', 500, 315);
      ctx.fillText('الصلاحية', 390, 315);
      ctx.fillText('الكمية', 280, 315);
      ctx.fillText('سعر الشراء', 190, 315);
      ctx.fillText('سعر الجمهور', 100, 315);

      // Rows
      const rows = sampleType === 'pharma1' ? [
        { name: 'Panadol Extra 500mg 24s', batch: 'BN-7721A', exp: '2027-10-31', qty: '30', buy: '1,800', sell: '2,400' },
        { name: 'Amoxil 500mg Caps 20s', batch: 'BN-4432B', exp: '2027-08-31', qty: '20', buy: '2,600', sell: '3,500' },
        { name: 'Cataflam 50mg Tab 20s', batch: 'BN-9910C', exp: '2028-02-28', qty: '15', buy: '1,500', sell: '2,100' },
        { name: 'Omeprazole 20mg Caps 14s', batch: 'BN-1288D', exp: '2027-06-30', qty: '25', buy: '1,200', sell: '1,800' }
      ] : [
        { name: 'Augmentin 1g Tab 14s', batch: 'AG-9082X', exp: '2027-11-30', qty: '15', buy: '4,500', sell: '6,000' },
        { name: 'Brufen 400mg Tab 30s', batch: 'BR-3310M', exp: '2028-01-31', qty: '25', buy: '2,100', sell: '2,900' },
        { name: 'Vitamin C 1000mg Effervescent', batch: 'VC-5521K', exp: '2027-09-30', qty: '40', buy: '1,900', sell: '2,700' }
      ];

      let y = 360;
      rows.forEach((r, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(50, y - 25, 700, 35);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(50, y - 25, 700, 35);

        ctx.fillStyle = '#1e293b';
        ctx.font = '13px Arial, sans-serif';
        ctx.fillText(r.name, 730, y - 2);
        ctx.fillText(r.batch, 500, y - 2);
        ctx.fillText(r.exp, 390, y - 2);
        ctx.fillText(r.qty, 280, y - 2);
        ctx.fillText(r.buy, 190, y - 2);
        ctx.fillText(r.sell, 100, y - 2);
        y += 40;
      });

      // Total block
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(50, y + 20, 700, 60);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(50, y + 20, 700, 60);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px Arial, sans-serif';
      const totalStr = sampleType === 'pharma1' ? '158,500 ر.ي' : '196,000 ر.ي';
      ctx.fillText(`إجمالي قيمة الفاتورة الصافية: ${totalStr}`, 720, y + 55);

      const generatedDataUrl = canvas.toDataURL('image/png');
      setImageSrc(generatedDataUrl);
    }
  };

  // Perform AI analysis via server route
  const handleAnalyzeInvoice = async () => {
    if (!imageSrc) {
      setError('يرجى تحميل أو التقاط صورة الفاتورة أولاً.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setInvoiceData(null);
    setPostingSuccess(null);

    try {
      const response = await fetch('/api/gemini/analyze-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageSrc,
          existingProducts: products.map((p) => ({
            id: p.id,
            name_ar: p.name_ar,
            name_en: p.name_en,
            base_unit: p.base_unit
          })),
          existingSuppliers: suppliers.map((s) => ({
            id: s.id,
            name_ar: s.name_ar,
            name: s.name
          }))
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `فشل الاتصال بالخادم (${response.status})`);
      }

      const rawResult = await response.json();

      // Normalize items
      const rawItems: any[] = Array.isArray(rawResult.items) ? rawResult.items : [];
      const normalizedItems: ExtractedItem[] = rawItems.map((it, idx) => {
        // Auto-match with existing product if not already matched
        let matchedId = it.matched_product_id;
        if (!matchedId) {
          const rawL = (it.raw_name || it.product_name_ar || '').toLowerCase();
          const found = products.find((p) => {
            const pAr = p.name_ar.toLowerCase();
            const pEn = (p.name_en || '').toLowerCase();
            return pAr.includes(rawL) || rawL.includes(pAr) || (pEn && (pEn.includes(rawL) || rawL.includes(pEn)));
          });
          if (found) {
            matchedId = found.id;
          }
        }

        const purchasePrice = typeof it.unit_purchase_price === 'number'
          ? it.unit_purchase_price
          : parseFloat(String(it.unit_purchase_price || '0').replace(/[^0-9.]/g, '')) || 1000;

        const sellingPrice = typeof it.unit_selling_price === 'number'
          ? it.unit_selling_price
          : parseFloat(String(it.unit_selling_price || '0').replace(/[^0-9.]/g, '')) || Math.round(purchasePrice * 1.3);

        return {
          id: 'ext-' + idx + '-' + Math.random().toString(36).substring(2, 6),
          raw_name: it.raw_name || it.product_name_ar || `صنف دوائي #${idx + 1}`,
          product_name_ar: it.product_name_ar || it.raw_name || `صنف دوائي #${idx + 1}`,
          product_name_en: it.product_name_en || '',
          matched_product_id: matchedId,
          is_new_product: !matchedId,
          batch_number: it.batch_number || `BN-${Math.floor(10000 + Math.random() * 90000)}`,
          expiry_date: it.expiry_date || new Date(Date.now() + 365 * 2 * 86400000).toISOString().split('T')[0],
          quantity: Math.max(1, parseInt(String(it.quantity || 1), 10)),
          unit_name: it.unit_name || 'باكت',
          unit_purchase_price: purchasePrice,
          unit_selling_price: sellingPrice,
          discount_amount: it.discount_amount || 0
        };
      });

      // Match supplier
      let matchedSupId = rawResult.matched_supplier_id;
      if (!matchedSupId && rawResult.supplier_name) {
        const sName = rawResult.supplier_name.toLowerCase();
        const foundSup = suppliers.find((s) => (s.name_ar || s.name || '').toLowerCase().includes(sName) || sName.includes((s.name_ar || s.name || '').toLowerCase()));
        if (foundSup) {
          matchedSupId = foundSup.id;
        }
      }

      setInvoiceData({
        supplier_name: rawResult.supplier_name || 'مورد غير محدد بالفاتورة',
        matched_supplier_id: matchedSupId,
        is_new_supplier: !matchedSupId,
        invoice_number: rawResult.invoice_number || `INV-${Date.now().toString().slice(-6)}`,
        invoice_date: rawResult.invoice_date || new Date().toISOString().split('T')[0],
        payment_type: rawResult.payment_type === 'cash' ? 'cash' : 'credit',
        total_amount: rawResult.total_amount,
        items: normalizedItems,
        simulated: !!rawResult.simulated
      });
    } catch (err: any) {
      setError(err.message || 'تعذر تحليل صورة الفاتورة. يرجى التأكد من وضوح الصورة والمحاولة مرة أخرى.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Modify Extracted Item Field
  const updateItem = (id: string, updates: Partial<ExtractedItem>) => {
    if (!invoiceData) return;
    setInvoiceData({
      ...invoiceData,
      items: invoiceData.items.map((it) => (it.id === id ? { ...it, ...updates } : it))
    });
  };

  // Remove Extracted Item
  const removeItem = (id: string) => {
    if (!invoiceData) return;
    setInvoiceData({
      ...invoiceData,
      items: invoiceData.items.filter((it) => it.id !== id)
    });
  };

  // Add a blank row
  const addBlankItem = () => {
    if (!invoiceData) return;
    const newItem: ExtractedItem = {
      id: 'ext-man-' + Math.random().toString(36).substring(2, 7),
      raw_name: 'صنف يدوي جديد',
      product_name_ar: 'صنف يدوي جديد',
      is_new_product: true,
      batch_number: `BN-${Math.floor(10000 + Math.random() * 90000)}`,
      expiry_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      quantity: 1,
      unit_name: 'باكت',
      unit_purchase_price: 1000,
      unit_selling_price: 1300
    };
    setInvoiceData({
      ...invoiceData,
      items: [...invoiceData.items, newItem]
    });
  };

  // Confirm and Enter Purchase Invoice into System
  const handlePostPurchaseInvoice = () => {
    if (!invoiceData) return;
    if (invoiceData.items.length === 0) {
      setError('يرجى إضافة صنف واحد على الأقل في الفاتورة قبل الترحيل.');
      return;
    }

    try {
      // 1. Resolve Supplier
      let finalSupplierId = invoiceData.matched_supplier_id;
      if (!finalSupplierId) {
        // Create new supplier on the fly
        const newSupId = 'sup-' + Math.random().toString(36).substring(2, 9);
        const newSupplier: Supplier = {
          id: newSupId,
          name_ar: invoiceData.supplier_name.trim() || 'مورد فاتورة ذكية',
          name: invoiceData.supplier_name.trim() || 'مورد فاتورة ذكية',
          phone: '000000000',
          cached_balance: 0,
          is_active: true,
          current_balance: 0,
          created_at: Date.now(),
          updated_at: Date.now()
        };

        db.transaction(() => {
          const s = db.getState();
          s.suppliers.push(newSupplier);
        });
        finalSupplierId = newSupId;
      }

      // 2. Resolve Items & New Products
      const resolvedItemsPayload = invoiceData.items.map((item) => {
        let finalProductId = item.matched_product_id;

        // If it's a new product or unmatched, create it in products table
        if (!finalProductId || item.is_new_product) {
          const newProdId = 'prod-' + Math.random().toString(36).substring(2, 9);
          const newProd: Product = {
            id: newProdId,
            internal_code: 'PRD-' + Math.floor(1000 + Math.random() * 9000),
            name_ar: item.product_name_ar.trim() || item.raw_name,
            name_en: item.product_name_en || '',
            dosage_form: 'tablet',
            base_unit: item.unit_name || 'باكت',
            pack_size: 1,
            current_purchase_price: Money.toMinor(item.unit_purchase_price),
            current_selling_price: Money.toMinor(item.unit_selling_price),
            min_stock_level: 5,
            reorder_level: 10,
            prescription_required: false,
            is_controlled: false,
            is_active: true,
            created_at: Date.now(),
            updated_at: Date.now()
          };

          db.transaction(() => {
            const s = db.getState();
            s.products.push(newProd);
          });
          finalProductId = newProdId;
        }

        return {
          product_id: finalProductId,
          batch_number: item.batch_number.trim().toUpperCase() || 'BN-GENERIC',
          expiry_date: item.expiry_date,
          unit_name: item.unit_name || 'باكت',
          unit_factor: 1,
          quantity: item.quantity,
          unit_purchase_price: Money.toMinor(item.unit_purchase_price),
          unit_selling_price: Money.toMinor(item.unit_selling_price),
          discount_amount: item.discount_amount ? Money.toMinor(item.discount_amount) : 0
        };
      });

      // 3. Create the purchase invoice atomically
      const purchaseResult = PurchaseService.createPurchase({
        supplier_id: finalSupplierId,
        invoice_number: invoiceData.invoice_number.trim(),
        purchase_date: invoiceData.invoice_date,
        payment_type: invoiceData.payment_type,
        user_id: 'user-01',
        update_product_purchase_price: true,
        update_product_selling_price: true,
        notes: 'تم استخراجها وترحيلها آلياً بواسطة مساعد الذكاء الاصطناعي (Gemini Vision OCR)',
        items: resolvedItemsPayload
      });

      setPostingSuccess({
        invoiceId: purchaseResult.id,
        invoiceNumber: purchaseResult.invoice_number,
        totalAmount: purchaseResult.net_total
      });
      setInvoiceData(null);
      setImageSrc(null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'فشل ترحيل فاتورة المشتريات إلى النظام.');
    }
  };

  // Calculate invoice total preview
  const currentTotal = invoiceData?.items.reduce(
    (acc, it) => acc + (it.quantity * it.unit_purchase_price) - (it.discount_amount || 0),
    0
  ) || 0;

  return (
    <div className="space-y-4 text-xs">
      {/* Success Notification */}
      {postingSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 animate-in fade-in zoom-in-95">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="font-black text-emerald-900 text-sm">
              تم إدخال وترحيل فاتورة المشتريات إلى النظام بنجاح!
            </h4>
            <p className="text-emerald-700 leading-relaxed">
              رقم الفاتورة: <strong className="font-mono">{postingSuccess.invoiceNumber}</strong> |
              إجمالي القيمة: <strong className="font-mono">{Money.format(postingSuccess.totalAmount)}</strong>.
              تم تحديث أرصدة الدفعات (Batches)، وتوليد حركات المخزون (Stock Movements)، وتسجيل القيود المحاسبية للمورد آلياً.
            </p>
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPostingSuccess(null)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors"
              >
                مسح فاتورة أخرى
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-medium flex-1">{error}</span>
        </div>
      )}

      {/* Upload / Capture Stage */}
      {!invoiceData && !postingSuccess && (
        <div className="space-y-4">
          <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-indigo-950 text-xs">
                ميزة التحليل الذكي لفواتير المشتريات الدوائية (Gemini Vision OCR)
              </h4>
              <p className="text-indigo-800/80 text-[11px] leading-relaxed mt-0.5">
                التقط صورة لفاتورة التوريد الورقية أو ارفعها، وسيقوم الذكاء الاصطناعي باستخراج اسم المورد، أرقام الدفعات والتشغيلات، تواريخ الصلاحية، الأسعار والكميات بدقة، لتتمكن من مراجعتها واعتمادها كفاتورة مشتريات رسمية بضغطة زر.
              </p>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-indigo-50/20 transition-all flex flex-col items-center justify-center gap-2.5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />

            {imageSrc ? (
              <div className="space-y-2">
                <img
                  src={imageSrc}
                  alt="معاينة الفاتورة"
                  className="max-h-48 rounded-xl mx-auto shadow-sm border border-slate-200 object-contain"
                />
                <p className="text-slate-600 font-bold">تم تحميل الصورة بنجاح (انقر لتغييرها)</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">انقر لرفع صورة الفاتورة أو اسحبها هنا</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">يدعم صور الكاميرا، الماسح الضوئي، JPG, PNG, WEBP</p>
                </div>
              </>
            )}
          </div>

          {/* Quick Actions & Demo Samples */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Camera className="w-4 h-4 text-slate-600" />
                <span>التقاط بالكاميرا</span>
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('pharma1')}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-xl flex items-center gap-1.5 border border-amber-200 transition-colors"
              >
                <FileText className="w-4 h-4 text-amber-600" />
                <span>نموذج فاتورة 1 (الأمل للأدوية)</span>
              </button>

              <button
                type="button"
                onClick={() => handleLoadSample('pharma2')}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold rounded-xl flex items-center gap-1.5 border border-blue-200 transition-colors"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span>نموذج فاتورة 2 (الشفاء الدوائية)</span>
              </button>
            </div>

            {imageSrc && (
              <button
                type="button"
                disabled={analyzing}
                onClick={handleAnalyzeInvoice}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تحليل الفاتورة واستخراج البنود...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>تحليل الفاتورة بالذكاء الاصطناعي</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Review & Edit Extracted Invoice */}
      {invoiceData && (
        <div className="space-y-4 animate-in fade-in zoom-in-95">
          {/* Header Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-indigo-600" />
                <h4 className="font-black text-slate-900 text-xs">
                  البيانات العامة للفاتورة المستخرجة من الصورة
                </h4>
                {invoiceData.simulated && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px]">
                    نموذج استخراج تجريبي
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setInvoiceData(null);
                  setImageSrc(null);
                }}
                className="text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1 text-[11px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة المسح</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              {/* Supplier Selection */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">المورد *</label>
                <select
                  value={invoiceData.matched_supplier_id || '__NEW__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__NEW__') {
                      setInvoiceData({
                        ...invoiceData,
                        matched_supplier_id: undefined,
                        is_new_supplier: true
                      });
                    } else {
                      const selSup = suppliers.find((s) => s.id === val);
                      setInvoiceData({
                        ...invoiceData,
                        matched_supplier_id: val,
                        is_new_supplier: false,
                        supplier_name: selSup?.name_ar || selSup?.name || invoiceData.supplier_name
                      });
                    }
                  }}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs"
                >
                  <option value="__NEW__">
                    {`+ إنشاء مورد جديد: (${invoiceData.supplier_name})`}
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_ar || s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">رقم الفاتورة *</label>
                <input
                  type="text"
                  value={invoiceData.invoice_number}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoice_number: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold font-mono text-xs"
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">تاريخ الفاتورة</label>
                <input
                  type="date"
                  value={invoiceData.invoice_date}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoice_date: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold font-mono text-xs"
                />
              </div>

              {/* Payment Type */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">طريقة السداد</label>
                <select
                  value={invoiceData.payment_type}
                  onChange={(e) => setInvoiceData({ ...invoiceData, payment_type: e.target.value as any })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-xs"
                >
                  <option value="credit">آجل / ذمم موردين (Credit)</option>
                  <option value="cash">نقداً من الصندوق (Cash)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <span>الأصناف الدوائية المستخرجة</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md font-mono text-[11px]">
                  {invoiceData.items.length} صنف
                </span>
              </span>
              <button
                type="button"
                onClick={addBlankItem}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-right border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-bold text-[11px] sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">الصنف في الفاتورة والربط</th>
                      <th className="p-2.5 w-28">رقم التشغيلة</th>
                      <th className="p-2.5 w-28">الصلاحية</th>
                      <th className="p-2.5 w-20">الكمية</th>
                      <th className="p-2.5 w-24">سعر الشراء</th>
                      <th className="p-2.5 w-24">سعر البيع</th>
                      <th className="p-2.5 w-24">الإجمالي</th>
                      <th className="p-2.5 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {invoiceData.items.map((item) => {
                      const itemTotal = (item.quantity * item.unit_purchase_price) - (item.discount_amount || 0);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.product_name_ar}
                              onChange={(e) => updateItem(item.id, { product_name_ar: e.target.value })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs mb-1"
                            />
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <select
                                value={item.matched_product_id || '__NEW__'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '__NEW__') {
                                    updateItem(item.id, { matched_product_id: undefined, is_new_product: true });
                                  } else {
                                    const p = products.find((pr) => pr.id === val);
                                    updateItem(item.id, {
                                      matched_product_id: val,
                                      is_new_product: false,
                                      product_name_ar: p?.name_ar || item.product_name_ar
                                    });
                                  }
                                }}
                                className="w-full p-1 bg-white border border-slate-200 rounded text-slate-600 font-medium"
                              >
                                <option value="__NEW__">+ إنشاء كصنف جديد في الصيدلية</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    ربط مع: {p.name_ar}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.batch_number}
                              onChange={(e) => updateItem(item.id, { batch_number: e.target.value })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="date"
                              value={item.expiry_date}
                              onChange={(e) => updateItem(item.id, { expiry_date: e.target.value })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={item.unit_purchase_price}
                              onChange={(e) => updateItem(item.id, { unit_purchase_price: parseFloat(e.target.value) || 0 })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              value={item.unit_selling_price}
                              onChange={(e) => updateItem(item.id, { unit_selling_price: parseFloat(e.target.value) || 0 })}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-xs text-emerald-700"
                            />
                          </td>
                          <td className="p-2 font-mono font-bold text-slate-800 text-xs">
                            {Money.format(Money.toMinor(itemTotal))}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer Actions & Post Button */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-slate-400 block text-[11px]">إجمالي قيمة الفاتورة الصافية للتوريد:</span>
              <span className="text-xl font-black font-mono text-emerald-400">
                {Money.format(Money.toMinor(currentTotal))}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInvoiceData(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition-colors"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handlePostPurchaseInvoice}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>اعتماد وترحيل فاتورة المشتريات إلى المخزون</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
