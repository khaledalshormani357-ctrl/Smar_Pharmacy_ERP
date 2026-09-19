// Structured Confirmation Card for Smart Pharmacy Copilot (Phase 9)
import React, { useState } from 'react';
import { ConfirmationRequestData } from '../types';
import { AlertCircle, CheckCircle2, X, ShieldAlert, Loader2 } from 'lucide-react';

interface ConfirmationCardProps {
  confirmation: ConfirmationRequestData;
  onConfirm: (operationKey: string) => Promise<void>;
  onCancel: (operationKey: string) => void;
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  confirmation,
  onConfirm,
  onCancel
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActioned, setHasActioned] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting || hasActioned) return;
    setIsSubmitting(true);
    try {
      await onConfirm(confirmation.operationKey);
      setHasActioned(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isSubmitting || hasActioned) return;
    setHasActioned(true);
    onCancel(confirmation.operationKey);
  };

  return (
    <div className="bg-amber-50/70 border-2 border-amber-300/80 rounded-2xl p-4 my-2.5 text-slate-800 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-amber-200 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span>تأكيد تنفيذ العملية:</span>
              <span className="text-amber-800 font-extrabold">{confirmation.actionName}</span>
            </h4>
            <span className="text-2xs text-amber-700 font-medium">يتطلب تأكيدك قبل التأثير على قاعدة البيانات</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-800 font-bold leading-relaxed">
        {confirmation.summary}
      </p>

      {confirmation.details && confirmation.details.length > 0 && (
        <div className="bg-white/90 p-3 rounded-xl border border-amber-200/60 space-y-1.5 text-2xs">
          {confirmation.details.map((d, idx) => (
            <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
              <span className="text-slate-500">{d.label}:</span>
              <span className="font-bold text-slate-900">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {!hasActioned ? (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري التنفيذ...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تأكيد التنفيذ</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleCancel}
            className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 active:scale-98 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            <span>إلغاء</span>
          </button>
        </div>
      ) : (
        <div className="text-center py-1 text-2xs font-bold text-slate-500">
          تمت معالجة أمر التأكيد.
        </div>
      )}
    </div>
  );
};
