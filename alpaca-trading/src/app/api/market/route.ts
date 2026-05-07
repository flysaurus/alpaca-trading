import { NextResponse } from 'next/server';
import { getClock, AlpacaError } from '@/lib/alpaca';
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
    const clock = await getClock();

    return NextResponse.json(
      {
        isOpen: clock.is_open,
        nextOpen: clock.next_open,
        nextClose: clock.next_close,
        timestamp: clock.timestamp,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market clock' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
