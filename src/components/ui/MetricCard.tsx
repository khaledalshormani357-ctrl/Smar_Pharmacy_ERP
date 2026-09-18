import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  id?: string;
  title: string;
  subtitle?: string;
  value: string;
  unit?: string;
  icon?: LucideIcon;
  colorScheme?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  id,
  title,
  subtitle,
  value,
  unit,
  icon: Icon,
  colorScheme = 'blue',
  onClick
}) => {
  const schemeStyles = {
    blue: {
      border: 'border-blue-100',
      iconBg: 'bg-blue-50 text-blue-600',
      subText: 'text-blue-600',
      hover: 'hover:border-blue-300'
    },
    emerald: {
      border: 'border-emerald-100',
      iconBg: 'bg-emerald-50 text-emerald-600',
      subText: 'text-emerald-600',
      hover: 'hover:border-emerald-300'
    },
    amber: {
      border: 'border-amber-100',
      iconBg: 'bg-amber-50 text-amber-600',
      subText: 'text-amber-600',
      hover: 'hover:border-amber-300'
    },
    rose: {
      border: 'border-rose-100',
      iconBg: 'bg-rose-50 text-rose-600',
      subText: 'text-rose-600',
      hover: 'hover:border-rose-300'
    },
    slate: {
      border: 'border-slate-200',
      iconBg: 'bg-slate-100 text-slate-700',
      subText: 'text-slate-500',
      hover: 'hover:border-slate-300'
    }
  }[colorScheme];

  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 border ${schemeStyles.border} shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all ${
        onClick ? `cursor-pointer ${schemeStyles.hover} active:scale-[0.98]` : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500">{title}</span>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${schemeStyles.iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 my-1">
        <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900 tracking-tight" dir="ltr">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-slate-400">{unit}</span>}
      </div>

      {subtitle && <p className={`text-[11px] font-medium mt-1 truncate ${schemeStyles.subText}`}>{subtitle}</p>}
    </div>
  );
};
