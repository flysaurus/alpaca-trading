import { NextResponse } from 'next/server';
import { fetchYahoo52Week } from '@/lib/yahoo';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);
  let symbol: string | undefined;

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const url = new URL(request.url);
    symbol = url.searchParams.get('symbol')?.toUpperCase();
    if (!symbol) {
      return NextResponse.json(
        { error: 'symbol required' },
        { status: 400, headers: rateLimitHeaders(limit) }
      );
    }

    const range = await fetchYahoo52Week(symbol);
    console.log(`[range52] ${symbol}: ${JSON.stringify(range)}`);
    
    if (!range || range.low <= 0 || range.high <= 0 || range.low >= range.high) {
      return NextResponse.json(
        { low: 0, high: 0, note: 'No valid range data' },
        { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'max-age=60' } }
      );
    }

    return NextResponse.json(
      { symbol, ...range },
      { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'max-age=3600' } }
    );
  } catch (error: any) {
    console.error(`[range52] Error for ${symbol || 'unknown'}:`, error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch 52-week range' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
