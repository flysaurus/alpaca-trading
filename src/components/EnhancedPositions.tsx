'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart3, ChevronUp, ChevronDown, Trash2, X, Download, Loader2 } from 'lucide-react';
import ChatModal from '@/components/ChatModal';
import { useChatStore } from '@/stores/chat';

interface Position {
  symbol: string;
  qty: number;
  marketValue: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
  side: 'long' | 'short';
}

interface Props {
  positions: Position[];
  cash?: number;
  portfolioValue?: number;
  onRefresh?: () => void;
}

interface PositionRow extends Position {
  todayPL: number;
  todayPLPct: number;
  costBasis: number;
  pctOfAccount: number;
}

type SortKey = 'symbol' | 'lastPrice' | 'todayPL' | 'totalPL' | 'value' | 'pctAccount' | 'qty' | 'costBasis';
type SortDir = 'asc' | 'desc';

interface SellConfig {
  type: 'market' | 'limit';
  limitPrice: string;
  qty: string;
  timeInForce: 'day' | 'gtc' | 'opg';
}

interface YearRangeProps { low: number; high: number; current: number }

interface RecData {
  action: 'buy' | 'hold' | 'sell';
  target_price: number;
  reasoning: string;
  confidence: number;
  stockAnalysis?: {
    earnings?: { next_earnings_date?: string } | null;
    insider?: { activity?: string } | null;
    sector?: { performance?: string; vs_spy?: number } | null;
    sentiment?: { score?: number; label?: string } | null;
  };
}

function YearRangeBar({ low, high, current }: YearRangeProps) {
  // Show placeholder if no valid range data
  if (!low || !high || low <= 0 || high <= 0 || low >= high) {
    return <span className="text-xs text-[var(--text-muted)]">—</span>;
  }
  
  // Calculate position as percentage of range
  const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  
  return (
    <div className="w-32 sm:w-40">
      <div className="relative h-2 dark:bg-bg-input-dark light:bg-bg-input-light rounded-full overflow-visible">
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, #ef4444 0%, #22c55e 100%)` }} />
        {/* Triangle indicator above the bar */}
        <div 
          className="absolute -top-1 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] dark:border-b-[#f9fafb] light:border-b-[#0f172a]"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      </div>
    </div>
  );
}

export default function EnhancedPositions({ positions, cash = 0, portfolioValue = 0, onRefresh }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('todayPL');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [ranges, setRanges] = useState<Record<string, { low: number; high: number }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sellConfigs, setSellConfigs] = useState<Record<string, SellConfig>>({});
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<Array<{ symbol: string; ok: boolean; error?: string }>>([]);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const recCache = useRef<Map<string, { data: RecData; fetchedAt: number }>>(new Map());
  const REC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  // Fetch real 52-week ranges from Yahoo Finance
  useEffect(() => {
    if (positions.length === 0) return;
    const fetchRanges = async () => {
      const map: Record<string, { low: number; high: number }> = {};
      for (const p of positions) {
        try {
          const res = await fetch(`/api/range52?symbol=${encodeURIComponent(p.symbol)}`);
          const json = await res.json();
          if (json.low && json.high) {
            map[p.symbol] = { low: json.low, high: json.high };
          }
        } catch {
          // silent
        }
      }
      setRanges(map);
    };
    fetchRanges();
  }, [positions]);

  const totalEquity = portfolioValue || positions.reduce((s, p) => s + p.marketValue, 0) + cash;

  const rows: PositionRow[] = positions.map((p) => ({
    ...p,
    todayPL: p.changeToday * p.qty,
    todayPLPct: p.currentPrice > 0 ? (p.changeToday / (p.currentPrice - p.changeToday)) * 100 : 0,
    costBasis: p.avgEntryPrice * p.qty,
    pctOfAccount: totalEquity > 0 ? (p.marketValue / totalEquity) * 100 : 0,
  }));

  const sorted = [...rows].sort((a, b) => {
    let v = 0;
    switch (sortKey) {
      case 'symbol': v = a.symbol.localeCompare(b.symbol); break;
      case 'lastPrice': v = a.currentPrice - b.currentPrice; break;
      case 'todayPL': v = a.todayPL - b.todayPL; break;
      case 'totalPL': v = a.unrealizedPL - b.unrealizedPL; break;
      case 'value': v = a.marketValue - b.marketValue; break;
      case 'pctAccount': v = a.pctOfAccount - b.pctOfAccount; break;
      case 'qty': v = a.qty - b.qty; break;
      case 'costBasis': v = a.costBasis - b.costBasis; break;
    }
    return sortDir === 'asc' ? v : -v;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const toggleSelect = (symbol: string, qty: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
        setSellConfigs((cfg) => ({
          ...cfg,
          [symbol]: cfg[symbol] || { type: 'market', limitPrice: '', qty: String(qty), timeInForce: 'day' },
        }));
      }
      setShowBulkPanel(next.size > 0);
      if (next.size === 0) setBulkResults([]);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
      setShowBulkPanel(false);
      setBulkResults([]);
    } else {
      const all = new Set(rows.map((r) => r.symbol));
      setSelected(all);
      const configs: Record<string, SellConfig> = {};
      for (const r of rows) {
        configs[r.symbol] = sellConfigs[r.symbol] || { type: 'market', limitPrice: '', qty: String(r.qty), timeInForce: 'day' };
      }
      setSellConfigs(configs);
    }
  };

  const updateSellConfig = (symbol: string, patch: Partial<SellConfig>) => {
    setSellConfigs((prev) => ({
      ...prev,
      [symbol]: { ...(prev[symbol] || { type: 'market', limitPrice: '', qty: '', timeInForce: 'day' }), ...patch },
    }));
  };

  const handleDownloadCSV = () => {
    const headers = ['Symbol','Qty','Avg Entry Price','Current Price','Market Value','Unrealized P&L','Unrealized P&L %','Change Today','Side'];
    const lines = [headers.join(',')];
    for (const p of positions) {
      const line = [
        p.symbol,
        p.qty,
        p.avgEntryPrice,
        p.currentPrice,
        p.marketValue,
        p.unrealizedPL,
        p.unrealizedPLPercent,
        p.changeToday,
        p.side,
      ].join(',');
      lines.push(line);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `positions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitBulkSell = async () => {
    setBulkSubmitting(true);
    setBulkResults([]);
    const results: Array<{ symbol: string; ok: boolean; error?: string }> = [];

    await Promise.all(
      Array.from(selected).map(async (symbol) => {
        const cfg = sellConfigs[symbol];
        const qty = Number(cfg?.qty || 0);
        if (!qty || qty <= 0) {
          results.push({ symbol, ok: false, error: 'Invalid quantity' });
          return;
        }

        try {
          const body: any = {
            symbol,
            qty,
            side: 'sell',
            type: cfg?.type || 'market',
            timeInForce: (cfg?.timeInForce || 'day').toLowerCase(),
          };
          if (cfg?.type === 'limit' && cfg.limitPrice) {
            body.limitPrice = Number(cfg.limitPrice);
          }

          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          results.push({ symbol, ok: json.success, error: json.error });
        } catch (err: any) {
          results.push({ symbol, ok: false, error: err.message || 'Network error' });
        }
      })
    );

    setBulkResults(results);
    setBulkSubmitting(false);
    if (results.every((r) => r.ok)) {
      setTimeout(() => {
        setSelected(new Set());
      setShowBulkPanel(false);
      setBulkResults([]);
        setShowBulkPanel(false);
        onRefresh?.();
      }, 1500);
    }
  };

  const th = (key: SortKey, label: string, align?: 'left' | 'right') => (
    <th
      onClick={() => handleSort(key)}
      className={`px-3 py-2 text-xs uppercase tracking-wider font-bold dark:text-text-primary-dark light:text-text-primary-light cursor-pointer hover:dark:text-text-primary-dark light:text-text-primary-light select-none whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === key && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  const fmtUSD = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const fmtInt = (n: number) => n.toLocaleString('en-US');

  const totalTodayPL = rows.reduce((s, r) => s + r.todayPL, 0);
  const totalPL = rows.reduce((s, r) => s + r.unrealizedPL, 0);
  const totalValue = rows.reduce((s, r) => s + r.marketValue, 0);
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);

  // Fetch position recommendation + stock analysis
  const fetchRecommendation = async (p: PositionRow) => {
    const key = p.symbol.toUpperCase();
    const cached = recCache.current.get(key);
    if (cached && Date.now() - cached.fetchedAt < REC_CACHE_TTL) {
      return cached.data;
    }

    setRecLoading(true);
    try {
      const params = new URLSearchParams({
        symbol: key,
        currentPrice: String(p.currentPrice),
        avgCost: String(p.avgEntryPrice),
        unrealizedPL: String(p.unrealizedPL),
        qty: String(p.qty),
        equity: String(totalEquity),
      });
      const res = await fetch(`/api/positions/recommendation?${params}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'API error');

      const rec: RecData = {
        action: data.action || 'hold',
        target_price: data.target_price || 0,
        reasoning: data.reasoning || '',
        confidence: data.confidence || 5,
        stockAnalysis: data.stockAnalysis,
      };

      recCache.current.set(key, { data: rec, fetchedAt: Date.now() });
      return rec;
    } catch (err: any) {
      console.error(`[Positions] Rec fetch failed for ${key}:`, err.message);
      return null;
    } finally {
      setRecLoading(false);
    }
  };

  const toggleExpand = async (symbol: string) => {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
      return;
    }
    setExpandedSymbol(symbol);
  };

  // Auto-fetch recommendation when expanding
  useEffect(() => {
    if (!expandedSymbol) return;
    const pos = rows.find((r) => r.symbol === expandedSymbol);
    if (!pos) return;

    const key = pos.symbol.toUpperCase();
    // Only fetch if not already in cache
    if (!recCache.current.has(key)) {
      fetchRecommendation(pos);
    }
  }, [expandedSymbol]);

  if (positions.length === 0 && cash <= 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-6 text-center">
        <BarChart3 className="w-8 h-8 text-[var(--hover-bg)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden relative">
      <div className="px-4 py-3 border-b dark:border-[#334155]/70 light:border-[#e2e8f0] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold dark:text-text-primary-dark light:text-text-primary-light tracking-wider">POSITIONS</h3>
          {selected.size > 0 && (
            <button
              onClick={() => setShowBulkPanel(true)}
              className="text-xs font-bold px-2 py-1 rounded bg-[var(--red-soft)]/20 text-[var(--red)] border border-[var(--red-soft)]/30 hover:bg-[var(--red-soft)]/30 transition"
            >
              Sell {selected.size} selected
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1 text-xs font-bold dark:text-text-primary-dark light:text-text-primary-light dark:bg-bg-input-dark light:bg-bg-input-light px-2 py-0.5 rounded border dark:border-[#334155]/70 light:border-[#e2e8f0] hover:dark:text-text-primary-dark light:text-text-primary-light hover:border-[var(--text-muted)] transition"
            title="Download positions as CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <div className="flex items-center justify-between dark:bg-[#1e293b] light:bg-[#f8fafc] rounded-xl py-2 px-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Positions</p>
              <span className="dark:text-[#f9fafb] light:text-[#0f172a] font-semibold text-base">{positions.length} Positions</span>
            </div>
            <span className="dark:text-[#f9fafb] light:text-[#0f172a] font-semibold text-base font-[family-name:var(--font-mono)]">${fmtUSD(totalValue)}</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[950px]">
          <thead>
            <tr className="border-b dark:border-[#334155]/70 light:border-[#e2e8f0] dark:bg-bg-input-dark light:bg-bg-input-light/40">
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === rows.length}
                  onChange={selectAll}
                  className="w-3.5 h-3.5 rounded border-[var(--border)] dark:bg-bg-input-dark light:bg-bg-input-light text-amber-500 focus:ring-amber-500/20 accent-amber-500 cursor-pointer"
                />
              </th>
              {th('symbol', 'Symbol', 'left')}
              {th('lastPrice', 'Last price')}
              {th('todayPL', "Today's gain/loss")}
              {th('totalPL', 'Total gain/loss')}
              {th('value', 'Current value')}
              {th('pctAccount', '% of account')}
              {th('qty', 'Qty')}
              {th('costBasis', 'Cost basis')}
              <th className="px-3 py-2 text-xs uppercase tracking-wider font-bold dark:text-text-primary-dark light:text-text-primary-light text-left whitespace-nowrap">52‑week range</th>
            </tr>
          </thead>
          <tbody>
            {/* Cash row */}
            {cash > 0 && (
              <tr className="border-b dark:border-[#334155]/50 light:border-[#e2e8f0] hover:bg-[var(--hover-bg)]/20">
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5">
                  <p className="font-semibold dark:text-text-primary-dark light:text-text-primary-light">Cash</p>
                  <p className="text-xs text-[var(--text-muted)]">HELD IN MONEY MARKET</p>
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums">${fmtUSD(cash)}</td>
                <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums">{((cash / totalEquity) * 100).toFixed(2)}%</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5" />
              </tr>
            )}

            {sorted.map((p) => {
              const range = ranges[p.symbol];
              const totalProfitable = p.unrealizedPL >= 0;
              const todayProfitable = p.todayPL >= 0;
              const isSelected = selected.has(p.symbol);
              const isExpanded = expandedSymbol === p.symbol;
              const rec = recCache.current.get(p.symbol.toUpperCase())?.data;
              const recAction = rec?.action || 'hold';
              const actionBadge = recAction === 'buy' ? 'dark:bg-[#10b981]/10 light:bg-[#10b981]/10 text-[#10b981]' : recAction === 'sell' ? 'dark:bg-[#ef4444]/10 light:bg-[#ef4444]/10 text-[#ef4444]' : 'dark:bg-[#f59e0b]/10 light:bg-[#f59e0b]/10 text-[#f59e0b]';

              return (
                <React.Fragment key={p.symbol}>
                <tr
                  className={`border-b dark:border-[#334155]/50 light:border-[#e2e8f0] hover:bg-[var(--hover-bg)]/20 transition cursor-pointer ${isSelected ? 'bg-amber-500/5' : ''} ${isExpanded ? 'dark:bg-[#1e293b]/50 light:bg-[#f8fafc]' : ''}`}
                  onClick={() => toggleExpand(p.symbol)}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(p.symbol, p.qty); }}
                      className="w-3.5 h-3.5 rounded border-[var(--border)] dark:bg-bg-input-dark light:bg-bg-input-light text-amber-500 focus:ring-amber-500/20 accent-amber-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold dark:text-text-primary-dark light:text-text-primary-light">{p.symbol}</p>
                      {rec && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${actionBadge}`}>
                          {recAction}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-sm font-medium dark:text-text-primary-dark light:text-text-primary-light tabular-nums whitespace-nowrap">
                    ${fmtUSD(p.currentPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <p className={`font-[family-name:var(--font-mono)] text-sm font-medium tabular-nums ${todayProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {todayProfitable ? '+' : ''}{fmtUSD(p.todayPL)}
                    </p>
                    <p className={`font-[family-name:var(--font-mono)] text-xs tabular-nums ${todayProfitable ? 'text-[var(--green)]/70' : 'text-[var(--red)]/70'}`}>
                      {fmtPct(p.todayPLPct)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <p className={`font-[family-name:var(--font-mono)] text-sm font-medium tabular-nums ${totalProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {totalProfitable ? '+' : ''}{fmtUSD(p.unrealizedPL)}
                    </p>
                    <p className={`font-[family-name:var(--font-mono)] text-xs tabular-nums ${totalProfitable ? 'text-[var(--green)]/70' : 'text-[var(--red)]/70'}`}>
                      {fmtPct(p.unrealizedPLPercent)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums whitespace-nowrap">
                    ${fmtUSD(p.marketValue)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums">
                    {p.pctOfAccount.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums">
                    {fmtInt(p.qty)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <p className="font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums">
                      ${fmtUSD(p.costBasis)}
                    </p>
                    <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-muted)] tabular-nums">
                      ${fmtUSD(p.avgEntryPrice)} / Share
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    {range ? (
                      <div className="flex items-center gap-2">
                        <YearRangeBar low={range.low} high={range.high} current={p.currentPrice} />
                        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap hidden sm:block">
                          ${range.low.toFixed(2)}–${range.high.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>

                {/* Expanded Recommendation Panel */}
                {isExpanded && (
                  <tr key={`${p.symbol}-exp`}>
                    <td colSpan={10} className="px-4 py-3 dark:bg-[#0f172a]/60 light:bg-[#f8fafc] border-b dark:border-[#334155]/50 light:border-[#e2e8f0]">
                      {(() => {
                        const cachedRec = recCache.current.get(p.symbol.toUpperCase())?.data;
                        const isLoading = recLoading && !cachedRec;

                        if (isLoading) {
                          return (
                            <div className="space-y-2">
                              <div className="h-4 w-32 dark:bg-[#1e293b] light:bg-[#e2e8f0] rounded animate-pulse" />
                              <div className="h-4 w-48 dark:bg-[#1e293b] light:bg-[#e2e8f0] rounded animate-pulse" />
                              <div className="h-10 w-full dark:bg-[#1e293b] light:bg-[#e2e8f0] rounded animate-pulse" />
                            </div>
                          );
                        }

                        if (!cachedRec) {
                          return (
                            <div className="flex items-center gap-2 py-2">
                              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                              <span className="text-xs text-[var(--text-muted)]">Loading analysis…</span>
                            </div>
                          );
                        }

                        const analysis = cachedRec.stockAnalysis;
                        const recIcon = cachedRec.action === 'buy' ? '🟢' : cachedRec.action === 'sell' ? '🔴' : '🟡';

                        return (
                          <div className="space-y-2">
                            {/* Header: Action + Confidence */}
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{recIcon}</span>
                              <span className="text-sm font-bold uppercase dark:text-[#f9fafb] light:text-[#0f172a]">
                                {cachedRec.action}
                              </span>
                              <span className="text-xs dark:text-text-secondary-dark light:text-text-secondary-light">
                                Confidence: {cachedRec.confidence}/10
                              </span>
                            </div>

                            {/* Target Price */}
                            {cachedRec.target_price > 0 && (
                              <div className="text-xs dark:text-text-secondary-dark light:text-text-secondary-light">
                                Target Price: <span className="font-bold dark:text-[#f9fafb] light:text-[#0f172a]">${cachedRec.target_price.toFixed(2)}</span>
                              </div>
                            )}

                            {/* Reasoning */}
                            {cachedRec.reasoning && (
                              <p className="text-xs dark:text-text-primary-dark light:text-text-primary-light leading-relaxed italic dark:bg-[#1e293b]/50 light:bg-[#f1f5f9] rounded-lg px-3 py-2">
                                "{cachedRec.reasoning}"
                              </p>
                            )}

                            {/* Stock Analysis Grid */}
                            {analysis && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {analysis.earnings?.next_earnings_date && (
                                  <div className="dark:bg-[#1e293b] light:bg-white rounded-lg px-2.5 py-1.5 border dark:border-[#334155] light:border-[#e2e8f0]">
                                    <p className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light uppercase">Earnings</p>
                                    <p className="text-xs font-semibold dark:text-[#f9fafb] light:text-[#0f172a]">{analysis.earnings.next_earnings_date}</p>
                                  </div>
                                )}
                                {analysis.insider?.activity && (
                                  <div className="dark:bg-[#1e293b] light:bg-white rounded-lg px-2.5 py-1.5 border dark:border-[#334155] light:border-[#e2e8f0]">
                                    <p className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light uppercase">Insider Activity</p>
                                    <p className="text-xs font-semibold dark:text-[#f9fafb] light:text-[#0f172a]">{analysis.insider.activity}</p>
                                  </div>
                                )}
                                {analysis.sector?.performance && (
                                  <div className="dark:bg-[#1e293b] light:bg-white rounded-lg px-2.5 py-1.5 border dark:border-[#334155] light:border-[#e2e8f0]">
                                    <p className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light uppercase">Sector</p>
                                    <p className="text-xs font-semibold dark:text-[#f9fafb] light:text-[#0f172a]">
                                      {analysis.sector.performance}
                                      {analysis.sector.vs_spy != null && ` ${analysis.sector.vs_spy > 0 ? '+' : ''}${analysis.sector.vs_spy.toFixed(1)}%`}
                                    </p>
                                  </div>
                                )}
                                {analysis.sentiment?.label && (
                                  <div className="dark:bg-[#1e293b] light:bg-white rounded-lg px-2.5 py-1.5 border dark:border-[#334155] light:border-[#e2e8f0]">
                                    <p className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light uppercase">News Sentiment</p>
                                    <p className={`text-xs font-semibold ${
                                      analysis.sentiment.label === 'Positive' ? 'text-[#10b981]' :
                                      analysis.sentiment.label === 'Negative' ? 'text-[#ef4444]' :
                                      'text-[#f59e0b]'
                                    }`}>{analysis.sentiment.label}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Analyze with AI button */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const prompt = `Analyze my ${p.symbol} position. I bought at $${p.avgEntryPrice.toFixed(2)}, currently at $${p.currentPrice.toFixed(2)}, P&L is $${p.unrealizedPL.toFixed(2)}.`;
                                  useChatStore.getState().setPendingMessage(prompt);
                                  setChatOpen(true);
                                }}
                                className="text-[10px] font-bold px-2.5 py-1 rounded dark:bg-[var(--accent)]/10 light:bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 hover:bg-[var(--accent)]/20 transition"
                              >
                                💬 Ask AI Advisor
                              </button>
                              <span className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Updated today</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}

            {/* Total row */}
            <tr className="dark:bg-bg-input-dark light:bg-bg-input-light/60 border-t-2 dark:border-[#334155]/70 light:border-[#e2e8f0]">
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-sm font-bold dark:text-text-primary-dark light:text-text-primary-light">TOTAL</td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <p className={`font-[family-name:var(--font-mono)] font-bold tabular-nums text-sm ${totalTodayPL >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {totalTodayPL >= 0 ? '+' : ''}{fmtUSD(totalTodayPL)}
                </p>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <p className={`font-[family-name:var(--font-mono)] font-bold tabular-nums text-sm ${totalPL >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {totalPL >= 0 ? '+' : ''}{fmtUSD(totalPL)}
                </p>
              </td>
              <td className="px-3 py-3 text-right font-[family-name:var(--font-mono)] font-bold dark:text-text-primary-dark light:text-text-primary-light tabular-nums text-sm whitespace-nowrap">
                ${fmtUSD(totalValue + cash)}
              </td>
              <td className="px-3 py-3 text-right font-[family-name:var(--font-mono)] font-bold dark:text-text-primary-dark light:text-text-primary-light tabular-nums text-sm">
                {totalEquity > 0 ? ((totalValue / totalEquity) * 100).toFixed(2) : '0.00'}%
              </td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right font-[family-name:var(--font-mono)] font-bold dark:text-text-primary-dark light:text-text-primary-light tabular-nums text-sm whitespace-nowrap">
                ${fmtUSD(totalCost)}
              </td>
              <td className="px-3 py-3" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bulk Sell Panel */}
      {showBulkPanel && selected.size > 0 && (
        <div className="border-t dark:border-[#334155]/70 light:border-[#e2e8f0] dark:bg-bg-input-dark light:bg-bg-input-light/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold dark:text-text-primary-dark light:text-text-primary-light">Bulk Sell — {selected.size} position{selected.size > 1 ? 's' : ''}</h4>
            <button onClick={() => { setShowBulkPanel(false); setBulkResults([]); }} className="text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {Array.from(selected).map((symbol) => {
              const pos = rows.find((r) => r.symbol === symbol);
              const cfg = sellConfigs[symbol] || { type: 'market', limitPrice: '', qty: String(pos?.qty || 0), timeInForce: 'day' };
              const result = bulkResults.find((r) => r.symbol === symbol);

              return (
                <div key={symbol} className="flex items-center gap-2 bg-[var(--card-bg)] rounded-lg px-3 py-2 border dark:border-[#334155]/70 light:border-[#e2e8f0]">
                  <div className="w-16">
                    <p className="text-sm font-bold dark:text-text-primary-dark light:text-text-primary-light">{symbol}</p>
                    <p className="text-xs text-[var(--text-muted)]">@{pos?.currentPrice.toFixed(2)}</p>
                  </div>

                  <input
                    type="number"
                    value={cfg.qty}
                    onChange={(e) => updateSellConfig(symbol, { qty: e.target.value })}
                    className="w-20 dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded px-2 py-1 text-sm dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)] focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
                    placeholder="Qty"
                  />

                  <select
                    value={cfg.type}
                    onChange={(e) => updateSellConfig(symbol, { type: e.target.value as 'market' | 'limit' })}
                    className="dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded px-2 py-1 text-sm dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)] focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
                  >
                    <option value="market">MKT</option>
                    <option value="limit">LMT</option>
                  </select>

                  {cfg.type === 'limit' && (
                    <>
                      <input
                        type="number"
                        value={cfg.limitPrice}
                        onChange={(e) => updateSellConfig(symbol, { limitPrice: e.target.value })}
                        className="w-24 dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded px-2 py-1 text-sm dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)] focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
                        placeholder="Limit $"
                      />
                      <select
                        value={cfg.timeInForce}
                        onChange={(e) => updateSellConfig(symbol, { timeInForce: e.target.value as 'day' | 'gtc' | 'opg' })}
                        className="dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded px-2 py-1 text-sm dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)] focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
                      >
                        <option value="day">DAY</option>
                        <option value="gtc">GTC</option>
                        <option value="opg">OPG</option>
                      </select>
                    </>
                  )}

                  {result && (
                    <span className={`text-xs font-bold ml-auto ${result.ok ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {result.ok ? '✓ Sent' : `✗ ${result.error}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={submitBulkSell}
              disabled={bulkSubmitting}
              className="flex-1 py-2 rounded-lg bg-[var(--red-soft)] hover:bg-[#b91c1c] dark:text-text-primary-dark light:text-text-primary-light font-bold text-sm tracking-wider transition disabled:opacity-40"
            >
              {bulkSubmitting ? 'SUBMITTING...' : `SELL ${selected.size} POSITION${selected.size > 1 ? 'S' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* AI Chat Modal (shared with Advisor tab) */}
      <ChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} alpacaAccountId={null} />
    </div>
  );
}
