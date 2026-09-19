// Balance Card View for Smart Pharmacy Copilot (Phase 9)
import React from 'react';
import { BalanceCardData } from '../types';
import { Wallet, User, Building2, ShieldCheck } from 'lucide-react';

interface BalanceCardViewProps {
  card: BalanceCardData;
}

export const BalanceCardView: React.FC<BalanceCardViewProps> = ({ card }) => {
  const getIcon = () => {
    switch (card.entityType) {
      case 'cashbox':
        return <Wallet className="w-5 h-5 text-emerald-600" />;
      case 'customer':
        return <User className="w-5 h-5 text-blue-600" />;
      case 'supplier':
        return <Building2 className="w-5 h-5 text-amber-600" />;
    }
  };

  const getBorderColor = () => {
    switch (card.entityType) {
      case 'cashbox':
        return 'border-emerald-200 bg-emerald-50/40';
      case 'customer':
        return 'border-blue-200 bg-blue-50/40';
      case 'supplier':
        return 'border-amber-200 bg-amber-50/40';
    }
  };

  return (
    <div className={`rounded-2xl border p-4 my-2 text-slate-800 shadow-xs space-y-2.5 ${getBorderColor()}`}>
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-2xs">
            {getIcon()}
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">{card.title}</h4>
            <p className="text-2xs text-slate-500">{card.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-2xs text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full font-bold">
          <ShieldCheck className="w-3 h-3" />
          <span>مطابق للنظام</span>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-white flex items-baseline justify-between">
        <span className="text-xs text-slate-600 font-medium">الرصيد الفعلي الحالي:</span>
        <div className="text-left font-mono">
          <span className="text-lg font-black text-slate-900">{card.balance.toLocaleString()}</span>
          <span className="text-xs font-bold text-slate-500 mr-1.5">{card.currency}</span>
        </div>
      </div>

      {card.details && card.details.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1 text-2xs">
          {card.details.map((d, i) => (
            <div key={i} className="bg-white/60 p-2 rounded-lg border border-slate-100">
              <span className="text-slate-500 block">{d.label}</span>
              <span className="font-bold text-slate-800">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
