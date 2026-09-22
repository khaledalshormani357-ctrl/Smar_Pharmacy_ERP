import React, { useState } from 'react';
import {
  Store,
  Phone,
  MapPin,
  FileText,
  DollarSign,
  Printer,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Percent,
  Sliders,
  ShieldCheck,
  Cpu,
  Moon,
  Sun,
  Laptop,
  Eye
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PharmacyProfile } from '../../types';
import { useTheme } from '../../context/ThemeContext';

export const SettingsView: React.FC = () => {
  const currentProfile = db.getState().profile;
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<PharmacyProfile>({ ...currentProfile });
  const [taxPercent, setTaxPercent] = useState<number>((currentProfile.tax_rate_bps || 0) / 100);
  const [marginPercent, setMarginPercent] = useState<number>((currentProfile.default_profit_margin_bps || 2000) / 100);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!profile.name_ar.trim()) {
        setErrorMsg('اسم الصيدلية بالعربية إلزامي.');
        return;
      }

      db.transaction(() => {
        const state = db.getState();
        const updatedProfile: PharmacyProfile = {
          ...profile,
          name_ar: profile.name_ar.trim(),
          name_en: profile.name_en?.trim(),
          owner_name: profile.owner_name?.trim(),
          phone: profile.phone.trim(),
          phone_en: profile.phone_en?.trim(),
          address_ar: profile.address_ar.trim(),
          address_en: profile.address_en?.trim(),
          tax_number: profile.tax_number?.trim(),
          license_number: profile.license_number?.trim(),
          receipt_footer_text: profile.receipt_footer_text?.trim(),
          tax_rate_bps: Math.round(Number(taxPercent) * 100),
          default_profit_margin_bps: Math.round(Number(marginPercent) * 100),
          near_expiry_days: Number(profile.near_expiry_days) || 60
        };

        state.profile = updatedProfile;
      });

      setSavedSuccess(true);
      setErrorMsg(null);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ الإعدادات');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">إعدادات الصيدلية والمنظومة</h3>
            <p className="text-xs text-slate-500">
              تخصيص الهوية التجارية، بيانات الترويسة، سياسات الفواتير، ونسب الضرائب والأرباح
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600">
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span>معرّف الجهاز: {profile.device_id || 'LOCAL-DEV-01'}</span>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>تم حفظ وتحديث إعدادات وبيانات الصيدلية بنجاح، وتسري فوراً على جميع الفواتير والمطبوعات.</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Theme & Night Shift Appearance Settings */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Moon className="w-4 h-4 text-indigo-600" />
            <span>مظهر المنظومة ووضع النوبات الليلية (Night Shift Mode)</span>
          </div>
          <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-emerald-500" />
            <span>مصمم للحد من إجهاد العين أثناء المناوبات والعمل الليلي</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Light Mode */}
          <button
            type="button"
            id="btn-theme-light"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between gap-3 ${
              theme === 'light'
                ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600">
                <Sun className="w-5 h-5" />
              </div>
              {theme === 'light' && (
                <span className="text-[10px] font-black text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full">
                  المفعل حالياً
                </span>
              )}
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800">الوضع الفاتح (النهاري)</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                إضاءة واضحة ومناسبة لساعات العمل النهارية الاعتيادية
              </p>
            </div>
          </button>

          {/* Dark Mode */}
          <button
            type="button"
            id="btn-theme-dark"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between gap-3 ${
              theme === 'dark'
                ? 'border-indigo-500 bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-indigo-900/40 text-indigo-400">
                <Moon className="w-5 h-5" />
              </div>
              {theme === 'dark' && (
                <span className="text-[10px] font-black text-indigo-300 bg-indigo-950/90 px-2 py-0.5 rounded-full border border-indigo-800">
                  المفعل حالياً
                </span>
              )}
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800">الوضع الليلي الداكن (Dark)</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                خلفيات داكنة مريحة للعين تمنع التوهج أثناء المناوبات الليلية
              </p>
            </div>
          </button>

          {/* System Mode */}
          <button
            type="button"
            id="btn-theme-system"
            onClick={() => setTheme('system')}
            className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between gap-3 ${
              theme === 'system'
                ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600">
                <Laptop className="w-5 h-5" />
              </div>
              {theme === 'system' && (
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
                  المفعل حالياً
                </span>
              )}
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800">تلقائي (حسب النظام)</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                يتغير تلقائياً مع وضع نظام تشغيل جهاز الصيدلية أو الهاتف
              </p>
            </div>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Section 1: Basic Identity */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 pb-2 border-b border-slate-100">
            <Store className="w-4 h-4 text-blue-600" />
            <span>بيانات الهوية والترخيص</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصيدلية (بالعربية) *</label>
              <input
                type="text"
                required
                value={profile.name_ar}
                onChange={(e) => setProfile({ ...profile, name_ar: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500"
                placeholder="مثال: صيدلية الأمل الحديثة"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصيدلية (بالإنجليزية)</label>
              <input
                type="text"
                value={profile.name_en || ''}
                onChange={(e) => setProfile({ ...profile, name_en: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 text-left font-mono"
                placeholder="e.g. Al-Amal Modern Pharmacy"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصيدلي المسؤول / المالك</label>
              <input
                type="text"
                value={profile.owner_name || ''}
                onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500"
                placeholder="د. أحمد عبدالله"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الترخيص الصيدلاني / المهني</label>
              <input
                type="text"
                value={profile.license_number || ''}
                onChange={(e) => setProfile({ ...profile, license_number: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono"
                placeholder="PH-2025-987"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي / السجل التجاري</label>
              <input
                type="text"
                value={profile.tax_number || ''}
                onChange={(e) => setProfile({ ...profile, tax_number: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono"
                placeholder="300000000000003"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف / خدمة العملاء *</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono"
                  placeholder="01-234567 / 777000000"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">عنوان المقر *</label>
              <input
                type="text"
                required
                value={profile.address_ar}
                onChange={(e) => setProfile({ ...profile, address_ar: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500"
                placeholder="الشارع العام، أمام المستشفى التخصصي"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Financial & Operational Policies */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 pb-2 border-b border-slate-100">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>السياسات المالية وحساب الأرباح والضرائب</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العملة الافتراضية</label>
              <select
                value={profile.currency}
                onChange={(e) => {
                  const curr = e.target.value;
                  let code = 'YER';
                  if (curr === 'ر.س') code = 'SAR';
                  if (curr === '$') code = 'USD';
                  if (curr === 'ج.م') code = 'EGP';
                  setProfile({ ...profile, currency: curr, currency_code: code });
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-hidden focus:border-blue-500"
              >
                <option value="ر.ي">ريال يمني (ر.ي / YER)</option>
                <option value="ر.س">ريال سعودي (ر.س / SAR)</option>
                <option value="$">دولار أمريكي ($ / USD)</option>
                <option value="ج.م">جنيه مصري (ج.م / EGP)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نسبة الضريبة / القيمة المضافة (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={taxPercent}
                onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                تطبق تلقائياً في حسابات الضرائب بالفواتير (0% في حال الإعفاء)
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">هامش الربح التقديري (%)</label>
              <input
                type="number"
                min="0"
                max="1000"
                step="0.5"
                value={marginPercent}
                onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                يقترح سعر البيع تلقائياً عند إضافة أصناف أو فواتير شراء جديدة
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Printing & Alerting Rules */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 pb-2 border-b border-slate-100">
            <Printer className="w-4 h-4 text-purple-600" />
            <span>خيارات الطباعة وتنبيهات الصلاحية</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حجم ورق الطباعة الافتراضي</label>
              <select
                value={profile.receipt_paper_size}
                onChange={(e) =>
                  setProfile({ ...profile, receipt_paper_size: e.target.value as '80mm' | '58mm' | 'A4' })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-hidden focus:border-blue-500"
              >
                <option value="80mm">طابعة إيصالات حرارية (80mm Thermal)</option>
                <option value="58mm">طابعة إيصالات صغيرة (58mm Thermal)</option>
                <option value="A4">طابعة ليزر / أوراق قياسية (A4 Standard)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عتبة التنبيه بانتهاء الصلاحية (بالأيام)</label>
              <select
                value={profile.near_expiry_days}
                onChange={(e) => setProfile({ ...profile, near_expiry_days: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-hidden focus:border-blue-500"
              >
                <option value={30}>30 يوماً (شهر واحد)</option>
                <option value={60}>60 يوماً (شهران)</option>
                <option value={90}>90 يوماً (3 أشهر)</option>
                <option value={180}>180 يوماً (6 أشهر)</option>
                <option value={365}>365 يوماً (سنة كاملة)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظة التذييل في أسفل الفاتورة</label>
              <textarea
                rows={2}
                value={profile.receipt_footer_text || ''}
                onChange={(e) => setProfile({ ...profile, receipt_footer_text: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 leading-relaxed"
                placeholder="مثال: نتمنى لكم الشفاء العاجل • الأدوية المباعة لا ترد ولا تستبدل بعد 3 أيام إلا بالفاتورة"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>حفظ وتثبيت إعدادات المنظومة</span>
          </button>
        </div>
      </form>
    </div>
  );
};
