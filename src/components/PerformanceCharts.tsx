'use client';

import { useState } from 'react';
import { Activity, PieChart } from 'lucide-react';
import { buildAllocationData, buildPerformanceData, aggregatePnLData } from '@/lib/portfolioAnalytics';

// ── Performance Chart Component with Portfolio Breakdown ──────────────────────
// Data shape for portfolio value chart
interface ValueDataPoint {
  date: string;
  value: number;
  pnl: number;
  stocks?: number;
  etfs?: number;
  cash?: number;
}

// Data shape for aggregated P&L chart
interface PnLDataPoint {
  date: string;
  pnl: number;
}

function PerformanceChart({ data, metric, timeframe }: { data: ValueDataPoint[]; metric: 'value' | 'pnl'; timeframe: string }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: ValueDataPoint | PnLDataPoint } | null>(null);
  
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No {metric === 'value' ? 'portfolio value' : 'P&L'} data available for this timeframe.
      </div>
    );
  }

  const chartWidth = 400;
  const chartHeight = 200;
  const padding = 20;
  
  // For portfolio value, show stacked bar chart
  if (metric === 'value') {
    const maxValue = Math.max(...data.map(d => d.value));
    const minBarWidth = 8;
    const maxBarWidth = 30;
    const availableWidth = chartWidth - 2 * padding;
    const calculatedBarWidth = availableWidth / data.length - 2;
    const barWidth = Math.max(minBarWidth, Math.min(maxBarWidth, calculatedBarWidth));
    
    return (
      <div className="relative w-full h-64">
        <svg width={chartWidth} height={chartHeight} className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {/* Stacked bars */}
          {data.map((d, i) => {
            const x = padding + (i / (data.length - 1)) * (chartWidth - 2 * padding);
            const cashHeight = (d.cash! / maxValue) * (chartHeight - 2 * padding);
            const etfHeight = (d.etfs! / maxValue) * (chartHeight - 2 * padding);
            const stockHeight = (d.stocks! / maxValue) * (chartHeight - 2 * padding);
            
            const cashY = chartHeight - padding - cashHeight;
            const etfY = cashY - etfHeight;
            const stockY = etfY - stockHeight;
            
            return (
              <g key={i}>
                {/* Cash bar */}
                <rect
                  x={x - barWidth / 2}
                  y={cashY}
                  width={barWidth}
                  height={cashHeight}
                  fill="#6b7280"
                  className="opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredPoint({ x, y: cashY + cashHeight / 2, data: d })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                {/* ETF bar */}
                <rect
                  x={x - barWidth / 2}
                  y={etfY}
                  width={barWidth}
                  height={etfHeight}
                  fill="#f59e0b"
                  className="opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredPoint({ x, y: etfY + etfHeight / 2, data: d })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                {/* Stock bar */}
                <rect
                  x={x - barWidth / 2}
                  y={stockY}
                  width={barWidth}
                  height={stockHeight}
                  fill="#10b981"
                  className="opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredPoint({ x, y: stockY + stockHeight / 2, data: d })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}
        </svg>
        
        {/* Tooltip */}
        {hoveredPoint && (
          <div 
            className="absolute bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2 shadow-xl pointer-events-none z-10"
            style={{ 
              left: `${(hoveredPoint.x / chartWidth) * 100}%`, 
              top: `${(hoveredPoint.y / chartHeight) * 100}%`,
              transform: 'translate(-50%, -100%) translateY(-10px)'
            }}
          >
            <p className="text-xs font-bold text-[var(--text-primary)]">
              {hoveredPoint.data.date}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              Total: ${Math.round((hoveredPoint.data as ValueDataPoint).value).toLocaleString()}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              Stocks: ${Math.round((hoveredPoint.data as ValueDataPoint).stocks!).toLocaleString()}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              ETFs: ${Math.round((hoveredPoint.data as ValueDataPoint).etfs!).toLocaleString()}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              Cash: ${Math.round((hoveredPoint.data as ValueDataPoint).cash!).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    );
  }
  
  // For P&L, show bar chart with aggregated data
  const aggregatedData = aggregatePnLData(data, timeframe);
  const pnlValues = aggregatedData.map(d => d.pnl);
  const minPnl = Math.min(...pnlValues);
  const maxPnl = Math.max(...pnlValues);
  const range = maxPnl - minPnl || 1;
  
  // Determine bar width for P&L chart
  const minBarWidth = 8;
  const maxBarWidth = 40;
  const availableWidth = chartWidth - 2 * padding;
  const calculatedBarWidth = availableWidth / aggregatedData.length - 2;
  const barWidth = Math.max(minBarWidth, Math.min(maxBarWidth, calculatedBarWidth));
  
  // Determine color based on overall profitability
  const totalPnL = pnlValues.reduce((sum, val) => sum + val, 0);
  const isProfitable = totalPnL > 0;
  const color = isProfitable ? '#10b981' : '#ef4444';
  
  return (
    <div className="relative w-full h-64">
      <svg width={chartWidth} height={chartHeight} className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {/* Zero line if needed */}
        {minPnl < 0 && maxPnl > 0 && (
          <line 
            x1={padding} 
            y1={padding + (1 - ((0 - minPnl) / range)) * (chartHeight - 2 * padding)} 
            x2={chartWidth - padding} 
            y2={padding + (1 - ((0 - minPnl) / range)) * (chartHeight - 2 * padding)} 
            stroke="#6b7280" 
            strokeWidth="1" 
            strokeDasharray="2,2"
          />
        )}
        
        {/* P&L Bars */}
        {aggregatedData.map((d, i) => {
          const x = padding + (i / (aggregatedData.length - 1 || 1)) * (chartWidth - 2 * padding);
          const barHeight = Math.abs((d.pnl - minPnl) / range) * (chartHeight - 2 * padding);
          const y = d.pnl >= 0 
            ? padding + (1 - ((d.pnl - minPnl) / range)) * (chartHeight - 2 * padding)
            : padding + (1 - ((0 - minPnl) / range)) * (chartHeight - 2 * padding);
          
          return (
            <rect
              key={i}
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={d.pnl >= 0 ? '#10b981' : '#ef4444'}
              className="opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
              onMouseEnter={() => setHoveredPoint({ x, y: y + (d.pnl >= 0 ? 0 : barHeight), data: d })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          );
        })}
      </svg>
      
      {/* Tooltip */}
      {hoveredPoint && (
        <div 
          className="absolute bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2 shadow-xl pointer-events-none z-10"
          style={{ 
            left: `${(hoveredPoint.x / chartWidth) * 100}%`, 
            top: `${(hoveredPoint.y / chartHeight) * 100}%`,
            transform: 'translate(-50%, -100%) translateY(-10px)'
          }}
        >
          <p className="text-xs font-bold text-[var(--text-primary)]">
            {hoveredPoint.data.date}
          </p>
          <p className={`text-[10px] font-bold ${hoveredPoint.data.pnl > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {hoveredPoint.data.pnl > 0 ? '+' : ''}${Math.round(hoveredPoint.data.pnl).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Donut Chart Component for Asset Types ───────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return null;
  
  let cumulativePercent = 0;
  const centerX = 100;
  const centerY = 100;
  const radius = 80;
  const innerRadius = 50;

  const createPath = (startAngle: number, endAngle: number) => {
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    
    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);
    const x3 = centerX + innerRadius * Math.cos(endAngleRad);
    const y3 = centerY + innerRadius * Math.sin(endAngleRad);
    const x4 = centerX + innerRadius * Math.cos(startAngleRad);
    const y4 = centerY + innerRadius * Math.sin(startAngleRad);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-48 h-48">
        <svg width="200" height="200" viewBox="0 0 200 200" className="w-full h-full">
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
            <span className="text-lg font-bold text-[var(--text-primary)]">100%</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-1.5 w-full">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[var(--text-primary)] flex-1">{item.label}</span>
            <span className="text-[var(--text-secondary)] font-mono">{((item.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bar Chart Component for Sectors (Vertical) ───────────────────────────────
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d.value));
  const chartHeight = 150;
  const barWidth = 30;
  const chartWidth = 300;
  const barSpacing = 10;

  return (
    <div className="w-full">
      <svg width={chartWidth} height={chartHeight + 40} className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}>
        {data.map((item, i) => {
          const barHeight = (item.value / maxValue) * chartHeight;
          const x = 20 + i * (barWidth + barSpacing);
          const y = chartHeight - barHeight;
          const percentage = ((item.value / total) * 100).toFixed(1);
          
          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color}
                className="hover:opacity-80 cursor-pointer transition-opacity"
              />
              
              {/* Percentage label */}
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                className="text-[10px] fill-[var(--text-secondary)] font-mono"
              >
                {percentage}%
              </text>
              
              {/* Label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 15}
                textAnchor="middle"
                className="text-[9px] fill-[var(--text-primary)]"
              >
                {item.label.length > 8 ? item.label.substring(0, 8) + '.' : item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Performance Card Component ────────────────────────────────────
function PerformanceCard({ portfolioValue, cash, positions }: { portfolioValue: number; cash: number; positions: any[] }) {
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'>('3M');
  const [chartType, setChartType] = useState<'value' | 'pnl'>('value');

  const portfolioData = {
    equity: portfolioValue - cash, // Equity is positions value only
    cash,
    portfolioValue, // Total portfolio value including cash
    positions: positions.map(p => ({
      symbol: p.symbol,
      marketValue: p.marketValue,
      qty: p.qty,
      avgEntryPrice: p.avgEntryPrice,
    })),
  };

  const days = timeframe === '1M' ? 30 : timeframe === '3M' ? 90 : timeframe === '6M' ? 180 : timeframe === '1Y' ? 365 : 730;
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
              className={`px-2 py-1 text-[9px] font-bold rounded transition ${
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

      <PerformanceChart data={performanceData} metric={chartType} timeframe={timeframe} />
      
      <div className="mt-4 flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>{performanceData[0]?.date}</span>
        <span>{performanceData[performanceData.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ── Allocation Card Component ─────────────────────────────────────
function AllocationCard({ portfolioValue, cash, positions }: { portfolioValue: number; cash: number; positions: any[] }) {
  const [allocationTab, setAllocationTab] = useState<'assetType' | 'sector'>('assetType');

  const portfolioData = {
    equity: portfolioValue - cash, // Equity is positions value only
    cash,
    portfolioValue, // Total portfolio value including cash
    positions: positions.map(p => ({
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
              className={`px-2 py-1 text-[9px] font-bold rounded ${
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