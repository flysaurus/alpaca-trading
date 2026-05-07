import { NextResponse } from 'next/server';
import { getRelevantPolymarketEvents, searchPolymarketEvents } from '@/lib/polymarket';
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
    const symbolsParam = url.searchParams.get('symbols');
    const query = url.searchParams.get('q') || undefined;
    const symbols = symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()) : undefined;

    const events = query
      ? await searchPolymarketEvents(query, 10)
      : await getRelevantPolymarketEvents(symbols);

    return NextResponse.json(
      {
        events,
        count: events.length,
        timestamp: new Date().toISOString(),
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Polymarket data' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
