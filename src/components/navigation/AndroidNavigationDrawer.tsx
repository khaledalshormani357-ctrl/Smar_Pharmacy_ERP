import React, { useEffect, useRef } from 'react';
import {
  X,
  ShoppingCart,
  Package,
  Truck,
  Wallet,
  LayoutDashboard,
  RotateCcw,
  FileText,
  ClipboardCheck,
  CalendarClock,
  Layers,
  Users,
  DollarSign,
  ArrowLeftRight,
  Clock,
  Settings,
  Database,
  KeyRound,
  Smartphone,
  Moon,
  Sun,
  Power,
  ChevronLeft
} from 'lucide-react';
import { PharmacyProfile, User } from '../../types';
import { AppBrandIcon } from '../common/AppBrandIcon';
import { useTheme } from '../../context/ThemeContext';
import { TabKey } from './BottomNav';

interface AndroidNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: PharmacyProfile;
  currentUser: User;
  currentTab: TabKey;
  onNavigate: (tab: TabKey) => void;
  onOpenQuickModal: (modalKey: string) => void;
  onLockSession: () => void;
  onOpenApkModal?: () => void;
}

export const AndroidNavigationDrawer: React.FC<AndroidNavigationDrawerProps> = ({
  isOpen,
  onClose,
  profile,
  currentUser,
  currentTab,
  onNavigate,
  onOpenQuickModal,
  onLockSession,
  onOpenApkModal
}) => {
  const { isDark, toggleTheme } = useTheme();
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch Swipe to Close for Android gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;
    // In RTL, sliding rightwards closes the right-side drawer
    if (diff > 60) {
      onClose();
      touchStartX.current = null;
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
  };

  if (!isOpen) return null;

  const handleSelectTab = (tab: TabKey) => {
    onNavigate(tab);
    onClose();
  };

  const handleAction = (modalKey: string) => {
    onOpenQuickModal(modalKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div
        ref={drawerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative ml-auto w-full max-w-[320px] sm:max-w-sm bg-white dark:bg-slate-900 h-full flex flex-col shadow-2xl border-l border-slate-100 dark:border-slate-800 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] animate-in slide-in-from-right duration-250 ease-out z-10 overflow-hidden"
      >
        {/* Header / User & Pharmacy Profile */}
        <div className="p-4 bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <AppBrandIcon className="w-9 h-9" />
              <div>
                <h2 className="font-extrabold text-sm leading-tight text-white drop-shadow-xs">
                  {profile.name_ar || 'صيدليتي الذكية'}
                </h2>
                <p className="text-[10px] text-indigo-200 font-mono">
                  {profile.phone || '01-234567'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 transition-all active:scale-95"
              aria-label="إغلاق القائمة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="pt-2 border-t border-indigo-600/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-500/40 flex items-center justify-center text-xs font-bold font-mono">
                {currentUser.username.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-xs font-bold">{currentUser.full_name || currentUser.username}</div>
                <div className="text-[10px] text-indigo-200">
                  {currentUser.role_id === 'admin' ? 'مدير النظام' : 'صيدلي / كاشير'}
                </div>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
              متصل
            </span>
          </div>
        </div>

        {/* Scrollable Navigation & Actions Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          {/* Main Navigation Tabs */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1.5">
              التبويبات الرئيسية
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleSelectTab('pos')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all active:scale-98 ${
                  currentTab === 'pos'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingCart className="w-4 h-4" />
                  <span>نقطة البيع (POS)</span>
                </div>
                <ChevronLeft className="w-4 h-4 opacity-40" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('inventory')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all active:scale-98 ${
                  currentTab === 'inventory'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4" />
                  <span>الأصناف والمخزون</span>
                </div>
                <ChevronLeft className="w-4 h-4 opacity-40" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('purchases')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all active:scale-98 ${
                  currentTab === 'purchases'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4" />
                  <span>المشتريات والتوريد</span>
                </div>
                <ChevronLeft className="w-4 h-4 opacity-40" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('more')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all active:scale-98 ${
                  currentTab === 'more'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wallet className="w-4 h-4" />
                  <span>الصناديق والتقارير</span>
                </div>
                <ChevronLeft className="w-4 h-4 opacity-40" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('dashboard')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all active:scale-98 ${
                  currentTab === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>لوحة المؤشرات والخدمات</span>
                </div>
                <ChevronLeft className="w-4 h-4 opacity-40" />
              </button>
            </div>
          </div>

          {/* Group 1: الفواتير والمبيعات */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1">
              <span>🧾</span>
              <span>الفواتير والمبيعات</span>
            </div>
            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => handleSelectTab('pos')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>فاتورة مبيعات جديدة</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('returns')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>مركز المردودات (مبيعات / مشتريات)</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('invoicesArchive')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>أرشيف واستعلام الفواتير</span>
              </button>
            </div>
          </div>

          {/* Group 2: المخزون والأصناف */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1">
              <span>📦</span>
              <span>المخزون والأصناف</span>
            </div>
            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => handleSelectTab('inventory')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Package className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>دليل وبطاقات الأصناف</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('batchAdjustment')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <CalendarClock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>تعديل التشغيلات والتواريخ</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('openingStock')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>رصيد أول المدة الشامل</span>
              </button>
            </div>
          </div>

          {/* Group 3: الحسابات والعملاء */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1">
              <span>👥</span>
              <span>الحسابات والعملاء</span>
            </div>
            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => handleAction('customers')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>حسابات وديون العملاء</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('suppliers')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Truck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>حسابات ومستحقات الموردين</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('expenses')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <DollarSign className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>المصروفات والسندات المالية</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('cashbox')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>حركة الصناديق والمقبوضات</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('shifts')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>تسليم واستلام ورديات الكاشير</span>
              </button>
            </div>
          </div>

          {/* Group 4: الإعدادات والنسخ الاحتياطي */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1">
              <span>⚙️</span>
              <span>الإعدادات والنظام</span>
            </div>
            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => handleSelectTab('more')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Settings className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>إعدادات النظام والطباعة</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('catalogImport')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <Database className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>استيراد الكتالوج الدوائي الوطني</span>
              </button>

              <button
                type="button"
                onClick={() => handleAction('license')}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl transition-colors font-medium text-[11px]"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>ترخيص وتفعيل النظام</span>
              </button>

              {onOpenApkModal && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenApkModal();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors font-medium text-[11px]"
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>تطبيق الهاتف (APK)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Quick Controls */}
        <div className="p-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            <span>{isDark ? 'نهاري' : 'ليلي'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onLockSession();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          >
            <Power className="w-4 h-4" />
            <span>قفل الوردية</span>
          </button>
        </div>
      </div>
    </div>
  );
};
