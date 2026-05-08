'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronUp, ChevronDown, Trash2, X, Download } from 'lucide-react';

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

function YearRangeBar({ low, high, current }: YearRangeProps) {
  // Show placeholder if no valid range data
  if (!low || !high || low <= 0 || high <= 0 || low >= high) {
    return <span className="text-xs text-[var(--text-muted)]">—</span>;
  }
  
  // Calculate position as percentage of range
  const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  
  return (
    <div className="w-32 sm:w-40">
      <div className="relative h-2 bg-[var(--app-bg)] rounded-full overflow-visible">
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, #ef4444 0%, #22c55e 100%)` }} />
        {/* Triangle indicator above the bar */}
        <div 
          className="absolute -top-1 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-white"
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
      className={`px-3 py-2 text-xs uppercase tracking-wider font-bold text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] select-none whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}
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

  if (positions.length === 0 && cash <= 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-6 text-center">
        <BarChart3 className="w-8 h-8 text-[var(--hover-bg)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] overflow-hidden relative">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-wider">POSITIONS</h3>
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
            className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] bg-[var(--app-bg)] px-2 py-0.5 rounded border border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition"
            title="Download positions as CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <span className="text-xs text-[var(--text-muted)] bg-[var(--app-bg)] px-2 py-0.5 rounded border border-[var(--border)]">
            {positions.length} positions · ${fmtUSD(totalEquity)}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[950px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--app-bg)]/40">
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === rows.length}
                  onChange={selectAll}
                  className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--app-bg)] text-amber-500 focus:ring-amber-500/20 accent-amber-500 cursor-pointer"
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
              <th className="px-3 py-2 text-xs uppercase tracking-wider font-bold text-[var(--text-secondary)] text-left whitespace-nowrap">52‑week range</th>
            </tr>
          </thead>
          <tbody>
            {/* Cash row */}
            {cash > 0 && (
              <tr className="border-b border-[var(--border)]/50 hover:bg-[var(--hover-bg)]/20">
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-[var(--text-secondary)]">Cash</p>
                  <p className="text-xs text-[var(--text-muted)]">HELD IN MONEY MARKET</p>
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">—</td>
                <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">${fmtUSD(cash)}</td>
                <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-secondary)] tabular-nums">{((cash / totalEquity) * 100).toFixed(2)}%</td>
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

              return (
                <tr key={p.symbol} className={`border-b border-[var(--border)]/50 hover:bg-[var(--hover-bg)]/20 transition ${isSelected ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.symbol, p.qty)}
                      className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--app-bg)] text-amber-500 focus:ring-amber-500/20 accent-amber-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-[var(--text-primary)]">{p.symbol}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                    ${fmtUSD(p.currentPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <p className={`font-[family-name:var(--font-mono)] tabular-nums ${todayProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {todayProfitable ? '+' : ''}{fmtUSD(p.todayPL)}
                    </p>
                    <p className={`font-[family-name:var(--font-mono)] text-xs tabular-nums ${todayProfitable ? 'text-[var(--green)]/70' : 'text-[var(--red)]/70'}`}>
                      {fmtPct(p.todayPLPct)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <p className={`font-[family-name:var(--font-mono)] tabular-nums ${totalProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {totalProfitable ? '+' : ''}{fmtUSD(p.unrealizedPL)}
                    </p>
                    <p className={`font-[family-name:var(--font-mono)] text-xs tabular-nums ${totalProfitable ? 'text-[var(--green)]/70' : 'text-[var(--red)]/70'}`}>
                      {fmtPct(p.unrealizedPLPercent)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                    ${fmtUSD(p.marketValue)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-secondary)] tabular-nums">
                    {p.pctOfAccount.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">
                    {fmtInt(p.qty)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <p className="font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">
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
              );
            })}

            {/* Total row */}
            <tr className="bg-[var(--surface-bg)]/60 border-t-2 border-[var(--border)]">
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-sm font-bold text-[var(--text-primary)]">TOTAL</td>
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
              <td className="px-3 py-3 text-right font-[family-name:var(--font-mono)] font-bold text-[var(--text-primary)] tabular-nums text-sm whitespace-nowrap">
                ${fmtUSD(totalValue + cash)}
              </td>
              <td className="px-3 py-3 text-right font-[family-name:var(--font-mono)] font-bold text-[var(--text-secondary)] tabular-nums text-sm">
                {totalEquity > 0 ? ((totalValue / totalEquity) * 100).toFixed(2) : '0.00'}%
              </td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right font-[family-name:var(--font-mono)] font-bold text-[var(--text-secondary)] tabular-nums text-sm whitespace-nowrap">
                ${fmtUSD(totalCost)}
              </td>
              <td className="px-3 py-3" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bulk Sell Panel */}
      {showBulkPanel && selected.size > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-bg)]/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Bulk Sell — {selected.size} position{selected.size > 1 ? 's' : ''}</h4>
            <button onClick={() => { setShowBulkPanel(false); setBulkResults([]); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {Array.from(selected).map((symbol) => {
              const pos = rows.find((r) => r.symbol === symbol);
              const cfg = sellConfigs[symbol] || { type: 'market', limitPrice: '', qty: String(pos?.qty || 0), timeInForce: 'day' };
              const result = bulkResults.find((r) => r.symbol === symbol);

              return (
                <div key={symbol} className="flex items-center gap-2 bg-[var(--card-bg)] rounded-lg px-3 py-2 border border-[var(--border)]">
                  <div className="w-16">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{symbol}</p>
                    <p className="text-xs text-[var(--text-muted)]">@{pos?.currentPrice.toFixed(2)}</p>
                  </div>

                  <input
                    type="number"
                    value={cfg.qty}
                    onChange={(e) => updateSellConfig(symbol, { qty: e.target.value })}
                    className="w-20 bg-[var(--app-bg)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] font-[family-name:var(--font-mono)] focus:outline-none focus:border-amber-500/50"
                    placeholder="Qty"
                  />

                  <select
                    value={cfg.type}
                    onChange={(e) => updateSellConfig(symbol, { type: e.target.value as 'market' | 'limit' })}
                    className="bg-[var(--app-bg)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-secondary)] font-[family-name:var(--font-mono)] focus:outline-none focus:border-amber-500/50"
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
                        className="w-24 bg-[var(--app-bg)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] font-[family-name:var(--font-mono)] focus:outline-none focus:border-amber-500/50"
                        placeholder="Limit $"
                      />
                      <select
                        value={cfg.timeInForce}
                        onChange={(e) => updateSellConfig(symbol, { timeInForce: e.target.value as 'day' | 'gtc' | 'opg' })}
                        className="bg-[var(--app-bg)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-secondary)] font-[family-name:var(--font-mono)] focus:outline-none focus:border-amber-500/50"
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
              className="flex-1 py-2 rounded-lg bg-[var(--red-soft)] hover:bg-[#b91c1c] text-[var(--text-primary)] font-bold text-sm tracking-wider transition disabled:opacity-40"
            >
              {bulkSubmitting ? 'SUBMITTING...' : `SELL ${selected.size} POSITION${selected.size > 1 ? 'S' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
