import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { requireSession } from '@/lib/session';

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);
  let symbol = '';

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

  try {
    const url = new URL(request.url);
    symbol = url.searchParams.get('symbol')?.toUpperCase() || '';
    const timeframe = url.searchParams.get('timeframe') || '1Day';
    const limitParam = parseInt(url.searchParams.get('limit') || '30', 10);

    if (!symbol) {
      return NextResponse.json(
        { error: 'symbol query param is required' },
        { status: 400, headers: rateLimitHeaders(limit) }
      );
    }

    const alpacaUrl = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limitParam}&adjustment=raw&feed=iex`;

    const res = await fetch(alpacaUrl, {
      headers: {
        'APCA-API-KEY-ID': keys.apiKey,
        'APCA-API-SECRET-KEY': keys.secretKey,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      console.error(`[bars] Alpaca HTTP ${res.status}:`, errText);
      return NextResponse.json(
        { error: `Alpaca error: ${res.status}` },
        { status: res.status === 429 ? 429 : 502, headers: rateLimitHeaders(limit) }
      );
    }

    const data = await res.json();
    const rawBars = data.bars?.[symbol] || [];

    console.log(`[bars] ${symbol}: fetched ${rawBars.length} bars`);
    if (rawBars.length > 0) {
      console.log(`[bars] ${symbol} last bar:`, JSON.stringify(rawBars[rawBars.length - 1]));
    }

    const bars = rawBars.map((b: any) => ({
      timestamp: b.t,
      open: Number(b.o),
      high: Number(b.h),
      low: Number(b.l),
      close: Number(b.c),
      volume: Number(b.v),
      vwap: b.vw ? Number(b.vw) : null,
    }));

    return NextResponse.json(
      {
        symbol,
        timeframe,
        bars,
        count: bars.length,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    console.error(`[API /bars] Error for ${symbol}:`, JSON.stringify({
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    }, null, 2));
    return NextResponse.json(
      { error: error.message || 'Failed to fetch bars' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
