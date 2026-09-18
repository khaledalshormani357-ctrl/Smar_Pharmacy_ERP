import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  CheckCircle2,
  Copy,
  Terminal,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Camera,
  WifiOff,
  Zap,
  X,
  Github
} from 'lucide-react';

interface ApkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkDownloadModal: React.FC<ApkDownloadModalProps> = ({ isOpen, onClose }) => {
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  if (!isOpen) return null;

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } else {
      alert('لتثبيت التطبيق على هاتفك الآن:\n1. اضغط على زر القائمة (الثلاث نقاط ⋮) في أعلى المتصفح.\n2. اختر "تثبيت التطبيق" (Install App) أو "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).\n3. سيظهر التطبيق كأيقونة مستقلة على هاتفك بدون شريط المتصفح ويعمل كلياً دون إنترنت!');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white rounded-t-3xl overflow-hidden shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white backdrop-blur-xs mb-1">
                <Sparkles className="w-3 h-3 text-amber-300" />
                جاهز للهواتف وأجهزة أندرويد
              </span>
              <h2 className="text-xl font-black tracking-tight text-white">
                تطبيق الصيدلية الذكية بصيغة APK
              </h2>
            </div>
          </div>
          <p className="text-xs text-emerald-100/90 leading-relaxed mt-2">
            تم تجهيز بنية التطبيق الأصلية بالكامل عبر Capacitor وأحدث معايير Android SDK لتعمل كأقوى نظام نقاط بيع ومخازن صيدلانية على هاتفك أو جهاز التابلت المحمول.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-slate-800 flex-1">
          {/* Option 1: Instant Install on Android / Phone */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-950">
                    الخيار 1: التثبيت الفوري كـ تطبيق هاتف مستقل
                  </h3>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    يعمل فورياً على هواتف Android و iPhone وتابلت الصيدلية بدون انتظار
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-600 text-white rounded-full uppercase tracking-wider shrink-0">
                موصى به
              </span>
            </div>

            <div className="text-xs text-slate-600 bg-white/80 p-3 rounded-xl border border-emerald-100 space-y-2">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>أيقونة مستقلة على شاشة الهاتف تفتح بملء الشاشة بدون شريط متصفح</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>دعم كامل لكاميرا الموبايل لمسح الباركود وتصوير الفواتير بالذكاء الاصطناعي</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <WifiOff className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>يعمل دون انقطاع حتى بدون اتصال بالإنترنت (Offline First)</span>
              </div>
            </div>

            <button
              onClick={handleInstallPwa}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'تثبيت التطبيق على هذا الهاتف الآن' : 'كيفية تثبيت التطبيق على الشاشة الرئيسية'}</span>
            </button>
          </div>

          {/* Option 2: Direct APK Compilation (Capacitor & Android Studio) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  الخيار 2: مشروع أندرويد الأصيل (Capacitor Android Project)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  كود المشروع مجهز بالكامل في مجلد <code className="bg-slate-200 px-1 py-0.5 rounded text-blue-700 font-mono">android/</code>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-600 leading-relaxed">
                يمكنك تجميع ملف الـ APK في أي جهاز يدعم Android Studio أو عبر سطر الأوامر بأمر واحد:
              </p>
              <div className="bg-slate-900 text-slate-100 p-3 rounded-xl text-[11px] font-mono flex items-center justify-between gap-2 overflow-x-auto">
                <span className="select-all">./build-apk.sh</span>
                <button
                  onClick={() => copyToClipboard('./build-apk.sh')}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors shrink-0"
                  title="نسخ الأمر"
                >
                  {copiedCommand ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                أو تشغيل المشروع مباشرة في <span className="font-semibold text-slate-700">Android Studio</span> بفتح مجلد <code className="bg-slate-200 px-1 rounded">android</code> والضغط على <strong>Build &gt; Build APK(s)</strong>.
              </p>
            </div>
          </div>

          {/* Option 3: Automated Free GitHub Actions APK Builder */}
          <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Github className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-purple-950">
                  الخيار 3: بناء تلقائي عبر GitHub Actions (سحابياً)
                </h3>
                <p className="text-[11px] text-purple-700 mt-0.5">
                  ملف سير العمل <code className="bg-purple-200 px-1 py-0.5 rounded font-mono">build-apk.yml</code> مضمّن وجاهز
                </p>
              </div>
            </div>

            <p className="text-xs text-purple-900/80 leading-relaxed">
              عند تصدير المشروع إلى حسابك على GitHub، سيقوم GitHub Actions ببناء حزمة الـ APK تلقائياً وتوفيرها للتنزيل المباشر في تبويب <strong>Actions</strong> دون الحاجة لتثبيت أي برامج على حاسوبك!
            </p>
          </div>

          {/* Features Highlights */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-100/80 flex items-center gap-2 text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>مشفر وآمن 100%</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100/80 flex items-center gap-2 text-slate-700">
              <Layers className="w-4 h-4 text-blue-600 shrink-0" />
              <span>تحديث تلقائي للمخزون</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-3xl shrink-0">
          <div className="text-[11px] text-slate-500">
            الإصدار: <span className="font-mono font-bold text-slate-700">v1.0.0-android</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
