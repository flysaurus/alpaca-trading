'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  TrendingUp,
  TrendingDown,
  PieChart,
  LayoutDashboard,
  History,
  Play,
  Clock,
  AlertCircle,
  Zap,
  DollarSign,
  Layers,
  BarChart2,
  Brain,
} from 'lucide-react';

// ── Performance Data Interface ────────────────────────────────────
interface PerformanceData {
  date: string;
  value: number;
  pnl: number;
  cash: number;
}

// ── Mock Historical Performance (would fetch from API) ────────────
function fetchPerformanceData(): PerformanceData[] {
  // Generate mock data for demonstration
  const data: PerformanceData[] = [];
  let value = 50000;
  let cash = 10000;
  
  const today = new Date();
  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Random walk
    const change = (Math.random() - 0.48) * 500;
    value += change;
    cash += change * 0.2;
    
    data.push({
      date: date.toISOString().split('T')[0],
      value,
      pnl: change,
      cash,
    });
  }
  
  return data;
}

// ── Asset Allocation Data ─────────────────────────────────────────
interface Allocation {
  label: string;
  value: number;
  color: string;
}

function fetchAllocationData(): { assetType: Allocation[]; sector: Allocation[] } {
  // Asset Type allocation
  const assetType: Allocation[] = [
    { label: 'Stocks', value: 85, color: '#10b981' }, // emerald
    { label: 'ETFs', value: 10, color: '#f59e0b' },   // amber
    { label: 'Cash', value: 5, color: '#6b7280' },    // gray
  ];

  // Sector allocation
  const sector: Allocation[] = [
    { label: 'Tech', value: 40, color: '#3b82f6' },   // blue
    { label: 'Finance', value: 15, color: '#8b5cf6' }, // violet
    { label: 'Healthcare', value: 12, color: '#ec4899' }, // pink
    { label: 'Consumer', value: 10, color: '#14b8a6' }, // teal
    { label: 'Energy', value: 8, color: '#f97316' },  // orange
    { label: ' Industrials', value: 7, color: '#6366f1' }, // indigo
    { label: 'Others', value: 8, color: '#9ca3af' },   // gray
  ];

  return { assetType, sector };
}

// ── Donut Chart Component ─────────────────────────────────────────
function DonutChart({ data, title }: { data: Allocation[]; title: string }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
        <PieChart className="w-4 h-4" />
        {title}
      </h3>
      
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg viewBox="-1 -1 2 2" className="w-full h-full -rotate-90">
            {data.map((item, i) => {
              const startPercent = cumulativePercent;
              const endPercent = cumulativePercent + item.value / total;
              const [startX, startY] = getCoordinatesForPercent(startPercent);
              const [endX, endY] = getCoordinatesForPercent(endPercent);
              const largeArcFlag = item.value / total > 0.5 ? 1 : 0;
              
              cumulativePercent += item.value / total;
              
              return (
                <path
                  key={i}
                  d={`M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`}
                  stroke={item.color}
                  strokeWidth={0.25}
                  fill="none"
                  className="transition-all hover:opacity-80"
                />
              );
            })}
            <circle cx="0" cy="0" r="0.75" className="fill-[var(--app-bg)]" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-[var(--text-primary)]">{total}%</span>
          </div>
        </div>
        
        <div className="space-y-1">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[var(--text-primary)] font-medium">{item.label}</span>
              <span className="text-[var(--text-muted)] ml-auto">{((item.value / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Performance Chart Component ───────────────────────────────────
function PerformanceChart({ data, metric }: { data: PerformanceData[]; metric: 'value' | 'pnl' | 'cash' }) {
  if (data.length === 0) return null;

  const values = data.map(d => d[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((d[metric] - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const isProfitable = values[values.length - 1] > values[0];

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2">
          {metric === 'value' && <Activity className="w-4 h-4" />}
          {metric === 'pnl' && <TrendingUp className="w-4 h-4" />}
          {metric === 'cash' && <DollarSign className="w-4 h-4" />}
          {metric === 'value' ? 'Portfolio Value' : metric === 'pnl' ? 'Daily P&L' : 'Cash Balance'}
        </h3>
        <span className={`text-xs font-bold ${metric === 'pnl' ? (isProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]') : 'text-[var(--text-primary)]'}`}>
          {metric === 'value' || metric === 'cash' 
            ? `$${values[values.length - 1].toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` 
            : `${values[values.length - 1] > 0 ? '+' : ''}$${values[values.length - 1].toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        </span>
      </div>
      
      <div className="h-32 relative">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={metric === 'pnl' ? (isProfitable ? '#10b981' : '#ef4444') : '#10b981'} stopOpacity="0.3" />
              <stop offset="100%" stopColor={metric === 'pnl' ? (isProfitable ? '#10b981' : '#ef4444') : '#10b981'} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline
            points={points}
            fill="none"
            stroke={metric === 'pnl' ? (isProfitable ? '#10b981' : '#ef4444') : '#10b981'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points={`0,100 ${points} 100,100`}
            fill="url(#grad)"
            className="transition-all"
          />
        </svg>
      </div>
      
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}

// ── Strategy Quick Stats ──────────────────────────────────────────
function StrategyStats() {
  const [activeTab, setActiveTab] = useState<'dca' | 'rebalance' | 'momentum' | 'meanreversion'>('dca');

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex gap-2 mb-3">
        {[
          { id: 'dca', label: 'DCA', icon: DollarSign },
          { id: 'rebalance', label: 'Rebalance', icon: Layers },
          { id: 'momentum', label: 'Momentum', icon: TrendingUp },
          { id: 'meanreversion', label: 'Mean Rev', icon: TrendingDown },
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                isActive
                  ? 'bg-amber-500 text-black'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'dca' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Active</span>
            <span className="text-[var(--green)] font-bold">Yes</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Symbol</span>
            <span className="font-bold font-[family-name:var(--font-mono)]">SPY</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Amount</span>
            <span className="font-bold font-[family-name:var(--font-mono)]">$500/mo</span>
          </div>
        </div>
      )}

      {activeTab === 'rebalance' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Active</span>
            <span className="text-[var(--green)] font-bold">Yes</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Assets</span>
            <span className="font-bold">4</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Threshold</span>
            <span className="font-bold">5%</span>
          </div>
        </div>
      )}

      {activeTab === 'momentum' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Active</span>
            <span className="text-[var(--green)] font-bold">Yes</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Top N</span>
            <span className="font-bold">5</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Lookback</span>
            <span className="font-bold">90 days</span>
          </div>
        </div>
      )}

      {activeTab === 'meanreversion' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Active</span>
            <span className="text-[var(--green)] font-bold">Yes</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Symbol</span>
            <span className="font-bold font-[family-name:var(--font-mono)]">SPY</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Z-Score</span>
            <span className="font-bold">2.0</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── News & AI Sentiment Panel ─────────────────────────────────────
function NewsSentimentPanel() {
  const newsItems = [
    { title: 'Tech stocks rally on AI breakthrough', sentiment: 'bullish', symbol: 'NVDA' },
    { title: 'Fed signals potential rate cut', sentiment: 'neutral', symbol: '' },
    { title: 'Consumer spending softens', sentiment: 'bearish', symbol: 'WMT' },
  ];

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-400" />
        <h3 className="text-xs font-bold text-[var(--text-secondary)]">AI News Summary</h3>
      </div>
      
      <div className="space-y-3">
        {newsItems.map((item, i) => (
          <div key={i} className="text-xs">
            <p className="text-[var(--text-primary)] mb-1">{item.title}</p>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                item.sentiment === 'bullish' ? 'bg-[var(--green)]/20 text-[var(--green)]' :
                item.sentiment === 'bearish' ? 'bg-[var(--red)]/20 text-[var(--red)]' :
                'bg-[var(--text-muted)]/20 text-[var(--text-muted)]'
              }`}>
                {item.sentiment}
              </span>
              {item.symbol && <span className="font-bold font-[family-name:var(--font-mono)]">{item.symbol}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function AIStrategiesTab({ positions }: { positions: any[] }) {
  const [timeframe, setTimeframe] = useState<'1D' | '1M' | '3M' | 'YTD' | 'ALL'>('1M');
  const [showChart, setShowChart] = useState<'value' | 'pnl' | 'cash'>('value');
  const [allocationTab, setAllocationTab] = useState<'assetType' | 'sector'>('assetType');

  const performanceData = fetchPerformanceData();
  const allocationData = fetchAllocationData();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Brain className="w-6 h-6 text-amber-400" />
          AI & Strategies
        </h2>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-[var(--surface-bg)] hover:bg-[var(--hover-bg)] text-xs font-bold rounded-lg transition">
            Backtest
          </button>
          <button className="px-3 py-1.5 bg-[var(--surface-bg)] hover:bg-[var(--hover-bg)] text-xs font-bold rounded-lg transition">
            History
          </button>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Performance
          </h3>
          <div className="flex gap-1.5">
            {['1D', '1M', '3M', 'YTD', 'ALL'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf as any)}
                className={`px-2.5 py-1 text-[9px] font-bold rounded transition ${
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

        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { id: 'value', label: 'Portfolio Value', icon: Activity },
            { id: 'pnl', label: 'Daily P&L', icon: TrendingUp },
            { id: 'cash', label: 'Cash Balance', icon: DollarSign },
          ].map((m) => {
            const Icon = m.icon;
            const isActive = showChart === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setShowChart(m.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        <PerformanceChart data={performanceData} metric={showChart} />
      </div>

      {/* Allocation Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Asset Allocation
            </h3>
            <div className="flex gap-1">
              {(['assetType', 'sector'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAllocationTab(t)}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition ${
                    allocationTab === t
                      ? 'bg-amber-500 text-black'
                      : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
                  }`}
                >
                  {t === 'assetType' ? 'Asset Type' : 'Sector'}
                </button>
              ))}
            </div>
          </div>
          
          <DonutChart 
            data={allocationTab === 'assetType' ? allocationData.assetType : allocationData.sector} 
            title={allocationTab === 'assetType' ? 'By Asset Type' : 'By Sector'} 
          />
        </div>

        <StrategyStats />
      </div>

      {/* News & AI Summary */}
      <NewsSentimentPanel />
    </div>
  );
}
