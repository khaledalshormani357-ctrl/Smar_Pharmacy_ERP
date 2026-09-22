import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Building2,
  FileText,
  RotateCcw
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { InventoryService } from '../../services/InventoryService';
import { FinanceService } from '../../services/FinanceService';
import { MetricCard } from '../ui/MetricCard';
import { Money } from '../../utils/money';

interface DashboardViewProps {
  onNavigateToPOS?: () => void;
  onNavigateToInventory?: () => void;
  onNavigateToPurchases?: () => void;
  onNavigate?: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToPOS,
  onNavigateToInventory,
  onNavigateToPurchases,
  onNavigate
}) => {
  const handlePOS = onNavigateToPOS || (() => onNavigate?.('pos'));
  const handleInventory = onNavigateToInventory || (() => onNavigate?.('inventory'));
  const handlePurchases = onNavigateToPurchases || (() => onNavigate?.('purchases'));
  const [data, setData] = useState(computeMetrics());

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setData(computeMetrics());
    });
    return unsub;
  }, []);

  function computeMetrics() {
    const state = db.getState();
    const products = InventoryService.getProductsWithStock();

    // Today's range in epoch
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayEpoch = startOfToday.getTime();

    const todaySales = state.sales.filter((s) => s.created_at >= todayEpoch && s.status === 'completed');
    const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.net_total, 0);
    const todayGrossProfit = todaySales.reduce((sum, s) => sum + s.gross_profit, 0);

    const todayExpenses = state.expenses
      .filter((e) => e.created_at >= todayEpoch)
      .reduce((sum, e) => sum + e.amount, 0);

    const todayNetProfit = todayGrossProfit - todayExpenses;

    const totalStockValuation = state.batches
      .filter((b) => b.status === 'active' && b.current_quantity > 0)
      .reduce((sum, b) => sum + b.current_quantity * b.purchase_price, 0);

    const lowStockCount = products.filter((p) => p.isLowStock).length;
    const expiringSoonCount = products.filter((p) => p.isNearExpiry).length;
    const expiredCount = products.filter((p) => p.isExpired).length;

    const cashboxBalance = state.cashboxes.reduce((sum, c) => sum + c.cached_balance, 0);
    const totalCustomerDebts = state.customers.reduce((sum, c) => sum + Math.max(0, c.cached_balance), 0);
    const totalSupplierPayables = state.suppliers.reduce((sum, s) => sum + Math.max(0, s.cached_balance), 0);

    const recentSales = [...state.sales]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 5);

    return {
      todaySalesTotal,
      todayGrossProfit,
      todayExpenses,
      todayNetProfit,
      totalStockValuation,
      lowStockCount,
      expiringSoonCount,
      expiredCount,
      cashboxBalance,
      totalCustomerDebts,
      totalSupplierPayables,
      recentSales,
      totalProductsCount: products.length
    };
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto md:max-w-2xl pb-24">
      {/* Quick Action Top Banner */}
      <div className="bg-gradient-to-l from-blue-600 to-indigo-700 rounded-3xl p-5 text-white shadow-lg shadow-blue-500/20">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-blue-100 bg-white/10 px-2.5 py-1 rounded-full">
              مبيعات اليوم
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono mt-2 tracking-tight" dir="ltr">
              {Money.format(data.todaySalesTotal)}
            </div>
            <p className="text-xs text-blue-100/90 mt-1">
              مجمل الربح: <span className="font-mono font-bold">{Money.format(data.todayGrossProfit)}</span>
            </p>
          </div>

          <button
            id="btn-dash-new-sale"
            onClick={handlePOS}
            className="px-4 py-3 bg-white text-blue-700 hover:bg-blue-50 active:scale-95 font-bold text-xs rounded-2xl shadow-md transition-all flex items-center gap-1.5"
          >
            <span>فاتورة جديدة</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          title="صافي ربح اليوم"
          subtitle="مجمل الربح - المصروفات"
          value={Money.formatNumber(data.todayNetProfit)}
          unit="ر.ي"
          icon={TrendingUp}
          colorScheme={data.todayNetProfit >= 0 ? 'emerald' : 'rose'}
        />

        <MetricCard
          title="سيولة الصناديق"
          subtitle="النقد المتوفر حالياً"
          value={Money.formatNumber(data.cashboxBalance)}
          unit="ر.ي"
          icon={DollarSign}
          colorScheme="blue"
        />

        <MetricCard
          title="ديون العملاء (الذمم)"
          subtitle="مستحقات على الزبائن"
          value={Money.formatNumber(data.totalCustomerDebts)}
          unit="ر.ي"
          icon={Users}
          colorScheme="amber"
        />

        <MetricCard
          title="مستحقات الموردين"
          subtitle="التزامات للشراء الآجل"
          value={Money.formatNumber(data.totalSupplierPayables)}
          unit="ر.ي"
          icon={Building2}
          colorScheme="slate"
        />
      </div>

      {/* Inventory & Expiry Health Warnings */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-500" />
            <span>سلامة المخزون والتنبيهات الدوائية</span>
          </h3>
          <button
            onClick={handleInventory}
            className="text-xs text-blue-600 font-semibold hover:underline"
          >
            عرض الكل ({data.totalProductsCount})
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div
            onClick={handleInventory}
            className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition-colors"
          >
            <div className="text-lg font-bold font-mono text-amber-700">{data.lowStockCount}</div>
            <div className="text-[11px] font-medium text-amber-600 mt-0.5">نواقص أدوية</div>
          </div>

          <div
            onClick={handleInventory}
            className="p-3 bg-orange-50/60 border border-orange-200 rounded-xl cursor-pointer hover:bg-orange-100/60 transition-colors"
          >
            <div className="text-lg font-bold font-mono text-orange-700">{data.expiringSoonCount}</div>
            <div className="text-[11px] font-medium text-orange-600 mt-0.5">صلاحية قريبة</div>
          </div>

          <div
            onClick={handleInventory}
            className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100/60 transition-colors"
          >
            <div className="text-lg font-bold font-mono text-rose-700">{data.expiredCount}</div>
            <div className="text-[11px] font-medium text-rose-600 mt-0.5">منتهي الصلاحية</div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>إجمالي القيمة التقديرية للمخزون (بسعر الشراء):</span>
          <span className="font-bold font-mono text-slate-800" dir="ltr">
            {Money.format(data.totalStockValuation)}
          </span>
        </div>
      </div>

      {/* Recent Sales Ledger */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>آخر الفواتير الصادرة</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">Real-time</span>
        </div>

        {data.recentSales.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            لم يتم إصدار فواتير بيع بعد. ابدأ بأول عملية بيع الآن!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentSales.map((sale) => (
              <div key={sale.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-bold font-mono text-xs text-slate-800">
                    {sale.invoice_number}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(sale.created_at).toLocaleTimeString('ar-YE', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}{' '}
                    • {sale.sale_type === 'cash' ? 'نقداً' : 'آجل'}
                  </div>
                </div>

                <div className="text-left">
                  <div className="font-bold font-mono text-xs text-slate-900" dir="ltr">
                    {Money.format(sale.net_total)}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-600">
                    ربح: {Money.format(sale.gross_profit)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Reconciliation Trigger */}
      <div className="flex items-center justify-between p-3 bg-slate-100 rounded-2xl text-xs text-slate-600">
        <span>فحص مطابقة دفاتر الأستاذ المحاسبية (Reconciliation):</span>
        <button
          onClick={() => {
            FinanceService.reconcileAll();
            alert('تمت مطابقة جميع أرصدة الصناديق والموردين والعملاء بنجاح!');
          }}
          className="px-3 py-1.5 bg-white hover:bg-slate-200 border border-slate-300 font-bold rounded-xl flex items-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>مطابقة الآن</span>
        </button>
      </div>
    </div>
  );
};
