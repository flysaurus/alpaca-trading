import { NextResponse } from 'next/server';
import { getBars, AlpacaError } from '@/lib/alpaca';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

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
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();
    const timeframe = url.searchParams.get('timeframe') || '1Day';
    const limitParam = parseInt(url.searchParams.get('limit') || '30', 10);

    if (!symbol) {
      return NextResponse.json(
        { error: 'symbol query param is required' },
        { status: 400, headers: rateLimitHeaders(limit) }
      );
    }

    const bars = await getBars({ symbol, timeframe, limit: limitParam });

    return NextResponse.json(
      {
        symbol,
        timeframe,
        bars: bars.map((b: any) => ({
          timestamp: b.Timestamp || b.timestamp,
          open: Number(b.OpenPrice || b.open),
          high: Number(b.HighPrice || b.high),
          low: Number(b.LowPrice || b.low),
          close: Number(b.ClosePrice || b.close),
          volume: Number(b.Volume || b.volume),
          vwap: b.VWAP || b.vwap ? Number(b.VWAP || b.vwap) : null,
        })),
        count: bars.length,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch bars' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
