'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Brain,
  BrainCircuit,
  Zap,
  DollarSign,
  Layers,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  ChevronDown,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Save,
  Search,
  Calendar,
  Send,
  Loader2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';
import SymbolSearch from '@/components/SymbolSearch';
import MorningRecommendationsList from '@/components/MorningRecommendationsList';
import ChatModal from '@/components/ChatModal';
import { useAdvisorStore } from '@/stores/advisorStore';
import {
  type DbStrategy,
  type DbAccountSnapshot,
  type DbAiSuggestion,
  fetchStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  fetchSnapshots,
  fetchAiSuggestions,
  createAiSuggestion,
} from '@/lib/supabase';

/* ── Stable anonymous user ID ──────────────────────────────────── */
function getUserId(): string {
  const key = 'alpaca-dashboard-user-id';
  let id = '';
  if (typeof window !== 'undefined') {
    id = localStorage.getItem(key) || '';
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
  }
  return id;
}

/* ── Types ─────────────────────────────────────────────────────── */

type StrategyType = 'dca' | 'rebalance' | 'momentum' | 'mean_reversion';

interface StrategyMeta {
  id: StrategyType;
  name: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

const STRATEGY_META: StrategyMeta[] = [
  { id: 'dca', name: 'Dollar Cost Averaging', icon: DollarSign, description: 'Invest fixed amounts at regular intervals to smooth out volatility', color: 'text-emerald-400' },
  { id: 'rebalance', name: 'Portfolio Rebalancing', icon: Layers, description: 'Maintain target allocations by buying/selling when drift exceeds threshold', color: 'text-blue-400' },
  { id: 'momentum', name: 'Momentum Strategy', icon: TrendingUp, description: 'Buy top performers, sell underperformers based on price momentum', color: 'text-violet-400' },
  { id: 'mean_reversion', name: 'Mean Reversion', icon: TrendingDown, description: 'Buy oversold, sell overbought when price deviates from mean', color: 'text-amber-400' },
];

interface PortfolioContext {
  account: { total_equity: number; positions_value: number; cash: number; day_pnl: number; buying_power: number };
  positions: Array<{ symbol: string; qty: number; market_value: number; unrealized_pl: number; unrealized_plpc: number; current_price: number }>;
  positions_count: number;
  orders: any[];
  market: {
    spy_change_pct: number;
    qqq_change_pct: number;
    vix: string;
    market_status: string;
  };
  news: Array<{ title: string; summary: string; source: string; created_at: string }>;
}

/* ── Market data cache (5 min) ─────────────────────────────────── */

let _marketCache: { data: any; ts: number } | null = null;
const MARKET_CACHE_MS = 0; // TEMP: disabled for testing

async function fetchMarketData() {
  const now = Date.now();
  console.log('[Advisor] fetchMarketData called at', new Date(now).toISOString());
  if (_marketCache && now - _marketCache.ts < MARKET_CACHE_MS) {
    console.log('[Advisor] Using cached market data. Cached at:', new Date(_marketCache.ts).toISOString(), 'Age:', (now - _marketCache.ts) / 1000, 'seconds');
    return _marketCache.data;
  }

  try {
    const [indicesRes, marketRes, newsRes] = await Promise.all([
      fetch('/api/indices').then((r) => r.json()),
      fetch('/api/market').then((r) => r.json()),
      fetch('/api/news?limit=5').then((r) => r.json()),
    ]);

    const indices = indicesRes?.indices || [];
    const spy = indices.find((i: any) => i.symbol === 'SPY');
    const qqq = indices.find((i: any) => i.symbol === 'QQQ');

    const marketData = {
      spy_change_pct: spy?.changePercent ?? 0,
      qqq_change_pct: qqq?.changePercent ?? 0,
      vix: 'N/A',
      market_status: marketRes?.isOpen ? 'open' : 'closed',
    };

    const rawNews = newsRes?.news || newsRes || [];
    console.log('[Advisor] Raw news count from API:', rawNews.length);
    if (rawNews.length > 0) {
      console.log('[Advisor] First headline raw:', rawNews[0]?.headline || rawNews[0]?.title || 'N/A');
      console.log('[Advisor] First headline source:', rawNews[0]?.source || rawNews[0]?.site || 'N/A');
    }

    const newsData = rawNews.slice(0, 5).map((n: any) => ({
      title: n.title || n.headline || '',
      summary: n.summary || n.description || '',
      source: n.source || n.site || 'Unknown',
      created_at: n.created_at || n.date || new Date().toISOString(),
    }));

    console.log('[Advisor] Fresh data fetched at:', new Date(now).toISOString());
    _marketCache = { data: { market: marketData, news: newsData }, ts: now };
    console.log('[Advisor] Fetched market data:', JSON.stringify(_marketCache.data, null, 2));
    return _marketCache.data;
  } catch (err) {
    console.error('[Advisor] Market data fetch error:', err);
    return {
      market: { spy_change_pct: 0, qqq_change_pct: 0, vix: 'N/A', market_status: 'unknown' },
      news: [],
    };
  }
}

/* ── Section A — Portfolio Pulse ───────────────────────────────── */

function PortfolioPulse({ context, loading }: { context: PortfolioContext | null; loading: boolean }) {
  if (loading || !context) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="h-2 bg-[var(--hover-bg)] rounded w-12" />
              <div className="h-4 bg-[var(--hover-bg)] rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { account } = context;
  const dayPL = account?.day_pnl || 0;
  const isDayPositive = dayPL >= 0;

  return (
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280] mb-1">Equity</p>
          <p className="text-sm font-semibold font-mono text-[#111827] dark:dark:text-text-primary-dark light:text-text-primary-light">${fmtUSD(account?.total_equity || 0)}</p>
        </div>
        <div className="text-center border-x border-[var(--border)]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280] mb-1">Day P&L</p>
          <p className={`text-sm font-semibold font-mono ${isDayPositive ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {isDayPositive ? '+' : ''}{fmtUSD(dayPL)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280] mb-1">Cash</p>
          <p className="text-sm font-semibold font-mono text-[#111827] dark:dark:text-text-primary-dark light:text-text-primary-light">${fmtUSD(account?.cash || 0)}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Risk Score Widget ─────────────────────────────────────────── */

interface RiskScoreData {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Critical';
  factors: {
    concentration: { score: number; detail: string };
    cash_buffer: { score: number; detail: string };
    volatility: { score: number; detail: string };
    rsi_extremes: { score: number; detail: string };
    diversification: { score: number; detail: string };
  };
  top_risk: string;
}

function RiskScoreWidget({ data, loading }: { data: RiskScoreData | null; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);

  console.log('Risk Score colors applied');

  if (loading || !data) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00d4aa] to-[#7c6aff]" />
        <div className="p-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full dark:bg-bg-hover-dark light:bg-bg-hover-light" />
            <div className="flex-1 space-y-2">
              <div className="h-4 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-32" />
              <div className="h-3 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const gradeColors: Record<string, string> = {
    A: 'bg-[#00d4aa] text-black',
    B: 'bg-[#2dd4bf] text-black',
    C: 'bg-[#facc15] text-black',
    D: 'bg-[#fb923c] text-black',
    F: 'bg-[#ef4444] dark:text-text-primary-dark light:text-text-primary-light',
  };

  const barColors = (score: number, max: number) => {
    const pct = score / max;
    if (pct < 0.33) return 'bg-[#00d4aa]';
    if (pct < 0.66) return 'bg-[#facc15]';
    return 'bg-[#ef4444]';
  };

  const factors = [
    { key: 'concentration', label: 'Concentration', max: 25 },
    { key: 'cash_buffer', label: 'Cash Buffer', max: 20 },
    { key: 'volatility', label: 'Volatility', max: 25 },
    { key: 'rsi_extremes', label: 'RSI Extremes', max: 15 },
    { key: 'diversification', label: 'Diversification', max: 15 },
  ] as const;

  return (
    <div
      className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden cursor-pointer transition hover:dark:border-[#475569] light:hover:border-[#cbd5e1]"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="h-[3px] w-full bg-gradient-to-r from-[#00d4aa] to-[#7c6aff]" />
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Score + Grade Circle */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-3xl font-bold dark:text-text-primary-dark light:text-text-primary-light leading-none">{data.score}</p>
              <p className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light mt-0.5">/100</p>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${gradeColors[data.grade] || 'bg-[var(--hover-bg)]'}`}>
              {data.grade}
            </div>
          </div>

          {/* Label + Top Risk */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold dark:text-text-primary-dark light:text-text-primary-light">{data.label} Risk</p>
            <p className="text-[11px] dark:text-text-secondary-dark light:text-text-secondary-light truncate mt-0.5">{data.top_risk}</p>
          </div>

          {/* Expand chevron */}
          <ChevronDown className={`w-4 h-4 dark:text-text-tertiary-dark light:text-text-tertiary-light transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>

        {/* Factor Bars */}
        <div className="mt-3 space-y-1.5">
          {factors.map(({ key, label, max }) => {
            const factor = data.factors[key as keyof typeof data.factors];
            const pct = (factor.score / max) * 100;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light w-24 truncate">{label}</span>
                <div className="flex-1 h-1.5 dark:bg-bg-base-dark light:bg-bg-base-light rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColors(factor.score, max)}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light w-8 text-right">{factor.score}/{max}</span>
              </div>
            );
          })}
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 pt-3 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] space-y-2">
            {factors.map(({ key, label }) => {
              const factor = data.factors[key as keyof typeof data.factors];
              return (
                <div key={key} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${barColors(factor.score, 25)}`} />
                  <div className="flex-1">
                    <p className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light">{label}</p>
                    <p className="text-[10px] dark:text-text-secondary-dark light:text-text-secondary-light">{factor.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
/* ── Sell Signals ──────────────────────────────────────────────── */

interface SellSignal {
  symbol: string;
  action: string;
  confidence: number;
  target_price: number;
  reasoning: string;
  currentPrice: number;
  qty: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

function SellSignals({ portfolioContext, onAnalyze }: { portfolioContext: PortfolioContext | null; onAnalyze: (symbol: string, prompt: string) => void }) {
  const [signals, setSignals] = useState<SellSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!portfolioContext?.positions?.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSellSignals() {
      setLoading(true);
      try {
        const results = await Promise.all(
          portfolioContext!.positions.map(async (pos) => {
            try {
              const avgCost = pos.market_value / Math.max(pos.qty, 1);
              const params = new URLSearchParams({
                symbol: pos.symbol,
                currentPrice: String(pos.current_price),
                avgCost: String(avgCost),
                unrealizedPL: String(pos.unrealized_pl),
                qty: String(pos.qty),
                equity: String(portfolioContext!.account.total_equity),
              });
              const res = await fetch(`/api/positions/recommendation?${params}`);
              const data = await res.json();
              if (data.action === 'sell') {
                return {
                  symbol: pos.symbol,
                  action: data.action,
                  confidence: data.confidence || 5,
                  target_price: data.target_price || 0,
                  reasoning: data.reasoning || '',
                  currentPrice: pos.current_price,
                  qty: pos.qty,
                  marketValue: pos.market_value,
                  unrealizedPL: pos.unrealized_pl,
                  unrealizedPLPercent: pos.unrealized_plpc,
                } as SellSignal;
              }
              return null;
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;
        const sellSignals = results.filter(Boolean) as SellSignal[];
        sellSignals.sort((a, b) => b.confidence - a.confidence);
        setSignals(sellSignals);
      } catch (err) {
        console.error('[SellSignals] Fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSellSignals();
    return () => { cancelled = true; };
  }, [portfolioContext]);

  const visibleSignals = signals.filter((s) => !dismissed.has(s.symbol));

  // Loading skeleton
  if (loading) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-28 animate-pulse" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-3 animate-pulse">
            <div className="h-5 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-32 mb-2" />
            <div className="h-4 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-48 mb-2" />
            <div className="h-3 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  // Hide entire section if no sell signals
  if (visibleSignals.length === 0) return null;

  const fmtUSD = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔴</span>
        <h3 className="text-lg font-semibold dark:text-[#fca5a5] light:text-[#dc2626]">Sell Signals</h3>
        <span className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">{visibleSignals.length} position{visibleSignals.length > 1 ? 's' : ''} flagged</span>
      </div>

      {visibleSignals.map((s) => (
        <div
          key={s.symbol}
          className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#ef4444]/20 light:border-[#ef4444]/20 p-4 space-y-2"
          style={{ borderLeftWidth: '3px', borderLeftColor: '#ef4444' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔴</span>
              <span className="text-xs font-bold uppercase dark:text-[#fca5a5] light:text-[#dc2626]">Sell Signal</span>
              <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
                Score: {Math.round(s.confidence * 10)}/100
              </span>
            </div>
          </div>

          {/* Symbol + P&L */}
          <div className="flex items-center gap-3">
            <span className="text-base font-bold dark:text-[#f9fafb] light:text-[#0f172a]">{s.symbol}</span>
            <span className="font-[family-name:var(--font-mono)] text-sm dark:text-text-primary-dark light:text-text-primary-light">
              ${fmtUSD(s.currentPrice)}
            </span>
            <span className={`font-[family-name:var(--font-mono)] text-xs font-bold ${s.unrealizedPL >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {s.unrealizedPL >= 0 ? '+' : ''}{fmtUSD(s.unrealizedPL)} ({s.unrealizedPLPercent >= 0 ? '+' : ''}{s.unrealizedPLPercent.toFixed(2)}%)
            </span>
          </div>

          {/* Reasoning */}
          {s.reasoning && (
            <p className="text-xs dark:text-text-secondary-dark light:text-text-secondary-light italic dark:bg-[#1e293b]/50 light:bg-[#fef2f2] rounded-lg px-3 py-2">
              "{s.reasoning}"
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                console.log('Sell signal confirmed:', s.symbol);
              }}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[11px] font-bold hover:bg-red-500 transition"
            >
              Sell
            </button>
            <button
              onClick={() => {
                const avgCost = s.marketValue / Math.max(s.qty, 1);
                const prompt = `Analyze my ${s.symbol} position. I bought at $${avgCost.toFixed(2)}, currently at $${s.currentPrice.toFixed(2)}, P&L is $${s.unrealizedPL.toFixed(2)}.`;
                onAnalyze(s.symbol, prompt);
              }}
              className="flex-1 py-2 rounded-xl border dark:border-[#0d9488]/40 light:border-[#0d9488]/40 dark:text-[#0d9488] light:text-[#0d9488] text-[11px] font-bold hover:dark:bg-[#0d9488]/10 hover:light:bg-[#0d9488]/5 transition"
            >
              Analyze
            </button>
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(s.symbol))}
              className="px-3 py-2 rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-medium hover:dark:bg-bg-hover-dark hover:light:bg-bg-hover-light transition"
            >
              Hold
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Opportunity Scanner ────────────────────────────────────────── */

interface EnrichedDipCandidate {
  symbol: string;
  score: number;
  change_pct: number;
  current_price: number;
  volume_ratio: number;
  rsi: number | null;
  safe_to_buy?: boolean;
  suggested_entry?: number;
  suggested_stop?: number;
  suggested_amount?: number;
  news_reason?: {
    reason?: string;
    recovery_probability?: string;
    one_line_summary?: string;
    red_flags?: string[];
  };
}

function MarketScanner({ onAnalyze }: { onAnalyze: (symbol: string, prompt: string) => void }) {
  const [candidates, setCandidates] = useState<EnrichedDipCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  console.log('Opportunity Scanner colors applied');
  console.log('Order ticket colors applied');
  console.log('Chat colors applied');
  console.log('Input fields updated in: [AdvisorStrategiesTab, SymbolSearch, WatchlistWidget, OrderFilters, NewsIntelligence, EnhancedPositions]');
  console.log('Card borders added to X components');
  const [marketLabel, setMarketLabel] = useState('Unknown');
  const [executing, setExecuting] = useState<string | null>(null);
  const [orderTicket, setOrderTicket] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [orderQty, setOrderQty] = useState<number>(0);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [stopPrice, setStopPrice] = useState<number>(0);
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc' | 'ioc'>('day');
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const scannerUserId = getUserId();
  const today = new Date().toISOString().split('T')[0];

  async function updateScannerAction(
    symbol: string,
    action: 'executed' | 'skipped' | 'watching',
    extra?: { executed_price?: number }
  ) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !supabaseKey) return;

      const supabase = createClient(supabaseUrl, supabaseKey);
      const patch: Record<string, any> = { user_action: action };
      if (extra?.executed_price) {
        patch.executed_price = extra.executed_price;
        patch.executed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('scanner_recommendations')
        .update(patch)
        .eq('user_id', scannerUserId)
        .eq('symbol', symbol)
        .eq('date', today);

      if (error) {
        console.error('[MarketScanner] Update error:', error.message);
      }
    } catch (err: any) {
      console.error('[MarketScanner] Failed to update action:', err.message);
    }
  }

  // ── Dip scanner fetch ───────────────────────────────────────
  const fetchDipScanner = useCallback(async () => {
    try {
      setLoading(true);
      // Get watchlist from localStorage
      const watchlistRaw =
        (typeof window !== 'undefined' && localStorage.getItem('alpaca-watchlist')) ||
        'AAPL,TSLA,NVDA,MSFT,GOOGL,AMZN,META';
      const watchlist = watchlistRaw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .join(',');

      const url = `/api/dip-scanner?watchlist=${encodeURIComponent(watchlist)}`;
      console.log('DipScanner fetch URL:', url);

      const [scannerRes, marketRes] = await Promise.all([
        fetch(url),
        fetch('/api/market').then((r) => r.json()).catch(() => ({})),
      ]);

      setMarketLabel(marketRes?.marketState?.label || 'Unknown');

      if (scannerRes.ok) {
        const data = await scannerRes.json();
        console.log('DipScanner response:', JSON.stringify(data, null, 2));
        setCandidates(data.candidates || []);
      } else {
        setCandidates([]);
      }
    } catch (err) {
      console.error('[MarketScanner] Load error:', err);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load
    fetchDipScanner();

    // Refresh every 10 minutes during market hours (9 AM - 4 PM ET)
    const intervalId = setInterval(() => {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const hour = et.getHours();
      if (hour >= 9 && hour < 16) {
        fetchDipScanner();
      }
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(intervalId);
  }, [fetchDipScanner]);

  const handleExecute = (candidate: EnrichedDipCandidate) => {
    const defaultQty = Math.max(1, Math.floor(500 / candidate.current_price));
    setOrderTicket(candidate.symbol);
    setOrderType('market');
    setOrderQty(defaultQty);
    setLimitPrice(candidate.current_price);
    setStopPrice(Number((candidate.current_price * 0.95).toFixed(2)));
    setTimeInForce('day');
  };

  const handleConfirmOrder = async (candidate: EnrichedDipCandidate) => {
    if (!orderQty || orderQty <= 0) {
      alert('Please enter a valid share quantity.');
      return;
    }
    setOrderSubmitting(true);
    try {
      const orderPayload = {
        symbol: candidate.symbol,
        side: 'buy',
        type: orderType.toLowerCase(),
        qty: Number(orderQty),
        estimatedPrice: limitPrice || candidate.current_price,
        timeInForce: timeInForce.toLowerCase(),
        ...(limitPrice && orderType !== 'market' ? { limitPrice: Number(limitPrice) } : {}),
        ...(stopPrice && (orderType === 'stop' || orderType === 'stop_limit') ? { stopPrice: Number(stopPrice) } : {}),
      };
      console.log('Order payload:', JSON.stringify(orderPayload));
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      if (!res.ok) throw new Error(`Order failed: ${res.status}`);
      await updateScannerAction(candidate.symbol, 'executed', {
        executed_price: candidate.current_price,
      });
      console.log('Tracked', candidate.symbol, 'executed');
      alert(`${candidate.symbol} order placed successfully`);
      setOrderTicket(null);
    } catch (err: any) {
      alert(`Failed to place order: ${err.message}`);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleCancelOrder = () => {
    setOrderTicket(null);
  };

  const handleAnalyze = (candidate: EnrichedDipCandidate) => {
    updateScannerAction(candidate.symbol, 'watching');
    console.log('Tracked', candidate.symbol, 'watching');
    const prompt = `Analyze ${candidate.symbol} quality dip. It's down ${candidate.change_pct.toFixed(1)}% today. Score: ${candidate.score}/100. Reason: ${candidate.news_reason?.one_line_summary || 'N/A'}. RSI: ${candidate.rsi ?? 'N/A'}. Should I buy?`;
    onAnalyze(candidate.symbol, prompt);
  };

  const handleSkip = (symbol: string) => {
    updateScannerAction(symbol, 'skipped');
    console.log('Tracked', symbol, 'skipped');
    setCandidates((prev) => prev.filter((x) => x.symbol !== symbol));
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-[#6366f1]" />
          <div>
            <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Opportunity Scanner</h3>
            <p className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Quality dips updated every 10 min</p>
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 animate-pulse"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-6 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-24" />
              <div className="h-6 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-16" />
            </div>
            <div className="h-4 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-48 mb-2" />
            <div className="h-3 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-full mb-3" />
            <div className="flex gap-2">
              <div className="h-8 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-24" />
              <div className="h-8 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-20" />
              <div className="h-8 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-6 text-center">
        <div className="flex items-center gap-2 mb-3 justify-center">
          <Search className="w-4 h-4 text-[#6366f1]" />
          <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Opportunity Scanner</h3>
        </div>
        <p className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light mb-2">Quality dips updated every 10 min</p>
        <p className="text-sm dark:text-text-secondary-dark light:text-text-secondary-light">
          No quality dips detected today.
          <br />
          Market is <span className="font-semibold">{marketLabel}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-[#6366f1]" />
          <div>
            <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Opportunity Scanner</h3>
            <p className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Quality dips updated every 10 min</p>
          </div>
        </div>
        <span className="text-[11px] text-[#6366f1] font-semibold bg-[#6366f1]/10 px-2 py-0.5 rounded-full">
          {candidates.length} found
        </span>
      </div>

      {candidates.map((c) => (
        <div
          key={c.symbol}
          className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden transition hover:dark:border-[#475569] light:hover:border-[#cbd5e1]"
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#6366f1]/10 text-[#6366f1] text-[10px] font-bold uppercase tracking-wide">
                  <Search className="w-3 h-3" />
                  Quality Dip
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-[#6366f1] dark:text-text-primary-dark light:text-text-primary-light text-[11px] font-bold">
                  Score: {c.score}/100
                </span>
              </div>
              <span className={`text-sm font-bold font-mono ${c.change_pct < 0 ? 'dark:text-accent-danger-dark light:text-accent-danger-light' : 'dark:text-accent-success-dark light:text-accent-success-light'}`}>
                {c.change_pct > 0 ? '+' : ''}{c.change_pct.toFixed(1)}%
              </span>
            </div>

            <h4 className="text-base font-bold dark:text-text-primary-dark light:text-text-primary-light">
              {c.symbol} — ${c.current_price.toFixed(2)}
            </h4>

            <div className="flex items-center gap-3 mt-1 text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
              <span>RSI: {c.rsi ?? 'N/A'}</span>
              <span>Vol: {c.volume_ratio.toFixed(1)}x normal</span>
            </div>
          </div>

          {/* News summary */}
          {c.news_reason?.one_line_summary && (
            <div className="px-4 py-2 bg-[#6366f1]/5 border-y border-[#6366f1]/10">
              <p className="text-[11px] dark:text-text-secondary-dark light:text-text-secondary-light italic">
                &ldquo;{c.news_reason.one_line_summary}&rdquo;
              </p>
            </div>
          )}

          {/* Recovery history */}
          {c.news_reason?.recovery_probability && (
            <div className="px-4 py-1.5">
              <p className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
                Recovery probability:{' '}
                <span className="font-semibold dark:text-text-primary-dark light:text-text-primary-light">
                  {c.news_reason.recovery_probability}
                </span>
              </p>
            </div>
          )}

          {/* Actions */}
          {orderTicket === c.symbol ? (
            <>
              {/* Order Ticket */}
              <div className="px-4 pb-2">
                <div className="rounded-xl p-3 space-y-3 dark:bg-[rgba(0,0,0,0.25)] light:bg-[rgba(0,0,0,0.04)] border dark:border-[#334155] light:border-[#e2e8f0]">
                  {/* QTY */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Shares</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={orderQty || ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setOrderQty(raw === '' ? 0 : Number(raw));
                      }}
                      className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                    />
                  </div>

                  {/* ORDER TYPE */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Order Type</label>
                    <div className="flex rounded-lg overflow-hidden border dark:border-[#334155]/70 light:border-[#e2e8f0]">
                      {(['market', 'limit', 'stop', 'stop_limit'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setOrderType(type)}
                          className={`flex-1 py-1.5 text-[10px] font-bold transition ${
                            orderType === type
                              ? 'bg-[#6366f1] dark:text-text-primary-dark light:text-text-primary-light'
                              : 'dark:bg-bg-base-dark light:bg-bg-base-light dark:text-text-tertiary-dark light:text-text-tertiary-light hover:dark:bg-bg-hover-dark light:bg-bg-hover-light'
                          }`}
                        >
                          {type === 'stop_limit' ? 'Stop Limit' : type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* LIMIT PRICE */}
                  {(orderType === 'limit' || orderType === 'stop_limit') && (
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Limit Price $</label>
                      <input
                        type="number"
                        step="0.01"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                      />
                    </div>
                  )}

                  {/* STOP PRICE */}
                  {(orderType === 'stop' || orderType === 'stop_limit') && (
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Stop Price $</label>
                      <input
                        type="number"
                        step="0.01"
                        value={stopPrice}
                        onChange={(e) => setStopPrice(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                      />
                    </div>
                  )}

                  {/* TIME IN FORCE */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Time in Force</label>
                    <div className="flex rounded-lg overflow-hidden border dark:border-[#334155]/70 light:border-[#e2e8f0]">
                      {(['day', 'gtc', 'ioc'] as const).map((tif) => (
                        <button
                          key={tif}
                          onClick={() => setTimeInForce(tif)}
                          className={`flex-1 py-1.5 text-[10px] font-bold transition ${
                            timeInForce === tif
                              ? 'bg-[#6366f1] dark:text-text-primary-dark light:text-text-primary-light'
                              : 'dark:bg-bg-base-dark light:bg-bg-base-light dark:text-text-tertiary-dark light:text-text-tertiary-light hover:dark:bg-bg-hover-dark light:bg-bg-hover-light'
                          }`}
                        >
                          {tif.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ESTIMATED TOTAL */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Est. Total</label>
                    <div className="px-3 py-2 text-sm dark:bg-bg-hover-dark light:bg-bg-hover-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light font-mono">
                      ${(orderQty * (limitPrice || c.current_price)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirm / Cancel */}
              <div className="px-4 pb-4 pt-2 flex items-center gap-2">
                <button
                  onClick={() => handleConfirmOrder(c)}
                  disabled={orderSubmitting}
                  className="flex-1 py-2 rounded-xl bg-[#0d9488] dark:text-text-primary-dark light:text-text-primary-light text-[11px] font-bold hover:bg-[#0f766e] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {orderSubmitting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Confirm Order
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={orderSubmitting}
                  className="px-4 py-2 rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-bold hover:dark:bg-bg-hover-dark light:bg-bg-hover-light transition disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="px-4 pb-4 pt-2 flex items-center gap-2">
              <button
                onClick={() => handleExecute(c)}
                disabled={!c.safe_to_buy}
                className="flex-1 py-2 rounded-xl bg-teal-600 dark:text-text-primary-dark light:text-text-primary-light text-[11px] font-bold hover:bg-teal-500 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <DollarSign className="w-3 h-3" />
                Buy
              </button>
              <button
                onClick={() => handleAnalyze(c)}
                className="px-4 py-2 rounded-xl border border-[#6366f1]/40 text-[#6366f1] text-[11px] font-bold hover:bg-[#6366f1]/10 transition"
              >
                Analyze
              </button>
              <button
                onClick={() => handleSkip(c.symbol)}
                className="px-3 py-2 rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-bold hover:dark:bg-bg-hover-dark light:bg-bg-hover-light transition"
              >
                Skip
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Strategy Card (preserved) ─────────────────────────────────── */

function formatParamsSummary(type: StrategyType, params: Record<string, any>): string {
  switch (type) {
    case 'dca':
      return `${params.symbol || '-'} · $${params.amount || 0} · ${params.frequency || 'weekly'}`;
    case 'rebalance':
      const allocations = params.allocations || [];
      return `${allocations.length} assets · ${Math.round((params.threshold || 0.05) * 100)}% threshold`;
    case 'momentum':
      const universe = params.universe || [];
      return `${universe.length} tickers · ${params.lookback_days || 90}d lookback`;
    case 'mean_reversion':
      return `${params.symbol || '-'} · ${params.lookback || 20}d · z>${params.z_score_threshold || 2}`;
    default:
      return '';
  }
}

function InlineStrategyCard({
  meta,
  onSave,
  onUpdate,
  onDelete,
  userId,
}: {
  meta: StrategyMeta;
  onSave: (type: StrategyType, name: string, params: Record<string, any>) => void;
  onUpdate: (id: string, patch: Partial<DbStrategy>) => void;
  onDelete: (id: string) => void;
  userId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [myStrategies, setMyStrategies] = useState<DbStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const Icon = meta.icon;

  useEffect(() => {
    if (!expanded) return;
    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/strategies?user_id=${userId}`);
        const data = await res.json();
        if (res.ok) {
          const filtered = (data.strategies || []).filter((s: DbStrategy) => s.type === meta.id);
          setMyStrategies(filtered);
        } else {
          setFetchError(data.error || 'Failed to load');
        }
      } catch (err: any) {
        setFetchError(err.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [expanded, meta.id, userId]);

  return (
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden transition-all">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--hover-bg)]/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 dark:bg-bg-input-dark light:bg-bg-input-light">
            <Icon className={`w-5 h-5 ${meta.color}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">{meta.name}</h3>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-[var(--text-muted)] dark:bg-bg-input-dark light:bg-bg-input-light px-2 py-0.5 rounded-full">{myStrategies.length}</span>
          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingId(null); }}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[var(--border-light)] text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Add {meta.name}
            </button>
          )}

          {showForm && (
            <StrategyForm
              type={meta.id}
              initialData={editingId ? myStrategies.find((s) => s.id === editingId) : undefined}
              userId={userId}
              onSave={(name, params) => {
                if (editingId) { onUpdate(editingId, { name, params }); }
                else { onSave(meta.id, name, params); }
                setShowForm(false); setEditingId(null);
              }}
              onCancel={() => { setShowForm(false); setEditingId(null); }}
            />
          )}

          {/* Saved strategies list */}
          {loading && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Saved Strategies</p>
              {[1, 2].map((i) => (
                <div key={i} className="dark:bg-bg-input-dark light:bg-bg-input-light rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-3 animate-pulse">
                  <div className="h-3 bg-[var(--hover-bg)] rounded w-32 mb-2" />
                  <div className="h-2 bg-[var(--hover-bg)] rounded w-48" />
                </div>
              ))}
            </div>
          )}

          {!loading && fetchError && (
            <p className="text-[11px] text-[var(--red)]">{fetchError}</p>
          )}

          {!loading && !fetchError && myStrategies.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-3">No saved strategies yet</p>
          )}

          {!loading && !fetchError && myStrategies.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Saved Strategies</p>
              {myStrategies.map((s) => (
                <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border ${s.is_active ? 'border-[var(--accent)]/20 bg-[var(--accent)]/5' : 'border-[var(--border)] dark:bg-bg-input-dark light:bg-bg-input-light'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold dark:text-text-primary-dark light:text-text-primary-light truncate">{s.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{formatParamsSummary(s.type as StrategyType, s.params)} · {s.is_active ? 'Active' : 'Paused'}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditingId(s.id); setShowForm(true); }} className="p-2 rounded-lg text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light hover:bg-[var(--hover-bg)] transition"><Edit3 className="w-3.5 h-3.5" /></button>
                    {confirmDelete === s.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { onDelete(s.id); setConfirmDelete(null); }} className="p-2 rounded-lg text-[var(--red)] hover:bg-[var(--red)]/10 transition"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setConfirmDelete(null)} className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(s.id)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => onUpdate(s.id, { is_active: !s.is_active })} className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${s.is_active ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20' : 'dark:bg-bg-input-dark light:bg-bg-input-light text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'}`}>{s.is_active ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Strategy Form (preserved) ─────────────────────────────────── */

function StrategyForm({ type, initialData, onSave, onCancel, userId }: { type: StrategyType; initialData?: DbStrategy; onSave: (name: string, params: Record<string, any>) => void; onCancel: () => void; userId: string }) {
  const [name, setName] = useState(initialData?.name || '');
  const [params, setParams] = useState<Record<string, any>>(initialData?.params || getDefaultParams(type));
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const updateParam = (key: string, value: any) => setParams((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!name) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          type,
          name: name || 'Untitled',
          params,
          is_active: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus('success');
        onSave(name, params);
        setTimeout(() => { setSaveStatus('idle'); onCancel(); }, 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('Strategy save error:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="dark:bg-bg-input-dark light:bg-bg-input-light rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">{initialData ? 'Edit' : 'New'} {STRATEGY_META.find((m) => m.id === type)?.name}</p>
        <button onClick={onCancel} className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition"><X className="w-4 h-4" /></button>
      </div>
      <div>
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Strategy Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly SPY DCA" className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
      </div>
      {type === 'dca' && <DCAFormFields params={params} onChange={updateParam} />}
      {type === 'rebalance' && <RebalanceFormFields params={params} onChange={updateParam} />}
      {type === 'momentum' && <MomentumFormFields params={params} onChange={updateParam} />}
      {type === 'mean_reversion' && <MeanReversionFormFields params={params} onChange={updateParam} />}

      {saveStatus === 'success' && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm font-bold text-[var(--green)]">
          <Check className="w-4 h-4" /> Strategy saved
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm font-bold text-[var(--red)]">
          <X className="w-4 h-4" /> Failed to save. Try again.
        </div>
      )}
      {saveStatus !== 'success' && (
        <button onClick={handleSave} disabled={!name || saveStatus === 'saving'} className="w-full py-2.5 rounded-lg font-bold text-sm bg-[var(--accent)] text-black hover:bg-[var(--accent)]/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {saveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {initialData ? 'Update Strategy' : 'Save Strategy'}
        </button>
      )}
    </div>
  );
}

function DCAFormFields({ params, onChange }: { params: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Symbol</label>
        <SymbolSearch value={params.symbol || ''} onChange={(s) => onChange('symbol', s)} placeholder="Search symbol..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Amount ($)</label>
          <input type="number" min="1" value={params.amount || 100} onChange={(e) => onChange('amount', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Frequency</label>
          <select value={params.frequency || 'weekly'} onChange={(e) => onChange('frequency', e.target.value)} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Start Date</label>
          <div className="relative">
            <input type="date" value={params.start_date || new Date().toISOString().split('T')[0]} onChange={(e) => onChange('start_date', e.target.value)} className="w-full px-3 py-2 pr-9 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light appearance-none" />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">End Date (optional)</label>
          <div className="relative">
            <input type="date" value={params.end_date || ''} onChange={(e) => onChange('end_date', e.target.value || undefined)} className="w-full px-3 py-2 pr-9 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light appearance-none" />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

function RebalanceFormFields({ params, onChange }: { params: Record<string, any>; onChange: (k: string, v: any) => void }) {
  const allocations: Array<{ symbol: string; weight: number }> = params.allocations || [{ symbol: 'SPY', weight: 0.6 }, { symbol: 'QQQ', weight: 0.3 }, { symbol: 'BND', weight: 0.1 }];
  const totalWeight = allocations.reduce((s, a) => s + a.weight, 0);
  const updateAlloc = (idx: number, patch: Partial<{ symbol: string; weight: number }>) => {
    const next = allocations.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange('allocations', next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light">Target Allocations</label>
        <span className={`text-[11px] font-bold ${Math.abs(totalWeight - 1) < 0.01 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{Math.round(totalWeight * 100)}%</span>
      </div>
      <div className="space-y-2">
        {allocations.map((alloc, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <SymbolSearch value={alloc.symbol} onChange={(s) => updateAlloc(idx, { symbol: s })} placeholder="Symbol" />
            <input type="number" step="0.01" min="0" max="1" value={alloc.weight} onChange={(e) => updateAlloc(idx, { weight: Number(e.target.value) })} className="w-20 px-2 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
            <button onClick={() => onChange('allocations', allocations.filter((_, i) => i !== idx))} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange('allocations', [...allocations, { symbol: '', weight: 0 }])} className="flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium hover:underline"><Plus className="w-3 h-3" /> Add allocation</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Drift Threshold</label>
          <input type="number" step="0.01" min="0" max="1" value={params.threshold || 0.05} onChange={(e) => onChange('threshold', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Mode</label>
          <select value={params.mode || 'full'} onChange={(e) => onChange('mode', e.target.value)} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"><option value="full">Full Rebalance</option><option value="cash-only">Cash Only</option></select>
        </div>
      </div>
    </div>
  );
}

function MomentumFormFields({ params, onChange }: { params: Record<string, any>; onChange: (k: string, v: any) => void }) {
  const universe: string[] = params.universe || ['AAPL','MSFT','GOOGL','AMZN','TSLA','NVDA','META','NFLX'];
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Universe (comma-separated)</label>
        <input type="text" value={universe.join(', ')} placeholder="AAPL, MSFT, GOOGL..." onChange={(e) => onChange('universe', e.target.value.split(/,\s*/).filter(Boolean))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Lookback</label><input type="number" min="1" value={params.lookback_days || 90} onChange={(e) => onChange('lookback_days', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Top N</label><input type="number" min="1" value={params.top_n || 5} onChange={(e) => onChange('top_n', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Bottom N</label><input type="number" min="0" value={params.bottom_n || 3} onChange={(e) => onChange('bottom_n', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
      </div>
    </div>
  );
}

function MeanReversionFormFields({ params, onChange }: { params: Record<string, any>; onChange: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Symbol</label>
        <SymbolSearch value={params.symbol || ''} onChange={(s) => onChange('symbol', s)} placeholder="Search symbol..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Lookback Period</label><input type="number" min="5" value={params.lookback || 20} onChange={(e) => onChange('lookback', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Z-Score Threshold</label><input type="number" step="0.1" min="0.5" value={params.z_score_threshold || 2.0} onChange={(e) => onChange('z_score_threshold', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
      </div>
    </div>
  );
}

function getDefaultParams(type: StrategyType): Record<string, any> {
  switch (type) {
    case 'dca': return { symbol: 'SPY', amount: 100, frequency: 'weekly', start_date: new Date().toISOString().split('T')[0] };
    case 'rebalance': return { allocations: [{symbol:'SPY',weight:0.6},{symbol:'QQQ',weight:0.3},{symbol:'BND',weight:0.1}], threshold: 0.05, mode: 'full' };
    case 'momentum': return { universe: ['AAPL','MSFT','GOOGL','AMZN','TSLA','NVDA','META','NFLX'], lookback_days: 90, top_n: 5, bottom_n: 3 };
    case 'mean_reversion': return { symbol: 'SPY', lookback: 20, z_score_threshold: 2.0 };
    default: return {};
  }
}

/* ── Helpers ─────────────────────────────────────────────────── */

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---/g, '')
    .replace(/^-\s/gm, '')
    .trim();
}

/* ── Helpers ───────────────────────────────────────────────────── */

function fmtUSD(n: number) {
  if (n === undefined || n === null) return '0.00';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(2) + 'k';
  return n.toFixed(2);
}

/* ── Main Component ────────────────────────────────────────────── */

export default function AdvisorStrategiesTab() {
  const [strategies, setStrategies] = useState<DbStrategy[]>([]);
  const [stratLoading, setStratLoading] = useState(true);
  const [stratError, setStratError] = useState<string | null>(null);
  const [portfolioContext, setPortfolioContext] = useState<PortfolioContext | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [riskScore, setRiskScore] = useState<RiskScoreData | null>(null);
  const [riskScoreLoading, setRiskScoreLoading] = useState(true);
  const setStorePortfolioContext = useAdvisorStore((s) => s.setPortfolioContext);
  const userId = getUserId();
  const [chatOpen, setChatOpen] = useState(false);

  // Fetch portfolio context on mount
  useEffect(() => {
    async function loadPortfolio() {
      try {
        setPortfolioLoading(true);
        const [acctRes, posRes, ordRes, marketData] = await Promise.all([
          fetch('/api/account').then((r) => r.json()),
          fetch('/api/positions').then((r) => r.json()),
          fetch('/api/orders?status=filled&limit=3').then((r) => r.json()),
          fetchMarketData(),
        ]);

        const account = acctRes?.account || acctRes || {};
        const positions = Array.isArray(posRes) ? posRes : posRes?.positions || [];
        const orders = ordRes?.orders || ordRes || [];

        console.log('[Advisor] Raw account from API:', JSON.stringify(account, null, 2));

        const totalEquity = Number(account.equity || account.portfolioValue || account.portfolio_value || 0);
        const cash = Number(account.cash || 0);
        let positionsValue = Number(account.long_market_value || account.longMarketValue || 0);
        if (!positionsValue || positionsValue <= 0) {
          positionsValue = totalEquity - cash;
        }

        const context: PortfolioContext = {
          account: {
            total_equity: totalEquity,
            positions_value: positionsValue,
            cash: cash,
            day_pnl: totalEquity - Number(account.lastEquity || account.last_equity || account.last_equity || totalEquity),
            buying_power: Number(account.buyingPower || account.buying_power || 0),
          },
          positions: positions.map((p: any) => ({
            symbol: p.symbol,
            qty: Number(p.qty || p.qty_signed || 0),
            market_value: Number(p.market_value || p.marketValue || 0),
            unrealized_pl: Number(p.unrealized_pl || p.unrealizedPl || 0),
            unrealized_plpc: Number(p.unrealized_plpc || p.unrealizedPlpc || 0),
            current_price: Number(p.current_price || p.currentPrice || p.lastday_price || 0),
          })),
          positions_count: positions.length,
          orders: orders.slice(0, 3),
          market: marketData.market,
          news: marketData.news,
        };

        console.log('[Advisor] Portfolio context:', JSON.stringify(context, null, 2));
        setPortfolioContext(context);
        setStorePortfolioContext(context);
        setAlpacaAccountId(account.id || null);
        
        // Fetch risk score
        setRiskScoreLoading(true);
        try {
          const rsRes = await fetch('/api/risk-score');
          const rsData = await rsRes.json();
          if (rsData.risk_score) {
            setRiskScore(rsData.risk_score);
          }
        } catch (err: any) {
          console.warn('[Advisor] Risk score fetch failed:', err.message);
        } finally {
          setRiskScoreLoading(false);
        }
      } catch (err) {
        console.error('Portfolio context load error:', err);
      } finally {
        setPortfolioLoading(false);
      }
    }
    loadPortfolio();
  }, [setStorePortfolioContext]);

  // Load strategies
  const loadStrategies = useCallback(async () => {
    try {
      setStratLoading(true);
      const data = await fetchStrategies(userId);
      setStrategies(data);
      setStratError(null);
    } catch (err: any) {
      console.error('Failed to load strategies:', err);
      setStratError(err.message || 'Failed to load strategies');
    } finally {
      setStratLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  const handleSave = async (type: StrategyType, name: string, params: Record<string, any>) => {
    try { await createStrategy(userId, { type, name, params, is_active: true }); await loadStrategies(); }
    catch (err: any) { setStratError(err.message || 'Failed to save strategy'); }
  };
  const handleUpdate = async (id: string, patch: Partial<DbStrategy>) => {
    try { await updateStrategy(id, userId, patch); await loadStrategies(); }
    catch (err: any) { setStratError(err.message || 'Failed to update strategy'); }
  };
  const handleDelete = async (id: string) => {
    try { await deleteStrategy(id, userId); await loadStrategies(); }
    catch (err: any) { setStratError(err.message || 'Failed to delete strategy'); }
  };

  const handleAnalyzeDip = (symbol: string, prompt: string) => {
    // Dispatch event that AIChatPanel listens for
    window.dispatchEvent(
      new CustomEvent('ai-analyze-position', { detail: { prompt } })
    );
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Section A½ — Risk Score */}
      <RiskScoreWidget data={riskScore} loading={riskScoreLoading} />

      {/* Section A⅝ — Sell Signals */}
      <SellSignals portfolioContext={portfolioContext} onAnalyze={handleAnalyzeDip} />

      {/* Section A⅔ — Buy Opportunities */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-text-primary-dark light:text-text-primary-light">
          📊 Buy Opportunities
        </h3>
        <MorningRecommendationsList />
      </section>

      {/* Section A¾ — Opportunity Scanner */}
      <MarketScanner onAnalyze={handleAnalyzeDip} />

      {/* Floating Chat Button + Modal */}
      <ChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} alpacaAccountId={alpacaAccountId} />
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-28 right-4 w-12 h-12 rounded-full bg-[var(--accent)] dark:bg-accent-primary-dark light:bg-accent-primary-light flex items-center justify-center shadow-lg hover:scale-110 transition z-40"
        title="AI Advisor"
      >
        <BrainCircuit size={22} />
      </button>

      {/* Section D — Strategies */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent)]" /> Strategies
          </h3>
          <span className="text-[11px] text-[var(--text-muted)]">{strategies.filter((s) => s.is_active).length} active</span>
        </div>
        {stratError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">{stratError}</div>}
        {stratLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--hover-bg)]" />
                  <div className="flex-1 space-y-2"><div className="h-3 bg-[var(--hover-bg)] rounded w-32" /><div className="h-2 bg-[var(--hover-bg)] rounded w-48" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          STRATEGY_META.map((meta) => (
            <InlineStrategyCard key={meta.id} meta={meta} onSave={handleSave} onUpdate={handleUpdate} onDelete={handleDelete} userId={userId} />
          ))
        )}
      </div>

    </div>
  );
}