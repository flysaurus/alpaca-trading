import { NextResponse } from 'next/server';
import { getBars, AlpacaError } from '@/lib/alpaca';
import { scanStock, sortScanResults } from '@/lib/scanner';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { requireSession } from '@/lib/session';

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const keys = await requireSession();
  if (!keys) {
    return NextResponse.json({ error: 'Session expired, re-authenticate' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const watchlist = searchParams.get('watchlist')?.split(',') || [
    'SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'AMD',
    'COIN', 'PLTR', 'ARKK', 'IWM', 'XLF', 'XLE', 'TLT', 'GLD', 'VIX',
  ];

  try {
    const barsMap: Record<string, any[]> = {};
    await Promise.all(
      watchlist.map(async (symbol) => {
        try {
          barsMap[symbol] = await getBars({ symbol, timeframe: '1D', limit: 30 });
        } catch {
          barsMap[symbol] = [];
        }
      })
    );

    const results = [];
    for (const symbol of watchlist) {
      const stockBars = barsMap[symbol] || [];
      const scan = scanStock(symbol, stockBars);
      if (scan) {
        results.push(scan);
      }
    }

    return NextResponse.json(
      {
        signals: sortScanResults(results),
        count: results.length,
        scanned: watchlist.length,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Scan failed' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
