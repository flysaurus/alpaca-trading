'use client';
import { fetchApi } from '@/lib/api-helper';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Brain,
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
import ChatCard from '@/components/ChatCard';
import { useChatStore } from '@/stores/chat';
import { useAdvisorStore } from '@/stores/advisorStore';
import { getSupabaseUserId } from '@/lib/auth';
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
      fetchApi('/api/indices').then((r) => r.json()),
      fetchApi('/api/market').then((r) => r.json()),
      fetchApi('/api/news?limit=5').then((r) => r.json()),
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
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-4">
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
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-4">
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
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] overflow-hidden">
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
      className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] overflow-hidden cursor-pointer transition hover:dark:border-[#475569] light:hover:border-[#cbd5e1]"
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
          <div className="mt-3 pt-3 border-t dark:border-[#334155] light:border-[#e2e8f0] space-y-2">
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
  signal_type: string;
  confidence: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  current_price: number;
  metadata?: Record<string, unknown>;
}

function SellSignals({ portfolioContext, onAnalyze }: { portfolioContext: PortfolioContext | null; onAnalyze: (symbol: string, prompt: string) => void }) {
  const [signals, setSignals] = useState<SellSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [sellTicket, setSellTicket] = useState<string | null>(null);
  const [sellType, setSellType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [sellQty, setSellQty] = useState<number>(0);
  const [sellLimitPrice, setSellLimitPrice] = useState<number>(0);
  const [sellStopPrice, setSellStopPrice] = useState<number>(0);
  const [sellTimeInForce, setSellTimeInForce] = useState<'day' | 'gtc' | 'ioc'>('day');
  const [sellSubmitting, setSellSubmitting] = useState(false);

  useEffect(() => {
    if (!portfolioContext?.positions?.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSellSignals() {
      setLoading(true);
      try {
        const { analyzeAllPositions } = await import('@/lib/sellSignals');
        const positions = portfolioContext!.positions.map((pos) => ({
          symbol: pos.symbol,
          current_price: pos.current_price,
          avg_entry_price: pos.market_value / Math.max(pos.qty, 1),
          qty: pos.qty,
          market_value: pos.market_value,
          unrealized_pl: pos.unrealized_pl,
          unrealized_plpc: pos.unrealized_plpc,
          total_equity: portfolioContext!.account.total_equity,
        }));

        const allSignals = await analyzeAllPositions(positions);
        if (cancelled) return;

        // Attach qty to each signal from positions
        const qtyMap = new Map(portfolioContext!.positions.map(p => [p.symbol, p.qty]));
        for (const sig of allSignals) {
          (sig as any)._qty = qtyMap.get(sig.symbol) || 1;
        }

        // Merge with LLM recommendation (keep LLM sell if also technically triggered)
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
              const res = await fetchApi(`/api/positions/recommendation?${params}`);
              const data = await res.json();
              if (data.action === 'sell') {
                return {
                  symbol: pos.symbol,
                  signal_type: 'AI_ADVISOR',
                  confidence: data.confidence || 5,
                  priority: 'MEDIUM' as const,
                  reason: data.reasoning || `AI recommends selling ${pos.symbol} at ${data.target_price ? '$'+data.target_price : 'market'}`,
                  current_price: pos.current_price,
                  metadata: { target_price: data.target_price, reasoning: data.reasoning },
                } as SellSignal;
              }
              return null;
            } catch {
              return null;
            }
          })
        );

        const aiSignals = results.filter((s): s is SellSignal => s !== null);

        // Combine technical + AI signals, deduplicate by symbol+type
        const signalMap = new Map<string, SellSignal>();
        for (const s of [...allSignals, ...aiSignals]) {
          const key = `${s.symbol}-${s.signal_type}`;
          if (!signalMap.has(key)) signalMap.set(key, s);
        }

        const merged = Array.from(signalMap.values());
        merged.sort((a, b) => {
          const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
          if (pDiff !== 0) return pDiff;
          return b.confidence - a.confidence;
        });

        setSignals(merged);
      } catch (err) {
        console.error('[SellSignals] Fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSellSignals();
    return () => { cancelled = true; };
  }, [portfolioContext]);

  // ── Sell order handlers ──────────────────────────────────────
  const handleSellClick = (s: SellSignal) => {
    const qty = (s as any)._qty || 1;
    setSellTicket(`${s.symbol}-${s.signal_type}`);
    setSellType('market');
    setSellQty(qty);
    setSellLimitPrice(s.current_price);
    setSellStopPrice(Number((s.current_price * 0.97).toFixed(2)));
    setSellTimeInForce('day');
  };

  const handleConfirmSell = async (s: SellSignal) => {
    if (!sellQty || sellQty <= 0) {
      alert('Please enter a valid share quantity.');
      return;
    }
    setSellSubmitting(true);
    try {
      const orderPayload = {
        symbol: s.symbol,
        side: 'sell',
        type: sellType.toLowerCase(),
        qty: Number(sellQty),
        estimatedPrice: sellLimitPrice || s.current_price,
        timeInForce: sellTimeInForce.toLowerCase(),
        ...(sellLimitPrice && sellType !== 'market' ? { limitPrice: Number(sellLimitPrice) } : {}),
        ...(sellStopPrice && (sellType === 'stop' || sellType === 'stop_limit') ? { stopPrice: Number(sellStopPrice) } : {}),
      };
      console.log('Sell order payload:', JSON.stringify(orderPayload));
      const res = await fetchApi('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      if (!res.ok) throw new Error(`Order failed: ${res.status}`);
      alert(`${s.symbol} sell order placed successfully`);
      setSellTicket(null);
      setDismissed((prev) => new Set([...prev, `${s.symbol}-${s.signal_type}`]));
    } catch (err: any) {
      alert(`Failed to place sell order: ${err.message}`);
    } finally {
      setSellSubmitting(false);
    }
  };

  const handleCancelSell = () => {
    setSellTicket(null);
  };

  const visibleSignals = signals.filter((s) => !dismissed.has(`${s.symbol}-${s.signal_type}`));

  // Loading skeleton
  if (loading) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded w-28 animate-pulse" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] p-3 animate-pulse">
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

      {visibleSignals.map((s) => {
        const signalColors: Record<string, string> = {
          TRAILING_STOP_HIT: 'border-l-red-500 bg-red-500/5',
          RSI_OVERBOUGHT: 'border-l-amber-500 bg-amber-500/5',
          MOMENTUM_DEATH_CROSS: 'border-l-red-400 bg-red-400/5',
          POSITION_SIZE_DRIFT: 'border-l-orange-500 bg-orange-500/5',
          TAKE_PROFIT_TARGET: 'border-l-green-500 bg-green-500/5',
          EARNINGS_RISK: 'border-l-violet-500 bg-violet-500/5',
          AI_ADVISOR: 'border-l-indigo-500 bg-indigo-500/5',
        };
        const borderColorClass = signalColors[s.signal_type] || 'border-l-gray-500 bg-gray-500/5';
        const priorityBadge = s.priority === 'HIGH'
          ? 'dark:bg-red-500/20 light:bg-red-500/10 dark:text-red-400 light:text-red-600'
          : s.priority === 'MEDIUM'
            ? 'dark:bg-amber-500/20 light:bg-amber-500/10 dark:text-amber-400 light:text-amber-600'
            : 'dark:bg-gray-500/20 light:bg-gray-500/10 dark:text-gray-400 light:text-gray-600';

        return (
        <div
          key={`${s.symbol}-${s.signal_type}`}
          className={`dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-4 space-y-2 border-l-[3px] ${borderColorClass}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${priorityBadge}`}>
                {s.signal_type.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
                {s.priority} · confidence {s.confidence}/10
              </span>
            </div>
          </div>

          {/* Symbol */}
          <div className="flex items-center gap-3">
            <span className="text-base font-bold dark:text-[#f9fafb] light:text-[#0f172a]">{s.symbol}</span>
            <span className="font-[family-name:var(--font-mono)] text-sm dark:text-text-primary-dark light:text-text-primary-light">
              ${fmtUSD(s.current_price)}
            </span>
          </div>

          {/* Reason */}
          <p className="text-xs dark:text-text-secondary-dark light:text-text-secondary-light dark:bg-[#1e293b]/50 light:bg-[#f1f5f9] rounded-lg px-3 py-2 italic">
            {s.reason}
          </p>

          {/* Show metadata for key signal types */}
          {s.signal_type === 'TRAILING_STOP_HIT' && s.metadata && (
            <p className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
              Recent high: ${(s.metadata.recent_high as number)?.toFixed(2)} · Drawdown: {(s.metadata.drawdown_pct as number)?.toFixed(1)}%
            </p>
          )}
          {s.signal_type === 'EARNINGS_RISK' && s.metadata && (
            <p className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
              Earnings: {s.metadata.earnings_date as string} ({s.metadata.days_away as number} days)
            </p>
          )}
          {s.signal_type === 'POSITION_SIZE_DRIFT' && s.metadata && (
            <p className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
              {(s.metadata.position_pct as number)?.toFixed(1)}% of portfolio
            </p>
          )}

          {/* Actions */}
          {sellTicket === `${s.symbol}-${s.signal_type}` ? (
            <>
              {/* Inline Sell Order Ticket */}
              <div className="rounded-xl p-3 space-y-3 dark:bg-[rgba(0,0,0,0.25)] light:bg-[rgba(0,0,0,0.04)] border dark:border-[#ef4444]/30 light:border-[#ef4444]/30">
                {/* Order Type */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Order Type</label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['market', 'limit', 'stop', 'stop_limit'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setSellType(t)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${
                          sellType === t
                            ? 'bg-red-600 text-white'
                            : 'dark:bg-bg-hover-dark light:bg-bg-hover-light dark:text-text-secondary-dark light:text-text-secondary-light hover:dark:bg-[#ef4444]/20 hover:text-red-400'
                        }`}
                      >
                        {t.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* QTY */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Shares</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sellQty || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^\d*$/.test(v)) setSellQty(v ? Number(v) : 0);
                    }}
                    className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-red-500/50 light:ring-red-500/50 focus:border-red-500"
                  />
                </div>

                {/* Limit Price */}
                {(sellType === 'limit' || sellType === 'stop_limit') && (
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Limit Price $</label>
                    <input
                      type="number"
                      step="0.01"
                      value={sellLimitPrice}
                      onChange={(e) => setSellLimitPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-red-500/50 light:ring-red-500/50 focus:border-red-500"
                    />
                  </div>
                )}

                {/* Stop Price */}
                {(sellType === 'stop' || sellType === 'stop_limit') && (
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Stop Price $</label>
                    <input
                      type="number"
                      step="0.01"
                      value={sellStopPrice}
                      onChange={(e) => setSellStopPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-red-500/50 light:ring-red-500/50 focus:border-red-500"
                    />
                  </div>
                )}

                {/* Estimated Value */}
                <p className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
                  Est. value: ${((sellType === 'limit' && sellLimitPrice > 0 ? sellLimitPrice : s.current_price) * sellQty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>

                {/* Confirm / Cancel */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirmSell(s)}
                    disabled={sellSubmitting}
                    className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[11px] font-bold hover:bg-red-500 transition disabled:opacity-50"
                  >
                    {sellSubmitting ? 'Submitting…' : 'Confirm Sell'}
                  </button>
                  <button
                    onClick={handleCancelSell}
                    className="px-3 py-2 rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-medium hover:dark:bg-bg-hover-dark hover:light:bg-bg-hover-light transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleSellClick(s)}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[11px] font-bold hover:bg-red-500 transition"
              >
                {s.signal_type === 'TAKE_PROFIT_TARGET' ? 'Take Profit' : 'Sell'}
              </button>
              <button
                onClick={() => {
                  const prompt = `Analyze my ${s.symbol} position at $${s.current_price.toFixed(2)}. Signal: ${s.signal_type.replace(/_/g, ' ')}. ${s.reason}. Should I act on this signal?`;
                  onAnalyze(s.symbol, prompt);
                }}
                className="flex-1 py-2 rounded-xl border dark:border-[#0d9488]/40 light:border-[#0d9488]/40 dark:text-[#0d9488] light:text-[#0d9488] text-[11px] font-bold hover:dark:bg-[#0d9488]/10 hover:light:bg-[#0d9488]/5 transition"
              >
                Analyze
              </button>
              <button
                onClick={() => setDismissed((prev) => new Set([...prev, `${s.symbol}-${s.signal_type}`]))}
                className="px-3 py-2 rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-medium hover:dark:bg-bg-hover-dark hover:light:bg-bg-hover-light transition"
              >
                Hold
              </button>
            </div>
          )}
        </div>
      )})}
    </div>
  );
}

/* ── Opportunity Scanner ────────────────────────────────────────── */

interface EnrichedDipCandidate {
  symbol: string;
  score: number;
  grade: string;
  change_pct: number;
  current_price: number;
  volume_ratio: number;
  rsi: number | null;
  rsi_7?: number | null;
  rsi_14?: number | null;
  rsi_28?: number | null;
  safe_to_buy?: boolean;
  suggested_entry?: number;
  suggested_stop?: number;
  suggested_amount?: number;
  stop_loss_pct?: number;
  atr?: number | null;
  earnings_days_away?: number | null;
  sma_proximity?: {
    sma20_near?: boolean;
    sma50_near?: boolean;
    sma200_near?: boolean;
    week52_low_near?: boolean;
  };
  sma_score?: number;
  earnings_score?: number;
  news_reason?: {
    reason?: string;
    recovery_probability?: string;
    one_line_summary?: string;
    red_flags?: string[];
  };
}

function MarketScanner({ onAnalyze }: { onAnalyze: (symbol: string, prompt: string) => void }) {
  const [candidates, setCandidates] = useState<EnrichedDipCandidate[]>([]);
  const [historyGroups, setHistoryGroups] = useState<Array<{
    date: string;
    candidates: Array<{
      symbol: string;
      score: number;
      action: string;
      price_at_rec: number;
      change_pct_at_rec: number;
      suggested_amount: number;
      time_slot: string;
      user_action: string;
      safe_to_buy: boolean;
    }>;
  }>>([]);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marketLabel, setMarketLabel] = useState('Unknown');
  const [executing, setExecuting] = useState<string | null>(null);
  const [orderTicket, setOrderTicket] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [orderQty, setOrderQty] = useState<number>(0);
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [stopPrice, setStopPrice] = useState<number>(0);
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc' | 'ioc'>('day');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [backtestStats, setBacktestStats] = useState<{
    hit_rate: number;
    total_signals: number;
    profitable_signals: number;
    avg_return_7d: number | null;
    avg_return_30d: number | null;
  } | null>(null);

  const [userId, setUserId] = useState<string>('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { getSupabaseUserId().then((id) => { if (id) setUserId(id); }); }, []);

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
        .eq('user_id', userId)
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

      const [marketRes] = await Promise.all([
        fetchApi('/api/market').then((r) => r.json()).catch(() => ({})),
      ]);

      setMarketLabel(marketRes?.marketState?.label || 'Unknown');
      setIsMarketOpen(marketRes?.isOpen || false);

      // Always fetch history (5 days)
      const historyUrl = `/api/dip-scanner?history=5&watchlist=${encodeURIComponent(watchlist)}`;
      const historyRes = await fetchApi(historyUrl);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistoryGroups(historyData.groups || []);
      }

      // If market is open, also fetch live candidates for current date
      if (marketRes?.isOpen) {
        const liveUrl = `/api/dip-scanner?watchlist=${encodeURIComponent(watchlist)}`;
        const liveRes = await fetchApi(liveUrl);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          setCandidates(liveData.candidates || []);
        } else {
          setCandidates([]);
        }
      } else {
        setCandidates([]);
      }
    } catch (err) {
      console.error('[MarketScanner] Load error:', err);
      setCandidates([]);
      setHistoryGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDipScanner();

    // Always refresh periodically (20 min) — shows history during off-hours
    const intervalId = setInterval(() => {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const hour = et.getHours();
      // Refresh every 20 min during market hours, every 2 hours otherwise
      const interval = (hour >= 9 && hour < 16) ? 20 * 60 * 1000 : 120 * 60 * 1000;
      // Check if enough time has passed by storing last fetch time
      // For simplicity, just run at the set interval
    }, 20 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [fetchDipScanner]);

  // Fetch backtest stats
  useEffect(() => {
    async function fetchBacktest() {
      try {
        const res = await fetchApi('/api/scanner/backtest');
        if (res.ok) {
          const data = await res.json();
          setBacktestStats(data);
        }
      } catch (err) {
        console.warn('[MarketScanner] Backtest fetch failed:', err);
      }
    }
    fetchBacktest();
  }, []);

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
      const res = await fetchApi('/api/orders', {
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

  // ── Rendering ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-[#6366f1]" />
          <div>
            <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Opportunity Scanner</h3>
            <p className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Loading scan history…</p>
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-4 animate-pulse"
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

  const hasLiveCandidates = candidates.length > 0;
  const hasHistory = historyGroups.length > 0;

  if (!hasLiveCandidates && !hasHistory) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-6 text-center">
        <div className="flex items-center gap-2 mb-3 justify-center">
          <Search className="w-4 h-4 text-[#6366f1]" />
          <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Opportunity Scanner</h3>
        </div>
        <p className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light mb-2">
          Scans at 6am, 9am, 12pm &amp; 3pm ET
        </p>
        <p className="text-sm dark:text-text-secondary-dark light:text-text-secondary-light">
          No signals yet. Check back after the next scan.
        </p>
      </div>
    );
  }

  // Format date for headers
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

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
        {backtestStats && backtestStats.total_signals > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
              {backtestStats.total_signals} tracked
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${backtestStats.hit_rate >= 0.7 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : backtestStats.hit_rate >= 0.5 ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'text-red-600 dark:text-red-400 bg-red-500/10'}`}>
              {Math.round(backtestStats.hit_rate * 100)}% win
            </span>
            {backtestStats.avg_return_7d != null && (
              <span className={`text-[10px] font-medium ${backtestStats.avg_return_7d > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {backtestStats.avg_return_7d > 0 ? '+' : ''}{backtestStats.avg_return_7d.toFixed(1)}% avg
              </span>
            )}
          </div>
        )}
      </div>

      {candidates.map((c) => (
        <div
          key={c.symbol}
          className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] overflow-hidden transition hover:dark:border-[#475569] light:hover:border-[#cbd5e1]"
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

            <div className="flex items-center gap-3 mt-1 text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light flex-wrap">
              <span>RSI: {c.rsi != null ? c.rsi.toFixed(1) : 'N/A'} <span className="opacity-60">(7: {c.rsi_7?.toFixed(1) ?? '?'} / 14: {c.rsi_14?.toFixed(1) ?? '?'} / 28: {c.rsi_28?.toFixed(1) ?? '?'})</span></span>
              <span>Vol: {c.volume_ratio.toFixed(1)}x</span>
            </div>
            {c.sma_proximity && (
              <div className="flex items-center gap-2 mt-1.5 text-[10px] flex-wrap">
                {c.sma_proximity.sma50_near && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    Near 50-day SMA
                  </span>
                )}
                {c.sma_proximity.sma200_near && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                    Near 200-day SMA
                  </span>
                )}
                {c.sma_proximity.sma20_near && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                    Near 20-day SMA
                  </span>
                )}
                {c.sma_proximity.week52_low_near && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">
                    Near 52wk Low
                  </span>
                )}
              </div>
            )}
            {c.atr != null && (
              <div className="flex items-center gap-3 mt-1 text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
                <span>ATR: ${c.atr.toFixed(2)}</span>
                <span>Stop: ${c.suggested_stop?.toFixed(2)} (-{c.stop_loss_pct?.toFixed(1)}%)</span>
                <span>Size: ${c.suggested_amount?.toLocaleString()}</span>
              </div>
            )}
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
                      className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                    />
                  </div>

                  {/* ORDER TYPE */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Order Type</label>
                    <div className="flex rounded-lg overflow-hidden border dark:border-[#334155] light:border-[#e2e8f0]">
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
                        className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
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
                        className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                      />
                    </div>
                  )}

                  {/* TIME IN FORCE */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Time in Force</label>
                    <div className="flex rounded-lg overflow-hidden border dark:border-[#334155] light:border-[#e2e8f0]">
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
                    <div className="px-3 py-2 text-sm dark:bg-bg-hover-dark light:bg-bg-hover-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light font-mono">
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
                  className="px-4 py-2 rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-bold hover:dark:bg-bg-hover-dark light:bg-bg-hover-light transition disabled:opacity-40"
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
                className="px-3 py-2 rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-bold hover:dark:bg-bg-hover-dark light:bg-bg-hover-light transition"
              >
                Skip
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ── Scan History ────────────────────────────────────── */}
      {historyGroups.length > 0 && (
        <>
          {historyGroups.map((group) => {
            const timeSlotsLabel = group.candidates.length > 0
              ? group.candidates[0].time_slot || ''
              : '';
            const totalSlots = new Set(group.candidates.map(c => c.time_slot)).size;
            const slotLabel = totalSlots > 1 ? `${totalSlots} scans` : timeSlotsLabel;

            return (
              <div key={group.date} className="space-y-2">
                {/* Date header */}
                <div className="flex items-center gap-2 pt-4 pb-1">
                  <span className="text-xs font-bold dark:text-text-secondary-dark light:text-text-secondary-light">
                    {formatDate(group.date)}
                  </span>
                  <span className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light bg-[#6366f1]/5 px-2 py-0.5 rounded-full">
                    {slotLabel}
                  </span>
                  <span className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light">
                    {group.candidates.length} signal{group.candidates.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Compact history cards */}
                {group.candidates.map((c) => (
                  <div
                    key={`${group.date}-${c.symbol}-${c.time_slot}`}
                    className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] px-3 py-2 flex items-center justify-between gap-3 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {c.time_slot && (
                        <span className="text-[10px] dark:text-text-muted-dark light:text-text-muted-light bg-[#6366f1]/5 px-1.5 py-0.5 rounded shrink-0">
                          {c.time_slot}
                        </span>
                      )}
                      <span className="font-semibold dark:text-text-primary-dark light:text-text-primary-light truncate">
                        {c.symbol}
                      </span>
                      <span className="text-[10px] font-mono dark:text-text-tertiary-dark light:text-text-tertiary-light">
                        ${c.price_at_rec?.toFixed(2)}
                      </span>
                      <span className={`font-mono ${c.change_pct_at_rec < 0 ? 'dark:text-accent-danger-dark light:text-accent-danger-light' : 'dark:text-accent-success-dark light:text-accent-success-light'}`}>
                        {c.change_pct_at_rec > 0 ? '+' : ''}{c.change_pct_at_rec?.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.score >= 85 ? 'bg-emerald-500/10 text-emerald-500' : c.score >= 70 ? 'bg-amber-500/10 text-amber-500' : 'bg-gray-500/10 dark:text-gray-400 light:text-gray-500'}`}>
                        {c.score}
                      </span>
                      <span className={`text-[10px] font-medium ${c.action === 'buy' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {c.action?.toUpperCase()}
                      </span>
                      {c.user_action === 'executed' && (
                        <span className="text-[10px] text-emerald-500">✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
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
        const res = await fetchApi(`/api/strategies?user_id=${userId}`);
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
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] overflow-hidden transition-all">
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
                <div key={i} className="dark:bg-bg-input-dark light:bg-bg-input-light rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] p-3 animate-pulse">
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
      const res = await fetchApi('/api/strategies', {
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
    <div className="dark:bg-bg-input-dark light:bg-bg-input-light rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">{initialData ? 'Edit' : 'New'} {STRATEGY_META.find((m) => m.id === type)?.name}</p>
        <button onClick={onCancel} className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition"><X className="w-4 h-4" /></button>
      </div>
      <div>
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Strategy Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly SPY DCA" className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
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
          <input type="number" min="1" value={params.amount || 100} onChange={(e) => onChange('amount', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Frequency</label>
          <select value={params.frequency || 'weekly'} onChange={(e) => onChange('frequency', e.target.value)} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Start Date</label>
          <div className="relative">
            <input type="date" value={params.start_date || new Date().toISOString().split('T')[0]} onChange={(e) => onChange('start_date', e.target.value)} className="w-full px-3 py-2 pr-9 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light appearance-none" />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">End Date (optional)</label>
          <div className="relative">
            <input type="date" value={params.end_date || ''} onChange={(e) => onChange('end_date', e.target.value || undefined)} className="w-full px-3 py-2 pr-9 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light appearance-none" />
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
            <input type="number" step="0.01" min="0" max="1" value={alloc.weight} onChange={(e) => updateAlloc(idx, { weight: Number(e.target.value) })} className="w-20 px-2 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
            <button onClick={() => onChange('allocations', allocations.filter((_, i) => i !== idx))} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange('allocations', [...allocations, { symbol: '', weight: 0 }])} className="flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium hover:underline"><Plus className="w-3 h-3" /> Add allocation</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Drift Threshold</label>
          <input type="number" step="0.01" min="0" max="1" value={params.threshold || 0.05} onChange={(e) => onChange('threshold', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Mode</label>
          <select value={params.mode || 'full'} onChange={(e) => onChange('mode', e.target.value)} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"><option value="full">Full Rebalance</option><option value="cash-only">Cash Only</option></select>
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
        <input type="text" value={universe.join(', ')} placeholder="AAPL, MSFT, GOOGL..." onChange={(e) => onChange('universe', e.target.value.split(/,\s*/).filter(Boolean))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Lookback</label><input type="number" min="1" value={params.lookback_days || 90} onChange={(e) => onChange('lookback_days', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Top N</label><input type="number" min="1" value={params.top_n || 5} onChange={(e) => onChange('top_n', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Bottom N</label><input type="number" min="0" value={params.bottom_n || 3} onChange={(e) => onChange('bottom_n', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
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
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Lookback Period</label><input type="number" min="5" value={params.lookback || 20} onChange={(e) => onChange('lookback', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Z-Score Threshold</label><input type="number" step="0.1" min="0.5" value={params.z_score_threshold || 2.0} onChange={(e) => onChange('z_score_threshold', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
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
  const [userId, setUserId] = useState<string>('');
  const [chatExpanded, setChatExpanded] = useState(false);

  // Resolve real Supabase Auth user ID
  useEffect(() => {
    getSupabaseUserId().then((id) => {
      if (id) setUserId(id);
    });
  }, []);

  // Fetch portfolio context on mount
  useEffect(() => {
    async function loadPortfolio() {
      try {
        setPortfolioLoading(true);
        const [acctRes, posRes, ordRes, marketData] = await Promise.all([
          fetchApi('/api/account').then((r) => r.json()),
          fetchApi('/api/positions').then((r) => r.json()),
          fetchApi('/api/orders?status=filled&limit=3').then((r) => r.json()),
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
          const rsRes = await fetchApi('/api/risk-score');
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
    useChatStore.getState().setPendingMessage(prompt);
    setChatExpanded(true);
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

      {/* Inline Chat Card */}
      <div className="pt-4">
        <ChatCard isExpanded={chatExpanded} setExpanded={setChatExpanded} alpacaAccountId={alpacaAccountId} />
      </div>

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
              <div key={i} className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-4 animate-pulse">
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