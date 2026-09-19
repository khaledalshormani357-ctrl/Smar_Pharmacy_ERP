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
import { User, PharmacyProfile } from './types';
import { Bot, Sparkles } from 'lucide-react';

export function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>('dashboard');
  const [profile, setProfile] = useState<PharmacyProfile>(db.getState().profile);
  const [currentUser, setCurrentUser] = useState<User>(db.getState().users[0]);
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [lockError, setLockError] = useState(false);

  // Quick modals from bottom nav or anywhere
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [showQuickVoucher, setShowQuickVoucher] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showApkModal, setShowApkModal] = useState(false);

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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      {/* Persistent App Header */}
      <AppHeader
        profile={profile}
        currentUser={currentUser}
        onRefresh={() => db.saveState()}
        onOpenSettings={() => setCurrentTab('more')}
        onLockSession={() => setIsLocked(true)}
        onOpenApkModal={() => setShowApkModal(true)}
      />

      {/* Main Screen Views */}
      <main className="w-full max-w-lg mx-auto md:max-w-5xl px-3 sm:px-4 py-4">
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
      </main>

      {/* Floating Smart Pharmacist Assistant Button */}
      <div className="fixed bottom-20 left-4 z-40">
        <button
          type="button"
          onClick={() => setShowAssistant(true)}
          title="المساعد الصيدلاني الذكي (البدائل والجرعات والتعارضات)"
          className="group relative flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-3.5 py-3 rounded-full shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all border-2 border-white"
        >
          <Bot className="w-5 h-5 text-indigo-100 animate-pulse" />
          <span className="text-xs font-bold hidden sm:inline">المساعد الذكي</span>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
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
    </div>
  );
}

export default App;

