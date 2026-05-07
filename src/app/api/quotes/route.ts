import { NextResponse } from 'next/server';
import { AlpacaError } from '@/lib/alpaca';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

const WATCHLIST = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN',
  'TSLA', 'NVDA', 'META', 'AMD', 'COIN', 'PLTR',
  'ARKK', 'IWM', 'XLF', 'XLE', 'TLT', 'GLD', 'VIX',
];

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_SECRET_KEY;

    if (!key || !secret) {
      return NextResponse.json(
        { error: 'Missing API credentials' },
        { status: 500, headers: rateLimitHeaders(limit) }
      );
    }

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? symbolsParam.split(',') : WATCHLIST;

    // Fetch snapshots from Alpaca Data API
    const snapRes = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols.join(',')}`, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
        'Accept': 'application/json',
      },
    });

    if (!snapRes.ok) {
      return NextResponse.json(
        { error: `Alpaca data error: ${snapRes.status}` },
        { status: 502, headers: rateLimitHeaders(limit) }
      );
    }

    const snapshots = await snapRes.json();

    const data = symbols.map((symbol) => {
      const snap = snapshots[symbol];
      if (!snap) {
        return { symbol, price: 0, change: 0, changePercent: 0, bid: null, ask: null };
      }

      // Use previous daily bar close as reference
      const prevClose = snap.prevDailyBar?.c || 0;

      // Use latest trade for current price (more accurate than quote during market hours)
      const latestPrice = snap.latestTrade?.p || snap.dailyBar?.c || prevClose;

      const change = prevClose ? latestPrice - prevClose : 0;
      const changePercent = prevClose ? (change / prevClose) * 100 : 0;

      return {
        symbol,
        price: latestPrice,
        change,
        changePercent,
        bid: snap.latestQuote?.bp || null,
        ask: snap.latestQuote?.ap || null,
        prevClose,
        timestamp: new Date().toISOString(),
      };
    });

    return NextResponse.json(
      { data, timestamp: new Date().toISOString() },
      { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch quotes' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
