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
  RotateCcw,
  FileText,
  Info,
  Check,
  ExternalLink
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PurchaseService } from '../../services/PurchaseService';
import { Money } from '../../utils/money';
import { Product, Supplier } from '../../types';
import { classifyImageAnalysisError, readFileAsDataUrl, validateAnalysisImage, withTimeout } from '../../utils/phase82';
import { NumericInput } from '../ui/NumericInput';
import { NetworkStatusService } from '../../services/NetworkStatusService';

export type OcrStage =
  | 'IDLE'
  | 'FILE_SELECTED'
  | 'VALIDATING'
  | 'PREPARING'
  | 'UPLOADING'
  | 'WAITING_FOR_HTTP_RESPONSE'
  | 'UPLOAD_COMPLETED'
  | 'ANALYZING'
  | 'RESPONSE_RECEIVED'
  | 'COMPLETED'
  | 'ERROR';

export interface OcrDiagnosticInfo {
  fileSelected: boolean;
  fileName: string;
  mimeType: string;
  fileSize: number;
  apiUrl: string;
  apiProtocol: string;
  networkStatus: string;
  apiReachability: 'UNKNOWN' | 'CHECKING' | 'PASS' | 'FAIL';
  uploadStarted: boolean;
  uploadProgress: number;
  uploadCompleted: boolean;
  httpStatus: number | null;
  serverResponseReceived: boolean;
  geminiRequestStarted: boolean;
  geminiResponseReceived: boolean;
  ocrParsing: 'IDLE' | 'PARSING' | 'SUCCESS' | 'FAILED';
  finalStatus: string;
  errorCode?: string | null;
  modelUsed?: string;
  latencyMs?: number;
}

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
  unit_factor?: number;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrStage, setOcrStage] = useState<OcrStage>('IDLE');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<ExtractedInvoice | null>(null);
  const [postingSuccess, setPostingSuccess] = useState<{ invoiceId: string; invoiceNumber: string; totalAmount: number } | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState<string>(() => NetworkStatusService.getApiBaseUrl());
  const [apiReachability, setApiReachability] = useState<{
    checking: boolean;
    status: 'UNKNOWN' | 'PASS' | 'FAIL';
    httpStatus?: number;
    error?: string;
  }>({ checking: false, status: 'UNKNOWN' });

  const [diagnostic, setDiagnostic] = useState<OcrDiagnosticInfo>({
    fileSelected: false,
    fileName: '',
    mimeType: '',
    fileSize: 0,
    apiUrl: '',
    apiProtocol: '',
    networkStatus: NetworkStatusService.getStatus(),
    apiReachability: 'UNKNOWN',
    uploadStarted: false,
    uploadProgress: 0,
    uploadCompleted: false,
    httpStatus: null,
    serverResponseReceived: false,
    geminiRequestStarted: false,
    geminiResponseReceived: false,
    ocrParsing: 'IDLE',
    finalStatus: 'IDLE'
  });

  React.useEffect(() => {
    const statusUrl = NetworkStatusService.resolveApiEndpoint('/api/assistant/status');

    fetch(statusUrl)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return { configured: false };
        return r.json();
      })
      .then((data) => setProviderConfigured(Boolean(data?.configured)))
      .catch(() => setProviderConfigured(false));
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Manual Ping Check for Server Reachability
  const handleTestApiReachability = async () => {
    setApiReachability({ checking: true, status: 'UNKNOWN' });
    try {
      const res = await NetworkStatusService.checkApiReachability(5000);
      if (res.reachable) {
        setApiReachability({
          checking: false,
          status: 'PASS',
          httpStatus: res.httpStatus
        });
        setDiagnostic((prev) => ({
          ...prev,
          apiReachability: 'PASS',
          httpStatus: res.httpStatus || 200
        }));
      } else {
        setApiReachability({
          checking: false,
          status: 'FAIL',
          httpStatus: res.httpStatus,
          error: res.error
        });
        setDiagnostic((prev) => ({
          ...prev,
          apiReachability: 'FAIL',
          httpStatus: res.httpStatus || null
        }));
      }
    } catch (e: any) {
      setApiReachability({
        checking: false,
        status: 'FAIL',
        error: e.message || 'CONNECT_FAILED'
      });
    }
  };

  // Helper to handle image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const validationError = validateAnalysisImage(file);
    if (validationError) {
      setImageSrc(null);
      setOcrStage('ERROR');
      setError(validationError);
      setErrorCode('FILE_ERROR');
      setDiagnostic((prev) => ({
        ...prev,
        fileSelected: true,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        finalStatus: 'FILE_ERROR',
        errorCode: 'FILE_ERROR'
      }));
      return;
    }

    readFileAsDataUrl(file).then((dataUrl) => {
      setImageSrc(dataUrl);
      setOcrStage('FILE_SELECTED');
      setError(null);
      setErrorCode(null);
      setInvoiceData(null);
      setPostingSuccess(null);
      setDiagnostic((prev) => ({
        ...prev,
        fileSelected: true,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        uploadProgress: 0,
        uploadCompleted: false,
        finalStatus: 'FILE_SELECTED'
      }));
    }).catch((uploadError) => {
      setImageSrc(null);
      setOcrStage('ERROR');
      setError(classifyImageAnalysisError(uploadError));
      setErrorCode('FILE_ERROR');
    }).finally(() => {
      e.target.value = '';
    });
  };

  // Sample Invoices for quick test
  const handleLoadSample = (sampleType: 'pharma1' | 'pharma2') => {
    setPostingSuccess(null);
    setError(null);
    setErrorCode(null);
    setInvoiceData(null);
    setUploadProgress(0);

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
      setOcrStage('FILE_SELECTED');
      setSelectedFile(null);
      setDiagnostic((prev) => ({
        ...prev,
        fileSelected: true,
        fileName: `${sampleType}_sample_invoice.png`,
        mimeType: 'image/png',
        fileSize: Math.round(generatedDataUrl.length * 0.75),
        uploadProgress: 0,
        uploadCompleted: false,
        finalStatus: 'FILE_SELECTED'
      }));
    }
  };

  // Perform AI analysis via Real XHR with Real Upload Progress & Strict State Machine
  const handleAnalyzeInvoice = async () => {
    if (!imageSrc) {
      setError('يرجى تحميل أو التقاط صورة الفاتورة أولاً.');
      setErrorCode('FILE_ERROR');
      return;
    }

    // 1. Stage: VALIDATING
    setOcrStage('VALIDATING');
    setAnalyzing(true);
    setError(null);
    setErrorCode(null);
    setInvoiceData(null);
    setPostingSuccess(null);
    setUploadProgress(0);

    const targetEndpoint = NetworkStatusService.resolveApiEndpoint('/api/gemini/analyze-invoice');
    const isOnline = NetworkStatusService.isOnline();
    const networkStatus = NetworkStatusService.getStatus();

    setDiagnostic((prev) => ({
      ...prev,
      apiUrl: targetEndpoint,
      apiProtocol: targetEndpoint.startsWith('https') ? 'HTTPS' : 'HTTP',
      networkStatus: networkStatus,
      uploadStarted: false,
      uploadCompleted: false,
      uploadProgress: 0,
      httpStatus: null,
      serverResponseReceived: false,
      geminiRequestStarted: false,
      geminiResponseReceived: false,
      ocrParsing: 'IDLE',
      finalStatus: 'VALIDATING'
    }));

    // If device is completely offline from the start
    if (!isOnline) {
      setAnalyzing(false);
      setOcrStage('ERROR');
      setErrorCode('NETWORK_OFFLINE');
      setError('لا يوجد اتصال بالإنترنت. يرجى التحقق من اتصال الشبكة (Wi-Fi / بيانات الجوال).');
      setDiagnostic((prev) => ({
        ...prev,
        finalStatus: 'NETWORK_OFFLINE',
        errorCode: 'NETWORK_OFFLINE'
      }));
      return;
    }

    // 2. Stage: PREPARING
    setOcrStage('PREPARING');
    setDiagnostic((prev) => ({ ...prev, finalStatus: 'PREPARING' }));

    const payload = JSON.stringify({
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
    });

    const startTime = Date.now();

    // 3. Stage: UPLOADING via XMLHttpRequest with Real Progress Tracking
    try {
      const resultJson: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', targetEndpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 90000;

        // REAL Upload Progress (No Fake Numbers)
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            setUploadProgress(pct);
            setDiagnostic((prev) => ({ ...prev, uploadProgress: pct }));
          }
        };

        xhr.upload.onloadstart = () => {
          setOcrStage('UPLOADING');
          setDiagnostic((prev) => ({
            ...prev,
            uploadStarted: true,
            finalStatus: 'UPLOADING'
          }));
        };

        xhr.upload.onload = () => {
          setUploadProgress(100);
          setOcrStage('WAITING_FOR_HTTP_RESPONSE');
          setDiagnostic((prev) => ({
            ...prev,
            uploadProgress: 100,
            uploadCompleted: true,
            finalStatus: 'WAITING_FOR_HTTP_RESPONSE'
          }));
        };

        xhr.onload = () => {
          const duration = Date.now() - startTime;
          setDiagnostic((prev) => ({
            ...prev,
            httpStatus: xhr.status,
            serverResponseReceived: true,
            latencyMs: duration
          }));

          if (xhr.status >= 200 && xhr.status < 300) {
            setOcrStage('UPLOAD_COMPLETED');
            try {
              const parsed = JSON.parse(xhr.responseText);
              resolve(parsed);
            } catch (jsonErr) {
              reject(new Error('JSON_PARSE_ERROR'));
            }
          } else if (xhr.status >= 400 && xhr.status < 500) {
            let serverErrMsg = `HTTP_${xhr.status}`;
            try {
              const errObj = JSON.parse(xhr.responseText);
              if (errObj?.error) serverErrMsg = errObj.error;
            } catch {}
            const err = new Error(serverErrMsg);
            (err as any).code = 'HTTP_4XX';
            (err as any).status = xhr.status;
            reject(err);
          } else {
            let serverErrMsg = `HTTP_${xhr.status}`;
            try {
              const errObj = JSON.parse(xhr.responseText);
              if (errObj?.error) serverErrMsg = errObj.error;
            } catch {}
            const err = new Error(serverErrMsg);
            (err as any).code = 'HTTP_5XX';
            (err as any).status = xhr.status;
            reject(err);
          }
        };

        xhr.onerror = () => {
          // If internet was online, xhr.status=0 means the server host was unreachable (e.g. localhost on mobile)
          const err = new Error(NetworkStatusService.isOnline() ? 'API_UNREACHABLE' : 'NETWORK_OFFLINE');
          (err as any).code = NetworkStatusService.isOnline() ? 'API_UNREACHABLE' : 'NETWORK_OFFLINE';
          reject(err);
        };

        xhr.ontimeout = () => {
          const err = new Error('TIMEOUT');
          (err as any).code = 'TIMEOUT';
          reject(err);
        };

        xhr.send(payload);
      });

      // 4. Stage: ANALYZING & PARSING
      setOcrStage('ANALYZING');
      setDiagnostic((prev) => ({
        ...prev,
        geminiRequestStarted: true,
        geminiResponseReceived: true,
        ocrParsing: 'PARSING',
        modelUsed: resultJson.model || 'gemini',
        finalStatus: 'ANALYZING'
      }));

      // Normalize items
      const rawItems: any[] = Array.isArray(resultJson.items) ? resultJson.items : [];
      if (rawItems.length === 0) {
        throw new Error('NO_ITEMS_DETECTED');
      }

      setOcrStage('RESPONSE_RECEIVED');
      setDiagnostic((prev) => ({
        ...prev,
        ocrParsing: 'SUCCESS',
        finalStatus: 'RESPONSE_RECEIVED'
      }));

      const normalizedItems: ExtractedItem[] = rawItems.map((it, idx) => {
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

        const detectedUnit = (it.unit_name || it.unit || 'علبة').trim();
        let matchedFactor = 1;
        if (matchedId) {
          const convs = (state.unit_conversions || []).filter((uc) => uc.product_id === matchedId && uc.is_active !== false);
          const foundConv = convs.find((uc) => uc.unit_name.trim() === detectedUnit);
          if (foundConv) {
            matchedFactor = foundConv.conversion_factor;
          }
        }

        const purchasePrice = typeof it.unit_purchase_price === 'number'
          ? it.unit_purchase_price
          : (typeof it.unit_price === 'number' ? it.unit_price : parseFloat(String(it.unit_purchase_price || it.unit_price || '0').replace(/[^0-9.]/g, '')) || 0);

        const sellingPrice = typeof it.unit_selling_price === 'number'
          ? it.unit_selling_price
          : parseFloat(String(it.unit_selling_price || '0').replace(/[^0-9.]/g, '')) || 0;

        return {
          id: 'ext-' + idx + '-' + Math.random().toString(36).substring(2, 6),
          raw_name: it.raw_name || it.trade_name_original || it.product_name_ar || `صنف دوائي #${idx + 1}`,
          product_name_ar: it.product_name_ar || it.trade_name_ar || it.raw_name || `صنف دوائي #${idx + 1}`,
          product_name_en: it.product_name_en || '',
          matched_product_id: matchedId,
          is_new_product: !matchedId,
          batch_number: it.batch_number || '',
          expiry_date: it.expiry_date || '',
          quantity: Math.max(1, parseInt(String(it.quantity || 1), 10)),
          unit_name: detectedUnit,
          unit_factor: matchedFactor,
          unit_purchase_price: purchasePrice,
          unit_selling_price: sellingPrice,
          discount_amount: it.discount_amount || 0
        };
      });

      // Match supplier
      let matchedSupId = resultJson.matched_supplier_id;
      if (!matchedSupId && resultJson.supplier_name) {
        const sName = resultJson.supplier_name.toLowerCase();
        const foundSup = suppliers.find((s) => (s.name_ar || s.name || '').toLowerCase().includes(sName) || sName.includes((s.name_ar || s.name || '').toLowerCase()));
        if (foundSup) {
          matchedSupId = foundSup.id;
        }
      }

      setInvoiceData({
        supplier_name: resultJson.supplier_name || 'مورد غير محدد بالفاتورة',
        matched_supplier_id: matchedSupId,
        is_new_supplier: !matchedSupId,
        invoice_number: resultJson.invoice_number || `INV-${Date.now().toString().slice(-6)}`,
        invoice_date: resultJson.invoice_date || new Date().toISOString().split('T')[0],
        payment_type: resultJson.payment_type === 'cash' ? 'cash' : 'credit',
        total_amount: resultJson.total_amount,
        items: normalizedItems,
        simulated: false
      });

      // 5. Stage: COMPLETED
      setOcrStage('COMPLETED');
      setDiagnostic((prev) => ({
        ...prev,
        finalStatus: 'COMPLETED'
      }));
    } catch (err: any) {
      setOcrStage('ERROR');
      const errCode = (err as any)?.code || (err?.message === 'TIMEOUT' ? 'TIMEOUT' : 'UNKNOWN_ERROR');
      setErrorCode(errCode);
      const classifiedMsg = classifyImageAnalysisError(err);
      setError(classifiedMsg);

      setDiagnostic((prev) => ({
        ...prev,
        finalStatus: errCode,
        errorCode: errCode,
        ocrParsing: errCode === 'JSON_PARSE_ERROR' ? 'FAILED' : prev.ocrParsing
      }));
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

        // Resolve unit factor
        let finalFactor = item.unit_factor || 1;
        if (finalProductId) {
          const convs = (state.unit_conversions || []).filter(
            (uc) => uc.product_id === finalProductId && uc.is_active !== false
          );
          const matchedConv = convs.find((uc) => uc.unit_name.trim() === (item.unit_name || '').trim());
          if (matchedConv) {
            finalFactor = matchedConv.conversion_factor;
          }
        }

        return {
          product_id: finalProductId,
          batch_number: item.batch_number.trim().toUpperCase() || 'BN-GENERIC',
          expiry_date: item.expiry_date,
          unit_name: item.unit_name || 'علبة',
          unit_factor: finalFactor,
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
      {/* Unconfigured Provider Banner */}
      {providerConfigured === false && (
        <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-900 leading-snug">
                تحليل الصور غير متاح حاليًا. لم يتم تفعيل مزود تحليل الصور (GEMINI_API_KEY) في متغيرات بيئة الخادم.
              </p>
              <p className="text-amber-700 text-2xs mt-1 leading-relaxed">
                لاستخدام المسح الضوئي الذكي واستخراج بيانات الفواتير بدقة، يرجى ضبط مفتاح <code className="bg-amber-100/70 px-1 py-0.5 rounded font-mono text-amber-950">GEMINI_API_KEY</code> في متغيرات بيئة الخادم.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Error Alert with Detailed Diagnostics & Action Options */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs">{error}</span>
                  {errorCode && (
                    <span className="px-2 py-0.5 bg-rose-200/80 text-rose-900 rounded font-mono text-[10px] font-bold">
                      {errorCode}
                    </span>
                  )}
                </div>
                {errorCode === 'API_UNREACHABLE' && (
                  <p className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                    ملاحظة: جهازك متصل بالإنترنت، ولكن تعذر الوصول إلى عنوان خادم الـ API السحابي المحدد. يرجى التحقق من إعدادات عنوان الخادم أدناه أو إجراء اختبار Ping.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleTestApiReachability}
                disabled={apiReachability.checking}
                className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${apiReachability.checking ? 'animate-spin' : ''}`} />
                <span>فحص الخادم (Ping)</span>
              </button>
              {imageSrc && (
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={handleAnalyzeInvoice}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة المحاولة</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Real-time State & Upload Progress Bar */}
      {analyzing && (
        <div className="p-4 bg-indigo-50/90 border border-indigo-200 rounded-2xl space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <span>
                {ocrStage === 'VALIDATING' && '1/5. جاري التحقق من سلامة ملف وصيغة الصورة...'}
                {ocrStage === 'PREPARING' && '2/5. جاري تجهيز حزمة الصورة والمطابقات الصيدلانية...'}
                {ocrStage === 'UPLOADING' && `3/5. جاري رفع الصورة إلى خادم الذكاء الاصطناعي (${uploadProgress}%)...`}
                {ocrStage === 'WAITING_FOR_HTTP_RESPONSE' && '4/5. تم نقل البيانات، بانتظار استجابة خادم المعالجة...'}
                {ocrStage === 'UPLOAD_COMPLETED' && '4/5. تم استلام الحزمة بنجاح، جاري التحليل...'}
                {ocrStage === 'ANALYZING' && '5/5. جاري معالجة الفاتورة واستخراج بنود الأدوية عبر Gemini Vision...'}
                {ocrStage === 'RESPONSE_RECEIVED' && 'اكتمل الاستخراج، جاري إعداد جدول المراجعة...'}
              </span>
            </div>
            {ocrStage === 'UPLOADING' && (
              <span className="font-mono text-indigo-700 text-xs">{uploadProgress}%</span>
            )}
          </div>
          {ocrStage === 'UPLOADING' && (
            <div className="w-full bg-indigo-200/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-200 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
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
                <div className="text-center">
                  <p className="text-slate-800 font-bold text-xs">
                    تم اختيار الصورة محلياً بنجاح (جاهزة للإرسال والتحليل — انقر لتغييرها)
                  </p>
                  <p className="text-slate-500 font-mono text-[11px] mt-0.5">
                    {selectedFile
                      ? `الملف: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                      : 'نموذج فاتورة دوائية تجريبية'}
                  </p>
                </div>
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
                    <span>جاري الرفع والتحليل...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>بدء الرفع والتحليل بالذكاء الاصطناعي</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Expandable Diagnostic & API Configuration Panel */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowDiagnostic(!showDiagnostic)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              <span>{showDiagnostic ? '▲ إخفاء تشخيص الاتصال (OCR Diagnostic)' : '▼ عرض تشخيص اتصال الخادم (OCR Diagnostic)'}</span>
            </button>

            {showDiagnostic && (
              <div className="mt-2 p-3.5 bg-slate-900 text-slate-200 rounded-2xl font-mono text-2xs space-y-2.5 border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-indigo-400">=== OCR REQUEST DIAGNOSTIC ===</span>
                  <button
                    type="button"
                    onClick={handleTestApiReachability}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-3xs font-sans font-bold"
                  >
                    {apiReachability.checking ? 'جاري الفحص...' : 'فحص الخادم (Ping /api/health)'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  <div>fileSelected: <span className="text-white font-bold">{diagnostic.fileSelected ? 'true' : 'false'}</span></div>
                  <div>fileName: <span className="text-white font-bold">{diagnostic.fileName || 'none'}</span></div>
                  <div>mimeType: <span className="text-white font-bold">{diagnostic.mimeType || 'none'}</span></div>
                  <div>fileSize: <span className="text-white font-bold">{diagnostic.fileSize ? `${(diagnostic.fileSize / 1024).toFixed(1)} KB` : '0'}</span></div>
                  <div>apiUrl: <span className="text-cyan-400 font-bold break-all">{diagnostic.apiUrl || NetworkStatusService.resolveApiEndpoint('/api/gemini/analyze-invoice')}</span></div>
                  <div>apiProtocol: <span className="text-white font-bold">{diagnostic.apiProtocol || (diagnostic.apiUrl.startsWith('https') ? 'HTTPS' : 'HTTP')}</span></div>
                  <div>networkStatus: <span className="text-emerald-400 font-bold">{NetworkStatusService.getStatus()}</span></div>
                  <div>apiReachability: <span className={apiReachability.status === 'PASS' ? 'text-emerald-400 font-bold' : (apiReachability.status === 'FAIL' ? 'text-rose-400 font-bold' : 'text-amber-400')}>
                    {apiReachability.status} {apiReachability.httpStatus ? `(${apiReachability.httpStatus})` : ''} {apiReachability.error ? `[${apiReachability.error}]` : ''}
                  </span></div>
                  <div>uploadStarted: <span className="text-white font-bold">{diagnostic.uploadStarted ? 'true' : 'false'}</span></div>
                  <div>uploadProgress: <span className="text-cyan-400 font-bold">{diagnostic.uploadProgress}%</span></div>
                  <div>uploadCompleted: <span className="text-white font-bold">{diagnostic.uploadCompleted ? 'true' : 'false'}</span></div>
                  <div>httpStatus: <span className="text-white font-bold">{diagnostic.httpStatus !== null ? diagnostic.httpStatus : 'null'}</span></div>
                  <div>serverResponseReceived: <span className="text-white font-bold">{diagnostic.serverResponseReceived ? 'true' : 'false'}</span></div>
                  <div>geminiRequestStarted: <span className="text-white font-bold">{diagnostic.geminiRequestStarted ? 'true' : 'false'}</span></div>
                  <div>geminiResponseReceived: <span className="text-white font-bold">{diagnostic.geminiResponseReceived ? 'true' : 'false'}</span></div>
                  <div>ocrParsing: <span className="text-white font-bold">{diagnostic.ocrParsing}</span></div>
                  <div>finalStatus: <span className={diagnostic.finalStatus === 'COMPLETED' ? 'text-emerald-400 font-bold' : (diagnostic.finalStatus === 'IDLE' ? 'text-slate-400' : 'text-amber-300 font-bold')}>{diagnostic.finalStatus}</span></div>
                  {diagnostic.modelUsed && <div>modelUsed: <span className="text-violet-400 font-bold">{diagnostic.modelUsed}</span></div>}
                  {diagnostic.latencyMs && <div>duration: <span className="text-white font-bold">{diagnostic.latencyMs}ms</span></div>}
                </div>

                {/* Custom API Base URL Config (for mobile & LAN testing) */}
                <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <span className="text-slate-400 shrink-0 text-3xs font-sans">تخصيص عنوان خادم الـ API:</span>
                  <input
                    type="text"
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    placeholder="https://your-host.com أو اتركه فارغاً للافتراضي"
                    className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-2xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      NetworkStatusService.setCustomApiBaseUrl(customApiUrl);
                      handleTestApiReachability();
                    }}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-sans font-bold text-3xs shrink-0"
                  >
                    حفظ واختبار
                  </button>
                </div>
              </div>
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
                      <th className="p-2.5 w-24">الوحدة</th>
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
                      const prod = item.matched_product_id ? products.find((p) => p.id === item.matched_product_id) : null;
                      const convs = prod ? (state.unit_conversions || []).filter((uc) => uc.product_id === prod.id && uc.is_active !== false) : [];
                      const availableUnits = prod ? [
                        prod.base_unit || 'حبة',
                        ...convs.map((c) => c.unit_name).filter((u) => u !== (prod.base_unit || 'حبة'))
                      ] : ['علبة', 'باكت', 'شريط', 'حبة', 'زجاجة', 'أمبول', 'فيال'];

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
                            <select
                              value={item.unit_name}
                              onChange={(e) => {
                                const selectedUnit = e.target.value;
                                const foundConv = convs.find((c) => c.unit_name.trim() === selectedUnit.trim());
                                const newFactor = foundConv ? foundConv.conversion_factor : 1;
                                updateItem(item.id, {
                                  unit_name: selectedUnit,
                                  unit_factor: newFactor
                                });
                              }}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                            >
                              {!availableUnits.includes(item.unit_name) && item.unit_name && (
                                <option value={item.unit_name}>{item.unit_name} (مكتشفة)</option>
                              )}
                              {availableUnits.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
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
                            <NumericInput
                              min={1}
                              allowDecimals={false}
                              value={item.quantity}
                              onChange={(val) => updateItem(item.id, { quantity: Math.max(1, val) })}
                              className="text-xs font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <NumericInput
                              min={0}
                              allowDecimals={true}
                              value={item.unit_purchase_price}
                              onChange={(val) => updateItem(item.id, { unit_purchase_price: val })}
                              className="text-xs font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <NumericInput
                              min={0}
                              allowDecimals={true}
                              value={item.unit_selling_price}
                              onChange={(val) => updateItem(item.id, { unit_selling_price: val })}
                              className="text-xs font-bold text-emerald-700"
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

          {/* Total Validation Warning (Part C13) */}
          {(() => {
            const localSum = invoiceData.items.reduce(
              (acc, it) => acc + (it.quantity * it.unit_purchase_price) - (it.discount_amount || 0),
              0
            );
            const extractedTotal = invoiceData.total_amount;
            if (extractedTotal && Math.abs(localSum - extractedTotal) > 1) {
              return (
                <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl flex items-center gap-2 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    تنبيه: الإجمالي المستخرج ({Money.format(Money.toMinor(extractedTotal))}) لا يطابق مجموع الأصناف ({Money.format(Money.toMinor(localSum))}). يرجى المراجعة قبل الحفظ.
                  </span>
                </div>
              );
            }
            return null;
          })()}

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
