// Cached asset list from Alpaca — refreshed periodically
export interface AssetInfo {
  symbol: string;
  name: string;
  exchange: string;
  tradable: boolean;
  assetClass: string;
}

let cachedAssets: AssetInfo[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 3600_000; // 1 hour

export async function getAllAssets(): Promise<AssetInfo[]> {
  if (cachedAssets && Date.now() - cacheTime < CACHE_TTL) {
    return cachedAssets;
  }

  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) return [];

  const base = process.env.TRADING_MODE === 'live'
    ? 'https://api.alpaca.markets'
    : 'https://paper-api.alpaca.markets';

  try {
    const res = await fetch(`${base}/v2/assets?status=active&asset_class=us_equity`, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
      },
    });

    if (!res.ok) return cachedAssets || [];

    const json = await res.json();
    cachedAssets = json
      .filter((a: any) => a.tradable && a.status === 'active')
      .map((a: any) => ({
        symbol: a.symbol,
        name: a.name,
        exchange: a.exchange,
        tradable: a.tradable,
        assetClass: a.asset_class,
      }))
      .sort((a: AssetInfo, b: AssetInfo) => a.symbol.localeCompare(b.symbol));

    cacheTime = Date.now();
    return cachedAssets ?? [];
  } catch {
    return cachedAssets || [];
  }
}

export function searchSymbols(query: string, assets: AssetInfo[], limit = 10): AssetInfo[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];

  // Exact prefix matches first
  const prefix = assets.filter(a => a.symbol.startsWith(q));
  // Then name matches
  const nameMatch = assets.filter(a =>
    !a.symbol.startsWith(q) && a.name.toUpperCase().includes(q)
  );

  return [...prefix, ...nameMatch].slice(0, limit);
}

// Popular symbols for quick access
export const POPULAR_SYMBOLS: AssetInfo[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'ARCA', tradable: true, assetClass: 'us_equity' },
  { symbol: 'QQQ', name: 'Invesco QQQ ETF', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', exchange: 'NASDAQ', tradable: true, assetClass: 'us_equity' },
  { symbol: 'PLTR', name: 'Palantir Technologies', exchange: 'NYSE', tradable: true, assetClass: 'us_equity' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', exchange: 'ARCA', tradable: true, assetClass: 'us_equity' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', tradable: true, assetClass: 'us_equity' },
  { symbol: 'XOM', name: 'Exxon Mobil Corp.', exchange: 'NYSE', tradable: true, assetClass: 'us_equity' },
];
