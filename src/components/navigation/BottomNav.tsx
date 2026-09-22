import React from 'react';
import { LayoutGrid, ShoppingBag, Truck, Search, FileSpreadsheet, MoreHorizontal } from 'lucide-react';

export type TabKey = 'dashboard' | 'pos' | 'inventory' | 'purchases' | 'more';

interface BottomNavProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onOpenSearch?: () => void;
  onOpenVoucher?: () => void;
  cartCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenSearch,
  onOpenVoucher,
  cartCount = 0
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] max-w-lg mx-auto md:max-w-3xl transition-colors duration-200">
      <div className="flex items-center justify-around h-16 px-2">
        {/* 1. الخدمات السريعة / الرئيسية */}
        <button
          id="nav-tab-dashboard"
          onClick={() => onSelectTab('dashboard')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all select-none ${
            currentTab === 'dashboard'
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium'
          }`}
        >
          <LayoutGrid className={`w-5 h-5 mb-0.5 transition-transform ${currentTab === 'dashboard' ? 'scale-110' : ''}`} />
          <span className="text-[11px] leading-tight">الخدمات</span>
          {currentTab === 'dashboard' && <span className="absolute bottom-1 w-1 h-1 bg-emerald-600 dark:bg-emerald-400 rounded-full" />}
        </button>

        {/* 2. مشتريات */}
        <button
          id="nav-tab-purchases"
          onClick={() => onSelectTab('purchases')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all select-none ${
            currentTab === 'purchases'
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium'
          }`}
        >
          <Truck className={`w-5 h-5 mb-0.5 transition-transform ${currentTab === 'purchases' ? 'scale-110' : ''}`} />
          <span className="text-[11px] leading-tight">مشتريات</span>
          {currentTab === 'purchases' && <span className="absolute bottom-1 w-1 h-1 bg-emerald-600 dark:bg-emerald-400 rounded-full" />}
        </button>

        {/* 3. مبيعات جديدة (الوسطى البارزة) */}
        <button
          id="nav-tab-pos"
          onClick={() => onSelectTab('pos')}
          className="relative flex flex-col items-center justify-center flex-1 py-1 select-none"
        >
          <div className="relative -top-2">
            <div
              className={`p-3 rounded-2xl transition-all shadow-md ${
                currentTab === 'pos'
                  ? 'bg-emerald-600 text-white shadow-emerald-500/30 dark:shadow-emerald-900/50 scale-105'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-slate-300 dark:shadow-slate-900'
              }`}
            >
              <ShoppingBag className="w-5 h-5" />
            </div>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-white dark:border-slate-900">
                {cartCount}
              </span>
            )}
          </div>
          <span className={`text-[11px] -mt-1 font-bold ${currentTab === 'pos' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
            مبيعات
          </span>
        </button>

        {/* 4. بحث سريع عن صنف */}
        <button
          id="nav-tab-search"
          onClick={onOpenSearch}
          className="relative flex flex-col items-center justify-center flex-1 py-1 transition-all select-none text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
        >
          <Search className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">بحث صنف</span>
        </button>

        {/* 5. سند مالي جديد */}
        <button
          id="nav-tab-voucher"
          onClick={onOpenVoucher}
          className="relative flex flex-col items-center justify-center flex-1 py-1 transition-all select-none text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
        >
          <FileSpreadsheet className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">سند مالي</span>
        </button>

        {/* 6. المزيد / الإعدادات */}
        <button
          id="nav-tab-more"
          onClick={() => onSelectTab('more')}
          className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all select-none ${
            currentTab === 'more'
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium'
          }`}
        >
          <MoreHorizontal className={`w-5 h-5 mb-0.5 transition-transform ${currentTab === 'more' ? 'scale-110' : ''}`} />
          <span className="text-[11px] leading-tight">المزيد</span>
          {currentTab === 'more' && <span className="absolute bottom-1 w-1 h-1 bg-emerald-600 dark:bg-emerald-400 rounded-full" />}
        </button>
      </div>
    </nav>
  );
};

