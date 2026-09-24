import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  X,
  Bot,
  Sparkles,
  Pill,
  Search,
  Calculator,
  ScanLine,
  MessageSquareCode,
  MoreVertical,
  ShieldCheck,
  ChevronLeft,
  Activity,
  Layers
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { User } from '../../types';
import { InvoiceScannerTab } from './InvoiceScannerTab';
import { CopilotChatTab } from '../../assistant/ui/CopilotChatTab';
import { NumericInput } from '../ui/NumericInput';
import { useBackHandler } from '../../hooks/useBackHandler';

interface SmartAssistantModalProps {
  onClose: () => void;
  initialTab?: 'copilot' | 'invoice_scanner' | 'clinical';
  currentUser?: User;
  currentScreen?: string;
  onNavigate?: (screen: string, section?: string) => void;
}

export const SmartAssistantModal: React.FC<SmartAssistantModalProps> = ({
  onClose,
  initialTab = 'copilot',
  currentUser,
  currentScreen = 'dashboard',
  onNavigate = () => {}
}) => {
  const activeUser = currentUser || db.getState().users[0];
  const products = db.getState().products;

  // Navigation within Assistant: 'copilot' is default and response-first
  const [activeView, setActiveView] = useState<'copilot' | 'scanner' | 'clinical'>(
    initialTab === 'invoice_scanner' ? 'scanner' : initialTab === 'clinical' ? 'clinical' : 'copilot'
  );

  // More Tools Bottom Sheet Drawer
  const [showToolsDrawer, setShowToolsDrawer] = useState(false);

  // Clinical Sub-tabs
  const [clinicalTab, setClinicalTab] = useState<'alternatives' | 'interactions' | 'dose'>('alternatives');

  // Alternatives search
  const [searchDrug, setSearchDrug] = useState('');
  const [selectedDrug, setSelectedDrug] = useState(products[0] || null);

  // Interactions state
  const [drug1, setDrug1] = useState(products[0]?.name_ar || '');
  const [drug2, setDrug2] = useState(products[1]?.name_ar || '');
  const [interactionResult, setInteractionResult] = useState<string | null>(null);

  // Pediatric dose state
  const [weightKg, setWeightKg] = useState<number>(15);
  const [selectedMed, setSelectedMed] = useState<'paracetamol' | 'amoxicillin' | 'ibuprofen'>('paracetamol');

  // Handle Android Hardware Back Button: close drawer first, then close modal
  useBackHandler('assistant-tools-drawer', showToolsDrawer, () => {
    setShowToolsDrawer(false);
    return true;
  });
  useBackHandler('smart-assistant-modal', !showToolsDrawer, () => {
    onClose();
    return true;
  });

  // Mobile Keyboard & VisualViewport awareness
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  const alternatives = selectedDrug
    ? products.filter(
        (p) =>
          p.id !== selectedDrug.id &&
          ((selectedDrug.active_ingredient &&
            p.active_ingredient &&
            p.active_ingredient.toLowerCase() === selectedDrug.active_ingredient.toLowerCase()) ||
            (selectedDrug.category_id && p.category_id === selectedDrug.category_id))
      )
    : [];

  const handleCheckInteractions = () => {
    const d1 = drug1.toLowerCase();
    const d2 = drug2.toLowerCase();

    if ((d1.includes('وارفارين') || d1.includes('warfarin')) && (d2.includes('اسبرين') || d2.includes('aspirin'))) {
      setInteractionResult('⚠️ تعارض خطير: زيادة خطر النزيف الحاد نتيجة تآزر التأثير المضاد للتخثر والصفائح. تجنب الجمع إلا بمراقبة دقيقة لـ INR.');
    } else if ((d1.includes('اوميبرازول') || d1.includes('omeprazole')) && (d2.includes('كلوبيدوجريل') || d2.includes('plavix'))) {
      setInteractionResult('⚠️ تعارض متوسط: اوميبرازول يقلل من الفعالية الحيوية للكلوبيدوجريل عبر تثبيط CYP2C19. يُفضل استبداله بـ بانتابرازول.');
    } else if ((d1.includes('سيبروفلوكساسين') || d1.includes('cipro')) && (d2.includes('حديد') || d2.includes('كالسيوم') || d2.includes('antacid'))) {
      setInteractionResult('⚠️ تعارض امتصاص: الأيونات ثنائية التكافؤ ترتبط بالفلوروكينولون وتقلل امتصاصه بنسبة تصل إلى 80%. اترك فاصلاً ساعتين على الأقل.');
    } else {
      setInteractionResult('✅ لم يتم رصد تعارض خطير مباشر معروف بين الصنفين المحددين وفقاً للقواعد الإرشادية السريرية الأولية. يُنصح بمراجعة الملف الطبي الكامل للمريض.');
    }
  };

  const calculatePediatricDose = () => {
    if (selectedMed === 'paracetamol') {
      const minDose = Math.round(weightKg * 10);
      const maxDose = Math.round(weightKg * 15);
      return {
        doseText: `${minDose} - ${maxDose} مجم لكل جرعة`,
        frequency: 'كل 4 إلى 6 ساعات عند اللزوم (بحد أقصى 4 مرات يومياً)',
        notes: 'لا تتجاوز 60 مجم/كجم/يوم لتجنب السمية الكبدية.'
      };
    } else if (selectedMed === 'ibuprofen') {
      const dose = Math.round(weightKg * 10);
      return {
        doseText: `${dose} مجم لكل جرعة`,
        frequency: 'كل 6 إلى 8 ساعات بعد الأكل',
        notes: 'لا يُعطى للأطفال دون سن 6 أشهر أو في حالات الجفاف.'
      };
    } else {
      const dailyDose = Math.round(weightKg * 50);
      const perDose = Math.round(dailyDose / 3);
      return {
        doseText: `${perDose} مجم 3 مرات يومياً (أو ${Math.round(dailyDose / 2)} مجم مرتين يومياً للجرعة المضاعفة)`,
        frequency: 'كل 8 ساعات لمدة 7-10 أيام',
        notes: 'يُفضل إكمال الكورس العلاجي بالكامل حتى بعد زوال الأعراض.'
      };
    }
  };

  const pediatricCalc = calculatePediatricDose();

  const containerStyle = viewportHeight
    ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` }
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      dir="rtl"
    >
      <div
        style={containerStyle}
        className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-[85vh] sm:max-h-[720px] border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
      >
        {/* Android-First Header: Back / Title / More Tools Menu */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeView !== 'copilot' ? (
              <button
                type="button"
                onClick={() => setActiveView('copilot')}
                className="p-1.5 -mr-1 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="الرجوع إلى المساعد"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 -mr-1 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
              <Bot className="w-4.5 h-4.5" />
            </div>

            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                {activeView === 'scanner'
                  ? 'فاحص الفواتير الذكي (OCR)'
                  : activeView === 'clinical'
                  ? 'الأدوات السريرية والبدائل'
                  : 'مساعد الصيدلية الذكي'}
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {activeView === 'copilot'
                  ? 'استعلامات الأدوية، الفواتير، المخزون والدعم التشغيلي'
                  : 'أدوات الصيدلية المتقدمة'}
              </p>
            </div>
          </div>

          {/* Quick Switcher / Drawer Trigger */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowToolsDrawer((prev) => !prev)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
              title="خيارات وأدوات المساعد"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* View 1: Response-First Copilot Chat View */}
        {activeView === 'copilot' && (
          <CopilotChatTab
            currentUser={activeUser}
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            onCloseModal={onClose}
            onOpenMoreTools={() => setShowToolsDrawer(true)}
          />
        )}

        {/* View 2: Invoice Scanner Tab */}
        {activeView === 'scanner' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <InvoiceScannerTab />
          </div>
        )}

        {/* View 3: Clinical Tools Tab */}
        {activeView === 'clinical' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5">
            {/* Clinical Sub-tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setClinicalTab('alternatives')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all ${
                  clinicalTab === 'alternatives'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                البدائل المتوفرة
              </button>
              <button
                type="button"
                onClick={() => setClinicalTab('interactions')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all ${
                  clinicalTab === 'interactions'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                فحص التعارضات
              </button>
              <button
                type="button"
                onClick={() => setClinicalTab('dose')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all ${
                  clinicalTab === 'dose'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                جرعات الأطفال
              </button>
            </div>

            {/* Alternatives View */}
            {clinicalTab === 'alternatives' && (
              <div className="space-y-3 text-xs">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchDrug}
                    onChange={(e) => setSearchDrug(e.target.value)}
                    placeholder="ابحث عن الدواء لإيجاد بدائله في الصيدلية..."
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1">
                  {products
                    .filter((p) => p.name_ar.includes(searchDrug) || p.name_en?.toLowerCase().includes(searchDrug.toLowerCase()))
                    .slice(0, 5)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedDrug(p)}
                        className={`w-full text-right p-2 rounded-xl text-xs flex items-center justify-between border transition-all ${
                          selectedDrug?.id === p.id
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold dark:bg-indigo-950/60 dark:border-indigo-700'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{p.name_ar}</span>
                        <span className="font-mono text-slate-500 text-2xs">{Money.format(p.current_selling_price)}</span>
                      </button>
                    ))}
                </div>

                {selectedDrug && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>بدائل ({selectedDrug.name_ar}):</span>
                      <span className="text-2xs text-indigo-600 font-normal">المادة: {selectedDrug.active_ingredient || 'عام'}</span>
                    </h4>
                    {alternatives.length === 0 ? (
                      <p className="text-slate-400 text-2xs">لا توجد بدائل مسجلة بنفس المادة الفعالة حالياً.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {alternatives.map((alt) => (
                          <div
                            key={alt.id}
                            className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">{alt.name_ar}</span>
                              <span className="text-2xs text-slate-500">{alt.name_en}</span>
                            </div>
                            <span className="font-mono font-bold text-emerald-600 text-xs">{Money.format(alt.current_selling_price)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Interactions View */}
            {clinicalTab === 'interactions' && (
              <div className="space-y-3 text-xs">
                <div className="space-y-2">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1 font-bold">الدواء الأول:</label>
                    <input
                      type="text"
                      value={drug1}
                      onChange={(e) => setDrug1(e.target.value)}
                      placeholder="مثال: وارفارين، اوميبرازول..."
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1 font-bold">الدواء الثاني:</label>
                    <input
                      type="text"
                      value={drug2}
                      onChange={(e) => setDrug2(e.target.value)}
                      placeholder="مثال: اسبرين، كلوبيدوجريل..."
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckInteractions}
                    className="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-xs hover:bg-indigo-700 transition-colors"
                  >
                    فحص التعارض السريري
                  </button>
                </div>

                {interactionResult && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                    {interactionResult}
                  </div>
                )}
              </div>
            )}

            {/* Pediatric Dose View */}
            {clinicalTab === 'dose' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">وزن الطفل (كجم) *</label>
                    <NumericInput
                      min={2}
                      max={60}
                      allowDecimals={true}
                      value={weightKg}
                      onChange={(val) => setWeightKg(val)}
                      suffix="كجم"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">الدواء المطلوب *</label>
                    <select
                      value={selectedMed}
                      onChange={(e) => setSelectedMed(e.target.value as any)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs"
                    >
                      <option value="paracetamol">باراسيتامول (Paracetamol - 10-15 mg/kg)</option>
                      <option value="ibuprofen">ايبوبروفين (Ibuprofen - 10 mg/kg)</option>
                      <option value="amoxicillin">اموكسيسيللين (Amoxicillin - 50 mg/kg)</option>
                    </select>
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2">
                    <span className="font-bold text-indigo-950 dark:text-indigo-200">الجرعة المحسوبة:</span>
                    <span className="font-bold font-mono text-indigo-700 dark:text-indigo-300 text-sm">
                      {pediatricCalc.doseText}
                    </span>
                  </div>
                  <div className="text-2xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p>• التكرار: {pediatricCalc.frequency}</p>
                    <p className="text-amber-800 dark:text-amber-300 font-semibold">• تنبيه: {pediatricCalc.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tools Drawer Sheet (Organized Accordion / Bottom Sheet for secondary tools) */}
        {showToolsDrawer && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex flex-col justify-end animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  أدوات وخدمات المساعد الذكي
                </h4>
                <button
                  type="button"
                  onClick={() => setShowToolsDrawer(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('copilot');
                    setShowToolsDrawer(false);
                  }}
                  className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
                    activeView === 'copilot'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-bold dark:bg-indigo-950/50 dark:border-indigo-800'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <MessageSquareCode className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block font-bold">المحادثة والاستعلامات الذكية</span>
                    <span className="block text-[10px] text-slate-500">الاستفسار عن الأصناف والمخزون والفواتير</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveView('scanner');
                    setShowToolsDrawer(false);
                  }}
                  className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
                    activeView === 'scanner'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-bold dark:bg-indigo-950/50 dark:border-indigo-800'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <ScanLine className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block font-bold">فاحص الفواتير (OCR)</span>
                    <span className="block text-[10px] text-slate-500">تحليل وتفريغ فواتير الشراء بالذكاء الاصطناعي</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveView('clinical');
                    setClinicalTab('alternatives');
                    setShowToolsDrawer(false);
                  }}
                  className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
                    activeView === 'clinical' && clinicalTab === 'alternatives'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-bold dark:bg-indigo-950/50 dark:border-indigo-800'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Pill className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block font-bold">بدائل الأدوية المتوفرة</span>
                    <span className="block text-[10px] text-slate-500">البحث التلقائي بالمادة الفعالة والتصنيف</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveView('clinical');
                    setClinicalTab('dose');
                    setShowToolsDrawer(false);
                  }}
                  className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
                    activeView === 'clinical' && clinicalTab === 'dose'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-bold dark:bg-indigo-950/50 dark:border-indigo-800'
                      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Calculator className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="block font-bold">حاسبة جرعات الأطفال</span>
                    <span className="block text-[10px] text-slate-500">حساب الجرعات الدوائية حسب الوزن والسن</span>
                  </div>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowToolsDrawer(false)}
                  className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  إغلاق القائمة
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
