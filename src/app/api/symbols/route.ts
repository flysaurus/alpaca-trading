import { NextResponse } from 'next/server';
import { getAllAssets, searchSymbols } from '@/lib/symbols';
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

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const count = parseInt(url.searchParams.get('limit') || '10', 10);

    if (!query || query.length < 1) {
      return NextResponse.json(
        { symbols: [] },
        { headers: rateLimitHeaders(limit) }
      );
    }

    // Try session keys first, fall back to env vars
    const keys = await requireSession();
    const assets = await getAllAssets(keys || undefined);
    const results = searchSymbols(query, assets, count);

    return NextResponse.json(
      {
        symbols: results,
        query,
        count: results.length,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to search symbols' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
