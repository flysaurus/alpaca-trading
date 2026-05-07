'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Shield,
  Play,
  Pause,
  History,
  BarChart3,
  Zap,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { AISuggestion, AdvisorConfig } from '@/lib/ai-advisor';

// ── Client-side storage helpers (no server code here) ──────────
const SUGGESTIONS_KEY = 'alpaca-trading-ai-suggestions';

async function storeSuggestionsClient(suggestions: AISuggestion[]): Promise<void> {
  try {
    const stored = JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || '[]');
    const updated = [...suggestions, ...stored].slice(0, 100);
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[AI Advisor] Failed to store suggestions:', error);
  }
}

async function getSuggestionsClient(): Promise<AISuggestion[]> {
  try {
    const stored = localStorage.getItem(SUGGESTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[AI Advisor] Failed to get suggestions:', error);
    return [];
  }
}

async function updateSuggestionOutcomeClient(symbol: string, outcome: 'profitable' | 'unprofitable' | 'neutral'): Promise<void> {
  try {
    const suggestions = await getSuggestionsClient();
    const suggestion = suggestions.find(s => s.symbol === symbol);
    if (suggestion) {
      (suggestion as any).outcome = outcome;
      (suggestion as any).outcome_updated_at = new Date().toISOString();
      await storeSuggestionsClient(suggestions);
    }
  } catch (error) {
    console.error('[AI Advisor] Failed to update suggestion outcome:', error);
  }
}

async function fetchSuggestionsFromAPI(
  watchlist: string[],
  config: Partial<AdvisorConfig> = {}
): Promise<AISuggestion[]> {
  const res = await fetch('/api/advisor/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlist, config }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const { suggestions } = await res.json();
  return suggestions;
}

// ── Components ─────────────────────────────────────────────────────
function SuggestionCard({ 
  suggestion, 
  onExecute, 
  onUpdateOutcome 
}: {
  suggestion: AISuggestion;
  onExecute: (suggestion: AISuggestion) => void;
  onUpdateOutcome: (symbol: string, outcome: 'profitable' | 'unprofitable' | 'neutral') => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'sell': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'hold': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'watch': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default: return 'text-[var(--text-muted)]';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'buy': return <TrendingUp className="w-4 h-4" />;
      case 'sell': return <TrendingDown className="w-4 h-4" />;
      case 'hold': return <Activity className="w-4 h-4" />;
      case 'watch': return <Eye className="w-4 h-4" />;
      default: return null;
    }
  };

  const handleExecute = () => {
    if (confirmText === 'CONFIRM') {
      onExecute(suggestion);
      setShowConfirmModal(false);
      setConfirmText('');
    }
  };

  return (
    <div className={`p-4 rounded-xl border ${getActionColor(suggestion.action)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getActionIcon(suggestion.action)}
          <span className="text-lg font-bold">{suggestion.symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{suggestion.confidence}% confidence</span>
          {suggestion.action === 'buy' && <TrendingUp className="w-4 h-4 text-green-500" />}
          {suggestion.action === 'sell' && <TrendingDown className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-3">{suggestion.reasoning}</p>

      <div className="flex items-center gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          <span>{suggestion.suggested_position_size_pct}% position</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{suggestion.time_horizon} term</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>SL: {suggestion.stop_loss_pct}%</span>
        <span>TP: {suggestion.take_profit_pct}%</span>
      </div>

      {suggestion.risk_factors.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Risk Factors</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestion.risk_factors.map((factor, i) => (
              <span key={i} className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 text-[10px] rounded">
                {factor}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex-1 px-3 py-1.5 text-xs bg-[var(--app-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
        >
          {showDetails ? <EyeOff className="w-3 h-3 inline mr-1" /> : <Eye className="w-3 h-3 inline mr-1" />}
          {showDetails ? 'Hide' : 'Show'} Details
        </button>
        <button
          onClick={() => setShowConfirmModal(true)}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            suggestion.action === 'buy' 
              ? 'bg-green-500 text-white hover:bg-green-600' 
              : suggestion.action === 'sell'
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-[var(--app-bg)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)]'
          }`}
          disabled={suggestion.action === 'hold' || suggestion.action === 'watch'}
        >
          {suggestion.action === 'hold' || suggestion.action === 'watch' ? 'No Action' : 'Execute'}
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[var(--text-muted)]">Current Price:</span>
              <span className="ml-2 text-[var(--text-primary)]">${suggestion.signals.price_action.current_price.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">30d Change:</span>
              <span className={`ml-2 ${suggestion.signals.price_action.price_change_30d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {suggestion.signals.price_action.price_change_30d.toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">RSI:</span>
              <span className="ml-2 text-[var(--text-primary)]">{suggestion.signals.price_action.rsi.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">MACD Trend:</span>
              <span className="ml-2 text-[var(--text-primary)]">{suggestion.signals.price_action.macd.trend}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">News Sentiment:</span>
              <span className="ml-2 text-[var(--text-primary)]">{suggestion.signals.news_sentiment.sentiment_score_7d.toFixed(3)}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Sector Exposure:</span>
              <span className="ml-2 text-[var(--text-primary)]">{suggestion.signals.portfolio_exposure.sector_exposure_pct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Confirm Trade Execution</h3>
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="p-3 bg-[var(--app-bg)] rounded-lg">
                <p className="text-sm text-[var(--text-primary)]">
                  <strong>{suggestion.action.toUpperCase()}</strong> {suggestion.symbol}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Position size: {suggestion.suggested_position_size_pct}% of portfolio
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Stop loss: {suggestion.stop_loss_pct}% | Take profit: {suggestion.take_profit_pct}%
                </p>
              </div>
              
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-400">
                  <strong>Safety Check:</strong> This action will place a real order in your account.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Type "CONFIRM" to proceed:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
                placeholder="CONFIRM"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmText('');
                }}
                className="flex-1 px-4 py-2 text-sm bg-[var(--app-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={confirmText !== 'CONFIRM'}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  confirmText === 'CONFIRM'
                    ? 'bg-amber-500 text-black hover:bg-amber-600'
                    : 'bg-[var(--app-bg)] text-[var(--text-muted)] cursor-not-allowed'
                }`}
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function AIAdvisorPage() {
  const [watchlist, setWatchlist] = useState<string[]>(['AAPL', 'MSFT', 'NVDA']);
  const [newSymbol, setNewSymbol] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load from localStorage
  useEffect(() => {
    getSuggestionsClient().then(setSuggestions);
  }, []);

  const handleAddSymbol = () => {
    if (newSymbol && !watchlist.includes(newSymbol.toUpperCase())) {
      setWatchlist([...watchlist, newSymbol.toUpperCase()]);
      setNewSymbol('');
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const handleGenerateSuggestions = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const newSuggestions = await fetchSuggestionsFromAPI(watchlist);
      setSuggestions(newSuggestions);
      await storeSuggestionsClient(newSuggestions);
    } catch (err: any) {
      console.error('[AI Advisor] Failed to generate:', err);
      setError(err.message || 'Failed to generate suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteSuggestion = async (suggestion: AISuggestion) => {
    try {
      // Place order via API
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: suggestion.symbol,
          side: suggestion.action,
          qty: Math.floor(suggestion.suggested_position_size_pct * 10), // Simplified sizing
          type: 'market',
          time_in_force: 'day',
        }),
      });

      if (res.ok) {
        alert(`Order placed: ${suggestion.action.toUpperCase()} ${suggestion.symbol}`);
      } else {
        const data = await res.json();
        alert(`Order failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Order failed: ${err.message}`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Trading Advisor</h1>
            <p className="text-sm text-[var(--text-muted)]">Multi-signal trading suggestions</p>
          </div>
        </div>
        <button
          onClick={handleGenerateSuggestions}
          disabled={isGenerating || watchlist.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Generate Suggestions
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Watchlist */}
      <div className="bg-[var(--card-bg)] rounded-xl p-4 border border-[var(--border)]">
        <h3 className="text-lg font-semibold mb-3">Watchlist</h3>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
            placeholder="Add symbol (e.g., AAPL)"
            className="flex-1 px-3 py-2 bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
          />
          <button
            onClick={handleAddSymbol}
            className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {watchlist.map(symbol => (
            <span key={symbol} className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--app-bg)] rounded-lg text-sm">
              {symbol}
              <button onClick={() => handleRemoveSymbol(symbol)} className="text-[var(--text-muted)] hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            <h3 className="text-lg font-semibold">AI Suggestions</h3>
            <span className="text-sm text-[var(--text-muted)]">({suggestions.length} found)</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={`${suggestion.symbol}-${suggestion.generated_at}`}
                suggestion={suggestion}
                onExecute={handleExecuteSuggestion}
                onUpdateOutcome={updateSuggestionOutcomeClient}
              />
            ))}
          </div>
        </div>
      )}

      {suggestions.length === 0 && !isGenerating && !error && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Click "Generate Suggestions" to get AI-powered trading insights</p>
        </div>
      )}
    </div>
  );
}
