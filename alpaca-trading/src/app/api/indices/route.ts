import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

const INDEX_MAP = [
  { alpaca: 'DIA', name: 'DJIA', short: 'DJIA', scale: 100 },
  { alpaca: 'SPY', name: 'S&P 500', short: 'S&P 500', scale: 10 },
  { alpaca: 'QQQ', name: 'NASDAQ', short: 'NASDAQ', scale: 3.5 },
  { alpaca: 'IWM', name: 'Russell 2000', short: 'RUSSELL', scale: 1.5 },
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

    // Fetch snapshots from Alpaca Data API
    const symbols = INDEX_MAP.map((i) => i.alpaca).join(',');
    const res = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols}`, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Alpaca data error: ${res.status}` },
        { status: 502, headers: rateLimitHeaders(limit) }
      );
    }

    const snapshots = await res.json();

    const results = [];
    for (const idx of INDEX_MAP) {
      const snap = snapshots[idx.alpaca];
      if (!snap) continue;

      const todayClose = snap.dailyBar?.c || snap.latestTrade?.p || 0;
      const yesterdayClose = snap.prevDailyBar?.c || 0;

      if (!todayClose || !yesterdayClose) continue;

      const change = todayClose - yesterdayClose;
      const changePercent = yesterdayClose ? (change / yesterdayClose) * 100 : 0;

      results.push({
        symbol: idx.alpaca,
        shortName: idx.short,
        name: idx.name,
        value: todayClose * idx.scale,
        change: change * idx.scale,
        changePercent,
        prevClose: yesterdayClose * idx.scale,
      });
    }

    return NextResponse.json(
      { data: results },
      { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch indices' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
