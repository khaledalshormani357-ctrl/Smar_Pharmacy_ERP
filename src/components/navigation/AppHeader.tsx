import React from 'react';
import { RotateCw, Settings, Power, Smartphone, Moon, Sun, Menu } from 'lucide-react';
import { PharmacyProfile, User } from '../../types';
import { AppBrandIcon } from '../common/AppBrandIcon';
import { useTheme } from '../../context/ThemeContext';

interface AppHeaderProps {
  profile: PharmacyProfile;
  currentUser: User;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onLockSession: () => void;
  onOpenApkModal?: () => void;
  onOpenDrawer?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  profile,
  currentUser,
  onRefresh,
  onOpenSettings,
  onLockSession,
  onOpenApkModal,
  onOpenDrawer
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 px-3 sm:px-4 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] transition-colors duration-200">
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto md:max-w-4xl">
        {/* Drawer Menu Button & Profile Branding */}
        <div className="flex items-center gap-2 min-w-0">
          {onOpenDrawer && (
            <button
              id="btn-header-drawer"
              type="button"
              onClick={onOpenDrawer}
              title="القائمة الجانبية والوصول السريع"
              aria-label="فتح القائمة الجانبية"
              className="p-2 -mr-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95 shrink-0"
            >
              <Menu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </button>
          )}

          <AppBrandIcon className="w-9 h-9 sm:w-10 sm:h-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
              {profile.name_ar || 'صيدليتي الذكية'}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <span className="truncate">نظام إدارة الصيدليات الذكي | {currentUser.full_name}</span>
            </div>
          </div>
        </div>

        {/* Quick Header Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenApkModal && (
            <button
              id="btn-header-apk"
              onClick={onOpenApkModal}
              title="تطبيق الهاتف (APK)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/80 dark:border-emerald-800/80 rounded-xl transition-all active:scale-95 shadow-xs"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">تطبيق APK</span>
            </button>
          )}

          {/* Dark / Light Mode Switcher */}
          <button
            id="btn-header-theme-toggle"
            onClick={toggleTheme}
            title={isDark ? 'التبديل إلى الوضع الفاتح (النهاري)' : 'التبديل إلى الوضع الليلي (نوبات ليلية)'}
            className={`p-2 rounded-xl transition-all active:scale-95 flex items-center justify-center ${
              isDark
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 bg-slate-800/80 border border-slate-700/60 shadow-xs'
                : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/80 border border-transparent'
            }`}
            aria-label="تبديل الوضع الليلي"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-300" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          <button
            id="btn-header-refresh"
            onClick={onRefresh}
            title="تحديث ومزامنة البيانات"
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            id="btn-header-settings"
            onClick={onOpenSettings}
            title="إعدادات النظام"
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            id="btn-header-lock"
            onClick={onLockSession}
            title="قفل الوردية / تسجيل الخروج"
            className="p-2 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors active:scale-95"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};


