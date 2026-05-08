'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, Loader2, TrendingUp, PieChart } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────
interface DataPoint {
  date: string;
  value: number;
  pnl: number;
  pnlPct: number;
  cumulativePnl: number;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString();
const fmt$K = (n: number) => {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString();
};
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00-05:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ── Fetch portfolio history ───────────────────────────────────────
async function fetchPortfolioHistory(period: string): Promise<DataPoint[]> {
  try {
    const res = await fetch(`/api/portfolio/history?period=${period}&timeframe=1D`);
    if (!res.ok) throw new Error('Failed to fetch');
    const { history } = await res.json();

    if (!history || !Array.isArray(history.timestamp) || history.timestamp.length === 0) {
      return [];
    }

    const data: DataPoint[] = [];
    let cumulativePnl = 0;
    for (let i = 0; i < history.timestamp.length; i++) {
      const equity = parseFloat(history.equity?.[i] || '0');
      if (equity <= 0) continue;
      const pnl = parseFloat(history.profit_loss?.[i] || '0');
      const pnlPct = parseFloat(history.profit_loss_pct?.[i] || '0');
      cumulativePnl += pnl;
      data.push({
        date: new Date(history.timestamp[i] * 1000).toISOString().split('T')[0],
        value: equity,
        pnl,
        pnlPct,
        cumulativePnl,
      });
    }
    return data;
  } catch (err) {
    console.error('[Performance] Failed to fetch:', err);
    return [];
  }
}

// ── Custom Tooltip ────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload as DataPoint;
  if (!d) return null;
  const isPos = d.pnl >= 0;

  return (
    <div className="bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2 shadow-2xl">
      <p className="text-[10px] text-[#6b7280] mb-1">{fmtDate(d.date)}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-[#6b7280]">Portfolio Value</span>
          <span className="text-[#f9fafb] font-bold font-mono">{fmt$(d.value)}</span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-[#6b7280]">Day P&L</span>
          <span className={`font-bold font-mono ${isPos ? 'text-[#34d399]' : 'text-[#f43f5e]'}`}>
            {isPos ? '+' : ''}{fmt$(d.pnl)} ({fmtPct(d.pnlPct)})
          </span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-[#6b7280]">Cumulative P&L</span>
          <span className={`font-bold font-mono ${d.cumulativePnl >= 0 ? 'text-[#34d399]' : 'text-[#f43f5e]'}`}>
            {d.cumulativePnl >= 0 ? '+' : ''}{fmt$(d.cumulativePnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────
function StatCard({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color?: string }) {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-[#1f2937] p-3 flex flex-col">
      <span className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">{label}</span>
      <span className={`text-lg font-bold mt-1 font-mono ${color || 'text-[#f9fafb]'}`}>{value}</span>
      {subtext && <span className="text-[10px] text-[#6b7280] mt-0.5">{subtext}</span>}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="h-[400px] flex flex-col items-center justify-center text-[#6b7280]">
      <TrendingUp className="w-8 h-8 mb-3 opacity-30" />
      <p className="text-sm font-medium">No data yet.</p>
      <p className="text-xs mt-1 opacity-60">Make your first trade to see results here.</p>
    </div>
  );
}

// ── Main Performance Card ─────────────────────────────────────────
export function PerformanceCard({
  portfolioValue,
  cash,
  positions,
}: {
  portfolioValue: number;
  cash: number;
  positions: any[];
}) {
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'>('1M');
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const periodMap: Record<string, string> = {
    '1M': '1M', '3M': '3M', '6M': '6M', 'YTD': 'YTD', '1Y': '1A', 'ALL': 'all',
  };

  const daysMap: Record<string, number> = {
    '1M': 22, '3M': 65, '6M': 130, 'YTD': 100, '1Y': 252, 'ALL': 500,
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPortfolioHistory(periodMap[timeframe])
      .then((rawData) => {
        if (cancelled) return;
        // Keep all valid data points, only remove obvious bad values
        const processed = rawData.filter(d => d.value >= 0 && !isNaN(d.value) && d.date);
        setData(processed);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [timeframe]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const startVal = data[0].value;
    const endVal = data[data.length - 1].value;
    const periodReturn = endVal - startVal;
    const periodReturnPct = startVal > 0 ? (periodReturn / startVal) * 100 : 0;
    const profitableDays = data.filter(d => d.pnl > 0).length;
    const winRate = data.length > 0 ? (profitableDays / data.length) * 100 : 0;
    let maxDD = 0;
    let peak = data[0].value;
    for (const d of data) {
      if (d.value > peak) peak = d.value;
      const dd = (peak - d.value) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return { currentValue: endVal, periodReturn, periodReturnPct, winRate, maxDrawdown: maxDD * 100 };
  }, [data]);

  // Y-axis domains
  const valueDomain = useMemo(() => {
    if (data.length === 0) return ['auto', 'auto'];
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [min * 0.998, max * 1.002];
  }, [data]);



  return (
    <div className="bg-[#0d1117] rounded-2xl border border-[#1f2937] p-4">
      {/* Header + Time Range */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#f9fafb] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#f59e0b]" />
          Performance
        </h3>
        <div className="flex gap-1">
          {(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                timeframe === tf
                  ? 'bg-[#f59e0b] text-black'
                  : 'bg-[#1f2937] text-[#6b7280] hover:bg-[#374151]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-[400px] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#f59e0b] animate-spin" />
        </div>
      )}

      {!loading && data.length === 0 && <EmptyState />}

      {!loading && data.length > 0 && stats && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard label="Portfolio Value" value={fmt$(stats.currentValue)} subtext={`As of ${fmtDate(data[data.length - 1].date)}`} />
            <StatCard
              label="Period Return"
              value={`${stats.periodReturn >= 0 ? '+' : ''}${fmt$(stats.periodReturn)}`}
              subtext={fmtPct(stats.periodReturnPct)}
              color={stats.periodReturn >= 0 ? 'text-[#34d399]' : 'text-[#f43f5e]'}
            />
            <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} subtext={`${data.filter(d => d.pnl > 0).length} of ${data.length} days`} />
            <StatCard label="Max Drawdown" value={`-${stats.maxDrawdown.toFixed(2)}%`} subtext="Peak to trough" color="text-[#f97316]" />
          </div>

          {/* Portfolio Value Area Chart */}
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 40, left: 0, bottom: 20 }}>
                <defs>
                  <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f293766" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 9 }}
                  tickFormatter={fmtDate}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  domain={valueDomain as any}
                  orientation="right"
                  tick={{ fill: '#6b7280', fontSize: 9, fontFamily: 'DM Mono' }}
                  tickFormatter={fmt$K}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#valueGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#f59e0b', stroke: '#0d1117', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>


        </>
      )}
    </div>
  );
}

// ── Allocation Card ─────────────────────────────────────────────────
export function AllocationCard({
  portfolioValue,
  cash,
  positions,
}: {
  portfolioValue: number;
  cash: number;
  positions: any[];
}) {
  const [allocationTab, setAllocationTab] = useState<'assetType' | 'sector'>('assetType');

  // Lazy import to avoid SSR issues
  const { buildAllocationData } = require('@/lib/portfolioAnalytics');

  const portfolioData = {
    equity: portfolioValue - cash,
    cash,
    portfolioValue,
    positions: positions.map((p: any) => ({
      symbol: p.symbol,
      marketValue: p.marketValue,
      qty: p.qty,
      avgEntryPrice: p.avgEntryPrice,
    })),
  };

  const allocationData = buildAllocationData(portfolioData);

  return (
    <div className="bg-[#0d1117] rounded-2xl border border-[#1f2937] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#f9fafb] flex items-center gap-2">
          <PieChart className="w-4 h-4 text-violet-400" />
          Allocation
        </h3>
        <div className="flex gap-1">
          {[
            { id: 'assetType', label: 'Asset' },
            { id: 'sector', label: 'Sector' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setAllocationTab(t.id as any)}
              className={`px-2 py-1 text-[10px] font-bold rounded-lg transition ${
                allocationTab === t.id
                  ? 'bg-violet-500 text-white'
                  : 'bg-[#1f2937] text-[#6b7280] hover:bg-[#374151]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <DonutChart data={allocationData[allocationTab]} />

      <div className="mt-4 space-y-2">
        {allocationData[allocationTab].map((item: any) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-[#9ca3af]">{item.label}</span>
            </div>
            <span className="text-xs font-bold text-[#f9fafb] font-mono">{item.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Donut Chart ─────────────────────────────────────────────────────
function DonutChart({ data }: { data: any[] }) {
  const total = data.reduce((sum: number, d: any) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[#6b7280] text-sm">
        No allocation data
      </div>
    );
  }

  const size = 192;
  const center = size / 2;
  const radius = size * 0.38;
  const innerRadius = size * 0.22;

  let currentAngle = 0;
  const slices = data.map((d: any) => {
    const angle = (d.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle += angle;
    return { ...d, startAngle, endAngle };
  });

  const arcPath = (start: number, end: number) => {
    const startRad = ((start - 90) * Math.PI) / 180;
    const endRad = ((end - 90) * Math.PI) / 180;
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const innerArcPath = (start: number, end: number) => {
    const startRad = ((start - 90) * Math.PI) / 180;
    const endRad = ((end - 90) * Math.PI) / 180;
    const x1 = center + innerRadius * Math.cos(endRad);
    const y1 = center + innerRadius * Math.sin(endRad);
    const x2 = center + innerRadius * Math.cos(startRad);
    const y2 = center + innerRadius * Math.sin(startRad);
    const largeArc = end - start > 180 ? 1 : 0;
    return `L ${x1} ${y1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2} ${y2} Z`;
  };

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice: any, i: number) => {
          if (slice.value <= 0) return null;
          return (
            <path
              key={i}
              d={`${arcPath(slice.startAngle, slice.endAngle)} ${innerArcPath(slice.startAngle, slice.endAngle)}`}
              fill={slice.color}
              stroke="#0d1117"
              strokeWidth="2"
            />
          );
        })}
        <text x={center} y={center - 6} textAnchor="middle" fill="#f9fafb" style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'DM Mono' }}>
          {total.toFixed(1)}%
        </text>
        <text x={center} y={center + 12} textAnchor="middle" fill="#6b7280" style={{ fontSize: '10px' }}>
          Allocated
        </text>
      </svg>
    </div>
  );
}
