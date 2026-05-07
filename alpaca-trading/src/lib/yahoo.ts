// Yahoo Finance — server-side only
// Uses /v7/finance/quote for real-time data (more reliable than /v8/chart for quotes)

export interface YahooQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  shortName?: string;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Fetch real-time quote from Yahoo /v7/finance/quote endpoint */
export async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, YahooQuote>> {
  const encodedSymbols = symbols.map(s => s.includes('^') ? s.replace('^', '%5E') : s).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodedSymbols}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 0 },
    });
    if (!res.ok) return {};

    const json = await res.json();
    const results = json?.quoteResponse?.result || [];
    const map: Record<string, YahooQuote> = {};

    for (const r of results) {
      const symbol = r.symbol;
      const price = Number(r.regularMarketPrice ?? r.price ?? 0);
      const prevClose = Number(r.regularMarketPreviousClose ?? r.previousClose ?? r.chartPreviousClose ?? 0);
      let change = Number(r.regularMarketChange);
      if (!change && price && prevClose) change = price - prevClose;
      let changePercent = Number(r.regularMarketChangePercent);
      if (!changePercent && prevClose) changePercent = (change / prevClose) * 100;

      map[symbol] = {
        symbol,
        price,
        change,
        changePercent,
        prevClose,
        fiftyTwoWeekLow: r.fiftyTwoWeekLow ? Number(r.fiftyTwoWeekLow) : undefined,
        fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ? Number(r.fiftyTwoWeekHigh) : undefined,
        shortName: r.shortName || r.longName || symbol,
      };
    }

    return map;
  } catch {
    return {};
  }
}

/** Fetch 52-week range from chart API (good for historical data) */
export async function fetchYahoo52Week(symbol: string): Promise<{ low: number; high: number } | null> {
  const encoded = symbol.includes('^') ? symbol.replace('^', '%5E') : symbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1y`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.indicators?.quote?.[0]) return null;

    const highs = result.indicators.quote[0].high || [];
    const lows = result.indicators.quote[0].low || [];
    const validHighs = highs.filter((h: any) => h && h > 0);
    const validLows = lows.filter((l: any) => l && l > 0);

    if (validHighs.length === 0 || validLows.length === 0) return null;

    return {
      low: Math.min(...validLows),
      high: Math.max(...validHighs),
    };
  } catch {
    return null;
  }
}
