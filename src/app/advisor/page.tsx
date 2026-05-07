'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Shield,
  Zap,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import SymbolSearch from '@/components/SymbolSearch';
import type { AISuggestion, AdvisorConfig } from '@/lib/ai-advisor';

const DEFAULT_CONFIG: AdvisorConfig = {
  confidence_threshold: 70,
  max_position_size_pct: 10,
  allowed_actions: ['buy', 'sell', 'hold', 'watch'],
  risk_tolerance: 'moderate',
};

/*───────────────────────────────────────────────────────────
  AI Advisor Page — Launch card + Suggestions engine
───────────────────────────────────────────────────────────*/

export default function AIAdvisorPage() {
  const [symbol, setSymbol] = useState('');
  const [activeSymbols, setActiveSymbols] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*── Add a symbol to the active list─────────────────────*/
  const handleSymbolSelect = (sym: string) => {
    const upper = sym.toUpperCase().trim();
    if (upper && !activeSymbols.includes(upper)) {
      setActiveSymbols(prev => [...prev, upper]);
    }
    setSymbol('');
  };

  const removeSymbol = (sym: string) => {
    setActiveSymbols(prev => prev.filter(s => s !== sym));
  };

  /*── Call API to generate suggestions───────────────────*/
  const handleGenerate = async () => {
    if (activeSymbols.length === 0) {
      setError('Add at least one symbol first');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/advisor/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlist: activeSymbols,
          config: DEFAULT_CONFIG,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const { suggestions: s } = await res.json();
      setSuggestions(s);
    } catch (err: any) {
      setError(err.message || 'Failed to generate suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/?tab=strategies"
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to AI & Strategies
        </a>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Brain className="w-8 h-8 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Trading Advisor</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Multi-signal analysis — price action, sentiment, insider activity & macro
          </p>
        </div>
      </div>

      {/* Symbol Search Section */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 mb-4">
        <label className="text-xs font-semibold text-[var(--text-secondary)] mb-2 block">
          Search Symbol
        </label>
        <SymbolSearch
          value={symbol}
          onChange={setSymbol}
          onSelect={handleSymbolSelect}
          placeholder="e.g. AAPL"
          className="w-full"
        />
      </div>

      {/* Active Symbols Pills */}
      {activeSymbols.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeSymbols.map(sym => (
            <span
              key={sym}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-sm text-violet-300"
            >
              {sym}
              <button
                onClick={() => removeSymbol(sym)}
                className="text-violet-400 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Generate Button — centered, beneath the pills */}
      <div className="flex justify-center my-6">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || activeSymbols.length === 0}
          className="flex items-center gap-2.5 px-8 py-3.5 bg-violet-500 text-white text-base font-semibold rounded-xl hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20 transition-all active:scale-95"
        >
          {isGenerating ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Generate Insights
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              AI Suggestions ({suggestions.length})
            </h2>
            <button
              onClick={() => setSuggestions([])}
              className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>

          {suggestions.map(sug => (
            <SuggestionCard key={`${sug.symbol}-${sug.generated_at}`} suggestion={sug} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isGenerating && suggestions.length === 0 && !error && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <Brain className="w-14 h-14 mx-auto mb-4 opacity-40" />
          <p className="text-sm">Search symbols above, then click Generate Insights</p>
        </div>
      )}
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Suggestion Card
───────────────────────────────────────────────────────────*/
function SuggestionCard({ suggestion }: { suggestion: AISuggestion }) {
  const [expanded, setExpanded] = useState(false);

  const actionColor = {
    buy: 'text-green-500 bg-green-500/10 border-green-500/20',
    sell: 'text-red-500 bg-red-500/10 border-red-500/20',
    hold: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    watch: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  }[suggestion.action];

  return (
    <div className={`rounded-xl border ${actionColor} p-4 transition-all`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">{suggestion.symbol}</span>
          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${actionColor}`}>
            {suggestion.action}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {suggestion.confidence}% confidence
        </span>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mt-2">{suggestion.reasoning}</p>

      <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] mt-2">
        <span>Target {suggestion.suggested_position_size_pct}%</span>
        <span>SL: {suggestion.stop_loss_pct}%</span>
        <span>TP: {suggestion.take_profit_pct}%</span>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mt-3 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-3 pt-3 border-t border-current/10">
          <div>
            <span className="text-[var(--text-muted)]">Price:</span>{' '}
            <span className="text-[var(--text-primary)]">
              ${suggestion.signals.price_action.current_price.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">30d:</span>{' '}
            <span className={suggestion.signals.price_action.price_change_30d >= 0 ? 'text-green-400' : 'text-red-400'}>
              {suggestion.signals.price_action.price_change_30d >= 0 ? '+' : ''}
              {suggestion.signals.price_action.price_change_30d.toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">RSI:</span>{' '}
            <span className="text-[var(--text-primary)]">
              {suggestion.signals.price_action.rsi.toFixed(1)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">MACD:</span>{' '}
            <span className="text-[var(--text-primary)] capitalize">
              {suggestion.signals.price_action.macd.trend}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Sentiment:</span>{' '}
            <span className="text-[var(--text-primary)]">
              {suggestion.signals.news_sentiment.sentiment_score_7d.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Sector:</span>{' '}
            <span className="text-[var(--text-primary)] capitalize">
              {suggestion.signals.macro_context.sector}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
