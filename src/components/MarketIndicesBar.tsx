'use client';

import { useState, useEffect } from 'react';

interface IndexData {
  symbol: string;
  shortName: string;
  etfSymbol: string;
  value: number;
  change: number;
  changePercent: number;
  prevClose: number;
  direction: string;
  source: string;
}

const SYMBOLS = ['^DJI', '^GSPC', '^IXIC', '^RUT', '^VIX'];
const LABELS: Record<string, string> = {
  '^DJI': 'DJIA',
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^RUT': 'Russell 2000',
  '^VIX': 'VIX',
};

export default function MarketIndicesBar() {
  const [data, setData] = useState<IndexData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/indices?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
    } catch (err: any) {
      console.warn('[MarketIndicesBar] API error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, []);

  const fmtBig = (n: number) =>
    n >= 1000
      ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n.toFixed(2);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {SYMBOLS.map((sym) => {
        const d = data.find((x) => x.symbol === sym);
        if (!d) {
          return (
            <div key={sym} className="flex-shrink-0 rounded-xl px-3 py-2.5 min-w-[150px] bg-[var(--card-bg)] border dark:border-[#334155] light:border-[#e2e8f0]">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{LABELS[sym]}</span>
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">—</span>
              </div>
              <div className="h-5 w-24 bg-[var(--app-bg)] rounded animate-pulse mt-1" />
              <div className="h-3.5 w-16 bg-[var(--app-bg)] rounded animate-pulse mt-1.5" />
            </div>
          );
        }

        const up = d.changePercent >= 0;
        return (
          <div
            key={sym}
            className={`flex-shrink-0 rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] px-3 py-2.5 min-w-[150px] ${
              up ? 'bg-[var(--green)]/10' : 'bg-[var(--red)]/10'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{d.shortName}</span>
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{d.etfSymbol}</span>
            </div>
            <p className="text-base font-semibold font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums leading-none">
              {fmtBig(d.value)}
            </p>
            <div className={`flex items-center gap-2 mt-1.5 ${up ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              <span className="text-sm font-medium font-[family-name:var(--font-mono)]">
                {d.change >= 0 ? '+' : ''}{d.change.toFixed(2)}
              </span>
              <span className="text-xs font-medium font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded bg-[var(--app-bg)]/60">
                {d.changePercent >= 0 ? '▲' : '▼'} {d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
