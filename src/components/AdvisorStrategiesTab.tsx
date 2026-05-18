'use client';

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
  History,
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
import { useAdvisorStore } from '@/stores/advisorStore';
import {
  type DbStrategy,
  type DbAccountSnapshot,
  type DbAiSuggestion,
  type DbTradeHistory,
  fetchStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  fetchSnapshots,
  fetchAiSuggestions,
  fetchTradeHistory,
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
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light p-4">
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
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light p-4">
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
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light overflow-hidden">
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
      className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light overflow-hidden cursor-pointer transition hover:dark:border-border-mid-dark hover:light:border-border-mid-light"
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
          <div className="mt-3 pt-3 border-t dark:border-border-light-dark light:border-border-light-light space-y-2">
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

/* ── Market Scanner ────────────────────────────────────────────── */

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
  console.log('Market Scanner colors applied');
  console.log('Order ticket colors applied');
  console.log('History card colors applied');
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
            <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Market Scanner</h3>
            <p className="text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Quality dips updated every 10 min</p>
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light p-4 animate-pulse"
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
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light p-6 text-center">
        <div className="flex items-center gap-2 mb-3 justify-center">
          <Search className="w-4 h-4 text-[#6366f1]" />
          <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Market Scanner</h3>
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
            <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">Market Scanner</h3>
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
          className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light overflow-hidden transition hover:dark:border-border-mid-dark hover:light:border-border-mid-light"
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
                <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
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
                      className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                    />
                  </div>

                  {/* ORDER TYPE */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Order Type</label>
                    <div className="flex rounded-lg overflow-hidden border dark:border-border-light-dark light:border-border-light-light">
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
                        className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
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
                        className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light focus:border-[#6366f1]"
                      />
                    </div>
                  )}

                  {/* TIME IN FORCE */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">Time in Force</label>
                    <div className="flex rounded-lg overflow-hidden border dark:border-border-light-dark light:border-border-light-light">
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
                    <div className="px-3 py-2 text-sm dark:bg-bg-hover-dark light:bg-bg-hover-light border dark:border-border-light-dark light:border-border-light-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light font-mono">
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
                  className="px-4 py-2 rounded-xl border dark:border-border-light-dark light:border-border-light-light dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-bold hover:dark:bg-bg-hover-dark light:bg-bg-hover-light transition disabled:opacity-40"
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
                className="flex-1 py-2 rounded-xl bg-[#6366f1] dark:text-text-primary-dark light:text-text-primary-light text-[11px] font-bold hover:bg-[#5558e0] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <DollarSign className="w-3 h-3" />
                Execute {Math.max(1, Math.floor((c.suggested_amount || 500) / c.current_price))} share(s) ~${c.suggested_amount || 500}
              </button>
              <button
                onClick={() => handleAnalyze(c)}
                className="px-4 py-2 rounded-xl border border-[#6366f1]/40 text-[#6366f1] text-[11px] font-bold hover:bg-[#6366f1]/10 transition"
              >
                Analyze
              </button>
              <button
                onClick={() => handleSkip(c.symbol)}
                className="px-3 py-2 rounded-xl border dark:border-border-light-dark light:border-border-light-light dark:text-text-tertiary-dark light:text-text-tertiary-light text-[11px] font-bold hover:dark:bg-bg-hover-dark light:bg-bg-hover-light transition"
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

/* ── Section B — AI Chat Panel ─────────────────────────────────── */

function AIChatPanel({ alpacaAccountId }: { alpacaAccountId: string | null }) {
  const messages = useAdvisorStore((s) => s.messages);
  const setMessages = useAdvisorStore((s) => s.setMessages);
  const addMessage = useAdvisorStore((s) => s.addMessage);
  const updateMessage = useAdvisorStore((s) => s.updateMessage);
  const isLoading = useAdvisorStore((s) => s.isLoading);
  const setIsLoading = useAdvisorStore((s) => s.setIsLoading);
  const portfolioContext = useAdvisorStore((s) => s.portfolioContext);
  const historyLoaded = useAdvisorStore((s) => s.historyLoaded);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userId = getUserId();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Listen for position analysis requests from Positions tab
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const prompt = e.detail?.prompt;
      if (!prompt) return;
      
      // Clear welcome if it's the only message
      const currentMessages = useAdvisorStore.getState().messages;
      if (currentMessages.length === 1 && currentMessages[0].id === 'welcome') {
        setMessages([]);
      }
      
      sendMessage(prompt);
    };
    window.addEventListener('ai-analyze-position', handler as EventListener);
    return () => window.removeEventListener('ai-analyze-position', handler as EventListener);
  }, []);

  // Load cross-session history on first mount
  useEffect(() => {
    if (historyLoaded) return;

    async function loadHistory() {
      try {
        const suggestions = await fetchAiSuggestions(userId, 10);
        if (suggestions.length === 0) {
          useAdvisorStore.getState().setHistoryLoaded(true);
          return;
        }

        // Reverse so oldest is first
        const reversed = [...suggestions].reverse();
        const historyMessages = reversed.flatMap((s) => [
          {
            id: `h-prompt-${s.id}`,
            role: 'user' as const,
            content: s.prompt,
            timestamp: new Date(s.created_at),
            fromHistory: true,
          },
          {
            id: `h-resp-${s.id}`,
            role: 'ai' as const,
            content: s.response,
            timestamp: new Date(s.created_at),
            fromHistory: true,
          },
        ]);

        setMessages((prev) => {
          // Keep welcome message, then history, then any new messages
          const welcome = prev.find((m) => m.id === 'welcome');
          const newMsgs = prev.filter((m) => m.id !== 'welcome' && !m.fromHistory);
          return [welcome || prev[0], ...historyMessages, ...newMsgs];
        });
      } catch (err) {
        console.error('[Advisor] Failed to load history:', err);
      } finally {
        useAdvisorStore.getState().setHistoryLoaded(true);
      }
    }

    loadHistory();
  }, [historyLoaded, userId, setMessages]);

  const saveToSupabase = async (prompt: string, response: string) => {
    if (!alpacaAccountId) return;
    try {
      await createAiSuggestion({
        user_id: userId,
        prompt,
        response,
        context: portfolioContext || {},
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Advisor] Failed to save to Supabase:', err);
    }
  };

  const handleChipClick = (chipText: string) => {
    // If only welcome message exists, clear it before sending chip prompt
    const currentMessages = useAdvisorStore.getState().messages;
    if (currentMessages.length === 1 && currentMessages[0].id === 'welcome') {
      setMessages([]);
    }
    sendMessage(chipText);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user' as const,
      content: text.trim(),
      timestamp: new Date(),
    };

    addMessage(userMsg);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      // Build conversation history (last 3 exchanges = 6 messages)
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const payload = {
        message: text.trim(),
        portfolioContext: portfolioContext || {},
        conversation_history: history,
      };
      console.log('[Advisor] Sending to LLM:', JSON.stringify(payload, null, 2));

      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Parse SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let aiContent = '';
      const aiId = `a-${Date.now()}`;

      addMessage({ id: aiId, role: 'ai', content: '', timestamp: new Date() });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                aiContent += delta;
                updateMessage(aiId, { content: aiContent });
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }

      // Final update with complete content
      updateMessage(aiId, { content: aiContent });

      // Save to Supabase for cross-session persistence
      await saveToSupabase(text.trim(), aiContent);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out after 90s. Please try again.');
      } else {
        setError(err.message || 'Failed to get response');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'ai',
        content: 'Your portfolio is loaded. Ask me anything about your positions, strategies, or market conditions.',
        timestamp: new Date(),
      },
    ]);
    setShowClearConfirm(false);
  };

  // Find index of first non-history message for divider
  const firstNewIndex = messages.findIndex((m) => !m.fromHistory && m.id !== 'welcome');

  return (
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border-2 border-[#00d4aa] overflow-hidden flex flex-col shadow-[0_4px_24px_rgba(0,212,170,0.08)] dark:shadow-none">
      {/* Top gradient bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-[#00d4aa] to-[#7c6aff] rounded-t-2xl" />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b dark:border-border-light-dark light:border-border-light-light">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#00d4aa]" />
          <h3 className="text-base font-bold text-[#00d4aa] tracking-wider">AI ADVISOR</h3>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="w-3 h-3 text-[var(--accent)] animate-spin" />}
          {showClearConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Clear?</span>
              <button onClick={handleClear} className="px-2 py-0.5 text-[10px] font-bold bg-[var(--red)]/10 text-[var(--red)] rounded hover:bg-[var(--red)]/20 transition">Clear</button>
              <button onClick={() => setShowClearConfirm(false)} className="px-2 py-0.5 text-[10px] font-bold dark:bg-bg-input-dark light:bg-bg-input-light dark:text-text-tertiary-dark light:text-text-tertiary-light rounded dark:hover:bg-bg-hover-dark light:hover:bg-bg-hover-light transition">Cancel</button>
            </div>
          ) : (
            messages.length > 1 && (
              <button onClick={() => setShowClearConfirm(true)} className="text-[10px] text-[#1e3a5f] dark:dark:text-text-tertiary-dark light:text-text-tertiary-light hover:text-[#1e3a5f] dark:hover:dark:text-text-primary-dark light:text-text-primary-light transition px-2 py-0.5 rounded dark:hover:bg-bg-hover-dark light:hover:bg-bg-hover-light">
                Clear
              </button>
            )
          )}
        </div>
      </div>

      {/* Messages — always rendered, dynamic height */}
      {(() => { console.log('[Advisor] messages.length:', messages.length); return null; })()}
      <div ref={scrollRef} className="overflow-y-auto min-h-[120px] max-h-[380px] py-2 px-0 space-y-3 no-scrollbar">
        {messages.filter((m) => m.id !== 'welcome').map((msg, idx) => (
          <div key={msg.id}>
            {/* Divider between history and new messages */}
            {idx === firstNewIndex && firstNewIndex > 0 && (
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px dark:bg-border-light-dark light:bg-border-light-light" />
                <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light whitespace-nowrap">— Previous session —</span>
                <div className="flex-1 h-px dark:bg-border-light-dark light:bg-border-light-light" />
              </div>
            )}
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'border dark:border-border-light-dark light:border-border-light-light dark:bg-bg-hover-dark light:bg-bg-hover-light dark:text-text-primary-dark light:text-text-primary-light rounded-br-md'
                    : 'border dark:border-border-light-dark light:border-border-light-light dark:bg-[#0d9488]/10 light:bg-[#0d9488]/5 dark:text-text-primary-dark light:text-text-primary-light rounded-bl-md prose dark:prose-invert prose-sm max-w-none ai-bubble'
                }`}
              >
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  (() => { console.log('[Advisor] AI raw response:', msg.content); return null; })() || <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-xl font-semibold text-[#00d4aa] mb-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-xl font-semibold text-[#00d4aa] mt-2 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-xl font-semibold text-[#00d4aa] mt-2 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="text-sm !text-[#2563eb] dark:!text-[#60a5fa] leading-relaxed mb-1">{children}</p>,
                      ul: ({ children }) => <ul className="text-sm !text-[#2563eb] dark:!text-[#60a5fa] leading-relaxed pl-4 mb-1">{children}</ul>,
                      li: ({ children }) => <li className="!text-[#2563eb] dark:!text-[#60a5fa] mb-0">{children}</li>,
                      strong: ({ children }) => <strong className="!text-[#000000] dark:!text-white font-bold">{children}</strong>,
                      em: ({ children }) => <em className="!text-[#374151] dark:!text-[#a0b4c8]">{children}</em>,
                      hr: () => <hr className="border-t border-[#e5e7eb] dark:border-[#1a2a45] my-1.5" />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="card border dark:border-border-light-dark light:border-border-light-light rounded-2xl rounded-bl-md px-3 py-2 dark:text-text-primary-dark light:text-text-primary-light">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2 text-[11px] text-red-400 text-center">
            {error}
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div className="px-3 py-1.5 border-t dark:border-border-light-dark light:border-border-light-light">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            "Latest brief",
            "Summarize my portfolio",
            "What's my biggest risk?",
            "Review my strategies",
          ].map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              disabled={isLoading}
              className="flex-shrink-0 px-2.5 py-1 text-[11px] font-bold dark:bg-bg-input-dark light:bg-bg-input-light border border-[#1e3a5f] dark:border-[#00d4aa]/40 rounded-full text-[#1e3a5f] dark:text-[#00d4aa] hover:text-[#1e3a5f] dark:hover:text-[#00d4aa] hover:border-[#1e3a5f] dark:hover:border-[#00d4aa] transition whitespace-nowrap"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-3 py-1.5 border-t dark:border-border-light-dark light:border-border-light-light">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your advisor..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-xs dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-light-dark light:border-border-light-light rounded-xl dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-xl bg-[var(--accent)] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent)]/90 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
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
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light overflow-hidden transition-all">
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
                <div key={i} className="dark:bg-bg-input-dark light:bg-bg-input-light rounded-xl border dark:border-border-mid-dark light:border-border-mid-light p-3 animate-pulse">
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
    <div className="dark:bg-bg-input-dark light:bg-bg-input-light rounded-xl border dark:border-border-mid-dark light:border-border-mid-light p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">{initialData ? 'Edit' : 'New'} {STRATEGY_META.find((m) => m.id === type)?.name}</p>
        <button onClick={onCancel} className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition"><X className="w-4 h-4" /></button>
      </div>
      <div>
        <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Strategy Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly SPY DCA" className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
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
          <input type="number" min="1" value={params.amount || 100} onChange={(e) => onChange('amount', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Frequency</label>
          <select value={params.frequency || 'weekly'} onChange={(e) => onChange('frequency', e.target.value)} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Start Date</label>
          <div className="relative">
            <input type="date" value={params.start_date || new Date().toISOString().split('T')[0]} onChange={(e) => onChange('start_date', e.target.value)} className="w-full px-3 py-2 pr-9 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light appearance-none" />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">End Date (optional)</label>
          <div className="relative">
            <input type="date" value={params.end_date || ''} onChange={(e) => onChange('end_date', e.target.value || undefined)} className="w-full px-3 py-2 pr-9 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light appearance-none" />
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
            <input type="number" step="0.01" min="0" max="1" value={alloc.weight} onChange={(e) => updateAlloc(idx, { weight: Number(e.target.value) })} className="w-20 px-2 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
            <button onClick={() => onChange('allocations', allocations.filter((_, i) => i !== idx))} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange('allocations', [...allocations, { symbol: '', weight: 0 }])} className="flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium hover:underline"><Plus className="w-3 h-3" /> Add allocation</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Drift Threshold</label>
          <input type="number" step="0.01" min="0" max="1" value={params.threshold || 0.05} onChange={(e) => onChange('threshold', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
        </div>
        <div>
          <label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Mode</label>
          <select value={params.mode || 'full'} onChange={(e) => onChange('mode', e.target.value)} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"><option value="full">Full Rebalance</option><option value="cash-only">Cash Only</option></select>
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
        <input type="text" value={universe.join(', ')} placeholder="AAPL, MSFT, GOOGL..." onChange={(e) => onChange('universe', e.target.value.split(/,\s*/).filter(Boolean))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Lookback</label><input type="number" min="1" value={params.lookback_days || 90} onChange={(e) => onChange('lookback_days', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Top N</label><input type="number" min="1" value={params.top_n || 5} onChange={(e) => onChange('top_n', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Bottom N</label><input type="number" min="0" value={params.bottom_n || 3} onChange={(e) => onChange('bottom_n', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
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
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Lookback Period</label><input type="number" min="5" value={params.lookback || 20} onChange={(e) => onChange('lookback', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
        <div><label className="text-[11px] font-medium dark:text-text-primary-dark light:text-text-primary-light block mb-1">Z-Score Threshold</label><input type="number" step="0.1" min="0.5" value={params.z_score_threshold || 2.0} onChange={(e) => onChange('z_score_threshold', Number(e.target.value))} className="w-full px-3 py-2 text-sm dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-border-mid-dark light:border-border-mid-light rounded-lg dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" /></div>
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

/* ── Section E — History ───────────────────────────────────────── */

function HistorySection({ userId }: { userId: string }) {
  const [snapshots, setSnapshots] = useState<DbAccountSnapshot[]>([]);
  const [suggestions, setSuggestions] = useState<DbAiSuggestion[]>([]);
  const [trades, setTrades] = useState<DbTradeHistory[]>([]);
  const [tradeFilter, setTradeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeSubtab, setActiveSubtab] = useState<'charts'|'suggestions'|'trades'>('charts');
  const [chartPeriod, setChartPeriod] = useState<'1W'|'1M'|'3M'>('1M');
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [snaps, suggs, trds] = await Promise.all([
          fetchSnapshots(userId, 90), fetchAiSuggestions(userId, 50), fetchTradeHistory(userId, { limit: 100 }),
        ]);
        setSnapshots(snaps); setSuggestions(suggs); setTrades(trds);
      } catch (err) { console.error('History load error:', err); }
      finally { setLoading(false); }
    }
    load();
  }, [userId]);

  // Filter snapshots by selected period
  const filteredSnapshots = useMemo(() => {
    const now = new Date();
    const daysMap = { '1W': 7, '1M': 30, '3M': 90 };
    const cutoff = new Date(now.getTime() - daysMap[chartPeriod] * 24 * 60 * 60 * 1000);
    return snapshots.filter((s) => new Date(s.date) >= cutoff);
  }, [snapshots, chartPeriod]);

  const chartData = filteredSnapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    equity: Number(s.equity),
    dayPnl: Number(s.day_pnl),
  }));

  const filteredTrades = tradeFilter ? trades.filter((t) => t.symbol.toLowerCase().includes(tradeFilter.toLowerCase())) : trades;

  if (loading) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light p-6 text-center">
        <BarChart3 className="w-8 h-8 dark:text-text-tertiary-dark light:text-text-tertiary-light mx-auto mb-2 animate-pulse" />
        <p className="text-sm dark:text-text-tertiary-dark light:text-text-tertiary-light">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b dark:border-border-light-dark light:border-border-light-light">
        <History className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="text-lg font-semibold dark:text-text-primary-dark light:text-text-primary-light">History</h3>
      </div>
      <div className="flex border-b dark:border-border-light-dark light:border-border-light-light">
        {[{id:'charts',label:'Charts'},{id:'suggestions',label:'AI Suggestions'},{id:'trades',label:'Trades'}].map((t) => (
          <button key={t.id} onClick={() => setActiveSubtab(t.id as any)} className={`flex-1 py-2.5 text-[11px] font-semibold transition ${activeSubtab === t.id ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'dark:text-text-tertiary-dark light:text-text-tertiary-light'}`}>{t.label}</button>
        ))}
      </div>
      <div className="p-4">
        {activeSubtab === 'charts' && (
          <div className="space-y-6">
            {/* Period toggle */}
            <div className="flex gap-1">
              {(['1W','1M','3M'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                    chartPeriod === p
                      ? 'bg-[var(--accent)] text-black'
                      : 'dark:bg-bg-hover-dark light:bg-bg-hover-light dark:text-text-tertiary-dark light:text-text-tertiary-light hover:dark:bg-bg-hover-dark light:bg-bg-hover-light'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Equity Chart */}
            {chartData.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium dark:text-text-secondary-dark light:text-text-secondary-light mb-2">Equity</p>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--text-muted)'}} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize:10,fill:'var(--text-muted)'}} tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} width={50} />
                      <Tooltip
                        contentStyle={{backgroundColor:'var(--surface-bg)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:'12px'}}
                        formatter={(value: any) => [`$${Number(value||0).toLocaleString()}`, 'Equity']}
                      />
                      <Line type="monotone" dataKey="equity" stroke="#00d4aa" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <EmptyState message="No history yet. Data builds daily after market close." />
            )}

            {/* P&L Chart */}
            {chartData.length > 0 && (
              <div>
                <p className="text-[11px] font-medium dark:text-text-secondary-dark light:text-text-secondary-light mb-2">Daily P&L</p>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--text-muted)'}} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize:10,fill:'var(--text-muted)'}} tickFormatter={(v) => `$${(v/1000).toFixed(1)}k`} width={50} />
                      <Tooltip
                        contentStyle={{backgroundColor:'var(--surface-bg)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:'12px'}}
                        formatter={(value: any) => [`$${Number(value||0).toLocaleString()}`, 'Day P&L']}
                      />
                      <ReferenceLine y={0} stroke="var(--border-light)" />
                      <Bar dataKey="dayPnl" radius={[2,2,0,0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.dayPnl >= 0 ? '#00d4aa' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubtab === 'suggestions' && (
          <div className="space-y-2">
            {suggestions.length === 0 ? <EmptyState message="No AI suggestions yet." /> : suggestions.map((s) => {
              const isExpanded = expandedSuggestion === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setExpandedSuggestion(isExpanded ? null : s.id)}
                  className="dark:bg-bg-hover-dark light:bg-bg-hover-light rounded-xl p-3 border dark:border-border-light-dark light:border-border-light-light cursor-pointer transition hover:dark:border-border-mid-dark hover:light:border-border-mid-light"
                >
                  <p className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
                    {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs font-semibold dark:text-text-primary-dark light:text-text-primary-light mt-1">{s.prompt}</p>
                  <p className={`text-[11px] dark:text-text-secondary-dark light:text-text-secondary-light mt-1 ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {isExpanded ? s.response : stripMarkdown(s.response).slice(0, 120) + '...'}
                  </p>
                  {!isExpanded && s.response.length > 100 && (
                    <p className="text-[10px] text-[var(--accent)] mt-1">Tap to expand</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeSubtab === 'trades' && (
          <div className="space-y-3">
            <SymbolSearch
              value={tradeFilter}
              onChange={(s) => setTradeFilter(s)}
              onSelect={(s) => setTradeFilter(s)}
              placeholder="Filter by symbol..."
            />
            {filteredTrades.length === 0 ? <EmptyState message={tradeFilter ? 'No trades match.' : 'No trade history yet.'} /> : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto no-scrollbar">
                {filteredTrades.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 dark:bg-bg-hover-dark light:bg-bg-hover-light rounded-lg border dark:border-border-light-dark light:border-border-light-light">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold dark:text-text-primary-dark light:text-text-primary-light">{t.symbol}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.side === 'buy' ? 'bg-[#00d4aa]/10 text-[#00d4aa]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>
                        {t.side.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] dark:text-text-primary-dark light:text-text-primary-light font-mono">{t.qty} @ ${Number(t.filled_price).toFixed(2)}</p>
                      <p className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
                        {new Date(t.filled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center">
      <BarChart3 className="w-8 h-8 text-[var(--border-light)] mx-auto mb-2" />
      <p className="text-xs text-[var(--text-muted)]">{message}</p>
    </div>
  );
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

      {/* Section A⅔ — Morning Recommendations */}
      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-4 dark:text-text-primary-dark light:text-text-primary-light">
          📊 Morning Recommendations
        </h3>
        <MorningRecommendationsList />
      </section>

      {/* Section A¾ — Market Scanner */}
      <MarketScanner onAnalyze={handleAnalyzeDip} />

      {/* Section B — AI Chat Panel */}
      <AIChatPanel alpacaAccountId={alpacaAccountId} />

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
              <div key={i} className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-border-light-dark light:border-border-light-light p-4 animate-pulse">
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

      {/* Section E — History */}
      <HistorySection userId={userId} />
    </div>
  );
}