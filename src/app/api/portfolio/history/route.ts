import { NextResponse } from 'next/server';
import { getPortfolioHistory, AlpacaError } from '@/lib/alpaca';
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
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '1M';
    const timeframe = searchParams.get('timeframe') || '1D';

    const history = await getPortfolioHistory({ period, timeframe });

    return NextResponse.json(
      { history },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch portfolio history' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
