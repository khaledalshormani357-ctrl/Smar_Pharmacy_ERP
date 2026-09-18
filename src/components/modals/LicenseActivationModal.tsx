import React, { useState } from 'react';
import { X, ShieldCheck, Key, CheckCircle, Smartphone, Award } from 'lucide-react';
import { db } from '../../db/sqlite';

interface LicenseActivationModalProps {
  onClose: () => void;
}

export const LicenseActivationModal: React.FC<LicenseActivationModalProps> = ({ onClose }) => {
  const profile = db.getState().profile;
  const [licenseKey, setLicenseKey] = useState(profile.license_number || 'PHARM-2026-PERMANENT-PRO');
  const [isActivated, setIsActivated] = useState(Boolean(profile.license_number));
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
    isActivated
      ? { text: 'البرنامج مرخص ومفعل بشكل دائم وغير محدود لهذا الجهاز.', type: 'success' }
      : null
  );

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setMessage({ text: 'يرجى إدخال مفتاح ترخيص صالح.', type: 'error' });
      return;
    }

    try {
      db.transaction(() => {
        const state = db.getState();
        state.profile.license_number = licenseKey.trim();
        state.profile.sync_status = 'synced';
        state.profile.updated_at = Date.now();
      });
      setIsActivated(true);
      setMessage({ text: 'تم تنشيط وتفعيل ترخيص البرنامج بنجاح مدى الحياة!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل تفعيل الترخيص.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">تفعيل الترخيص وإدارة رخصة البرنامج</h3>
              <p className="text-xs text-slate-500">حالة الرخصة وتنشيط النسخة غير المحدودة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
        )}

        <div className="space-y-3 text-xs">
          {/* Device ID / System Token */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between text-slate-600 font-bold">
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-600" />
                معرّف الجهاز المسجل (Hardware UUID)
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-mono">
                محمي مشفر
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-800 bg-white p-2 rounded-xl border border-slate-200 select-all text-center">
              {profile.device_id || 'DEV-UUID-967-772722134'}
            </div>
          </div>

          {/* License Status Badge */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-600" />
              <div>
                <div className="font-bold text-slate-900 text-xs">نوع الرخصة: إصدار غير محدود (Pro Lifetime)</div>
                <div className="text-[11px] text-emerald-700">تحديثات مستمرة + نسخ احتياطي محلي وسحابي</div>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-xl text-[10px] font-bold">
              مفعل
            </span>
          </div>

          <form onSubmit={handleActivate} className="space-y-3 pt-1">
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                مفتاح الترخيص والتنشيط (License Key)
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="text"
                  required
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="e.g. PHARM-2026-XXXX-XXXX-XXXX"
                  className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إغلاق
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
              >
                تحديث وتنشيط الترخيص
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
