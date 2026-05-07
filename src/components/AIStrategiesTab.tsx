'use client';

import { useState } from 'react';
import {
  Brain,
  TrendingUp,
  Zap,
  ArrowLeft,
} from 'lucide-react';

// ── Strategy Quick Stats ──────────────────────────────────────────
function StrategyStats() {
  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--app-bg)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)]">Active Strategies</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">4</p>
        </div>
        <div className="bg-[var(--app-bg)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)]">Trades Today</p>
          <p className="text-lg font-bold text-[var(--green)]">12</p>
        </div>
        <div className="bg-[var(--app-bg)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)]">Success Rate</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">68%</p>
        </div>
        <div className="bg-[var(--app-bg)] rounded-lg p-3">
          <p className="text-xs text-[var(--text-muted)]">PnL Today</p>
          <p className="text-lg font-bold text-[var(--green)]">+$1,240</p>
        </div>
      </div>
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
      <div className="space-y-2">
        {newsItems.map((item, i) => (
          <div key={i} className="flex items-start gap-2 p-2 bg-[var(--app-bg)] rounded-lg">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              item.sentiment === 'bullish' ? 'bg-green-500' :
              item.sentiment === 'bearish' ? 'bg-red-500' :
              'bg-yellow-500'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-primary)] truncate">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-[var(--text-muted)] capitalize">{item.sentiment}</span>
                {item.symbol && (
                  <span className="text-[9px] bg-[var(--surface-bg)] px-1.5 rounded font-mono">{item.symbol}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
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

      {/* Strategy Stats */}
      <StrategyStats />

      {/* AI Advisor Section */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-[var(--text-secondary)]">AI Trading Advisor</h3>
        </div>
        
        <div className="text-center py-8">
          <Brain className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-[var(--text-primary)] mb-2">AI Trading Advisor</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            Get AI-powered trading suggestions with multi-signal analysis
          </p>
          <a 
            href="/advisor" 
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-black rounded-lg hover:bg-amber-600 transition-colors"
          >
            <Brain className="w-4 h-4" />
            Launch AI Advisor
          </a>
        </div>
      </div>

      {/* News & AI Summary */}
      <NewsSentimentPanel />
    </div>
  );
}
