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
import { 
  generateSuggestions, 
  storeSuggestions, 
  getSuggestions, 
  updateSuggestionOutcome,
  type AISuggestion,
  type AdvisorConfig 
} from '@/lib/ai-advisor';

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
      case 'watch': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-500';
    if (confidence >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const handleExecute = () => {
    if (confirmText === 'CONFIRM') {
      onExecute(suggestion);
      setShowConfirmModal(false);
      setConfirmText('');
    }
  };

  return (
    <>
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 hover:border-amber-500/20 transition-all">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`px-2 py-1 rounded-lg text-xs font-bold border ${getActionColor(suggestion.action)}`}>
              {suggestion.action.toUpperCase()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{suggestion.symbol}</h3>
              <p className="text-xs text-[var(--text-muted)]">{suggestion.generated_at.split('T')[0]}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-xs font-bold ${getConfidenceColor(suggestion.confidence)}`}>
              {suggestion.confidence}% confidence
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">{suggestion.time_horizon} term</p>
          </div>
        </div>

        <p className="text-xs text-[var(--text-primary)] mb-3">{suggestion.reasoning}</p>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-3 h-3 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">
              {suggestion.suggested_position_size_pct}% position
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>SL: {suggestion.stop_loss_pct}%</span>
            <span>TP: {suggestion.take_profit_pct}%</span>
          </div>
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
                <span className="text-[var(--text-muted)]">RSI:</span>
                <span className="ml-2 text-[var(--text-primary)]">{suggestion.signals.price_action.rsi.toFixed(1)}</span>
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
      </div>

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
                Execute Trade
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SuggestionHistory({ suggestions, onUpdateOutcome }: {
  suggestions: AISuggestion[];
  onUpdateOutcome: (symbol: string, outcome: 'profitable' | 'unprofitable' | 'neutral') => void;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <History className="w-4 h-4 text-amber-400" />
          Suggestion History
        </h3>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {showHistory ? 'Hide' : 'Show'} ({suggestions.length})
        </button>
      </div>

      {showHistory && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {suggestions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No suggestions yet</p>
          ) : (
            suggestions.map((suggestion, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-[var(--app-bg)] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    suggestion.action === 'buy' ? 'bg-green-500' :
                    suggestion.action === 'sell' ? 'bg-red-500' :
                    suggestion.action === 'hold' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      {suggestion.action.toUpperCase()} {suggestion.symbol}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {suggestion.generated_at.split('T')[0]} • {suggestion.confidence}% confidence
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateOutcome(suggestion.symbol, 'profitable')}
                    className="px-2 py-1 text-[10px] bg-green-500/10 text-green-500 rounded hover:bg-green-500/20"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => onUpdateOutcome(suggestion.symbol, 'unprofitable')}
                    className="px-2 py-1 text-[10px] bg-red-500/10 text-red-500 rounded hover:bg-red-500/20"
                  >
                    ✗
                  </button>
                  <button
                    onClick={() => onUpdateOutcome(suggestion.symbol, 'neutral')}
                    className="px-2 py-1 text-[10px] bg-gray-500/10 text-gray-500 rounded hover:bg-gray-500/20"
                  >
                    ~
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Advisor Page ─────────────────────────────────────────────
export default function AIAdvisorPage() {
  const [watchlist, setWatchlist] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'TSLA']);
  const [newSymbol, setNewSymbol] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [historicalSuggestions, setHistoricalSuggestions] = useState<AISuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingSymbols, setAnalyzingSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadHistoricalSuggestions();
  }, []);

  const loadHistoricalSuggestions = async () => {
    try {
      const history = await getSuggestions();
      setHistoricalSuggestions(history);
    } catch (error) {
      console.error('Failed to load historical suggestions:', error);
    }
  };

  const addToWatchlist = () => {
    if (newSymbol && !watchlist.includes(newSymbol.toUpperCase())) {
      setWatchlist([...watchlist, newSymbol.toUpperCase()]);
      setNewSymbol('');
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const analyzeWatchlist = async () => {
    setIsAnalyzing(true);
    setAnalyzingSymbols(new Set(watchlist));
    
    try {
      const newSuggestions = await generateSuggestions(watchlist);
      setSuggestions(newSuggestions);
      
      // Store suggestions
      await storeSuggestions(newSuggestions);
      await loadHistoricalSuggestions();
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
      setAnalyzingSymbols(new Set());
    }
  };

  const executeSuggestion = async (suggestion: AISuggestion) => {
    try {
      // Mock execution - would integrate with actual order placement
      console.log('Executing suggestion:', suggestion);
      
      // For now, just mark as executed
      const updatedSuggestions = suggestions.map(s => 
        s.symbol === suggestion.symbol 
          ? { ...s, executed_at: new Date().toISOString() }
          : s
      );
      setSuggestions(updatedSuggestions);
    } catch (error) {
      console.error('Execution failed:', error);
    }
  };

  const updateOutcome = async (symbol: string, outcome: 'profitable' | 'unprofitable' | 'neutral') => {
    try {
      await updateSuggestionOutcome(symbol, outcome);
      await loadHistoricalSuggestions();
    } catch (error) {
      console.error('Failed to update outcome:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <Brain className="w-6 h-6 text-amber-400" />
            AI Trading Advisor
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            AI-powered trading suggestions based on technical analysis, news sentiment, insider activity, and macro context
          </p>
        </div>

        {/* Watchlist Management */}
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Watchlist</h3>
            <button
              onClick={analyzeWatchlist}
              disabled={isAnalyzing || watchlist.length === 0}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                isAnalyzing || watchlist.length === 0
                  ? 'bg-[var(--app-bg)] text-[var(--text-muted)] cursor-not-allowed'
                  : 'bg-amber-500 text-black hover:bg-amber-600'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Analyze
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {watchlist.map(symbol => (
              <div key={symbol} className="flex items-center gap-1 px-3 py-1 bg-[var(--app-bg)] rounded-lg">
                <span className="text-sm text-[var(--text-primary)]">{symbol}</span>
                {analyzingSymbols.has(symbol) && (
                  <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                )}
                <button
                  onClick={() => removeFromWatchlist(symbol)}
                  className="text-[var(--text-muted)] hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && addToWatchlist()}
              placeholder="Add symbol (e.g., AAPL)"
              className="flex-1 px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
            />
            <button
              onClick={addToWatchlist}
              className="px-3 py-2 text-sm bg-[var(--hover-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--border)] transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Current Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Current Suggestions
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suggestions.map((suggestion, i) => (
                <SuggestionCard
                  key={i}
                  suggestion={suggestion}
                  onExecute={executeSuggestion}
                  onUpdateOutcome={updateOutcome}
                />
              ))}
            </div>
          </div>
        )}

        {/* Historical Suggestions */}
        <SuggestionHistory 
          suggestions={historicalSuggestions} 
          onUpdateOutcome={updateOutcome} 
        />
      </div>
    </div>
  );
}