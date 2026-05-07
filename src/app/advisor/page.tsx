'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Zap,
  ChevronUp,
  ChevronDown,
  ShoppingCart,
  X,
  History,
  Shield,
} from 'lucide-react';
import SymbolSearch from '@/components/SymbolSearch';
import type { AISuggestion } from '@/lib/ai-advisor';

const RISK_KEY = 'alpaca-trading-risk-threshold';
const HISTORY_KEY = 'alpaca-trading-ai-history';

/*───────────────────────────────────────────────────────────
  Types
───────────────────────────────────────────────────────────*/
interface HistoryEntry {
  id: string;
  date: string;
  symbol: string;
  suggestion: AISuggestion;
}

interface PositionInfo {
  symbol: string;
  qty: number;
  market_value: number;
  avg_entry_price: number;
}

interface AccountInfo {
  buying_power: number;
  portfolio_value: number;
}

/*───────────────────────────────────────────────────────────
  Helpers
───────────────────────────────────────────────────────────*/
function loadHistory(): HistoryEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entry: HistoryEntry) {
  try {
    if (typeof window === 'undefined') return;
    const all = [entry, ...loadHistory()].slice(0, 100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  } catch { /*ignore*/ }
}

function getStoredRisk(): 'conservative' | 'moderate' | 'aggressive' {
  try {
    if (typeof window === 'undefined') return 'moderate';
    const r = localStorage.getItem(RISK_KEY);
    if (r === 'conservative' || r === 'moderate' || r === 'aggressive') return r;
  } catch { /*ignore*/ }
  return 'moderate';
}

/*───────────────────────────────────────────────────────────
  Main Page
───────────────────────────────────────────────────────────*/
export default function AIAdvisorPage() {
  const [symbol, setSymbol] = useState('');
  const [activeSymbols, setActiveSymbols] = useState<string[]>([]);
  const [currentSuggestions, setCurrentSuggestions] = useState<AISuggestion[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [positions, setPositions] = useState<PositionInfo[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState<null | {
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
    price: string;
    status: 'idle' | 'confirm' | 'submitting' | 'done' | 'error';
    message?: string;
  }>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => { loadPositions(); loadAccount(); }, []);

  const loadPositions = async () => {
    try {
      const r = await fetch('/api/positions');
      if (r.ok) setPositions(await r.json());
    } catch { /*ignore*/ }
  };

  const loadAccount = async () => {
    try {
      const r = await fetch('/api/account');
      if (r.ok) setAccount(await r.json());
    } catch { /*ignore*/ }
  };

  const handleSymbolSelect = (sym: string) => {
    const up = sym.toUpperCase().trim();
    if (up && !activeSymbols.includes(up)) setActiveSymbols(p => [...p, up]);
    setSymbol('');
  };

  const removeSymbol = (sym: string) => setActiveSymbols(p => p.filter(s => s !== sym));

  const handleGenerate = async () => {
    if (activeSymbols.length === 0) { setError('Add at least one symbol'); return; }
    setIsGenerating(true); setError(null);
    try {
      const res = await fetch('/api/advisor/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist: activeSymbols, config: { risk_tolerance: getStoredRisk() } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { suggestions: s } = await res.json();
      setCurrentSuggestions(s);
      // Save to history
      const now = new Date().toISOString();
      s.forEach((sg: AISuggestion) => saveHistory({ id: `${sg.symbol}-${Date.now()}`, date: now, symbol: sg.symbol, suggestion: sg }));
      setHistory(loadHistory());
    } catch (err: any) { setError(err.message || 'Failed'); }
    finally { setIsGenerating(false); }
  };

  const placeOrder = async () => {
    if (!orderForm || orderForm.status !== 'confirm') return;
    setOrderForm({ ...orderForm, status: 'submitting' });
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderForm.symbol,
          side: orderForm.side,
          qty: orderForm.qty,
          type: orderForm.price === 'market' ? 'market' : 'limit',
          time_in_force: 'day',
          ...(orderForm.price !== 'market' ? { limit_price: Number(orderForm.price) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderForm({ ...orderForm, status: 'done', message: `${orderForm.side.toUpperCase()} ${orderForm.qty} ${orderForm.symbol} — order placed!` });
        loadPositions(); loadAccount();
      } else {
        setOrderForm({ ...orderForm, status: 'error', message: data.error || 'Order failed' });
      }
    } catch (e: any) {
      setOrderForm({ ...orderForm, status: 'error', message: e.message });
    }
  };

  // Aggregate history by symbol for dedup display
  const priorBySymbol: Record<string, HistoryEntry> = {};
  history.forEach(h => { if (!priorBySymbol[h.symbol]) priorBySymbol[h.symbol] = h; });

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Brain className="w-8 h-8 text-violet-400" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Trading Advisor</h1>
          <p className="text-sm text-[var(--text-muted)]">Multi-signal analysis with risk-aware order sizing</p>
        </div>
      </div>

      {/* Risk badge */}
      <div className="mb-4">
        <RiskBadge />
      </div>

      {/* Symbol Search */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 mb-4">
        <label className="text-xs font-semibold text-[var(--text-secondary)] mb-2 block">Search Symbol</label>
        <SymbolSearch value={symbol} onChange={setSymbol} onSelect={handleSymbolSelect} placeholder="e.g. AAPL" className="w-full" />
      </div>

      {/* Active Symbols */}
      {activeSymbols.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeSymbols.map(sym => (
            <span key={sym} className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg text-sm text-violet-300">
              {sym}
              <button onClick={() => removeSymbol(sym)} className="text-violet-400 hover:text-red-400">✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Generate Button */}
      <div className="flex justify-center my-6">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || activeSymbols.length === 0}
          className="flex items-center gap-2.5 px-8 py-3.5 bg-violet-500 text-white text-base font-semibold rounded-xl hover:bg-violet-600 disabled:opacity-40 shadow-lg shadow-violet-500/20 transition-all active:scale-95"
        >
          {isGenerating ? <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
            : <><Zap className="w-5 h-5" />Generate Insights</>}
        </button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4"><p className="text-red-400 text-sm">{error}</p></div>}

      {/* Prior analysis for same symbols */}
      {currentSuggestions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Current Analysis</h2>
          {currentSuggestions.map(sug => (
            <div key={`${sug.symbol}-${sug.generated_at}`}>
              {priorBySymbol[sug.symbol] && priorBySymbol[sug.symbol].date !== sug.generated_at && (
                <div className="mb-2">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Previous ({new Date(priorBySymbol[sug.symbol].date).toLocaleDateString()})</span>
                  <CompactSuggestion suggestion={priorBySymbol[sug.symbol].suggestion} />
                </div>
              )}
              <SuggestionDetail
                suggestion={sug}
                positions={positions}
                account={account}
                onOrderClick={(side, qty) => setOrderForm({
                  symbol: sug.symbol,
                  side,
                  qty,
                  price: 'market',
                  status: 'confirm',
                })}
              />
            </div>
          ))}
        </div>
      )}

      {/* Order Form Inline */}
      {orderForm && orderForm.status !== 'done' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{orderForm.status === 'confirm' ? 'Review Order' : orderForm.status === 'submitting' ? 'Placing…' : 'Error'}</h3>
              <button onClick={() => setOrderForm(null)}><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>

            {orderForm.status === 'confirm' && (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Symbol</span><span className="font-bold">{orderForm.symbol}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Side</span><span className={`font-bold ${orderForm.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{orderForm.side.toUpperCase()}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Qty</span><span className="font-bold">{orderForm.qty}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">Type</span><span className="font-bold">Market</span></div>
                </div>
                <button onClick={placeOrder} className="w-full py-2.5 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-600 transition-colors">
                  Confirm & Place Order
                </button>
              </>
            )}
            {orderForm.status === 'submitting' && (
              <div className="text-center py-4"><span className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin inline-block" /></div>
            )}
            {orderForm.status === 'error' && (
              <p className="text-red-400 text-sm text-center">{orderForm.message}</p>
            )}
          </div>
        </div>
      )}
      {orderForm?.status === 'done' && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-4 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <p className="text-green-400 text-sm">{orderForm.message}</p>
        </div>
      )}

      {/* Empty / idle state */}
      {!isGenerating && currentSuggestions.length === 0 && !error && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <Brain className="w-14 h-14 mx-auto mb-4 opacity-40" />
          <p className="text-sm">Search symbols above, then click Generate Insights</p>
          <p className="text-xs mt-1 opacity-60">Your risk profile updates in Risk Badge above</p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2 mb-3">
            <History className="w-3.5 h-3.5" /> All Past Recommendations
          </h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.slice(0, 20).map(h => (
              <div key={h.id} className="flex items-center justify-between p-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">{h.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    h.suggestion.action === 'buy' ? 'bg-green-500/10 text-green-400' :
                    h.suggestion.action === 'sell' ? 'bg-red-500/10 text-red-400' :
                    h.suggestion.action === 'hold' ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-blue-400/10 text-blue-400'
                  }`}>{h.suggestion.action.toUpperCase()}</span>
                </div>
                <span className="text-[var(--text-muted)]">{new Date(h.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav back */}
      <div className="mt-10 pb-6 text-center">
        <a href="/?tab=strategies" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to AI & Strategies
        </a>
      </div>
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Risk Badge
───────────────────────────────────────────────────────────*/
function RiskBadge() {
  const [risk, setRisk] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  useEffect(() => { setRisk(getStoredRisk()); }, []);
  const update = (r: 'conservative' | 'moderate' | 'aggressive') => {
    localStorage.setItem(RISK_KEY, r);
    setRisk(r);
  };
  const styles: Record<string, string> = {
    conservative: 'border-amber-500/30 text-amber-400',
    moderate: 'border-blue-400/30 text-blue-400',
    aggressive: 'border-red-500/30 text-red-400',
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Risk Profile</span>
      {(['conservative', 'moderate', 'aggressive'] as const).map(r => (
        <button
          key={r}
          onClick={() => update(r)}
          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
            risk === r ? `${styles[r]} bg-current/5` : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Compact suggestion (for prior history preview)
───────────────────────────────────────────────────────────*/
function CompactSuggestion({ suggestion }: { suggestion: AISuggestion }) {
  const color = { buy: 'text-green-400', sell: 'text-red-400', hold: 'text-yellow-400', watch: 'text-blue-400' }[suggestion.action];
  return (
    <div className="p-2 bg-[var(--app-bg)] rounded-lg text-xs flex items-center gap-3 opacity-60">
      <span className="font-bold text-[var(--text-primary)]">{suggestion.symbol}</span>
      <span className={`font-bold ${color}`}>{suggestion.action.toUpperCase()}</span>
      <span className="text-[var(--text-muted)] ml-auto">{suggestion.confidence}% conf</span>
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Detailed Suggestion Card with Analysis + Order
───────────────────────────────────────────────────────────*/
function SuggestionDetail({
  suggestion,
  positions,
  account,
  onOrderClick,
}: {
  suggestion: AISuggestion;
  positions: PositionInfo[];
  account: AccountInfo | null;
  onOrderClick: (side: 'buy' | 'sell', qty: number) => void;
}) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const pos = positions.find(p => p.symbol === suggestion.symbol);
  const currentQty = pos ? pos.qty : 0;
  const price = suggestion.signals.price_action.current_price;

  // Calculate recommended qty based on position size % of portfolio
  const portfolioVal = account?.portfolio_value || 100000;
  const targetValue = portfolioVal * (suggestion.suggested_position_size_pct / 100);
  const recommendedBuyQty = Math.max(1, Math.floor(targetValue / price));
  // For sell: recommend selling all or partial based on action
  const recommendedSellQty = currentQty > 0 ? currentQty : 0;

  const actionColor = {
    buy: 'text-green-500 bg-green-500/10 border-green-500/20',
    sell: 'text-red-500 bg-red-500/10 border-red-500/20',
    hold: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    watch: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  }[suggestion.action];

  // Composite score calculation
  const rsiScore = suggestion.signals.price_action.rsi > 70 ? -20 : suggestion.signals.price_action.rsi < 30 ? 20 : 0;
  const macdScore = suggestion.signals.price_action.macd.trend === 'bullish' ? 15 : suggestion.signals.price_action.macd.trend === 'bearish' ? -15 : 0;
  const sentimentScore = suggestion.signals.news_sentiment.sentiment_score_7d * 10;
  const insiderScore = suggestion.signals.insider_activity.net_buys_sells_90d > 0 ? 10 : -10;
  const compositeScore = Math.min(100, Math.max(0, 50 + rsiScore + macdScore + sentimentScore + insiderScore));

  return (
    <div className={`rounded-xl border ${actionColor} p-4`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[var(--text-primary)]">{suggestion.symbol}</span>
          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded bg-current/10`}>
            {suggestion.action}
          </span>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{suggestion.confidence}% confidence</span>
      </div>

      {/* Recommendation line */}
      <div className="mt-2 p-2.5 bg-[var(--app-bg)] rounded-lg">
        {suggestion.action === 'buy' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">
                <span className="text-green-400 font-bold">Buy {recommendedBuyQty} shares</span> at ~${price.toFixed(2)}
              </p>
              {currentQty > 0 && <p className="text-[10px] text-[var(--text-muted)]">You currently hold {currentQty} shares</p>}
            </div>
            <button
              onClick={() => onOrderClick('buy', recommendedBuyQty)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Buy
            </button>
          </div>
        )}
        {suggestion.action === 'sell' && currentQty > 0 && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text-primary)]">
                <span className="text-red-400 font-bold">Sell {recommendedSellQty} shares</span> at ~${price.toFixed(2)}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">You currently hold {currentQty} shares</p>
            </div>
            <button
              onClick={() => onOrderClick('sell', recommendedSellQty)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Sell
            </button>
          </div>
        )}
        {suggestion.action === 'sell' && currentQty === 0 && (
          <p className="text-sm text-[var(--text-muted)]">Sell recommended but you hold 0 shares</p>
        )}
        {(suggestion.action === 'hold' || suggestion.action === 'watch') && (
          <p className="text-sm text-[var(--text-primary)]">
            {suggestion.action === 'hold'
              ? `Hold position${currentQty > 0 ? ` (${currentQty} shares)` : ''}. No action needed.`
              : `Watch ${suggestion.symbol}. Not a good entry/exit point yet.`}
          </p>
        )}
      </div>

      {/* Reasoning */}
      <p className="text-sm text-[var(--text-secondary)] mt-2">{suggestion.reasoning}</p>

      {/* Key metrics */}
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-2">
        <span>SL: {suggestion.stop_loss_pct}%</span>
        <span>TP: {suggestion.take_profit_pct}%</span>
        <span>Horizon: {suggestion.time_horizon}</span>
      </div>

      {/* Analysis toggle */}
      <button
        onClick={() => setShowAnalysis(!showAnalysis)}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mt-3 transition-colors"
      >
        {showAnalysis ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showAnalysis ? 'Hide analysis' : 'Show analysis'}
      </button>

      {showAnalysis && (
        <div className="mt-3 pt-3 border-t border-current/10 space-y-3">
          {/* Composite Score */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[var(--app-bg)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${compositeScore}%`,
                  backgroundColor: compositeScore >= 60 ? '#22d66e' : compositeScore >= 40 ? '#f59e0b' : '#f87171',
                }}
              />
            </div>
            <span className="text-xs font-bold">Score: {Math.round(compositeScore)}/100</span>
          </div>

          {/* Signal grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <AnalysisRow label="Price" value={`$${price.toFixed(2)}`} />
            <AnalysisRow label="30d Change" value={`${suggestion.signals.price_action.price_change_30d >= 0 ? '+' : ''}${suggestion.signals.price_action.price_change_30d.toFixed(1)}%`} positive={suggestion.signals.price_action.price_change_30d >= 0} />
            <AnalysisRow label="RSI" value={`${suggestion.signals.price_action.rsi.toFixed(1)} (${suggestion.signals.price_action.rsi_interpretation})`} warn={suggestion.signals.price_action.rsi_interpretation !== 'neutral'} />
            <AnalysisRow label="MACD" value={suggestion.signals.price_action.macd.trend} positive={suggestion.signals.price_action.macd.trend === 'bullish'} negative={suggestion.signals.price_action.macd.trend === 'bearish'} />
            <AnalysisRow label="Sentiment" value={`${suggestion.signals.news_sentiment.sentiment_score_7d > 0 ? '+' : ''}${suggestion.signals.news_sentiment.sentiment_score_7d.toFixed(2)}`} positive={suggestion.signals.news_sentiment.sentiment_score_7d > 0.1} negative={suggestion.signals.news_sentiment.sentiment_score_7d < -0.1} />
            <AnalysisRow label="Insider" value={`${suggestion.signals.insider_activity.net_buys_sells_90d > 0 ? '+' : ''}${(suggestion.signals.insider_activity.net_buys_sells_90d / 1000).toFixed(0)}K`} positive={suggestion.signals.insider_activity.net_buys_sells_90d > 0} negative={suggestion.signals.insider_activity.net_buys_sells_90d < 0} />
            <AnalysisRow label="Sector" value={suggestion.signals.macro_context.sector} />
            <AnalysisRow label="Macro" value={suggestion.signals.macro_context.upcoming_events.map(e => e.event).join(', ')} />
          </div>

          {/* Risk factors */}
          {suggestion.risk_factors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestion.risk_factors.map((f, i) => (
                <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] rounded">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisRow({ label, value, positive, negative, warn }: { label: string; value: string; positive?: boolean; negative?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between p-1.5 bg-[var(--app-bg)] rounded">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`font-medium ${positive ? 'text-green-400' : negative ? 'text-red-400' : warn ? 'text-yellow-400' : 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  );
}
