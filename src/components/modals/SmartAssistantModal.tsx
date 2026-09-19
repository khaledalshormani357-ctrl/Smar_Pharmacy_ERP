// Smart Pharmacy Copilot & Clinical Assistant Modal (Phase 9)
import React, { useState } from 'react';
import {
  X,
  Bot,
  Sparkles,
  AlertTriangle,
  Pill,
  Search,
  Calculator,
  ScanLine,
  MessageSquareCode
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { Money } from '../../utils/money';
import { User } from '../../types';
import { InvoiceScannerTab } from './InvoiceScannerTab';
import { CopilotChatTab } from '../../assistant/ui/CopilotChatTab';

interface SmartAssistantModalProps {
  onClose: () => void;
  initialTab?: 'copilot' | 'invoice_scanner' | 'alternatives' | 'interactions' | 'dose';
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

  const [mainTab, setMainTab] = useState<'copilot' | 'invoice_scanner' | 'clinical'>(
    initialTab === 'invoice_scanner'
      ? 'invoice_scanner'
      : initialTab === 'copilot'
      ? 'copilot'
      : 'clinical'
  );

  const [clinicalSubTab, setClinicalSubTab] = useState<'alternatives' | 'interactions' | 'dose'>(
    initialTab === 'alternatives' || initialTab === 'interactions' || initialTab === 'dose'
      ? initialTab
      : 'alternatives'
  );

  // Alternatives search
  const [searchDrug, setSearchDrug] = useState('');
  const [selectedDrug, setSelectedDrug] = useState(products[0] || null);

  // Interactions state
  const [drug1, setDrug1] = useState(products[0]?.name_ar || '');
  const [drug2, setDrug2] = useState(products[1]?.name_ar || '');
  const [interactionResult, setInteractionResult] = useState<string | null>(null);

  // Dose state
  const [weightKg, setWeightKg] = useState<number>(15);
  const [selectedMed, setSelectedMed] = useState<'paracetamol' | 'amoxicillin' | 'ibuprofen'>('paracetamol');

  const filteredDrugs = products.filter((p) => {
    const q = searchDrug.toLowerCase();
    return p.name_ar.toLowerCase().includes(q) || (p.name_en && p.name_en.toLowerCase().includes(q));
  });

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl p-4 sm:p-5 max-w-4xl w-full shadow-2xl space-y-3.5 max-h-[94vh] overflow-y-auto border border-slate-100 animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                مساعد الصيدلية الذكي (Smart Pharmacy Copilot)
                <Sparkles className="w-4 h-4 text-amber-500" />
              </h3>
              <p className="text-2xs sm:text-xs text-slate-500">
                دليل الاستخدام التفاعلي، مساعد العمليات، فاحص الفواتير، والحسابات السريرية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setMainTab('copilot')}
            className={`py-2 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mainTab === 'copilot' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquareCode className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">المساعد والمحادثة</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('invoice_scanner')}
            className={`py-2 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mainTab === 'invoice_scanner' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ScanLine className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">فاحص الفواتير (OCR)</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('clinical')}
            className={`py-2 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              mainTab === 'clinical' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Pill className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">البدائل والجرعات</span>
          </button>
        </div>

        {/* Tab 1: Smart Pharmacy Copilot (Interactive Guide & Real Assistant) */}
        {mainTab === 'copilot' && (
          <CopilotChatTab
            currentUser={activeUser}
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            onCloseModal={onClose}
          />
        )}

        {/* Tab 2: Invoice Scanner OCR */}
        {mainTab === 'invoice_scanner' && <InvoiceScannerTab />}

        {/* Tab 3: Clinical Tools (Alternatives, Drug Interactions, Pediatric Doses) */}
        {mainTab === 'clinical' && (
          <div className="space-y-3.5">
            {/* Clinical sub-selector */}
            <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2 text-2xs font-bold">
              <button
                type="button"
                onClick={() => setClinicalSubTab('alternatives')}
                className={`py-1.5 px-3 rounded-lg transition-all ${
                  clinicalSubTab === 'alternatives'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                البدائل المتوفرة
              </button>
              <button
                type="button"
                onClick={() => setClinicalSubTab('interactions')}
                className={`py-1.5 px-3 rounded-lg transition-all ${
                  clinicalSubTab === 'interactions'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                فحص التعارضات
              </button>
              <button
                type="button"
                onClick={() => setClinicalSubTab('dose')}
                className={`py-1.5 px-3 rounded-lg transition-all ${
                  clinicalSubTab === 'dose'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                جرعات الأطفال
              </button>
            </div>

            {/* Alternatives View */}
            {clinicalSubTab === 'alternatives' && (
              <div className="space-y-3 text-xs">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchDrug}
                    onChange={(e) => setSearchDrug(e.target.value)}
                    placeholder="ابحث عن الدواء الأساسي لإيجاد بدائله في الصيدلية..."
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 block">اختر الصنف المطلوب بدائله:</span>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-0.5">
                      {filteredDrugs.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedDrug(p)}
                          className={`w-full text-right p-2 rounded-xl border text-xs transition-all ${
                            selectedDrug?.id === p.id
                              ? 'bg-indigo-50 border-indigo-300 font-bold text-indigo-900'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="truncate">{p.name_ar}</div>
                          {p.active_ingredient && (
                            <div className="text-2xs text-slate-400 truncate">{p.active_ingredient}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 block flex items-center justify-between">
                      <span>البدائل المقترحة بالصيدلية</span>
                      <span className="text-2xs font-mono text-indigo-600 font-bold">({alternatives.length} بديل)</span>
                    </span>

                    <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-0.5">
                      {alternatives.length === 0 ? (
                        <p className="text-slate-400 py-10 text-center">لا توجد بدائل مسجلة بنفس الفعالية أو التصنيف</p>
                      ) : (
                        alternatives.map((alt) => (
                          <div
                            key={alt.id}
                            className="p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-slate-900">{alt.name_ar}</div>
                              <div className="text-2xs text-indigo-700">
                                {alt.active_ingredient ? `مادة فعالة: ${alt.active_ingredient}` : 'نفس العائلة الدوائية'}
                              </div>
                            </div>
                            <div className="font-mono font-bold text-emerald-700">
                              {Money.format(alt.current_selling_price || 0)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Drug Interactions View */}
            {clinicalSubTab === 'interactions' && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-500">أدخل اسم دواءين للتحقق من التداخلات والتعارضات المحتملة بينهما:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">الدواء الأول</label>
                    <input
                      type="text"
                      value={drug1}
                      onChange={(e) => setDrug1(e.target.value)}
                      placeholder="مثال: وارفارين، اوميبرازول..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">الدواء الثاني</label>
                    <input
                      type="text"
                      value={drug2}
                      onChange={(e) => setDrug2(e.target.value)}
                      placeholder="مثال: اسبرين، سيبروفلوكساسين..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCheckInteractions}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>فحص التعارض السريري</span>
                </button>

                {interactionResult && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold leading-relaxed text-slate-800">
                    {interactionResult}
                  </div>
                )}
              </div>
            )}

            {/* Pediatric Dose Calculator */}
            {clinicalSubTab === 'dose' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">وزن الطفل (كجم) *</label>
                    <input
                      type="number"
                      min="2"
                      max="60"
                      value={weightKg}
                      onChange={(e) => setWeightKg(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-base font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">الدواء المراد حسابه *</label>
                    <select
                      value={selectedMed}
                      onChange={(e) => setSelectedMed(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="paracetamol">باراسيتامول (Paracetamol - 10-15 mg/kg)</option>
                      <option value="ibuprofen">ايبوبروفين (Ibuprofen - 10 mg/kg)</option>
                      <option value="amoxicillin">اموكسيسيلين (Amoxicillin - 50 mg/kg/day)</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-bold">الجرعة المحسوبة للطفل:</span>
                    <span className="font-mono text-base font-black text-indigo-900">{pediatricCalc.doseText}</span>
                  </div>
                  <div className="flex items-center justify-between text-2xs text-slate-600 border-t border-indigo-100 pt-1.5">
                    <span>التكرار الموصى به:</span>
                    <span className="font-bold text-slate-800">{pediatricCalc.frequency}</span>
                  </div>
                  <div className="text-2xs text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200 font-medium">
                    <strong>تنبيه سريري:</strong> {pediatricCalc.notes}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
