'use client';

import { useState, useEffect } from 'react';

interface IndexData {
  symbol: string;
  shortName: string;
  value: number;
  change: number;
  changePercent: number;
}

const INDICES = [
  { symbol: '^DJI', short: 'DJIA', scale: 100 },
  { symbol: '^GSPC', short: 'S&P 500', scale: 10 },
  { symbol: '^IXIC', short: 'NASDAQ', scale: 1 },
  { symbol: '^RUT', short: 'RUSSELL', scale: 1 },
];

// Alpaca ETF proxies
const PROXIES: Record<string, string> = {
  '^DJI': 'DIA',
  '^GSPC': 'SPY',
  '^IXIC': 'QQQ',
  '^RUT': 'IWM',
};

async function fetchYahooClient(symbols: string[]): Promise<Record<string, { price: number; change: number; changePercent: number; prevClose: number }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};

    const json = await res.json();
    const results = json?.quoteResponse?.result || [];
    const map: Record<string, any> = {};

    for (const r of results) {
      const price = Number(r.regularMarketPrice ?? 0);
      const prevClose = Number(r.regularMarketPreviousClose ?? r.previousClose ?? 0);
      const change = Number(r.regularMarketChange ?? (prevClose ? price - prevClose : 0));
      const changePercent = Number(r.regularMarketChangePercent ?? (prevClose ? (change / prevClose) * 100 : 0));

      if (price > 0) {
        map[r.symbol] = { price, change, changePercent, prevClose };
      }
    }

    return map;
  } catch {
    return {};
  }
}

async function fetchAlpacaProxies(symbols: string[]): Promise<Record<string, { price: number; prevClose: number }>> {
  try {
    const res = await fetch(`/api/quotes?symbols=${symbols.join(',')}`);
    const json = await res.json();
    if (!json.data) return {};

    const map: Record<string, any> = {};
    for (const q of json.data) {
      if (q.price > 0) {
        map[q.symbol] = { price: q.price, prevClose: q.prevClose || q.price };
      }
    }
    return map;
  } catch {
    return {};
  }
}

export default function MarketIndicesBar() {
  const [data, setData] = useState<IndexData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);

    // Strategy: Try Yahoo first (client-side, may work), then Alpaca proxies
    const yahooSymbols = INDICES.map((i) => i.symbol);
    const yahooData = await fetchYahooClient(yahooSymbols);

    const results: IndexData[] = [];
    const missingProxies: string[] = [];
    const missingMap: Record<string, any> = {};

    for (const idx of INDICES) {
      const q = yahooData[idx.symbol];
      if (q && q.price > 0) {
        results.push({
          symbol: idx.symbol,
          shortName: idx.short,
          value: q.price,
          change: q.change,
          changePercent: q.changePercent,
        });
      } else {
        missingProxies.push(PROXIES[idx.symbol]);
        missingMap[PROXIES[idx.symbol]] = idx;
      }
    }

    // Fallback: Alpaca ETF proxies
    if (missingProxies.length > 0) {
      const alpacaData = await fetchAlpacaProxies(missingProxies);

      for (const proxy of missingProxies) {
        const q = alpacaData[proxy];
        const idx = missingMap[proxy];
        if (!q || !q.price) continue;

        const change = q.prevClose ? q.price - q.prevClose : 0;
        const changePercent = q.prevClose ? (change / q.prevClose) * 100 : 0;

        results.push({
          symbol: idx.symbol,
          shortName: idx.short,
          value: q.price * idx.scale,
          change: change * idx.scale,
          changePercent,
        });
      }
    }

    setData(results);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const i = setInterval(fetchAll, 15000);
    return () => clearInterval(i);
  }, []);

  const fmtBig = (n: number) =>
    n >= 1000
      ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n.toFixed(2);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {INDICES.map((idx) => {
        const d = data.find((x) => x.symbol === idx.symbol);
        if (!d) {
          // Skeleton
          return (
            <div key={idx.symbol} className="flex-shrink-0 rounded-xl px-3 py-2.5 min-w-[150px] bg-[var(--card-bg)] border border-[var(--border)]">
              <span className="text-[10px] font-bold text-[var(--text-secondary)] tracking-wide">{idx.short}</span>
              <div className="h-5 w-24 bg-[var(--app-bg)] rounded animate-pulse mt-1" />
              <div className="h-3.5 w-16 bg-[var(--app-bg)] rounded animate-pulse mt-1.5" />
            </div>
          );
        }

        const up = d.changePercent >= 0;
        return (
          <div
            key={idx.symbol}
            className={`flex-shrink-0 rounded-xl px-3 py-2.5 min-w-[150px] ${
              up ? 'bg-[var(--green)]/10 border border-[var(--green)]/25' : 'bg-[var(--red)]/10 border border-[var(--red)]/25'
            }`}
          >
            <span className="text-[10px] font-bold text-[var(--text-secondary)] tracking-wide">{idx.short}</span>
            <p className="text-lg font-bold font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums leading-none">
              {fmtBig(d.value)}
            </p>
            <div className={`flex items-center gap-2 mt-1.5 ${up ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              <span className="text-[11px] font-bold font-[family-name:var(--font-mono)]">
                {d.change >= 0 ? '+' : ''}{d.change.toFixed(2)}
              </span>
              <span className="text-[10px] font-bold font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded bg-[var(--app-bg)]/60">
                {d.changePercent >= 0 ? '▲' : '▼'} {d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
