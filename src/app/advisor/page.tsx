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
  Zap,
  ChevronUp,
  ChevronDown,
  ShoppingCart,
  X,
  History,
  Shield,
  BarChart3,
  Newspaper,
  Users,
  Globe,
  Info,
  Lightbulb,
  Layers,
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
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
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
    orderType: 'market' | 'limit' | 'stop';
    timeInForce: 'day' | 'gtc' | 'opg';
    limitPrice: string;
    status: 'idle' | 'confirm' | 'submitting' | 'done' | 'error';
    message?: string;
  }>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => { loadPositions(); loadAccount(); }, []);

  const loadPositions = async () => {
    try {
      const r = await fetch('/api/positions');
      if (r.ok) {
        const data = await r.json();
        const list = (data?.positions || []).map((p: any) => ({
          symbol: p.symbol || '',
          qty: Number(p.qty) || 0,
          market_value: Number(p.marketValue) || 0,
          avg_entry_price: Number(p.avgEntryPrice) || 0,
        }));
        setPositions(list);
      }
    } catch { /*ignore*/ }
  };

  const loadAccount = async () => {
    try {
      const r = await fetch('/api/account');
      if (r.ok) {
        const data = await r.json();
        setAccount({
          buying_power: Number(data?.account?.buyingPower) || 0,
          portfolio_value: Number(data?.account?.portfolioValue) || 0,
        });
      }
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
      const data = await res.json();
      const s = Array.isArray(data.suggestions) ? data.suggestions : [];
      setCurrentSuggestions(s);
      const now = new Date().toISOString();
      s.forEach((sg: AISuggestion) => {
        if (sg && sg.symbol) {
          saveHistory({ id: `${sg.symbol}-${Date.now()}`, date: now, symbol: sg.symbol, suggestion: sg });
        }
      });
      setHistory(loadHistory());
    } catch (err: any) { setError(err.message || 'Failed'); }
    finally { setIsGenerating(false); }
  };

  const placeOrder = async () => {
    if (!orderForm || orderForm.status !== 'confirm') return;
    setOrderForm({ ...orderForm, status: 'submitting' });
    try {
      const body: any = {
        symbol: orderForm.symbol,
        side: orderForm.side,
        qty: orderForm.qty,
        type: orderForm.orderType,
        time_in_force: orderForm.timeInForce,
      };
      if (orderForm.orderType === 'limit' && orderForm.limitPrice) {
        body.limit_price = Number(orderForm.limitPrice);
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const priorBySymbol: Record<string, HistoryEntry> = {};
  history.forEach(h => { if (!priorBySymbol[h.symbol]) priorBySymbol[h.symbol] = h; });

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header with back button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Trading Advisor</h1>
            <p className="text-sm text-[var(--text-muted)]">Multi-signal analysis with risk-aware order sizing</p>
          </div>
        </div>
        <a
          href="/?tab=strategies"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--card-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to AI & Strategies
        </a>
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

      {/* Current Suggestions */}
      {currentSuggestions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Current Analysis</h2>
          {currentSuggestions.map(sug => (
            <div key={`${sug.symbol}-${sug.generated_at}`}>
              {priorBySymbol[sug.symbol] && (
                <RecommendationChange
                  current={sug}
                  prior={priorBySymbol[sug.symbol].suggestion}
                />
              )}
              <SuggestionCard
                suggestion={sug}
                positions={positions}
                account={account}
                onTradeClick={(side, qty) => setOrderForm({
                  symbol: sug.symbol,
                  side,
                  qty,
                  price: String(sug.signals?.price_action?.current_price || ''),
                  orderType: 'market',
                  timeInForce: 'day',
                  limitPrice: '',
                  status: 'confirm',
                })}
              />
            </div>
          ))}
        </div>
      )}

      {/* Order Modal */}
      {orderForm && orderForm.status !== 'done' && (
        <OrderModal
          form={orderForm}
          onClose={() => setOrderForm(null)}
          onUpdate={(patch) => setOrderForm(prev => prev ? { ...prev, ...patch } : null)}
          onSubmit={placeOrder}
        />
      )}
      {orderForm?.status === 'done' && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-4 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <p className="text-green-400 text-sm">{orderForm.message}</p>
        </div>
      )}

      {/* Empty state */}
      {!isGenerating && currentSuggestions.length === 0 && !error && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <Brain className="w-14 h-14 mx-auto mb-4 opacity-40" />
          <p className="text-sm">Search symbols above, then click Generate Insights</p>
          <p className="text-xs mt-1 opacity-60">Your risk profile is shown above</p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2 mb-3">
            <History className="w-3.5 h-3.5" /> All Past Recommendations
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.slice(0, 20).map((h, idx) => (
              <HistoryCard key={h?.id || idx} entry={h} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Risk Badge — brighter
───────────────────────────────────────────────────────────*/
function RiskBadge() {
  const [risk, setRisk] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  useEffect(() => { setRisk(getStoredRisk()); }, []);
  const update = (r: 'conservative' | 'moderate' | 'aggressive') => {
    localStorage.setItem(RISK_KEY, r);
    setRisk(r);
  };
  const styles: Record<string, string> = {
    conservative: 'border-amber-400/40 text-amber-300 bg-amber-400/10',
    moderate: 'border-blue-400/40 text-blue-300 bg-blue-400/10',
    aggressive: 'border-red-400/40 text-red-300 bg-red-400/10',
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">Risk Profile</span>
      {(['conservative', 'moderate', 'aggressive'] as const).map(r => (
        <button
          key={r}
          onClick={() => update(r)}
          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
            risk === r ? `${styles[r]}` : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Recommendation Change Banner
───────────────────────────────────────────────────────────*/
function RecommendationChange({ current, prior }: { current: AISuggestion; prior: AISuggestion }) {
  if (current.action === prior.action) return null;
  const actionLabels: any = { buy: 'Buy', sell: 'Sell', hold: 'Hold', watch: 'Watch' };
  return (
    <div className="mb-2 p-2 bg-[var(--app-bg)] rounded-lg border border-amber-500/20 flex items-start gap-2">
      <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="text-xs text-[var(--text-secondary)]">
        <span className="font-semibold text-amber-400">Recommendation changed:</span>{' '}
        Previously <span className="font-bold">{actionLabels[prior.action] || prior.action}</span>, now{' '}
        <span className="font-bold">{actionLabels[current.action] || current.action}</span>.
        Confidence shifted from {prior.confidence}% to {current.confidence}%.
      </div>
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Collapsible Suggestion Card
───────────────────────────────────────────────────────────*/
function SuggestionCard({
  suggestion,
  positions,
  account,
  onTradeClick,
}: {
  suggestion: AISuggestion;
  positions: PositionInfo[];
  account: AccountInfo | null;
  onTradeClick: (side: 'buy' | 'sell', qty: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pos = positions.find(p => p.symbol === suggestion.symbol);
  const currentQty = pos ? pos.qty : 0;

  const sig = suggestion.signals || ({} as any);
  const priceAction = sig.price_action || { current_price: 0, price_change_30d: 0, rsi: 50, rsi_interpretation: 'neutral', macd: { trend: 'neutral' }, volume_trend: {} };
  const price = Number(priceAction.current_price) || 0;

  const portfolioVal = account?.portfolio_value || 100000;
  const targetValue = portfolioVal * ((suggestion.suggested_position_size_pct ?? 5) / 100);
  const recommendedBuyQty = price > 0 ? Math.max(1, Math.floor(targetValue / price)) : 1;

  const action = suggestion.action || 'watch';
  const confidence = suggestion.confidence ?? 50;

  const actionColor: any = {
    buy: 'text-green-500 bg-green-500/10 border-green-500/20',
    sell: 'text-red-500 bg-red-500/10 border-red-500/20',
    hold: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    watch: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  };

  return (
    <div className={`rounded-xl border ${actionColor[action] || actionColor.watch} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--text-primary)]">{suggestion.symbol || '—'}</span>
          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-current/10">{action}</span>
          <span className="text-xs text-[var(--text-muted)]">{confidence}% confidence</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Reasoning */}
          <div className="p-3 bg-[var(--app-bg)] rounded-lg">
            <p className="text-sm text-[var(--text-secondary)]">{suggestion.reasoning || 'No reasoning available'}</p>
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-2">
              <span>SL: {(suggestion.stop_loss_pct ?? 5)}%</span>
              <span>TP: {(suggestion.take_profit_pct ?? 10)}%</span>
              <span>Horizon: {suggestion.time_horizon || 'medium'}</span>
            </div>
          </div>

          {/* Trade buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => onTradeClick('buy', recommendedBuyQty)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Buy {recommendedBuyQty}
            </button>
            {currentQty > 0 && (
              <button
                onClick={() => onTradeClick('sell', currentQty)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors"
              >
                <TrendingDown className="w-3.5 h-3.5" /> Sell {currentQty}
              </button>
            )}
          </div>

          {/* Full Analysis */}
          <AnalysisDetail suggestion={suggestion} />
        </div>
      )}
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Full Analysis Detail
───────────────────────────────────────────────────────────*/
function AnalysisDetail({ suggestion }: { suggestion: AISuggestion }) {
  const sig = suggestion.signals || ({} as any);
  const priceAction = sig.price_action || { current_price: 0, price_change_30d: 0, rsi: 50, rsi_interpretation: 'neutral', macd: { trend: 'neutral' }, volume_trend: {} };
  const newsSentiment = sig.news_sentiment || { sentiment_score_7d: 0 };
  const insiderActivity = sig.insider_activity || { net_buys_sells_90d: 0 };
  const macroContext = sig.macro_context || { sector: '—', upcoming_events: [] };
  const price = Number(priceAction.current_price) || 0;

  const rsiScore = (priceAction.rsi || 50) > 70 ? -20 : (priceAction.rsi || 50) < 30 ? 20 : 0;
  const macdTrend = priceAction.macd?.trend || 'neutral';
  const macdScore = macdTrend === 'bullish' ? 15 : macdTrend === 'bearish' ? -15 : 0;
  const sentimentScore = (newsSentiment.sentiment_score_7d || 0) * 10;
  const insiderScore = (insiderActivity.net_buys_sells_90d || 0) > 0 ? 10 : -10;
  const compositeScore = Math.min(100, Math.max(0, 50 + rsiScore + macdScore + sentimentScore + insiderScore));

  return (
    <div className="space-y-3">
      {/* Composite Score */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Composite Score</span>
          <span className="text-xs font-bold">{Math.round(compositeScore)}/100</span>
        </div>
        <div className="h-2 bg-[var(--app-bg)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${compositeScore}%`,
              backgroundColor: compositeScore >= 60 ? '#22d66e' : compositeScore >= 40 ? '#f59e0b' : '#f87171',
            }}
          />
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">
          Score blends RSI, MACD trend, news sentiment, and insider activity into a single number. Higher = more bullish signals aligned.
        </p>
      </div>

      {/* Signal Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <SignalRow
          icon={BarChart3}
          label="Price"
          value={`$${price.toFixed(2)}`}
          detail={`30-day change: ${(priceAction.price_change_30d || 0).toFixed(1)}%`}
        />
        <SignalRow
          icon={Activity}
          label="RSI"
          value={`${(priceAction.rsi || 0).toFixed(1)}`}
          detail={priceAction.rsi > 70 ? 'Overbought — potential pullback expected' : priceAction.rsi < 30 ? 'Oversold — potential bounce expected' : 'Neutral momentum'}
          warn={priceAction.rsi_interpretation !== 'neutral'}
        />
        <SignalRow
          icon={TrendingUp}
          label="MACD"
          value={macdTrend}
          detail={macdTrend === 'bullish' ? 'MACD line above signal — upward momentum building' : macdTrend === 'bearish' ? 'MACD line below signal — downward pressure' : 'MACD and signal converged — no clear trend'}
          positive={macdTrend === 'bullish'}
          negative={macdTrend === 'bearish'}
        />
        <SignalRow
          icon={Newspaper}
          label="News Sentiment"
          value={`${(newsSentiment.sentiment_score_7d || 0).toFixed(2)}`}
          detail={(newsSentiment.sentiment_score_7d || 0) > 0.2 ? 'Positive news flow — favorable coverage' : (newsSentiment.sentiment_score_7d || 0) < -0.2 ? 'Negative news flow — headwinds reported' : 'Mixed or neutral news coverage'}
          positive={(newsSentiment.sentiment_score_7d || 0) > 0.1}
          negative={(newsSentiment.sentiment_score_7d || 0) < -0.1}
        />
        <SignalRow
          icon={Users}
          label="Insider Activity"
          value={`${(insiderActivity.net_buys_sells_90d || 0) > 0 ? '+' : ''}${((insiderActivity.net_buys_sells_90d || 0) / 1000).toFixed(0)}K`}
          detail={(insiderActivity.net_buys_sells_90d || 0) > 0 ? 'Net insider buying — management confidence signal' : (insiderActivity.net_buys_sells_90d || 0) < 0 ? 'Net insider selling — possible caution signal' : 'Balanced insider activity'}
          positive={(insiderActivity.net_buys_sells_90d || 0) > 0}
          negative={(insiderActivity.net_buys_sells_90d || 0) < 0}
        />
        <SignalRow
          icon={Globe}
          label="Macro Context"
          value={macroContext.sector || '—'}
          detail={(macroContext.upcoming_events || []).map((e: any) => e?.event || '').join(', ') || 'No major events'}
        />
      </div>

      {/* Risk factors */}
      {(suggestion.risk_factors || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(suggestion.risk_factors || []).map((f: any, i: number) => (
            <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] rounded">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({ icon: Icon, label, value, detail, positive, negative, warn }: any) {
  return (
    <div className="p-2.5 bg-[var(--app-bg)] rounded-lg">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-[var(--text-muted)]" />
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-bold ${positive ? 'text-green-400' : negative ? 'text-red-400' : warn ? 'text-yellow-400' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{detail}</p>
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  Order Modal — full Quick Trade
───────────────────────────────────────────────────────────*/
function OrderModal({
  form,
  onClose,
  onUpdate,
  onSubmit,
}: {
  form: NonNullable<ReturnType<typeof useState<null | any>>[0]>;
  onClose: () => void;
  onUpdate: (patch: Partial<any>) => void;
  onSubmit: () => void;
}) {
  const notional = form.price ? form.qty * Number(form.price) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{form.status === 'confirm' ? 'Place Order' : form.status === 'submitting' ? 'Submitting…' : 'Error'}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
        </div>

        {form.status === 'confirm' && (
          <>
            {/* Side toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate({ side: 'buy' })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wider transition ${
                  form.side === 'buy'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'bg-[var(--app-bg)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => onUpdate({ side: 'sell' })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wider transition ${
                  form.side === 'sell'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-[var(--app-bg)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                SELL
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Symbol</span>
                <span className="font-bold">{form.symbol}</span>
              </div>

              <input
                type="number"
                value={form.qty}
                onChange={(e) => onUpdate({ qty: Number(e.target.value) })}
                className="w-full bg-[var(--app-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50"
                placeholder="Quantity"
              />

              <div className="flex gap-2">
                <select
                  value={form.orderType}
                  onChange={(e) => onUpdate({ orderType: e.target.value })}
                  className="flex-1 bg-[var(--app-bg)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-amber-500/50"
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                </select>
                <select
                  value={form.timeInForce}
                  onChange={(e) => onUpdate({ timeInForce: e.target.value })}
                  className="flex-1 bg-[var(--app-bg)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-amber-500/50"
                >
                  <option value="day">DAY</option>
                  <option value="gtc">GTC</option>
                  <option value="opg">OPG</option>
                </select>
              </div>

              {form.orderType === 'limit' && (
                <input
                  type="number"
                  value={form.limitPrice}
                  onChange={(e) => onUpdate({ limitPrice: e.target.value })}
                  placeholder="Limit Price"
                  className="w-full bg-[var(--app-bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50"
                />
              )}

              {notional > 0 && (
                <p className="text-[10px] text-[var(--text-muted)] text-right">
                  ≈ ${notional.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>

            <button
              onClick={onSubmit}
              className={`w-full py-2.5 rounded-lg font-bold text-xs tracking-wider transition ${
                form.side === 'buy'
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {form.side.toUpperCase()} {form.qty} {form.symbol}
            </button>
          </>
        )}

        {form.status === 'submitting' && (
          <div className="text-center py-4"><span className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin inline-block" /></div>
        )}
        {form.status === 'error' && (
          <p className="text-red-400 text-sm text-center">{form.message}</p>
        )}
      </div>
    </div>
  );
}

/*───────────────────────────────────────────────────────────
  History Card — collapsible, no trade buttons
───────────────────────────────────────────────────────────*/
function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const action = entry?.suggestion?.action || 'watch';
  const actionColor: any = {
    buy: 'text-green-500 bg-green-500/10 border-green-500/20',
    sell: 'text-red-500 bg-red-500/10 border-red-500/20',
    hold: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    watch: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  };

  return (
    <div className={`rounded-xl border ${actionColor[action] || actionColor.watch} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-[var(--text-primary)]">{entry?.symbol || '—'}</span>
          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-current/10">{action}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{entry?.date ? new Date(entry.date).toLocaleDateString() : '—'}</span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
      </button>
      {expanded && entry?.suggestion && (
        <div className="px-3 pb-3">
          <AnalysisDetail suggestion={entry.suggestion} />
        </div>
      )}
    </div>
  );
}
