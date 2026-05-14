import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

const CACHE_TTL_MS = 60 * 1000;

let _cache: { data: any[]; ts: number } | null = null;

function getCached(): any[] | null {
  if (!_cache) return null;
  if (Date.now() - _cache.ts > CACHE_TTL_MS) {
    _cache = null;
    return null;
  }
  return _cache.data;
}

function setCached(data: any[]) {
  _cache = { data, ts: Date.now() };
}

interface IndexConfig {
  alpaca: string;
  label: string;
  symbol: string;
}

const INDICES: IndexConfig[] = [
  { alpaca: 'DIA', label: 'DJIA', symbol: '^DJI' },
  { alpaca: 'SPY', label: 'S&P 500', symbol: '^GSPC' },
  { alpaca: 'QQQ', label: 'NASDAQ', symbol: '^IXIC' },
  { alpaca: 'IWM', label: 'Russell 2000', symbol: '^RUT' },
  { alpaca: 'VIXY', label: 'VIX', symbol: '^VIX' },
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

  // Return cached data if fresh
  const cached = getCached();
  if (cached) {
    console.log('[API /indices] Returning cached data');
    return NextResponse.json(
      { data: cached, cached: true },
      { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;

  if (!key || !secret) {
    console.error('[API /indices] Alpaca credentials not set');
    return NextResponse.json(
      { error: 'Alpaca API credentials not configured' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const symbols = INDICES.map((i) => i.alpaca).join(',');
    console.log('[API /indices] Fetching from Alpaca:', symbols);

    const res = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols}`, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Alpaca data error: ${res.status}`);
    }

    const snapshots = await res.json();
    console.log('[API /indices] Alpaca snapshots keys:', Object.keys(snapshots).join(', '));

    const results = [];
    for (const idx of INDICES) {
      const snap = snapshots[idx.alpaca];
      if (!snap) {
        console.warn(`[API /indices] No snapshot for ${idx.alpaca}`);
        continue;
      }

      const todayClose = snap.dailyBar?.c || snap.latestTrade?.p || 0;
      const yesterdayClose = snap.prevDailyBar?.c || 0;

      if (!todayClose || !yesterdayClose) {
        console.warn(`[API /indices] Missing bars for ${idx.alpaca}: today=${todayClose}, yesterday=${yesterdayClose}`);
        continue;
      }

      const change = todayClose - yesterdayClose;
      const changePercent = yesterdayClose ? (change / yesterdayClose) * 100 : 0;

      console.log(`[API /indices] ${idx.label}: ${todayClose.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}, ${changePercent.toFixed(2)}%)`);

      results.push({
        symbol: idx.symbol,
        shortName: idx.label,
        etfSymbol: idx.alpaca,
        value: todayClose,
        change,
        changePercent,
        prevClose: yesterdayClose,
        direction: change >= 0 ? 'up' : 'down',
        source: 'alpaca',
      });
    }

    if (results.length === 0) {
      throw new Error('No valid data returned from Alpaca');
    }

    setCached(results);

    return NextResponse.json(
      { data: results },
      { headers: { ...rateLimitHeaders(limit), 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.error('[API /indices] Error:', error.message);

    // Fallback to cached data even if expired
    if (_cache?.data) {
      console.log('[API /indices] Returning stale cached data after error');
      return NextResponse.json(
        { data: _cache.data, cached: true, stale: true },
        { headers: rateLimitHeaders(limit) }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch indices' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
