import React, { useState } from 'react';
import {
  ShoppingCart,
  ShoppingBag,
  Wallet,
  Package,
  Gift,
  ClipboardCheck,
  UserPlus,
  FolderTree,
  Users,
  Truck,
  RotateCcw,
  ArrowLeftRight,
  FileText,
  CalendarClock,
  BarChart3,
  ShieldCheck,
  Settings,
  Clock,
  ClipboardList,
  UserCheck,
  Search,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  BookOpen,
  Database
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { User } from '../../types';
import { TabKey } from '../navigation/BottomNav';

// Modals
import { LicenseActivationModal } from '../modals/LicenseActivationModal';
import { DeviceShiftModal } from '../modals/DeviceShiftModal';
import { IncomingShiftsModal } from '../modals/IncomingShiftsModal';
import { BatchAdjustmentModal } from '../modals/BatchAdjustmentModal';
import { UniversalOpeningStockModal } from '../modals/UniversalOpeningStockModal';
import { AccountSetupModal } from '../modals/AccountSetupModal';
import { ExpenseAccountsModal } from '../modals/ExpenseAccountsModal';
import { CustomerAccountsModal } from '../modals/CustomerAccountsModal';
import { SupplierAccountsModal } from '../modals/SupplierAccountsModal';
import { CashboxMovementsModal } from '../modals/CashboxMovementsModal';
import { ReturnsHubModal } from '../returns/ReturnsHubModal';
import { InvoicesArchiveView } from '../more/InvoicesArchiveView';
import { UsersView } from '../more/UsersView';
import { ReportsView } from '../more/ReportsView';
import { DashboardView } from './DashboardView';
import { CatalogImportModal } from '../modals/CatalogImportModal';

interface QuickServicesViewProps {
  currentUser: User;
  onNavigate: (tab: TabKey | 'returns' | 'reports') => void;
}

export const QuickServicesView: React.FC<QuickServicesViewProps> = ({ currentUser, onNavigate }) => {
  const [viewMode, setViewMode] = useState<'services' | 'analytics'>('services');

  // Modal Visibility states
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showDeviceShiftModal, setShowDeviceShiftModal] = useState(false);
  const [showIncomingShiftsModal, setShowIncomingShiftsModal] = useState(false);
  const [showBatchAdjustmentModal, setShowBatchAdjustmentModal] = useState(false);
  const [showUniversalOpeningStockModal, setShowUniversalOpeningStockModal] = useState(false);
  const [showAccountSetupModal, setShowAccountSetupModal] = useState(false);
  const [showExpenseAccountsModal, setShowExpenseAccountsModal] = useState(false);
  const [showCustomerAccountsModal, setShowCustomerAccountsModal] = useState(false);
  const [showSupplierAccountsModal, setShowSupplierAccountsModal] = useState(false);
  const [showCashboxMovementsModal, setShowCashboxMovementsModal] = useState(false);
  const [showReturnsModal, setShowReturnsModal] = useState<'sale' | 'purchase' | null>(null);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showInvoicesArchiveModal, setShowInvoicesArchiveModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  const state = db.getState();
  const totalCashInBoxes = state.cashboxes.reduce((sum, b) => sum + b.cached_balance, 0);

  // Today's summary stats
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todaySales = state.sales.filter((s) => s.created_at >= todayStart && s.status === 'completed');
  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.net_total, 0);
  const todayProfits = todaySales.reduce((sum, s) => sum + (s.gross_profit || 0), 0);

  // Expiry & low stock alerts count
  const nearExpiryDays = state.profile.near_expiry_days || 90;
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() + nearExpiryDays);
  const nearExpiryCount = state.batches.filter((b) => b.current_quantity > 0 && new Date(b.expiry_date) <= expiryCutoff).length;

  return (
    <div className="space-y-4 pb-20">
      {/* Top Toggle Header: الخدمات السريعة vs المؤشرات والأرباح */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-3xl border border-slate-100 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode('services')}
            className={`flex-1 sm:flex-initial px-5 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              viewMode === 'services'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>الخدمات السريعة</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={`flex-1 sm:flex-initial px-5 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              viewMode === 'analytics'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span>المؤشرات والأرباح</span>
          </button>
        </div>

        {/* Live Quick Banner */}
        <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-between sm:justify-end">
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>السيولة المتاحة: {Money.format(totalCashInBoxes)}</span>
          </div>

          {nearExpiryCount > 0 && (
            <div className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-100 flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{nearExpiryCount} أدوية وشيكة الانتهاء</span>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'analytics' ? (
        /* Analytics & KPIs view */
        <DashboardView onNavigate={onNavigate} />
      ) : (
        /* The Full 20 Quick Services Grid from Reference */
        <div className="space-y-5">
          {/* Section 1: العمليات الأساسية والصندوق */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 px-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              العمليات الأساسية ونقاط البيع
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* 1. نقطة البيع POS */}
              <button
                type="button"
                onClick={() => onNavigate('pos')}
                className="group p-4 bg-white hover:bg-emerald-50/50 border border-slate-200/90 hover:border-emerald-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                      نقطة البيع POS
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                      سريع F1
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    شاشة مبيعات الكاشير وسرعة البيع بالباركود والوصفات
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShoppingCart className="w-6 h-6" />
                </div>
              </button>

              {/* 2. فاتورة مشتريات */}
              <button
                type="button"
                onClick={() => onNavigate('purchases')}
                className="group p-4 bg-white hover:bg-blue-50/50 border border-slate-200/90 hover:border-blue-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-blue-700 transition-colors">
                      فاتورة مشتريات
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    توريد الأدوية والمستلزمات من الشركات والموردين
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShoppingBag className="w-6 h-6" />
                </div>
              </button>

              {/* 3. حركات الصندوق */}
              <button
                type="button"
                onClick={() => setShowCashboxMovementsModal(true)}
                className="group p-4 bg-white hover:bg-teal-50/50 border border-slate-200/90 hover:border-teal-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-teal-700 transition-colors">
                      حركات الصندوق
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    سندات القبض والصرف، نقل السيولة، والمصروفات
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-teal-100/70 text-teal-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Wallet className="w-6 h-6" />
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: إدارة المخزون والأصناف */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 px-1">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              إدارة المخزون والأصناف والتشغيلات
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* 4. المخزون والجرد */}
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="group p-4 bg-white hover:bg-purple-50/50 border border-slate-200/90 hover:border-purple-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-purple-700 transition-colors">
                      المخزون والجرد
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    قائمة الأصناف والدفعات وتتبع الكميات وتواريخ الصلاحية
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-purple-100/70 text-purple-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Package className="w-6 h-6" />
                </div>
              </button>

              {/* 5. العينات المجانية/والمخزون الافتتاحي */}
              <button
                type="button"
                onClick={() => setShowUniversalOpeningStockModal(true)}
                className="group p-4 bg-white hover:bg-violet-50/50 border border-slate-200/90 hover:border-violet-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-violet-700 transition-colors">
                      العينات المجانية/والمخزون الافتتاحي
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    إدخال وضبط بضاعة أول المدة وهدايا وعينات المندوبين
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-violet-100/70 text-violet-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Gift className="w-6 h-6" />
                </div>
              </button>

              {/* 6. الجرد المخزني */}
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="group p-4 bg-white hover:bg-indigo-50/50 border border-slate-200/90 hover:border-indigo-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-indigo-700 transition-colors">
                      الجرد المخزني
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    جلسات الجرد الدوري والمطابقة ومعالجة العجز والفائض
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
              </button>

              {/* 7. دليل الأدوية اليمني المعتمد */}
              <button
                type="button"
                onClick={() => setShowCatalogModal(true)}
                className="group p-4 bg-white hover:bg-emerald-50/50 border border-slate-200/90 hover:border-emerald-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                      دليل الأدوية اليمني المعتمد
                    </span>
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 rounded-full">
                      4,048 صنف دوائي
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    استعراض واستيراد الأصناف المعتمدة بدقة (معرفات ثابتة وخالية من ابتداع الأسعار)
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Database className="w-6 h-6" />
                </div>
              </button>
            </div>
          </div>

          {/* Section 3: إدارة الحسابات والعملاء والموردين */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 px-1">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              إدارة الحسابات والعملاء والموردين
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 7. تأسيس حساب عميل / مورد */}
              <button
                type="button"
                onClick={() => setShowAccountSetupModal(true)}
                className="group p-4 bg-white hover:bg-teal-50/50 border border-slate-200/90 hover:border-teal-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-teal-700 transition-colors block">
                    تأسيس حساب عميل / مورد
                  </span>
                  <p className="text-[11px] text-slate-500">
                    فتح وتأسيس حسابات الذمم
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-teal-100/70 text-teal-700 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
              </button>

              {/* 8. دليل حسابات المصروفات */}
              <button
                type="button"
                onClick={() => setShowExpenseAccountsModal(true)}
                className="group p-4 bg-white hover:bg-orange-50/50 border border-slate-200/90 hover:border-orange-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-orange-700 transition-colors block">
                    دليل حسابات المصروفات
                  </span>
                  <p className="text-[11px] text-slate-500">
                    إدارة دليل بنود المصروفات
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-orange-100/70 text-orange-700 flex items-center justify-center shrink-0">
                  <FolderTree className="w-5 h-5" />
                </div>
              </button>

              {/* 9. حسابات العملاء */}
              <button
                type="button"
                onClick={() => setShowCustomerAccountsModal(true)}
                className="group p-4 bg-white hover:bg-blue-50/50 border border-slate-200/90 hover:border-blue-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors block">
                    حسابات العملاء
                  </span>
                  <p className="text-[11px] text-slate-500">
                    كشوفات الحساب والديون والتحصيل
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
              </button>

              {/* 10. حسابات الموردين */}
              <button
                type="button"
                onClick={() => setShowSupplierAccountsModal(true)}
                className="group p-4 bg-white hover:bg-indigo-50/50 border border-slate-200/90 hover:border-indigo-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-indigo-700 transition-colors block">
                    حسابات الموردين
                  </span>
                  <p className="text-[11px] text-slate-500">
                    متابعة المستحقات وسداد الفواتير
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
              </button>
            </div>
          </div>

          {/* Section 4: المرتجعات والتسويات */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 px-1">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              المرتجعات والتسويات وأرشيف الفواتير
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 11. مرتجع المبيعات */}
              <button
                type="button"
                onClick={() => setShowReturnsModal('sale')}
                className="group p-4 bg-white hover:bg-rose-50/50 border border-slate-200/90 hover:border-rose-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-rose-700 transition-colors block">
                    مرتجع المبيعات
                  </span>
                  <p className="text-[11px] text-slate-500">
                    إرجاع دواء من زبون واسترداد القيمة
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-rose-100/70 text-rose-700 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
              </button>

              {/* 12. مرتجع المشتريات */}
              <button
                type="button"
                onClick={() => setShowReturnsModal('purchase')}
                className="group p-4 bg-white hover:bg-amber-50/50 border border-slate-200/90 hover:border-amber-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-amber-700 transition-colors block">
                    مرتجع المشتريات
                  </span>
                  <p className="text-[11px] text-slate-500">
                    إرجاع بضاعة تالفة أو منتهية للمورد
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
              </button>

              {/* 13. إلغاء وتعديل الفواتير */}
              <button
                type="button"
                onClick={() => setShowInvoicesArchiveModal(true)}
                className="group p-4 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-slate-700 transition-colors block">
                    إلغاء وتعديل الفواتير
                  </span>
                  <p className="text-[11px] text-slate-500">
                    أرشيف الفواتير وتعديلها وإلغاؤها
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
              </button>

              {/* 14. تعديل الرصيد الافتتاحي */}
              <button
                type="button"
                onClick={() => setShowBatchAdjustmentModal(true)}
                className="group p-4 bg-white hover:bg-violet-50/50 border border-slate-200/90 hover:border-violet-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-violet-700 transition-colors block">
                    تعديل الرصيد الافتتاحي
                  </span>
                  <p className="text-[11px] text-slate-500">
                    تعديل صنف/كمية/سعر/تاريخ انتهاء
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-violet-100/70 text-violet-700 flex items-center justify-center shrink-0">
                  <CalendarClock className="w-5 h-5" />
                </div>
              </button>
            </div>
          </div>

          {/* Section 5: التقارير والإعدادات والورديات */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 px-1">
              <span className="w-2 h-2 rounded-full bg-slate-800" />
              التقارير والإعدادات وإدارة الورديات
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* 15. التقارير الإدارية */}
              <button
                type="button"
                onClick={() => setShowReportsModal(true)}
                className="group p-4 bg-white hover:bg-emerald-50/50 border border-slate-200/90 hover:border-emerald-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors block">
                    التقارير الإدارية
                  </span>
                  <p className="text-xs text-slate-500">
                    تقارير الأرباح، المبيعات، النواقص، وحركة الأصناف
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-6 h-6" />
                </div>
              </button>

              {/* 16. تفعيل الترخيص */}
              <button
                type="button"
                onClick={() => setShowLicenseModal(true)}
                className="group p-4 bg-white hover:bg-emerald-50/50 border border-slate-200/90 hover:border-emerald-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors block">
                    تفعيل الترخيص
                  </span>
                  <p className="text-xs text-slate-500">
                    تفعيل النسخة وإدارة رخصة البرنامج الدائمة
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </button>

              {/* 17. إعدادات النظام */}
              <button
                type="button"
                onClick={() => onNavigate('more')}
                className="group p-4 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-black text-slate-900 group-hover:text-slate-700 transition-colors block">
                    إعدادات النظام
                  </span>
                  <p className="text-xs text-slate-500">
                    بيانات الصيدلية، الطابعة، والنسخ الاحتياطي
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Settings className="w-6 h-6" />
                </div>
              </button>

              {/* 18. وردية الجهاز */}
              <button
                type="button"
                onClick={() => setShowDeviceShiftModal(true)}
                className="group p-4 bg-white hover:bg-emerald-50/50 border border-slate-200/90 hover:border-emerald-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors block">
                    وردية الجهاز
                  </span>
                  <p className="text-xs text-slate-500">
                    فتح وإغلاق وردية الكاشير وتصدير الحزمة
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
              </button>

              {/* 19. مراجعة الورديات الواردة */}
              <button
                type="button"
                onClick={() => setShowIncomingShiftsModal(true)}
                className="group p-4 bg-white hover:bg-purple-50/50 border border-slate-200/90 hover:border-purple-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-black text-slate-900 group-hover:text-purple-700 transition-colors block">
                    مراجعة الورديات الواردة
                  </span>
                  <p className="text-xs text-slate-500">
                    استيراد حزم الموظفين ومطابقة التوريدات
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-purple-100/70 text-purple-700 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-6 h-6" />
                </div>
              </button>

              {/* 20. إدارة الموظفين */}
              <button
                type="button"
                onClick={() => setShowUsersModal(true)}
                className="group p-4 bg-white hover:bg-blue-50/50 border border-slate-200/90 hover:border-blue-300 rounded-3xl transition-all shadow-xs text-right flex items-start justify-between"
              >
                <div className="space-y-1">
                  <span className="text-sm font-black text-slate-900 group-hover:text-blue-700 transition-colors block">
                    إدارة الموظفين
                  </span>
                  <p className="text-xs text-slate-500">
                    المستخدمين والصلاحيات والرموز السرية PIN
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                  <UserCheck className="w-6 h-6" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render All Modals */}
      {showLicenseModal && <LicenseActivationModal onClose={() => setShowLicenseModal(false)} />}
      {showDeviceShiftModal && <DeviceShiftModal currentUser={currentUser} onClose={() => setShowDeviceShiftModal(false)} />}
      {showIncomingShiftsModal && <IncomingShiftsModal onClose={() => setShowIncomingShiftsModal(false)} />}
      {showBatchAdjustmentModal && <BatchAdjustmentModal onClose={() => setShowBatchAdjustmentModal(false)} />}
      {showUniversalOpeningStockModal && <UniversalOpeningStockModal onClose={() => setShowUniversalOpeningStockModal(false)} />}
      {showAccountSetupModal && <AccountSetupModal onClose={() => setShowAccountSetupModal(false)} />}
      {showExpenseAccountsModal && <ExpenseAccountsModal onClose={() => setShowExpenseAccountsModal(false)} />}
      {showCustomerAccountsModal && <CustomerAccountsModal onClose={() => setShowCustomerAccountsModal(false)} />}
      {showSupplierAccountsModal && <SupplierAccountsModal onClose={() => setShowSupplierAccountsModal(false)} />}
      {showCashboxMovementsModal && <CashboxMovementsModal onClose={() => setShowCashboxMovementsModal(false)} />}

      {/* Returns Modal */}
      {showReturnsModal && (
        <ReturnsHubModal initialType={showReturnsModal} onClose={() => setShowReturnsModal(null)} />
      )}

      {/* Reports Modal */}
      {showReportsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-5xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">التقارير والمؤشرات</h3>
              <button
                type="button"
                onClick={() => setShowReportsModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <ReportsView />
          </div>
        </div>
      )}

      {/* Invoices Archive Modal */}
      {showInvoicesArchiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-4xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">أرشيف الفواتير</h3>
              <button
                type="button"
                onClick={() => setShowInvoicesArchiveModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <InvoicesArchiveView />
          </div>
        </div>
      )}

      {/* Users Management Modal */}
      {showUsersModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-4xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">إدارة المستخدمين والصلاحيات</h3>
              <button
                type="button"
                onClick={() => setShowUsersModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <UsersView />
          </div>
        </div>
      )}

      {/* Authoritative Drug Catalog Modal */}
      <CatalogImportModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
      />
    </div>
  );
};
