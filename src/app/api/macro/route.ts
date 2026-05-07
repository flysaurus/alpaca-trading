import { NextResponse } from 'next/server';
import { getUpcomingEvents, getSymbolEvents } from '@/lib/macro';
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
    const symbol = url.searchParams.get('symbol') || undefined;
    const days = parseInt(url.searchParams.get('days') || '14', 10);

    const events = symbol
      ? await getSymbolEvents(symbol, days)
      : await getUpcomingEvents(days);

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
      { error: error.message || 'Failed to fetch macro events' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
