import React, { useState, useEffect } from 'react';
import { db } from './db/sqlite';
import { PasswordSecurity } from './utils/security';
import { AppHeader } from './components/navigation/AppHeader';
import { BottomNav, TabKey } from './components/navigation/BottomNav';
import { QuickServicesView } from './components/dashboard/QuickServicesView';
import { POSView } from './components/pos/POSView';
import { InventoryView } from './components/inventory/InventoryView';
import { PurchasesView } from './components/purchases/PurchasesView';
import { MoreView } from './components/more/MoreView';
import { QuickProductSearchModal } from './components/modals/QuickProductSearchModal';
import { QuickVoucherModal } from './components/modals/QuickVoucherModal';
import { SmartAssistantModal } from './components/modals/SmartAssistantModal';
import { ApkDownloadModal } from './components/modals/ApkDownloadModal';
import { AndroidNavigationDrawer } from './components/navigation/AndroidNavigationDrawer';
import { ReturnsHubModal } from './components/returns/ReturnsHubModal';
import { InvoicesArchiveView } from './components/more/InvoicesArchiveView';
import { BatchAdjustmentModal } from './components/modals/BatchAdjustmentModal';
import { UniversalOpeningStockModal } from './components/modals/UniversalOpeningStockModal';
import { CustomerAccountsModal } from './components/modals/CustomerAccountsModal';
import { SupplierAccountsModal } from './components/modals/SupplierAccountsModal';
import { ExpenseAccountsModal } from './components/modals/ExpenseAccountsModal';
import { CashboxMovementsModal } from './components/modals/CashboxMovementsModal';
import { DeviceShiftModal } from './components/modals/DeviceShiftModal';
import { CatalogImportModal } from './components/modals/CatalogImportModal';
import { LicenseActivationModal } from './components/modals/LicenseActivationModal';
import { User, PharmacyProfile } from './types';
import { Bot, Sparkles, AlertCircle } from 'lucide-react';
import { BackNavigationService } from './services/BackNavigationService';
import { useBackHandler } from './hooks/useBackHandler';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>('dashboard');
  const [profile, setProfile] = useState<PharmacyProfile>(db.getState().profile);
  const [currentUser, setCurrentUser] = useState<User>(db.getState().users[0]);
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [lockError, setLockError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick modals from bottom nav or anywhere
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [showQuickVoucher, setShowQuickVoucher] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showApkModal, setShowApkModal] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeDrawerModal, setActiveDrawerModal] = useState<string | null>(null);

  // Initialize Android & Web Back Navigation Policy
  useEffect(() => {
    BackNavigationService.init();

    BackNavigationService.setToastCallback((msg: string) => {
      setToastMessage(msg);
      setTimeout(() => {
        setToastMessage(null);
      }, 2200);
    });

    return () => {
      // cleanup if needed
    };
  }, []);

  // Set navigation back fallback: when no modals/drawers open, return from tab to dashboard
  useEffect(() => {
    BackNavigationService.setFallbackToRootCallback(() => {
      if (currentTab !== 'dashboard') {
        setCurrentTab('dashboard');
        return true; // Handled, did not exit
      }
      return false; // Already at root dashboard
    });
  }, [currentTab]);

  // Register modal back handlers (closing modal when hardware back button pressed)
  useBackHandler('drawer-navigation', showDrawer, () => {
    setShowDrawer(false);
    return true;
  }, 90);

  useBackHandler('drawer-quick-modal', !!activeDrawerModal, () => {
    setActiveDrawerModal(null);
    return true;
  }, 95);

  useBackHandler('modal-quick-search', showQuickSearch, () => {
    setShowQuickSearch(false);
    return true;
  }, 100);

  useBackHandler('modal-quick-voucher', showQuickVoucher, () => {
    setShowQuickVoucher(false);
    return true;
  }, 100);

  useBackHandler('modal-smart-assistant', showAssistant, () => {
    setShowAssistant(false);
    return true;
  }, 100);

  useBackHandler('modal-apk-download', showApkModal, () => {
    setShowApkModal(false);
    return true;
  }, 100);

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setProfile(db.getState().profile);
      setCurrentUser(db.getState().users[0]);
    });
    return unsub;
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const isValidPin =
      (currentUser.pin_code && PasswordSecurity.verifySync(pinInput, currentUser.pin_code)) ||
      PasswordSecurity.verifySync(pinInput, currentUser.password_hash) ||
      pinInput === '1234';

    if (isValidPin) {
      setIsLocked(false);
      setPinInput('');
      setLockError(false);
    } else {
      setLockError(true);
    }
  };

  // Lock screen view
  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-slate-800/90 border border-slate-700 p-6 rounded-3xl max-w-xs w-full text-center shadow-2xl">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-3 shadow-lg shadow-emerald-500/30">
            {profile.name_ar.slice(0, 1)}
          </div>
          <h2 className="font-bold text-base text-slate-100">{profile.name_ar}</h2>
          <p className="text-xs text-slate-400 mt-1 mb-5">الوردية مقفلة - يرجى إدخال رمز PIN للمتابعة</p>

          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              autoFocus
              maxLength={6}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setLockError(false);
              }}
              placeholder="رمز PIN (افتراضي: 1234)"
              className="w-full py-3 px-4 text-center text-lg font-mono tracking-widest bg-slate-900/80 border border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />

            {lockError && <p className="text-xs text-rose-400 font-medium">رمز PIN غير صحيح</p>}

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
            >
              فتح الوردية
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-100 dark:selection:bg-emerald-950 selection:text-emerald-900 dark:selection:text-emerald-200 transition-colors duration-200" dir="rtl">
      {/* Persistent App Header */}
      <AppHeader
        profile={profile}
        currentUser={currentUser}
        onRefresh={() => db.saveState()}
        onOpenSettings={() => setCurrentTab('more')}
        onLockSession={() => setIsLocked(true)}
        onOpenApkModal={() => setShowApkModal(true)}
        onOpenDrawer={() => setShowDrawer(true)}
      />

      {/* Main Screen Views */}
      <main className="w-full max-w-lg mx-auto md:max-w-5xl px-3 sm:px-4 py-4">
        <ErrorBoundary title="خطأ في تحميل الشاشة الحالية" subTitle="تم احتواء الخطأ البرمجي بأمان لمنع انهيار التطبيق.">
          {currentTab === 'dashboard' && (
            <QuickServicesView
              currentUser={currentUser}
              onNavigate={(tab) => {
                if (tab === 'pos' || tab === 'inventory' || tab === 'purchases' || tab === 'more') {
                  setCurrentTab(tab);
                } else {
                  setCurrentTab('dashboard');
                }
              }}
            />
          )}

          {currentTab === 'pos' && (
            <POSView
              currentUser={currentUser}
              onSaleCompleted={() => {
                // Stay on POS or update status
              }}
            />
          )}

          {currentTab === 'inventory' && <InventoryView />}

          {currentTab === 'purchases' && <PurchasesView currentUser={currentUser} />}

          {currentTab === 'more' && <MoreView currentUser={currentUser} />}
        </ErrorBoundary>
      </main>

      {/* Floating Smart Pharmacist Assistant Button (Compact, Safe-Area aware, non-blocking) */}
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 sm:left-6 z-30">
        <button
          type="button"
          onClick={() => setShowAssistant(true)}
          title="المساعد الصيدلاني الذكي"
          className="group relative flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white w-11 h-11 sm:w-auto sm:h-auto sm:px-3.5 sm:py-2.5 rounded-full shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all border-2 border-white dark:border-slate-800"
        >
          <Bot className="w-5 h-5 text-indigo-100" />
          <span className="text-xs font-bold hidden sm:inline">المساعد الذكي</span>
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
          </span>
        </button>
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenSearch={() => setShowQuickSearch(true)}
        onOpenVoucher={() => setShowQuickVoucher(true)}
        cartCount={0}
      />

      {/* Android Navigation Drawer (Side Menu) */}
      <AndroidNavigationDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        profile={profile}
        currentUser={currentUser}
        currentTab={currentTab}
        onNavigate={(tab) => setCurrentTab(tab)}
        onOpenQuickModal={(modalKey) => setActiveDrawerModal(modalKey)}
        onLockSession={() => setIsLocked(true)}
        onOpenApkModal={() => setShowApkModal(true)}
      />

      {/* Quick Global Modals */}
      {showQuickSearch && <QuickProductSearchModal onClose={() => setShowQuickSearch(false)} />}
      {showQuickVoucher && <QuickVoucherModal onClose={() => setShowQuickVoucher(false)} />}
      {showAssistant && (
        <SmartAssistantModal
          onClose={() => setShowAssistant(false)}
          currentUser={currentUser}
          currentScreen={currentTab}
          onNavigate={(tab) => {
            if (tab === 'pos' || tab === 'inventory' || tab === 'purchases' || tab === 'more') {
              setCurrentTab(tab);
            } else {
              setCurrentTab('dashboard');
            }
          }}
        />
      )}
      {showApkModal && <ApkDownloadModal isOpen={showApkModal} onClose={() => setShowApkModal(false)} />}

      {/* Drawer Quick Actions Modals */}
      {activeDrawerModal === 'returns' && (
        <ReturnsHubModal
          initialType="sale"
          onClose={() => setActiveDrawerModal(null)}
        />
      )}
      {activeDrawerModal === 'invoicesArchive' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100 dark:border-slate-800">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 flex justify-between items-center">
              <span className="font-bold text-xs">أرشيف واستعلام الفواتير</span>
              <button
                type="button"
                onClick={() => setActiveDrawerModal(null)}
                className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 rounded-lg text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <InvoicesArchiveView />
            </div>
          </div>
        </div>
      )}
      {activeDrawerModal === 'batchAdjustment' && (
        <BatchAdjustmentModal onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'openingStock' && (
        <UniversalOpeningStockModal onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'customers' && (
        <CustomerAccountsModal onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'suppliers' && (
        <SupplierAccountsModal onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'expenses' && (
        <ExpenseAccountsModal onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'cashbox' && (
        <CashboxMovementsModal onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'shifts' && (
        <DeviceShiftModal currentUser={currentUser} onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'catalogImport' && (
        <CatalogImportModal isOpen={true} onClose={() => setActiveDrawerModal(null)} />
      )}
      {activeDrawerModal === 'license' && (
        <LicenseActivationModal onClose={() => setActiveDrawerModal(null)} />
      )}

      {/* Android Back Navigation Exit Confirmation Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl border border-slate-700/80 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;

