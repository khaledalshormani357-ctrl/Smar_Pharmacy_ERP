import React from 'react';
import { RotateCw, Settings, Power, Pill, Smartphone } from 'lucide-react';
import { PharmacyProfile, User } from '../../types';

interface AppHeaderProps {
  profile: PharmacyProfile;
  currentUser: User;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onLockSession: () => void;
  onOpenApkModal?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  profile,
  currentUser,
  onRefresh,
  onOpenSettings,
  onLockSession,
  onOpenApkModal
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto md:max-w-4xl">
        {/* Profile Branding */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            <Pill className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-slate-900 truncate leading-tight">
              {profile.name_ar || 'صيدليتي الذكية'}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
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
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-all active:scale-95 shadow-xs"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">تطبيق APK</span>
            </button>
          )}

          <button
            id="btn-header-refresh"
            onClick={onRefresh}
            title="تحديث ومزامنة البيانات"
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors active:scale-95"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            id="btn-header-settings"
            onClick={onOpenSettings}
            title="إعدادات النظام"
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors active:scale-95"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            id="btn-header-lock"
            onClick={onLockSession}
            title="قفل الوردية / تسجيل الخروج"
            className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors active:scale-95"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

