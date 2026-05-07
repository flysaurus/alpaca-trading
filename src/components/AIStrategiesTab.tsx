'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  Zap,
  DollarSign,
  Layers,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  History,
  ArrowUpRight,
  ArrowLeft,
  Info,
  ChevronRight,
} from 'lucide-react';

// ── Strategy Descriptions ───────────────────────────────────────
const STRATEGIES = [
  {
    id: 'dca',
    name: 'Dollar Cost Averaging',
    icon: DollarSign,
    description: 'Invest fixed amounts at regular intervals to smooth out volatility',
    algorithm: 'Time-based schedule → Market buy orders',
    status: 'Available',
  },
  {
    id: 'rebalance',
    name: 'Portfolio Rebalancing',
    icon: Layers,
    description: 'Maintain target allocations by buying/selling when drift exceeds threshold',
    algorithm: 'Drift detection → Buy/sell to restore target weights',
    status: 'Available',
  },
  {
    id: 'momentum',
    name: 'Momentum Strategy',
    icon: TrendingUp,
    description: 'Buy top performers, sell underperformers based on price momentum',
    algorithm: 'Returns ranking over lookback period → Long top / short bottom',
    status: 'Available',
  },
  {
    id: 'meanreversion',
    name: 'Mean Reversion',
    icon: TrendingDown,
    description: 'Buy oversold, sell overbought when price deviates from mean',
    algorithm: 'Z-score + Bollinger Bands → Contrarian signals',
    status: 'Available',
  },
];

// ── Strategy Stats with real descriptions ───────────────────────
function StrategyStats() {
  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--app-bg)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)]">Active Strategies</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{STRATEGIES.filter(s => s.status === 'Active').length}</p>
          <p className="text-[9px] text-[var(--text-muted)]">of {STRATEGIES.length} configured</p>
        </div>
        <div className="bg-[var(--app-bg)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)]">Trades Today</p>
          <p className="text-lg font-bold text-[var(--green)]">—</p>
          <p className="text-[9px] text-[var(--text-muted)]">will show when strategies run</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
        {STRATEGIES.map(s => {
          const Icon = s.icon;
          return (
            <a
              key={s.id}
              href="/strategies"
              className="flex items-center justify-between p-2 bg-[var(--app-bg)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-amber-400 transition-colors" />
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">{s.name}</p>
                  <p className="text-[9px] text-[var(--text-muted)] truncate max-w-[200px]">{s.description}</p>
                </div>
              </div>
              <span className="text-[9px] text-[var(--text-muted)]">{s.status}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── News & AI Sentiment Panel with clickable links ──────────────
function NewsSentimentPanel() {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  const newsItems = [
    {
      title: 'Tech stocks rally on AI breakthrough',
      sentiment: 'bullish',
      symbol: 'NVDA',
      url: 'https://www.cnbc.com/technology/',
      summary: 'Major tech companies surge after new AI model announcements. Chipmakers and cloud providers lead gains.',
    },
    {
      title: 'Fed signals potential rate cut in next meeting',
      sentiment: 'neutral',
      symbol: '',
      url: 'https://www.cnbc.com/economy/',
      summary: 'Federal Reserve minutes suggest dovish shift in monetary policy. Markets pricing in 25bp cut.',
    },
    {
      title: 'Consumer spending softens in Q2 retail data',
      sentiment: 'bearish',
      symbol: 'WMT',
      url: 'https://www.cnbc.com/retail/',
      summary: 'Retail sales below expectations. Discount retailers outperform as consumers trade down.',
    },
  ];

  if (expandedItem !== null) {
    const item = newsItems[expandedItem];
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
        <button
          onClick={() => setExpandedItem(null)}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to news list
        </button>

        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${
          item.sentiment === 'bullish' ? 'bg-green-500/10 text-green-400' :
          item.sentiment === 'bearish' ? 'bg-red-500/10 text-red-400' :
          'bg-yellow-500/10 text-yellow-400'
        }`}>
          <Activity className="w-3 h-3" />
          {item.sentiment.toUpperCase()}
        </div>

        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{item.title}</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-4">{item.summary}</p>

        {item.symbol && (
          <p className="text-[10px] text-[var(--text-muted)] mb-3">
            Related: <span className="font-mono text-[var(--text-primary)]">{item.symbol}</span>
          </p>
        )}

        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[var(--app-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
        >
          Read full article <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-400" />
        <h3 className="text-xs font-bold text-[var(--text-secondary)]">AI News Summary</h3>
      </div>
      <div className="space-y-2">
        {newsItems.map((item, i) => (
          <button
            key={i}
            onClick={() => setExpandedItem(i)}
            className="w-full flex items-start gap-2 p-2 bg-[var(--app-bg)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors text-left"
          >
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              item.sentiment === 'bullish' ? 'bg-green-500' :
              item.sentiment === 'bearish' ? 'bg-red-500' :
              'bg-yellow-500'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-primary)]">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-[var(--text-muted)] capitalize">{item.sentiment}</span>
                {item.symbol && (
                  <span className="text-[9px] bg-[var(--surface-bg)] px-1.5 rounded font-mono">{item.symbol}</span>
                )}
                <ChevronRight className="w-3 h-3 text-[var(--text-muted)] ml-auto" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Compact AI Advisor Card ─────────────────────────────────────
function AIAdvisorCard() {
  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-500/10 rounded-lg flex-shrink-0">
          <Brain className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">AI Trading Advisor</h3>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
            Multi-signal analysis engine that combines price action (RSI, MACD), news sentiment, 
            insider activity, and macro events to generate ranked trading suggestions.
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="px-1.5 py-0.5 bg-[var(--app-bg)] text-[9px] text-[var(--text-muted)] rounded">RSI</span>
            <span className="px-1.5 py-0.5 bg-[var(--app-bg)] text-[9px] text-[var(--text-muted)] rounded">MACD</span>
            <span className="px-1.5 py-0.5 bg-[var(--app-bg)] text-[9px] text-[var(--text-muted)] rounded">Sentiment</span>
            <span className="px-1.5 py-0.5 bg-[var(--app-bg)] text-[9px] text-[var(--text-muted)] rounded">Insider Flow</span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-muted)] mb-2">
          <Info className="w-3 h-3 inline mr-1" />
          Enter symbols, set your risk profile, and get buy/sell/hold/watch recommendations with confidence scores and position sizing.
        </p>
        <a
          href="/advisor"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-600 transition-colors"
        >
          <Brain className="w-3.5 h-3.5" />
          Launch AI Advisor
        </a>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────
export default function AIStrategiesTab({ positions }: { positions: any[] }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Brain className="w-6 h-6 text-amber-400" />
          AI & Strategies
        </h2>
      </div>

      {/* AI Advisor — compact */}
      <AIAdvisorCard />

      {/* Strategy Stats with descriptions */}
      <StrategyStats />

      {/* News — clickable */}
      <NewsSentimentPanel />
    </div>
  );
}
