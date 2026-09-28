import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { NetworkStatusService, NetworkState } from '../../services/NetworkStatusService';

interface NetworkIndicatorProps {
  compact?: boolean;
  className?: string;
}

export const NetworkIndicator: React.FC<NetworkIndicatorProps> = ({
  compact = false,
  className = ''
}) => {
  const [networkState, setNetworkState] = useState<NetworkState>(NetworkStatusService.getStatus());
  const [isChecking, setIsChecking] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const unsubscribe = NetworkStatusService.addListener((state) => {
      setNetworkState(state);
    });
    return () => unsubscribe();
  }, []);

  const handleManualCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isChecking) return;
    setIsChecking(true);
    try {
      await NetworkStatusService.checkNetworkNow();
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusConfig = () => {
    switch (networkState) {
      case 'ONLINE':
        return {
          dotColor: 'bg-emerald-500',
          textColor: 'text-emerald-700 dark:text-emerald-300',
          bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
          borderColor: 'border-emerald-200 dark:border-emerald-800',
          label: 'متصل بالإنترنت',
          shortLabel: 'متصل',
          icon: Wifi,
          hint: 'المزامنة السحابية والمساعد الذكي نشطان'
        };
      case 'CONNECTING':
        return {
          dotColor: 'bg-amber-500 animate-pulse',
          textColor: 'text-amber-700 dark:text-amber-300',
          bgColor: 'bg-amber-50 dark:bg-amber-950/50',
          borderColor: 'border-amber-200 dark:border-amber-800',
          label: 'جاري الاتصال...',
          shortLabel: 'اتصال...',
          icon: RefreshCw,
          hint: 'جاري التحقق من استقرار الشبكة'
        };
      case 'OFFLINE':
      default:
        return {
          dotColor: 'bg-rose-500',
          textColor: 'text-rose-700 dark:text-rose-300',
          bgColor: 'bg-rose-50 dark:bg-rose-950/50',
          borderColor: 'border-rose-200 dark:border-rose-800',
          label: 'غير متصل — وضع محلي 100%',
          shortLabel: 'وضع محلي',
          icon: WifiOff,
          hint: 'البيع والمخزون والفواتير تعمل محلياً دون أي انقطاع'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleManualCheck}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`${config.label} (${config.hint})`}
        aria-label={config.label}
        className={`relative inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs font-semibold border transition-all active:scale-95 ${config.bgColor} ${config.textColor} ${config.borderColor} ${className}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dotColor} shrink-0`} />
        <Icon className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">{config.shortLabel}</span>

        {showTooltip && (
          <div className="absolute top-full mt-1.5 right-0 z-50 whitespace-nowrap bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg border border-slate-700 pointer-events-none transition-opacity">
            <p className="font-bold">{config.label}</p>
            <p className="text-slate-300 text-2xs">{config.hint}</p>
          </div>
        )}
      </button>
    );
  }

  return (
    <div
      onClick={handleManualCheck}
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium border cursor-pointer select-none transition-all hover:opacity-90 active:scale-98 ${config.bgColor} ${config.textColor} ${config.borderColor} ${className}`}
      title="انقر لفحص الشبكة وتنشيط المزامنة السحابية"
    >
      <span className={`w-2 h-2 rounded-full ${config.dotColor} shrink-0`} />
      <Icon className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
      <span className="font-semibold">{config.label}</span>
      <span className="text-2xs opacity-75 hidden md:inline">({config.hint})</span>
    </div>
  );
};
