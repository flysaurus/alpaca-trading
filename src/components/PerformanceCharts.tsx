'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, Loader2, TrendingUp, TrendingDown, AlertTriangle, PieChart } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────
interface DataPoint {
  date: string;
  value: number;      // equity / portfolio value
  pnl: number;        // daily P&L
  pnlPct: number;     // daily P&L %
  cumulativePnl: number; // running total of P&L from start of period
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString();
const fmt$K = (n: number) => {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString();
};
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00-05:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
};

// ── Mock data generator for empty paper accounts ────────────────
function generateMockData(days: number): DataPoint[] {
  const data: DataPoint[] = [];
  let value = 100_000;
  let cumulativePnl = 0;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends

    const change = (Math.random() - 0.48) * 800; // slight upward bias
    value += change;
    value = Math.max(value, 50_000);
    cumulativePnl += change;

    data.push({
      date: d.toISOString().split('T')[0],
      value,
      pnl: change,
      pnlPct: (change / (value - change)) * 100,
      cumulativePnl,
    });
  }
  return data;
}

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

// ── Stats Card ────────────────────────────────────────────────────
function StatCard({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color?: string }) {
  return (
    <div className="bg-[var(--app-bg)] rounded-lg p-3 flex flex-col">
      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-semibold">{label}</span>
      <span className={`text-lg font-bold mt-1 ${color || 'text-[var(--text-primary)]'}`}>{value}</span>
      {subtext && <span className="text-[10px] text-[var(--text-muted)] mt-0.5">{subtext}</span>}
    </div>
  );
}

// ── Smooth area chart (Portfolio Value) ───────────────────────────
function AreaChart({ data, width, height, hoveredIndex, onHover }: { data: DataPoint[]; width: number; height: number; hoveredIndex: number | null; onHover: (i: number | null) => void }) {
  if (data.length === 0) return null;

  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = (maxVal - minVal) * 0.05;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const yRange = yMax - yMin || 1;

  const padX = 40;
  const padY = 10;
  const chartW = width - padX;
  const chartH = height - padY * 2;

  const getX = (i: number) => (i / (data.length - 1)) * chartW;
  const getY = (v: number) => chartH - ((v - yMin) / yRange) * chartH + padY;

  // Build smooth area path using cubic bezier
  let path = `M ${getX(0)} ${getY(data[0].value)}`;
  for (let i = 1; i < data.length; i++) {
    const x0 = getX(i - 1);
    const y0 = getY(data[i - 1].value);
    const x1 = getX(i);
    const y1 = getY(data[i].value);
    const cpx = (x0 + x1) / 2;
    path += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
  }
  const areaPath = `${path} L ${getX(data.length - 1)} ${height} L ${getX(0)} ${height} Z`;

  // Y-axis labels (3 ticks)
  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill="url(#areaGrad)" />

      {/* Line */}
      <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Right Y-axis labels */}
      {ticks.map((t, i) => (
        <text key={i} x={width - 2} y={getY(t)} textAnchor="end" className="fill-[var(--text-muted)]" style={{ fontSize: '9px' }}>
          {fmt$K(t)}
        </text>
      ))}

      {/* Hover crosshair */}
      {hoveredIndex !== null && (
        <>
          <line x1={getX(hoveredIndex)} y1={padY} x2={getX(hoveredIndex)} y2={height} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
          <circle cx={getX(hoveredIndex)} cy={getY(data[hoveredIndex].value)} r="4" fill="#f59e0b" stroke="var(--card-bg)" strokeWidth="2" />
        </>
      )}

      {/* Invisible hover bars */}
      {data.map((_, i) => (
        <rect
          key={i}
          x={getX(i) - chartW / data.length / 2}
          y={0}
          width={chartW / data.length}
          height={height}
          fill="transparent"
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => onHover(null)}
        />
      ))}
    </svg>
  );
}

// ── P&L Composed Chart (Bars + Cumulative Line) ───────────────────
function PnLChart({ data, width, height, hoveredIndex, onHover }: { data: DataPoint[]; width: number; height: number; hoveredIndex: number | null; onHover: (i: number | null) => void }) {
  if (data.length === 0) return null;

  const pnls = data.map(d => d.pnl);
  const cumuls = data.map(d => d.cumulativePnl);

  const minPnl = Math.min(...pnls);
  const maxPnl = Math.max(...pnls);
  const pnlPad = (maxPnl - minPnl) * 0.1;
  const pnlMin = minPnl - pnlPad;
  const pnlMax = maxPnl + pnlPad;
  const pnlRange = pnlMax - pnlMin || 1;

  const minCum = Math.min(...cumuls);
  const maxCum = Math.max(...cumuls);
  const cumPad = (maxCum - minCum) * 0.1;
  const cumMin = minCum - cumPad;
  const cumMax = maxCum + cumPad;
  const cumRange = cumMax - cumMin || 1;

  const padX = 40;
  const padY = 10;
  const chartW = width - padX;
  const chartH = height - padY * 2;

  const getX = (i: number) => (i / (data.length - 1)) * chartW;
  const getBarY = (v: number) => chartH - ((v - pnlMin) / pnlRange) * chartH + padY;
  const getCumY = (v: number) => chartH - ((v - cumMin) / cumRange) * chartH + padY;

  const zeroY = getBarY(0);

  const barW = Math.max((chartW / data.length) * 0.6, 2);

  // Cumulative line path (smooth)
  let linePath = `M ${getX(0)} ${getCumY(cumuls[0])}`;
  for (let i = 1; i < data.length; i++) {
    const x0 = getX(i - 1);
    const y0 = getCumY(cumuls[i - 1]);
    const x1 = getX(i);
    const y1 = getCumY(cumuls[i]);
    const cpx = (x0 + x1) / 2;
    linePath += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
  }

  // Left axis (P&L) labels
  const pnlTicks = [pnlMin, (pnlMin + pnlMax) / 2, pnlMax];
  // Right axis (Cumulative) labels
  const cumTicks = [cumMin, (cumMin + cumMax) / 2, cumMax];

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Zero line */}
      <line x1={0} y1={zeroY} x2={chartW} y2={zeroY} stroke="#374151" strokeWidth="1" />

      {/* Bars */}
      {data.map((d, i) => {
        const x = getX(i) - barW / 2;
        const isPos = d.pnl >= 0;
        const barTop = getBarY(d.pnl);
        const barBottom = zeroY;
        const barH = Math.abs(barBottom - barTop);
        const barY = Math.min(barTop, barBottom);

        return (
          <rect
            key={`bar-${i}`}
            x={x}
            y={barY}
            width={barW}
            height={Math.max(barH, 1)}
            rx={1}
            fill={isPos ? '#34d399' : '#f43f5e'}
            opacity={hoveredIndex === i ? 1 : 0.7}
          />
        );
      })}

      {/* Cumulative line */}
      <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Left Y-axis (P&L) */}
      {pnlTicks.map((t, i) => (
        <text key={`pl-${i}`} x={2} y={getBarY(t)} textAnchor="start" className="fill-[var(--text-muted)]" style={{ fontSize: '9px' }}>
          {fmt$K(t)}
        </text>
      ))}

      {/* Right Y-axis (Cumulative) */}
      {cumTicks.map((t, i) => (
        <text key={`cl-${i}`} x={width - 2} y={getCumY(t)} textAnchor="end" className="fill-[var(--text-muted)]" style={{ fontSize: '9px' }}>
          {fmt$K(t)}
        </text>
      ))}

      {/* Hover crosshair */}
      {hoveredIndex !== null && (
        <line x1={getX(hoveredIndex)} y1={padY} x2={getX(hoveredIndex)} y2={height} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
      )}

      {/* Invisible hover bars */}
      {data.map((_, i) => (
        <rect
          key={i}
          x={getX(i) - chartW / data.length / 2}
          y={0}
          width={chartW / data.length}
          height={height}
          fill="transparent"
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => onHover(null)}
        />
      ))}
    </svg>
  );
}

// ── Shared X-axis ─────────────────────────────────────────────────
function XAxis({ data, width }: { data: DataPoint[]; width: number }) {
  if (data.length === 0) return null;
  const padX = 40;
  const chartW = width - padX;
  const count = Math.min(data.length, 7);
  const step = Math.floor((data.length - 1) / (count - 1));

  return (
    <svg width={width} height={20} className="overflow-visible">
      {Array.from({ length: count }).map((_, i) => {
        const idx = Math.min(i * step, data.length - 1);
        const x = (idx / (data.length - 1)) * chartW;
        return (
          <text key={i} x={x} y={14} textAnchor="middle" className="fill-[var(--text-muted)]" style={{ fontSize: '9px' }}>
            {fmtDate(data[idx].date)}
          </text>
        );
      })}
    </svg>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────
function Tooltip({ data, index, x, y }: { data: DataPoint[]; index: number; x: number; y: number }) {
  if (index === null || index < 0 || index >= data.length) return null;
  const d = data[index];
  const isPos = d.pnl >= 0;

  return (
    <div
      className="fixed z-50 bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2 shadow-2xl pointer-events-none"
      style={{ left: Math.min(x + 10, window.innerWidth - 220), top: Math.max(y - 10, 10) }}
    >
      <p className="text-[10px] text-[var(--text-muted)] mb-1">{fmtDate(d.date)}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-[var(--text-muted)]">Portfolio Value</span>
          <span className="text-[var(--text-primary)] font-bold">{fmt$(d.value)}</span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-[var(--text-muted)]">Day P&L</span>
          <span className={`font-bold ${isPos ? 'text-[#34d399]' : 'text-[#f43f5e]'}`}>
            {isPos ? '+' : ''}{fmt$(d.pnl)} ({fmtPct(d.pnlPct)})
          </span>
        </div>
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-[var(--text-muted)]">Cumulative P&L</span>
          <span className={`font-bold ${d.cumulativePnl >= 0 ? 'text-[#34d399]' : 'text-[#f43f5e]'}`}>
            {d.cumulativePnl >= 0 ? '+' : ''}{fmt$(d.cumulativePnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="h-[360px] flex flex-col items-center justify-center text-[var(--text-muted)]">
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

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

        let processed = rawData;

        // Filter out null/undefined/zero values
        processed = processed.filter(d => d.value > 0 && !isNaN(d.value));

        // Remove outliers: exclude points where |value| > mean * 10
        if (processed.length > 0) {
          const mean = processed.reduce((s, d) => s + d.value, 0) / processed.length;
          processed = processed.filter(d => Math.abs(d.value) <= mean * 10);
        }

        // If no real data, use mock
        if (processed.length === 0) {
          processed = generateMockData(daysMap[timeframe]);
        }

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

    // Max drawdown
    let maxDD = 0;
    let peak = data[0].value;
    for (const d of data) {
      if (d.value > peak) peak = d.value;
      const dd = (peak - d.value) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    return {
      currentValue: endVal,
      periodReturn,
      periodReturnPct,
      winRate,
      maxDrawdown: maxDD * 100,
    };
  }, [data]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4" onMouseMove={handleMouseMove}>
      {/* Header + Time Range */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          Performance
        </h3>
        <div className="flex gap-1">
          {(['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded transition ${
                timeframe === tf
                  ? 'bg-[#f59e0b] text-black'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-[360px] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        </div>
      )}

      {!loading && data.length === 0 && <EmptyState />}

      {!loading && data.length > 0 && stats && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-2 mb-4">
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
          <div className="mb-1">
            <p className="text-[10px] text-[var(--text-muted)] mb-1 font-semibold uppercase tracking-wide">Portfolio Value</p>
            <AreaChart data={data} width={600} height={200} hoveredIndex={hoveredIndex} onHover={setHoveredIndex} />
          </div>

          {/* Shared X-Axis */}
          <XAxis data={data} width={600} />

          {/* P&L Composed Chart */}
          <div className="mt-2">
            <p className="text-[10px] text-[var(--text-muted)] mb-1 font-semibold uppercase tracking-wide">Daily P&L</p>
            <PnLChart data={data} width={600} height={160} hoveredIndex={hoveredIndex} onHover={setHoveredIndex} />
          </div>

          {/* Tooltip */}
          {hoveredIndex !== null && <Tooltip data={data} index={hoveredIndex} x={mousePos.x} y={mousePos.y} />}
        </>
      )}
    </div>
  );
}

// ── Allocation Card (keep existing) ───────────────────────────────
function AllocationCardInner({
  portfolioValue,
  cash,
  positions,
}: {
  portfolioValue: number;
  cash: number;
  positions: any[];
}) {
  const [allocationTab, setAllocationTab] = useState<'assetType' | 'sector'>('assetType');
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
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
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
              className={`px-2 py-1 text-[10px] font-bold rounded transition ${
                allocationTab === t.id
                  ? 'bg-violet-500 text-white'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
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
              <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)]">{item.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: any[] }) {
  const total = data.reduce((sum: number, d: any) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--text-muted)] text-sm">
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
              stroke="var(--card-bg)"
              strokeWidth="2"
            />
          );
        })}
        <text x={center} y={center - 6} textAnchor="middle" className="fill-[var(--text-primary)]" style={{ fontSize: '20px', fontWeight: 'bold' }}>
          {total.toFixed(1)}%
        </text>
        <text x={center} y={center + 12} textAnchor="middle" className="fill-[var(--text-muted)]" style={{ fontSize: '10px' }}>
          Allocated
        </text>
      </svg>
    </div>
  );
}

export { AllocationCardInner as AllocationCard };
