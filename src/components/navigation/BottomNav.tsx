import React from 'react';
import { Home, ShoppingCart, Truck, ChartNoAxesCombined, MoreHorizontal } from 'lucide-react';

export type TabKey = 'dashboard' | 'pos' | 'inventory' | 'purchases' | 'reports' | 'more';

interface BottomNavProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onOpenSearch?: () => void;
  onOpenVoucher?: () => void;
  cartCount?: number;
}

const items = [
  { key: 'dashboard' as const, label: 'الرئيسية', Icon: Home },
  { key: 'pos' as const, label: 'المبيعات', Icon: ShoppingCart },
  { key: 'purchases' as const, label: 'المشتريات', Icon: Truck },
  { key: 'reports' as const, label: 'التقارير', Icon: ChartNoAxesCombined },
  { key: 'more' as const, label: 'المزيد', Icon: MoreHorizontal },
];

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab, cartCount = 0 }) => {
  return (
    <nav
      aria-label="التنقل الرئيسي"
      dir="rtl"
      className="fixed bottom-0 left-0 right-0 z-40 mx-auto w-full max-w-lg border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto flex h-[62px] max-w-lg items-stretch justify-around px-1">
        {items.map(({ key, label, Icon }) => {
          const active = currentTab === key || (key === 'more' && currentTab === 'inventory');
          return (
            <button
              key={key}
              id={`nav-tab-${key}`}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelectTab(key)}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors active:scale-[0.97] ${
                active
                  ? 'font-bold text-emerald-600 dark:text-emerald-400'
                  : 'font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span className={`relative flex h-7 w-10 items-center justify-center rounded-2xl transition-colors ${
                active ? 'bg-emerald-50 dark:bg-emerald-950/60' : ''
              }`}>
                <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.5 : 2} />
                {key === 'pos' && cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-bold text-white dark:border-slate-900">
                    {cartCount}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate text-[10px] leading-tight sm:text-[11px]">{label}</span>
              {active && <span className="absolute bottom-0 h-[3px] w-6 rounded-t-full bg-emerald-600 dark:bg-emerald-400" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
