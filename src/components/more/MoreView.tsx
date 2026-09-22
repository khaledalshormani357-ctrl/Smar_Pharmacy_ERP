import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Users,
  Building2,
  FileSpreadsheet,
  Download,
  RotateCcw,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  X,
  FileText,
  Settings,
  UserCog,
  FolderTree,
  ArrowLeftRight,
  Archive,
  Smartphone
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { FinanceService } from '../../services/FinanceService';
import { User, Cashbox, Customer, Supplier, ExpenseCategory, Expense, WorkShift } from '../../types';
import { Money } from '../../utils/money';
import { NumericInput } from '../ui/NumericInput';
import { StatementModal } from './StatementModal';
import { ReportsView } from './ReportsView';
import { SettingsView } from './SettingsView';
import { UsersView } from './UsersView';
import { CategoriesView } from './CategoriesView';
import { InvoicesArchiveView } from './InvoicesArchiveView';
import { ApkDownloadModal } from '../modals/ApkDownloadModal';

interface MoreViewProps {
  currentUser: User;
}

export const MoreView: React.FC<MoreViewProps> = ({ currentUser }) => {
  const [activeSection, setActiveSection] = useState<
    'cash' | 'invoices' | 'customers' | 'suppliers' | 'categories' | 'reports' | 'users' | 'settings' | 'backup'
  >('cash');
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeShift, setActiveShift] = useState<WorkShift | null>(null);

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showApkModal, setShowApkModal] = useState(false);
  const [statementEntity, setStatementEntity] = useState<{ type: 'customer' | 'supplier'; id: string } | null>(null);

  // Cash Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromBox, setTransferFromBox] = useState('');
  const [transferToBox, setTransferToBox] = useState('');
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferNotes, setTransferNotes] = useState('');

  // New Cashbox Modal
  const [showNewBoxModal, setShowNewBoxModal] = useState(false);
  const [newBoxNameAr, setNewBoxNameAr] = useState('');
  const [newBoxNameEn, setNewBoxNameEn] = useState('');

  // Expense form
  const [expCategory, setExpCategory] = useState('');
  const [expCashbox, setExpCashbox] = useState('');
  const [expAmount, setExpAmount] = useState(0);
  const [expStatement, setExpStatement] = useState('');
  const [expRecipient, setExpRecipient] = useState('');

  // Receipt Form (قبض من عميل)
  const [recCustomer, setRecCustomer] = useState('');
  const [recCashbox, setRecCashbox] = useState('');
  const [recAmount, setRecAmount] = useState(0);
  const [recNotes, setRecNotes] = useState('');

  // Payment Form (صرف لمورد)
  const [paySupplier, setPaySupplier] = useState('');
  const [payCashbox, setPayCashbox] = useState('');
  const [payAmount, setPayAmount] = useState(0);
  const [payNotes, setPayNotes] = useState('');

  // Adjustment Form (تسوية نقدية)
  const [adjCashbox, setAdjCashbox] = useState('');
  const [adjAmount, setAdjAmount] = useState(0);
  const [adjDirection, setAdjDirection] = useState<'IN' | 'OUT'>('IN');
  const [adjReason, setAdjReason] = useState('');

  // Shift Forms
  const [shiftOpeningCash, setShiftOpeningCash] = useState(0);
  const [shiftActualCash, setShiftActualCash] = useState(0);
  const [shiftClosingNotes, setShiftClosingNotes] = useState('');

  // Action status message
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
    const unsub = db.subscribe(() => {
      loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    const s = db.getState();
    setCashboxes(s.cashboxes);
    setCustomers(s.customers);
    setSuppliers(s.suppliers);
    setExpenseCategories(s.expense_categories);
    setExpenses([...s.expenses].reverse());

    // Current open shift for this user / default box
    const currentShift = s.work_shifts.find((ws) => ws.user_id === currentUser.id && ws.status === 'open') || null;
    setActiveShift(currentShift);
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleAddExpense = () => {
    if (!expCategory || expAmount <= 0 || !expStatement.trim()) {
      showNotification('error', 'يرجى تحديد بند المصروف، المبلغ، والبيان الإجباري.');
      return;
    }
    try {
      FinanceService.addExpense({
        category_id: expCategory,
        cashbox_id: expCashbox || cashboxes[0]?.id,
        amount: Money.toMinor(expAmount),
        statement: expStatement.trim(),
        recipient: expRecipient.trim(),
        user_id: currentUser.id
      });
      setShowExpenseModal(false);
      setExpAmount(0);
      setExpStatement('');
      setExpRecipient('');
      showNotification('success', 'تم تسجيل المصروف بنجاح وتحديث رصيد الصندوق.');
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء تسجيل المصروف');
    }
  };

  const handleCancelExpense = (expense: Expense) => {
    const reason = window.prompt(`يرجى كتابة سبب إلغاء المصروف (${expense.statement}):`);
    if (!reason || !reason.trim()) return;

    try {
      FinanceService.cancelExpense({
        expense_id: expense.id,
        reason: reason.trim(),
        user_id: currentUser.id
      });
      showNotification('success', `تم إلغاء المصروف وعكس المبلغ (${Money.format(expense.amount)}) إلى الصندوق.`);
    } catch (err: any) {
      showNotification('error', err.message || 'تعذر إلغاء المصروف');
    }
  };

  const handleAddReceipt = () => {
    if (!recCustomer || recAmount <= 0) {
      showNotification('error', 'يرجى تحديد العميل ومبلغ التحصيل.');
      return;
    }
    try {
      const res = FinanceService.addCustomerReceipt({
        customer_id: recCustomer,
        cashbox_id: recCashbox || cashboxes[0]?.id,
        amount: Money.toMinor(recAmount),
        notes: recNotes.trim(),
        user_id: currentUser.id
      });
      setShowReceiptModal(false);
      setRecAmount(0);
      setRecNotes('');
      showNotification('success', `تم إصدار سند قبض رقم ${res.receipt_number} بنجاح.`);
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء تسجيل سند القبض');
    }
  };

  const handleAddPayment = () => {
    if (!paySupplier || payAmount <= 0) {
      showNotification('error', 'يرجى تحديد المورد ومبلغ السداد.');
      return;
    }
    try {
      const res = FinanceService.addSupplierPayment({
        supplier_id: paySupplier,
        cashbox_id: payCashbox || cashboxes[0]?.id,
        amount: Money.toMinor(payAmount),
        notes: payNotes.trim(),
        user_id: currentUser.id
      });
      setShowPaymentModal(false);
      setPayAmount(0);
      setPayNotes('');
      showNotification('success', `تم إصدار سند صرف رقم ${res.voucher_number} بنجاح.`);
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء تسجيل سند الصرف');
    }
  };

  const handleCashAdjustment = () => {
    if (adjAmount <= 0 || !adjReason.trim()) {
      showNotification('error', 'يرجى إدخال مبلغ التسوية والسبب الإجباري.');
      return;
    }
    try {
      const res = FinanceService.adjustCash({
        cashbox_id: adjCashbox || cashboxes[0]?.id,
        amount: Money.toMinor(adjAmount),
        direction: adjDirection,
        reason: adjReason.trim(),
        user_id: currentUser.id
      });
      setShowAdjustmentModal(false);
      setAdjAmount(0);
      setAdjReason('');
      showNotification('success', `تمت تسوية رصيد الصندوق بسند رقم ${res.adjustment_number}.`);
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء إجراء التسوية');
    }
  };

  const handleOpenShift = () => {
    try {
      const shift = FinanceService.openShift({
        cashbox_id: cashboxes[0]?.id,
        opening_cash: Money.toMinor(shiftOpeningCash),
        user_id: currentUser.id
      });
      setShowOpenShiftModal(false);
      setShiftOpeningCash(0);
      showNotification('success', `تم فتح وردية عمل جديدة برقم ${shift.shift_number || shift.id}.`);
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء فتح الوردية');
    }
  };

  const handleCloseShift = () => {
    if (!activeShift) return;
    try {
      const closed = FinanceService.closeShift({
        shift_id: activeShift.id,
        actual_cash: Money.toMinor(shiftActualCash),
        closing_notes: shiftClosingNotes.trim(),
        user_id: currentUser.id
      });
      setShowCloseShiftModal(false);
      setShiftActualCash(0);
      setShiftClosingNotes('');
      showNotification(
        'success',
        `تم إغلاق الوردية بنجاح. الفارق المسجل: ${Money.format(closed.cash_difference)}`
      );
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء إغلاق الوردية');
    }
  };

  const handleReconcileAll = () => {
    try {
      const result = FinanceService.reconcileAll();
      showNotification(
        'success',
        `تمت مطابقة كافة السجلات المالية بنجاح: ${result.cashboxes} صناديق، ${result.customers} عملاء، ${result.suppliers} موردين.`
      );
    } catch (err: any) {
      showNotification('error', err.message || 'خطأ أثناء المطابقة');
    }
  };

  const handleTransferCash = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromBox || !transferToBox) {
      showNotification('error', 'يرجى اختيار صندوق المصدر وصندوق الوجهة.');
      return;
    }
    if (transferFromBox === transferToBox) {
      showNotification('error', 'لا يمكن التحويل لنفس الصندوق.');
      return;
    }
    if (transferAmount <= 0) {
      showNotification('error', 'يرجى إدخال مبلغ تحويل صحيح أكبر من صفر.');
      return;
    }
    try {
      FinanceService.transferCash({
        from_cashbox_id: transferFromBox,
        to_cashbox_id: transferToBox,
        amount: Money.toMinor(transferAmount),
        notes: transferNotes.trim() || 'تحويل مالي بين الصناديق',
        user_id: currentUser.id
      });
      setShowTransferModal(false);
      setTransferAmount(0);
      setTransferNotes('');
      showNotification('success', 'تم تحويل السيولة بين الصناديق وتسجيل القيود بنجاح.');
    } catch (err: any) {
      showNotification('error', err.message || 'فشلت عملية التحويل');
    }
  };

  const handleCreateCashbox = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoxNameAr.trim()) {
      showNotification('error', 'اسم الصندوق بالعربية إلزامي.');
      return;
    }
    try {
      FinanceService.createCashbox({
        name_ar: newBoxNameAr.trim(),
        type: 'daily',
        user_id: currentUser.id
      });
      setShowNewBoxModal(false);
      setNewBoxNameAr('');
      setNewBoxNameEn('');
      showNotification('success', 'تم إنشاء الصندوق النقدي الجديد بنجاح.');
    } catch (err: any) {
      showNotification('error', err.message || 'فشل إنشاء الصندوق');
    }
  };

  const handleExportBackup = () => {
    const data = db.exportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmacy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showNotification('success', 'تم تنزيل النسخة الاحتياطية بنجاح.');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (content) {
          const proceed = typeof window !== 'undefined' && window.confirm 
            ? window.confirm('هل أنت متأكد من استعادة هذه النسخة؟ سيتم استبدال البيانات الحالية.')
            : true;

          if (proceed) {
            const success = db.importJSON(content);
            if (success) {
              showNotification('success', 'تمت استعادة النسخة الاحتياطية بنجاح.');
            } else {
              showNotification('error', 'فشلت استعادة البيانات.');
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse backup:', err);
        showNotification('error', 'ملف النسخة الاحتياطية غير صالح أو تالف.');
      }
    };
    reader.onerror = () => {
      showNotification('error', 'تعذر قراءة ملف النسخة الاحتياطية.');
    };
    reader.readAsText(file);
  };

  // Shift summary calculations if closing modal is open
  const shiftSummary = activeShift ? FinanceService.getShiftSummary(activeShift.id) : null;
  const shiftVariance = shiftSummary ? Money.toMinor(shiftActualCash) - shiftSummary.expected_cash : 0;

  return (
    <div className="p-3 sm:p-4 max-w-4xl mx-auto space-y-4 pb-20">
      {/* Toast Notification */}
      {actionMessage && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Main Tab Bar */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl text-xs font-bold gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveSection('cash')}
          className={`flex-1 min-w-[95px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'cash' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>الصندوق والسيولة</span>
        </button>

        <button
          onClick={() => setActiveSection('invoices')}
          className={`flex-1 min-w-[95px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'invoices' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>أرشيف الفواتير</span>
        </button>

        <button
          onClick={() => setActiveSection('customers')}
          className={`flex-1 min-w-[85px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'customers' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>العملاء والذمم</span>
        </button>

        <button
          onClick={() => setActiveSection('suppliers')}
          className={`flex-1 min-w-[85px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'suppliers' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>الموردين</span>
        </button>

        <button
          onClick={() => setActiveSection('categories')}
          className={`flex-1 min-w-[105px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'categories' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>التصنيفات والشركات</span>
        </button>

        <button
          onClick={() => setActiveSection('reports')}
          className={`flex-1 min-w-[85px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'reports' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>التقارير</span>
        </button>

        <button
          onClick={() => setActiveSection('users')}
          className={`flex-1 min-w-[95px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'users' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <UserCog className="w-4 h-4" />
          <span>المستخدمين</span>
        </button>

        <button
          onClick={() => setActiveSection('settings')}
          className={`flex-1 min-w-[85px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'settings' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>الإعدادات</span>
        </button>

        <button
          onClick={() => setActiveSection('backup')}
          className={`flex-1 min-w-[80px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeSection === 'backup' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>النسخ</span>
        </button>

        <button
          onClick={() => setShowApkModal(true)}
          className="flex-1 min-w-[100px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm active:scale-95"
          title="تحميل وتثبيت تطبيق الهاتف APK"
        >
          <Smartphone className="w-4 h-4 text-emerald-100" />
          <span>تطبيق APK</span>
        </button>
      </div>

      {/* SECTION 1: CASHBOX & EXPENSES */}
      {activeSection === 'cash' && (
        <div className="space-y-4">
          {/* WorkShift Management Card */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    activeShift ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                  }`}
                />
                <h3 className="text-xs font-bold text-slate-900">
                  حالة وردية العمل: {activeShift ? 'مفتوحة نشطة' : 'لا توجد وردية مفتوحة'}
                </h3>
              </div>
              {activeShift ? (
                <button
                  onClick={() => setShowCloseShiftModal(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  إغلاق الوردية والمطابقة
                </button>
              ) : (
                <button
                  onClick={() => setShowOpenShiftModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  فتح وردية عمل جديدة
                </button>
              )}
            </div>

            {activeShift && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">رقم الوردية</span>
                  <span className="font-bold font-mono text-slate-800 text-[11px]">
                    {activeShift.shift_number || activeShift.id}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">الرصيد الافتتاحي</span>
                  <span className="font-bold font-mono text-slate-800 text-xs" dir="ltr">
                    {Money.format(activeShift.opening_cash)}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">المبيعات النقدية</span>
                  <span className="font-bold font-mono text-emerald-600 text-xs" dir="ltr">
                    {Money.format(shiftSummary?.sales_cash || 0)}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold">الرصيد المتوقع بالصندوق</span>
                  <span className="font-bold font-mono text-blue-600 text-xs" dir="ltr">
                    {Money.format(shiftSummary?.expected_cash || 0)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Bar */}
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowExpenseModal(true)}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل مصروف</span>
              </button>
              <button
                onClick={() => setShowAdjustmentModal(true)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>تسوية نقدية</span>
              </button>
              <button
                onClick={() => {
                  setTransferFromBox(cashboxes[0]?.id || '');
                  setTransferToBox(cashboxes[1]?.id || '');
                  setTransferAmount(0);
                  setShowTransferModal(true);
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>نقل سيولة بين الصناديق</span>
              </button>
              <button
                onClick={() => {
                  setNewBoxNameAr('');
                  setNewBoxNameEn('');
                  setShowNewBoxModal(true);
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-2xl flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>إضافة صندوق نقد</span>
              </button>
            </div>

            <button
              onClick={handleReconcileAll}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-blue-600" />
              <span>مطابقة الأرصدة الشاملة</span>
            </button>
          </div>

          {/* Cashboxes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cashboxes.map((box) => {
              const trueBal = FinanceService.getCashboxBalance(box.id);
              const isMatched = box.cached_balance === trueBal;

              return (
                <div key={box.id} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{box.name_ar}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        isMatched ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {isMatched ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>مطابق</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          <span>بحاجة مطابقة</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="pt-1">
                    <span className="text-[10px] text-slate-400 block font-medium">الرصيد الفعلي للصندوق</span>
                    <span className="text-lg font-black font-mono text-slate-900" dir="ltr">
                      {Money.format(trueBal)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expenses List with Reversals */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800">
                سجل المصروفات التشغيلية ({expenses.length})
              </h3>
            </div>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {expenses.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">لا توجد مصروفات مسجلة حتى الآن</div>
              ) : (
                expenses.map((exp) => {
                  const isCancelled = exp.status === 'cancelled';
                  const cat = expenseCategories.find((c) => c.id === exp.category_id);

                  return (
                    <div key={exp.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{exp.statement}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-semibold">
                            {cat?.name_ar || 'مصروف'}
                          </span>
                          {isCancelled && (
                            <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.5 rounded-md font-bold">
                              ملغي
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {exp.expense_number} •{' '}
                          {new Date(exp.created_at).toLocaleDateString('ar-YE', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {exp.recipient ? ` • المستلم: ${exp.recipient}` : ''}
                        </div>
                        {isCancelled && exp.cancellation_reason && (
                          <div className="text-[10px] text-rose-500 mt-0.5 font-medium">
                            سبب الإلغاء: {exp.cancellation_reason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`font-mono font-bold text-xs ${
                            isCancelled ? 'line-through text-slate-400' : 'text-rose-600'
                          }`}
                          dir="ltr"
                        >
                          -{Money.format(exp.amount)}
                        </span>

                        {!isCancelled && (
                          <button
                            onClick={() => handleCancelExpense(exp)}
                            className="px-2 py-1 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-500 font-bold text-[10px] rounded-lg transition-colors"
                          >
                            إلغاء وعكس
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: CUSTOMERS & RECEIVABLES */}
      {activeSection === 'customers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800">حسابات العملاء والذمم الآجلة ({customers.length})</h3>
            <button
              onClick={() => {
                setRecCustomer(customers[0]?.id || '');
                setShowReceiptModal(true);
              }}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>سند قبض دفعة من عميل</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customers.map((cust) => {
              const trueBal = FinanceService.getCustomerBalance(cust.id);

              return (
                <div key={cust.id} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{cust.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{cust.phone || 'بدون هاتف'}</p>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-[10px] text-slate-400 block">المديونية الحالية</span>
                      <span
                        className={`text-sm font-bold ${
                          trueBal > 0 ? 'text-rose-600' : 'text-slate-700'
                        }`}
                        dir="ltr"
                      >
                        {Money.format(trueBal)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <button
                      onClick={() => setStatementEntity({ type: 'customer', id: cust.id })}
                      className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 text-[11px]"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>كشف حساب تفصيلي</span>
                    </button>

                    {trueBal > 0 && (
                      <button
                        onClick={() => {
                          setRecCustomer(cust.id);
                          setShowReceiptModal(true);
                        }}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-[11px] transition-colors"
                      >
                        قبض دفعة
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: SUPPLIERS & PAYABLES */}
      {activeSection === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800">حسابات الموردين والمستحقات ({suppliers.length})</h3>
            <button
              onClick={() => {
                setPaySupplier(suppliers[0]?.id || '');
                setShowPaymentModal(true);
              }}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>سند صرف دفعة لمورد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suppliers.map((supp) => {
              const trueBal = FinanceService.getSupplierBalance(supp.id);

              return (
                <div key={supp.id} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{supp.name}</h4>
                      <p className="text-[10px] text-slate-400">
                        {supp.contact_person ? `المسؤول: ${supp.contact_person} • ` : ''}
                        <span className="font-mono">{supp.phone}</span>
                      </p>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-[10px] text-slate-400 block">المستحقات الحالية</span>
                      <span
                        className={`text-sm font-bold ${
                          trueBal > 0 ? 'text-blue-600' : 'text-slate-700'
                        }`}
                        dir="ltr"
                      >
                        {Money.format(trueBal)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <button
                      onClick={() => setStatementEntity({ type: 'supplier', id: supp.id })}
                      className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 text-[11px]"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>كشف حساب تفصيلي</span>
                    </button>

                    {trueBal > 0 && (
                      <button
                        onClick={() => {
                          setPaySupplier(supp.id);
                          setShowPaymentModal(true);
                        }}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-[11px] transition-colors"
                      >
                        سداد دفعة
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 4: FINANCIAL REPORTS FOUNDATION */}
      {activeSection === 'reports' && <ReportsView />}

      {/* SECTION 5: INVOICES ARCHIVE & DOCUMENT MANAGEMENT */}
      {activeSection === 'invoices' && <InvoicesArchiveView />}

      {/* SECTION 6: CATEGORIES & MANUFACTURERS */}
      {activeSection === 'categories' && <CategoriesView />}

      {/* SECTION 7: USERS & PERMISSIONS */}
      {activeSection === 'users' && <UsersView />}

      {/* SECTION 8: SYSTEM SETTINGS */}
      {activeSection === 'settings' && <SettingsView />}

      {/* SECTION 9: BACKUP & INTEGRITY */}
      {activeSection === 'backup' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">النسخ الاحتياطي والأمان المالي</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              تصدير واستيراد قاعدة بيانات الصيدلية Offline-First بصيغة JSON محمية ومشفرة.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleExportBackup}
              className="p-4 rounded-2xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-900 flex items-center justify-between transition-colors"
            >
              <div className="text-right">
                <span className="font-bold text-xs block">تصدير نسخة احتياطية كاملة</span>
                <span className="text-[10px] text-blue-600 block">حفظ نسخة من كافة العمليات المالية والمخزون</span>
              </div>
              <Download className="w-5 h-5 text-blue-700" />
            </button>

            <label className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-900 flex items-center justify-between cursor-pointer transition-colors">
              <div className="text-right">
                <span className="font-bold text-xs block">استعادة نسخة احتياطية</span>
                <span className="text-[10px] text-slate-500 block">استرجاع قاعدة البيانات من ملف خارجي</span>
              </div>
              <RotateCcw className="w-5 h-5 text-slate-700" />
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD EXPENSE */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">تسجيل مصروف تشغيلي جديد</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">بند المصروف</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="">-- اختر البند --</option>
                  {expenseCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">الصندوق المصروف منه</label>
                <select
                  value={expCashbox}
                  onChange={(e) => setExpCashbox(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (المتاح: {Money.format(FinanceService.getCashboxBalance(box.id))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">المبلغ (ر.ي)</label>
                <NumericInput
                  value={expAmount}
                  onChange={setExpAmount}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">البيان الإجباري</label>
                <input
                  type="text"
                  value={expStatement}
                  onChange={(e) => setExpStatement(e.target.value)}
                  placeholder="مثال: فاتورة كهرباء شهر مايو..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">المستلم (اختياري)</label>
                <input
                  type="text"
                  value={expRecipient}
                  onChange={(e) => setExpRecipient(e.target.value)}
                  placeholder="اسم الشخص المستلم للمبلغ..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowExpenseModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddExpense}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                حفظ وصرف المصروف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CUSTOMER RECEIPT */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">سند قبض دفعة من عميل</h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">العميل</label>
                <select
                  value={recCustomer}
                  onChange={(e) => setRecCustomer(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="">-- اختر العميل --</option>
                  {customers.map((c) => {
                    const debt = FinanceService.getCustomerBalance(c.id);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} (المديونية: {Money.format(debt)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">الصندوق المودع فيه</label>
                <select
                  value={recCashbox}
                  onChange={(e) => setRecCashbox(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">المبلغ المقبوض (ر.ي)</label>
                <NumericInput
                  value={recAmount}
                  onChange={setRecAmount}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">ملاحظات السند</label>
                <input
                  type="text"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="دفعة على الحساب..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowReceiptModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddReceipt}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl"
              >
                تأكيد وقبض الدفعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SUPPLIER PAYMENT */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">سند صرف دفعة لمورد</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">المورد</label>
                <select
                  value={paySupplier}
                  onChange={(e) => setPaySupplier(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map((s) => {
                    const payable = FinanceService.getSupplierBalance(s.id);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} (المستحقات: {Money.format(payable)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">الصندوق المصروف منه</label>
                <select
                  value={payCashbox}
                  onChange={(e) => setPayCashbox(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (المتاح: {Money.format(FinanceService.getCashboxBalance(box.id))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">المبلغ المسدد (ر.ي)</label>
                <NumericInput
                  value={payAmount}
                  onChange={setPayAmount}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">ملاحظات السند</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="سداد دفعة عن فاتورة توريد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddPayment}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                تأكيد وصرف السند
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CASH ADJUSTMENT */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">تسوية رصيد الصندوق (إيداع / سحب)</h3>
              <button onClick={() => setShowAdjustmentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">نوع التسوية</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjDirection('IN')}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${
                      adjDirection === 'IN'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    إيداع نقدي (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjDirection('OUT')}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${
                      adjDirection === 'OUT'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    سحب نقدي (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">الصندوق</label>
                <select
                  value={adjCashbox}
                  onChange={(e) => setAdjCashbox(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (الرصيد: {Money.format(FinanceService.getCashboxBalance(box.id))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">مبلغ التسوية (ر.ي)</label>
                <NumericInput
                  value={adjAmount}
                  onChange={setAdjAmount}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">السبب الإجباري للتسوية</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="سبب التسوية المعتمد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleCashAdjustment}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl"
              >
                تنفيذ التسوية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: OPEN SHIFT */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">فتح وردية عمل جديدة</h3>
              <button onClick={() => setShowOpenShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-blue-50 p-3 rounded-2xl text-blue-900">
                <p className="font-bold">المستخدم: {currentUser.full_name}</p>
                <p className="text-[11px] text-blue-700 mt-0.5">الصندوق: {cashboxes[0]?.name_ar}</p>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">العهدة الافتتاحية بالصندوق (ر.ي)</label>
                <NumericInput
                  value={shiftOpeningCash}
                  onChange={setShiftOpeningCash}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowOpenShiftModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleOpenShift}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl"
              >
                بدء الوردية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CLOSE SHIFT */}
      {showCloseShiftModal && activeShift && shiftSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">إغلاق الوردية ومطابقة النقدية</h3>
              <button onClick={() => setShowCloseShiftModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>العهدة الافتتاحية:</span>
                  <span className="font-mono font-bold" dir="ltr">{Money.format(shiftSummary.opening_cash)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>المبيعات النقدية (+):</span>
                  <span className="font-mono font-bold text-emerald-600" dir="ltr">+{Money.format(shiftSummary.sales_cash)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>المردودات والمصروفات (-):</span>
                  <span className="font-mono font-bold text-rose-600" dir="ltr">
                    -{Money.format(shiftSummary.returns_cash + shiftSummary.expenses)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-200">
                  <span>الرصيد الدفتري المتوقع:</span>
                  <span className="font-mono text-blue-700" dir="ltr">{Money.format(shiftSummary.expected_cash)}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">المبلغ الفعلي المعدود بالصندوق (ر.ي)</label>
                <NumericInput
                  value={shiftActualCash}
                  onChange={setShiftActualCash}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              {/* Variance Indicator */}
              <div
                className={`p-2.5 rounded-xl font-bold flex items-center justify-between ${
                  shiftVariance === 0
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <span>فارق الصندوق:</span>
                <span className="font-mono text-sm" dir="ltr">
                  {shiftVariance > 0 ? '+' : ''}
                  {Money.format(shiftVariance)}
                </span>
              </div>

              {shiftVariance !== 0 && (
                <div>
                  <label className="block text-rose-600 font-bold mb-1">
                    سبب وملاحظات الفارق النقدي (إجباري عند وجود عجز أو زيادة)
                  </label>
                  <textarea
                    rows={2}
                    value={shiftClosingNotes}
                    onChange={(e) => setShiftClosingNotes(e.target.value)}
                    placeholder="يرجى كتابة سبب الفارق بالتفصيل..."
                    className="w-full p-2.5 bg-rose-50/50 border border-rose-200 rounded-xl text-xs font-bold focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleCloseShift}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                اعتماد وإغلاق الوردية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: CASH TRANSFER MODAL */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">نقل سيولة نقدية بين الصناديق</h3>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferCash} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">صندوق المصدر (الخصم منه) *</label>
                <select
                  required
                  value={transferFromBox}
                  onChange={(e) => setTransferFromBox(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="">-- اختر الصندوق المصدر --</option>
                  {cashboxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name_ar} (المتاح: {Money.format(FinanceService.getCashboxBalance(box.id))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">صندوق الوجهة (الإيداع إليه) *</label>
                <select
                  required
                  value={transferToBox}
                  onChange={(e) => setTransferToBox(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="">-- اختر الصندوق الوجهة --</option>
                  {cashboxes
                    .filter((b) => b.id !== transferFromBox)
                    .map((box) => (
                      <option key={box.id} value={box.id}>
                        {box.name_ar} (الرصيد: {Money.format(FinanceService.getCashboxBalance(box.id))})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">مبلغ التحويل (ر.ي) *</label>
                <NumericInput
                  value={transferAmount}
                  onChange={setTransferAmount}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">ملاحظات أو سبب التحويل</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="مثال: تغذية الصندوق الرئيسي، ترحيل سيولة إضافية..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  تأكيد تحويل السيولة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: NEW CASHBOX MODAL */}
      {showNewBoxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">إضافة صندوق نقدي جديد</h3>
              </div>
              <button onClick={() => setShowNewBoxModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCashbox} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">اسم الصندوق (بالعربية) *</label>
                <input
                  type="text"
                  required
                  value={newBoxNameAr}
                  onChange={(e) => setNewBoxNameAr(e.target.value)}
                  placeholder="مثال: الصندوق الرئيسي، صندوق وردية الصباح..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">اسم الصندوق (بالإنجليزية / اختياري)</label>
                <input
                  type="text"
                  value={newBoxNameEn}
                  onChange={(e) => setNewBoxNameEn(e.target.value)}
                  placeholder="e.g. Main Cashbox, Morning Register"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono text-left"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewBoxModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  حفظ الصندوق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: STATEMENT MODAL */}
      {statementEntity && (
        <StatementModal
          type={statementEntity.type}
          entityId={statementEntity.id}
          onClose={() => setStatementEntity(null)}
        />
      )}

      {/* MODAL 10: APK DOWNLOAD / MOBILE MODAL */}
      {showApkModal && (
        <ApkDownloadModal
          isOpen={showApkModal}
          onClose={() => setShowApkModal(false)}
        />
      )}
    </div>
  );
};
