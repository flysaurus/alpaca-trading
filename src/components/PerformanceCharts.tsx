'use client';

import { useState, useMemo, useEffect } from 'react';
import { Activity, PieChart, Loader2 } from 'lucide-react';
import { buildAllocationData, aggregateValueByWeek, aggregatePnLByWeek } from '@/lib/portfolioAnalytics';

// ── Types ─────────────────────────────────────────────────────────
interface ValueDataPoint {
  date: string;
  value: number;
  pnl: number;
  stocks?: number;
  etfs?: number;
  cash?: number;
}

interface TooltipState {
  x: number;
  y: number;
  data: ValueDataPoint;
}

// ── Helper: format currency ───────────────────────────────────────
function fmtCurrency(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

// ── Helper: format date label ─────────────────────────────────────
function fmtDateLabel(dateStr: string, isWeekly: boolean): string {
  const d = new Date(dateStr + 'T00:00:00-05:00');
  if (isWeekly) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Fetch real portfolio history from API ─────────────────────────
async function fetchPortfolioHistory(period: string): Promise<ValueDataPoint[]> {
  try {
    const res = await fetch(`/api/portfolio/history?period=${period}&timeframe=1D`);
    if (!res.ok) throw new Error('Failed to fetch');
    const { history } = await res.json();

    if (!history || !Array.isArray(history.timestamp) || history.timestamp.length === 0) {
      return [];
    }

    // Transform Alpaca response to chart format
    const data: ValueDataPoint[] = [];
    for (let i = 0; i < history.timestamp.length; i++) {
      const ts = history.timestamp[i];
      const date = new Date(ts * 1000).toISOString().split('T')[0];
      const value = parseFloat(history.equity[i] || '0');
      const prevValue = i > 0 ? parseFloat(history.equity[i - 1] || '0') : value;
      const pnl = value - prevValue;

      data.push({
        date,
        value,
        pnl,
        stocks: value * 0.7, // Approximate breakdown
        etfs: value * 0.2,
        cash: value * 0.1,
      });
    }
    return data;
  } catch (err) {
    console.error('[Performance] Failed to fetch portfolio history:', err);
    return [];
  }
}

// ── Performance Chart Component ───────────────────────────────────
function PerformanceChart({
  data,
  metric,
  days,
}: {
  data: ValueDataPoint[];
  metric: 'value' | 'pnl';
  days: number;
}) {
  const [hovered, setHovered] = useState<TooltipState | null>(null);

  const isLongRange = days > 30;

  // Aggregate data when needed
  const chartData = useMemo(() => {
    if (metric === 'value') {
      if (isLongRange) {
        return aggregateValueByWeek(data);
      }
      return data;
    }
    // P&L: skip non-trading days (already filtered in buildPerformanceData)
    if (isLongRange) {
      return aggregatePnLByWeek(data);
    }
    return data;
  }, [data, metric, isLongRange]);

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--text-muted)] text-sm">
        No historical data available
      </div>
    );
  }

  const values = chartData.map((d) => (metric === 'value' ? d.value : d.pnl));
  const maxValue = Math.max(...values.map(Math.abs));
  const minValue = Math.min(...values);
  const isPnL = metric === 'pnl';
  const hasNegative = isPnL && minValue < 0;

  // Chart dimensions
  const width = 100;
  const height = 48;
  const padding = { top: 4, bottom: 4 };
  const chartHeight = height - padding.top - padding.bottom;

  // For value chart: scale from 0 to max
  // For P&L chart: scale from min to max (centered on 0 if has negative)
  const getY = (v: number) => {
    if (isPnL && hasNegative) {
      const range = maxValue - minValue;
      if (range === 0) return height / 2;
      return padding.top + chartHeight - ((v - minValue) / range) * chartHeight;
    }
    const range = maxValue || 1;
    return padding.top + chartHeight - (v / range) * chartHeight;
  };

  const zeroY = isPnL && hasNegative ? getY(0) : height;

  // Build SVG bar chart
  const barWidth = width / chartData.length;
  const barGap = barWidth * 0.2;
  const barW = barWidth - barGap;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-48"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Zero line for P&L */}
        {isPnL && hasNegative && (
          <line
            x1="0"
            y1={zeroY}
            x2={width}
            y2={zeroY}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.2"
          />
        )}

        {chartData.map((d, i) => {
          const val = isPnL ? d.pnl : d.value;
          const x = i * barWidth + barGap / 2;

          let barH: number;
          let barY: number;

          if (isPnL && hasNegative) {
            const y = getY(val);
            if (val >= 0) {
              barY = y;
              barH = zeroY - y;
            } else {
              barY = zeroY;
              barH = y - zeroY;
            }
          } else {
            const y = getY(val);
            barY = y;
            barH = height - padding.bottom - y;
          }

          const isPositive = val >= 0;
          const color = isPnL
            ? isPositive
              ? '#22d66e'
              : '#f87171'
            : '#f59e0b';

          return (
            <g key={i}>
              <rect
                x={x}
                y={barY}
                width={Math.max(barW, 0.5)}
                height={Math.max(barH, 0.5)}
                fill={color}
                rx={0.3}
                opacity={0.8}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setHovered({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    data: d,
                  });
                }}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute z-10 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2 shadow-xl pointer-events-none"
          style={{
            left: Math.min(hovered.x - 80, window.innerWidth - 200),
            top: hovered.y - 80,
          }}
        >
          <p className="text-[10px] text-[var(--text-muted)]">{hovered.data.date}</p>
          <p className="text-xs font-bold text-[var(--text-primary)]">
            {metric === 'value' ? fmtCurrency(hovered.data.value) : `${hovered.data.pnl >= 0 ? '+' : ''}${fmtCurrency(hovered.data.pnl)}`}
          </p>
          {metric === 'value' && (
            <p className="text-[10px] text-[var(--text-muted)]">
              P&L: {hovered.data.pnl >= 0 ? '+' : ''}{fmtCurrency(hovered.data.pnl)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Performance Card Component ────────────────────────────────────
function PerformanceCard({
  portfolioValue,
  cash,
  positions,
}: {
  portfolioValue: number;
  cash: number;
  positions: any[];
}) {
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'>('3M');
  const [chartType, setChartType] = useState<'value' | 'pnl'>('value');
  const [performanceData, setPerformanceData] = useState<ValueDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodMap: Record<string, string> = {
    '1M': '1M',
    '3M': '3M',
    '6M': '6M',
    'YTD': 'YTD',
    '1Y': '1A',
    'ALL': 'all',
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPortfolioHistory(periodMap[timeframe] || '3M')
      .then((data) => {
        if (!cancelled) {
          setPerformanceData(data);
          if (data.length === 0) {
            setError('No historical portfolio data available from Alpaca');
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [timeframe]);

  const days =
    timeframe === '1M'
      ? 22
      : timeframe === '3M'
      ? 65
      : timeframe === '6M'
      ? 130
      : timeframe === '1Y'
      ? 252
      : timeframe === 'YTD'
      ? 100
      : 500;

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          Performance
        </h3>
        <div className="flex gap-1">
          {['1M', '3M', '6M', 'YTD', '1Y', 'ALL'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf as any)}
              className={`px-2 py-1 text-[10px] font-bold rounded transition ${
                timeframe === tf
                  ? 'bg-amber-500 text-black'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { id: 'value', label: 'Portfolio Value' },
          { id: 'pnl', label: 'P&L' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setChartType(m.id as any)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
              chartType === m.id
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="h-48 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="h-48 flex items-center justify-center text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && performanceData.length > 0 && (
        <>
          <PerformanceChart data={performanceData} metric={chartType} days={days} />
          <div className="mt-4 flex justify-between text-[11px] text-slate-400 font-medium">
            <span>{performanceData[0]?.date}</span>
            <span>{performanceData[performanceData.length - 1]?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Allocation Card Component ─────────────────────────────────────
function AllocationCard({
  portfolioValue,
  cash,
  positions,
}: {
  portfolioValue: number;
  cash: number;
  positions: any[];
}) {
  const [allocationTab, setAllocationTab] = useState<'assetType' | 'sector'>('assetType');

  const portfolioData = {
    equity: portfolioValue - cash,
    cash,
    portfolioValue,
    positions: positions.map((p) => ({
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

      {/* Donut Chart */}
      <DonutChart data={allocationData[allocationTab]} />

      {/* Legend */}
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

// ── Donut Chart Component ─────────────────────────────────────────
function DonutChart({ data }: { data: any[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--text-muted)] text-sm">
        No allocation data
      </div>
    );
  }

  const size = 192; // Bigger donut (was ~128)
  const center = size / 2;
  const radius = size * 0.38;
  const innerRadius = size * 0.22;

  let currentAngle = 0;
  const slices = data.map((d) => {
    const angle = (d.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle += angle;
    return { ...d, startAngle, endAngle };
  });

  // SVG arc path helper
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
        {slices.map((slice, i) => {
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
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          className="fill-[var(--text-primary)] text-lg font-bold"
          style={{ fontSize: '20px' }}
        >
          {total.toFixed(1)}%
        </text>
        <text
          x={center}
          y={center + 12}
          textAnchor="middle"
          className="fill-[var(--text-muted)]"
          style={{ fontSize: '10px' }}
        >
          Allocated
        </text>
      </svg>
    </div>
  );
}

// ── Exports ───────────────────────────────────────────────────────
export { PerformanceCard, AllocationCard };
