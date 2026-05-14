import { NextResponse } from 'next/server';
import { getPositions, AlpacaError } from '@/lib/alpaca';
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
    const positions = await getPositions();
    
    if (positions.length > 0) {
      console.log('[API /positions] Raw Alpaca position sample:', JSON.stringify(positions[0], null, 2));
    }

    return NextResponse.json(
      {
        positions: positions.map((p: any) => ({
          symbol: p.symbol,
          qty: Number(p.qty),
          marketValue: Number(p.market_value),
          avgEntryPrice: Number(p.avg_entry_price),
          currentPrice: Number(p.current_price),
          unrealizedPL: Number(p.unrealized_pl),
          unrealizedPLPercent: Number(p.unrealized_plpc) * 100,
          changeToday: Number(p.change_today),
          side: Number(p.qty) >= 0 ? 'long' : 'short',
        })),
        count: positions.length,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
