// Guide Card Component for Smart Pharmacy Copilot (Phase 9)
import React from 'react';
import { GuideResponseData } from '../types';
import { BookOpen, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface GuideCardProps {
  guide: GuideResponseData;
  onNavigate?: (screen: string, section?: string) => void;
}

export const GuideCard: React.FC<GuideCardProps> = ({ guide, onNavigate }) => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 my-2 text-slate-800 space-y-3 shadow-xs">
      <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm border-b border-slate-200/80 pb-2">
        <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
        <span>دليل الاستخدام: {guide.topic}</span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed font-medium">
        {guide.summary}
      </p>

      <div className="space-y-2 pt-1">
        {guide.steps.map((step) => (
          <div key={step.stepNumber} className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {step.stepNumber}
            </span>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-slate-800">{step.title}</h5>
              <p className="text-2xs sm:text-xs text-slate-600 mt-0.5 leading-normal">{step.instruction}</p>
            </div>
          </div>
        ))}
      </div>

      {guide.navigationTarget && onNavigate && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onNavigate(guide.navigationTarget!.screen, guide.navigationTarget!.section)}
            className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
          >
            <span>{guide.navigationTarget.buttonLabel}</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
