'use client';

import { useState, useMemo } from 'react';
import { Activity, PieChart } from 'lucide-react';
import { buildAllocationData, buildPerformanceData, aggregateValueByWeek, aggregatePnLByWeek } from '@/lib/portfolioAnalytics';

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
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No {metric === 'value' ? 'portfolio value' : 'P&L'} data available for this timeframe.
      </div>
    );
  }

  const chartWidth = 400;
  const chartHeight = 200;
  const paddingX = 30;
  const paddingY = 20;
  const plotWidth = chartWidth - 2 * paddingX;
  const plotHeight = chartHeight - 2 * paddingY;

  const barCount = chartData.length;
  const barWidth = Math.max(4, Math.min(28, plotWidth / barCount - 3));

  // ── Portfolio Value chart: show daily/weekly CHANGE as bars from zero ──
  if (metric === 'value') {
    const changes = chartData.map((d, i) =>
      i === 0 ? 0 : d.value - chartData[i - 1].value
    );
    const minChange = Math.min(...changes);
    const maxChange = Math.max(...changes);
    const maxAbs = Math.max(Math.abs(minChange), Math.abs(maxChange), 1);

    // Zero line Y position (centered if we have both + and -, else at bottom/top)
    const hasPositive = maxChange > 0;
    const hasNegative = minChange < 0;
    let zeroY: number;
    let scale: number;

    if (hasPositive && hasNegative) {
      zeroY = paddingY + (maxChange / (maxChange - minChange)) * plotHeight;
      scale = plotHeight / (maxChange - minChange);
    } else if (hasNegative) {
      zeroY = paddingY;
      scale = plotHeight / maxAbs;
    } else {
      zeroY = chartHeight - paddingY;
      scale = plotHeight / maxAbs;
    }

    return (
      <div className="relative w-full h-64">
        <svg
          width={chartWidth}
          height={chartHeight}
          className="w-full h-full"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          {/* Zero line */}
          <line
            x1={paddingX}
            y1={zeroY}
            x2={chartWidth - paddingX}
            y2={zeroY}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3,3"
          />

          {/* Change bars */}
          {chartData.map((d, i) => {
            const change = changes[i];
            if (i === 0) return null; // Skip first point (no previous to compare)

            const x = paddingX + ((i + 0.5) / barCount) * plotWidth;
            const barH = Math.abs(change) * scale;
            const y = change >= 0 ? zeroY - barH : zeroY;
            const color = change >= 0 ? '#10b981' : '#ef4444';

            return (
              <rect
                key={i}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={barH}
                fill={color}
                className="opacity-85 hover:opacity-100 cursor-pointer transition-opacity"
                rx={2}
                onMouseEnter={() =>
                  setHovered({
                    x,
                    y: change >= 0 ? y : y + barH,
                    data: d,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* Date labels (sparse if many bars) */}
          {chartData.map((d, i) => {
            if (i === 0) return null;
            const showLabel =
              barCount <= 10 ||
              i === 1 ||
              i === chartData.length - 1 ||
              i % Math.ceil(barCount / 6) === 0;
            if (!showLabel) return null;

            const x = paddingX + ((i + 0.5) / barCount) * plotWidth;
            return (
              <text
                key={`label-${i}`}
                x={x}
                y={chartHeight - 4}
                textAnchor="middle"
                className="fill-slate-300"
                style={{ fontSize: '9px', fontWeight: 500 }}
              >
                {fmtDateLabel(d.date, isLongRange)}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="absolute bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2.5 shadow-xl pointer-events-none z-10 min-w-[140px]"
            style={{
              left: `${(hovered.x / chartWidth) * 100}%`,
              top: `${(hovered.y / chartHeight) * 100}%`,
              transform: 'translate(-50%, -100%) translateY(-10px)',
            }}
          >
            <p className="text-xs font-bold text-[var(--text-primary)] mb-1">
              {hovered.data.date}
            </p>
            <p className="text-[11px] text-slate-300">
              Value: <span className="font-mono font-semibold text-white">{fmtCurrency(hovered.data.value)}</span>
            </p>
            <p className="text-[11px] text-slate-300">
              Change:{' '}
              <span
                className={`font-mono font-semibold ${
                  hovered.data.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {hovered.data.pnl >= 0 ? '+' : ''}
                {fmtCurrency(hovered.data.pnl)}
              </span>
            </p>
            {hovered.data.stocks !== undefined && (
              <>
                <div className="border-t border-[var(--border)] my-1.5" />
                <p className="text-[10px] text-slate-400">
                  Stocks:{' '}
                  <span className="font-mono text-slate-200">{fmtCurrency(hovered.data.stocks)}</span>
                </p>
                <p className="text-[10px] text-slate-400">
                  ETFs:{' '}
                  <span className="font-mono text-slate-200">{fmtCurrency(hovered.data.etfs!)}</span>
                </p>
                <p className="text-[10px] text-slate-400">
                  Cash:{' '}
                  <span className="font-mono text-slate-200">{fmtCurrency(hovered.data.cash!)}</span>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── P&L chart: bars from zero line, skip weekends/holidays ──
  const pnlValues = chartData.map((d) => d.pnl);
  const minPnl = Math.min(...pnlValues);
  const maxPnl = Math.max(...pnlValues);
  const maxAbsPnl = Math.max(Math.abs(minPnl), Math.abs(maxPnl), 1);

  const hasPos = maxPnl > 0;
  const hasNeg = minPnl < 0;
  let zeroYPnl: number;
  let scalePnl: number;

  if (hasPos && hasNeg) {
    zeroYPnl = paddingY + (maxPnl / (maxPnl - minPnl)) * plotHeight;
    scalePnl = plotHeight / (maxPnl - minPnl);
  } else if (hasNeg) {
    zeroYPnl = paddingY;
    scalePnl = plotHeight / maxAbsPnl;
  } else {
    zeroYPnl = chartHeight - paddingY;
    scalePnl = plotHeight / maxAbsPnl;
  }

  return (
    <div className="relative w-full h-64">
      <svg
        width={chartWidth}
        height={chartHeight}
        className="w-full h-full"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        {/* Zero line */}
        <line
          x1={paddingX}
          y1={zeroYPnl}
          x2={chartWidth - paddingX}
          y2={zeroYPnl}
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="3,3"
        />

        {/* P&L Bars */}
        {chartData.map((d, i) => {
          const x = paddingX + ((i + 0.5) / barCount) * plotWidth;
          const barH = Math.abs(d.pnl) * scalePnl;
          const y = d.pnl >= 0 ? zeroYPnl - barH : zeroYPnl;
          const color = d.pnl >= 0 ? '#10b981' : '#ef4444';

          return (
            <rect
              key={i}
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={barH}
              fill={color}
              className="opacity-85 hover:opacity-100 cursor-pointer transition-opacity"
              rx={2}
              onMouseEnter={() =>
                setHovered({
                  x,
                  y: d.pnl >= 0 ? y : y + barH,
                  data: d,
                })
              }
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {/* Date labels */}
        {chartData.map((d, i) => {
          const showLabel =
            barCount <= 10 ||
            i === 0 ||
            i === chartData.length - 1 ||
            i % Math.ceil(barCount / 6) === 0;
          if (!showLabel) return null;

          const x = paddingX + ((i + 0.5) / barCount) * plotWidth;
          return (
            <text
              key={`label-${i}`}
              x={x}
              y={chartHeight - 4}
              textAnchor="middle"
              className="fill-slate-300"
              style={{ fontSize: '9px', fontWeight: 500 }}
            >
              {fmtDateLabel(d.date, isLongRange)}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2.5 shadow-xl pointer-events-none z-10 min-w-[120px]"
          style={{
            left: `${(hovered.x / chartWidth) * 100}%`,
            top: `${(hovered.y / chartHeight) * 100}%`,
            transform: 'translate(-50%, -100%) translateY(-10px)',
          }}
        >
          <p className="text-xs font-bold text-[var(--text-primary)] mb-1">
            {hovered.data.date}
          </p>
          <p
            className={`text-[11px] font-bold ${
              hovered.data.pnl > 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {hovered.data.pnl > 0 ? '+' : ''}
            {fmtCurrency(hovered.data.pnl)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Value: <span className="font-mono text-slate-200">{fmtCurrency(hovered.data.value)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Donut Chart Component (50% larger) ────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return null;

  // 50% larger: center 150, outer radius 120, inner 75
  const centerX = 150;
  const centerY = 150;
  const radius = 120;
  const innerRadius = 75;

  let cumulativePercent = 0;

  const createPath = (startAngle: number, endAngle: number) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);
    const x3 = centerX + innerRadius * Math.cos(endRad);
    const y3 = centerY + innerRadius * Math.sin(endRad);
    const x4 = centerX + innerRadius * Math.cos(startRad);
    const y4 = centerY + innerRadius * Math.sin(startRad);

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-72 h-72">
        <svg width="300" height="300" viewBox="0 0 300 300" className="w-full h-full">
          {data.map((item, i) => {
            const startAngle = cumulativePercent * 360;
            const endAngle = startAngle + (item.value / total) * 360;
            cumulativePercent += item.value / total;

            return (
              <path
                key={i}
                d={createPath(startAngle, endAngle)}
                fill={item.color}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <span className="text-xl font-bold text-[var(--text-primary)]">100%</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 w-full">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <div
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[var(--text-primary)] font-medium flex-1">{item.label}</span>
            <span className="text-slate-300 font-mono font-semibold">
              {((item.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bar Chart Component for Sectors ───────────────────────────────
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value));
  const chartHeight = 180;
  const barWidth = 32;
  const chartWidth = 340;
  const barSpacing = 12;

  return (
    <div className="w-full">
      <svg
        width={chartWidth}
        height={chartHeight + 50}
        className="w-full"
        viewBox={`0 0 ${chartWidth} ${chartHeight + 50}`}
      >
        {data.map((item, i) => {
          const barHeight = (item.value / maxValue) * chartHeight;
          const x = 24 + i * (barWidth + barSpacing);
          const y = chartHeight - barHeight;
          const percentage = ((item.value / total) * 100).toFixed(1);

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color}
                className="hover:opacity-80 cursor-pointer transition-opacity"
                rx={3}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-slate-300 font-mono"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {percentage}%
              </text>
              <text
                x={x + barWidth / 2}
                y={chartHeight + 18}
                textAnchor="middle"
                className="fill-[var(--text-primary)]"
                style={{ fontSize: '11px', fontWeight: 500 }}
              >
                {item.label.length > 8 ? item.label.substring(0, 8) + '…' : item.label}
              </text>
            </g>
          );
        })}
      </svg>
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

  const days =
    timeframe === '1M'
      ? 22 // ~22 trading days in a month
      : timeframe === '3M'
      ? 65
      : timeframe === '6M'
      ? 130
      : timeframe === '1Y'
      ? 252
      : timeframe === 'YTD'
      ? 100 // approximate
      : 500;

  const performanceData = buildPerformanceData(portfolioData, days);

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

      <PerformanceChart data={performanceData} metric={chartType} days={days} />

      <div className="mt-4 flex justify-between text-[11px] text-slate-400 font-medium">
        <span>{performanceData[0]?.date}</span>
        <span>{performanceData[performanceData.length - 1]?.date}</span>
      </div>
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
          <PieChart className="w-4 h-4 text-amber-400" />
          Allocation
        </h3>
        <div className="flex gap-1">
          {(['assetType', 'sector'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setAllocationTab(t)}
              className={`px-2 py-1 text-[10px] font-bold rounded transition ${
                allocationTab === t
                  ? 'bg-amber-500 text-black'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)]'
              }`}
            >
              {t === 'assetType' ? 'Assets' : 'Sector'}
            </button>
          ))}
        </div>
      </div>

      {allocationTab === 'assetType' ? (
        <DonutChart data={allocationData.assetType} />
      ) : (
        <BarChart data={allocationData.sector} />
      )}
    </div>
  );
}

export { PerformanceCard, AllocationCard };
