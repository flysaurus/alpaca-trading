import { NextResponse } from 'next/server';
import { getClock, AlpacaError } from '@/lib/alpaca';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { classifyMarketState } from '@/lib/marketState';

const APCA_KEY = process.env.ALPACA_API_KEY;
const APCA_SECRET = process.env.ALPACA_SECRET_KEY;

let cache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchBars(symbol: string, limit: number, start?: string, end?: string): Promise<any[]> {
  let url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=1Day&limit=${limit}&feed=iex`;
  if (start) url += `&start=${encodeURIComponent(start)}`;
  if (end) url += `&end=${encodeURIComponent(end)}`;
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': APCA_KEY || '',
      'APCA-API-SECRET-KEY': APCA_SECRET || '',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca bars ${symbol}: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.bars?.[symbol] || [];
}

export async function GET(request: Request) {
  try {
    const ip = getClientIP(request);
    const limit = checkRateLimit(ip);

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    // Check cache
    if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cache.data, { headers: rateLimitHeaders(limit) });
    }

    const clock = await getClock();

    // Build date range: 90 days ago to today
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch SPY 80-day bars with date range
    const spyBars = await fetchBars('SPY', 80, startDate, endDate);
    if (spyBars.length < 2) {
      throw new Error('Insufficient SPY bar data');
    }

    // Fetch VIXY 2-day bars (last close = VIX proxy)
    const vixyBars = await fetchBars('VIXY', 2);
    const vix = vixyBars.length > 0 ? vixyBars[vixyBars.length - 1].c : 20;

    // Calculate SPY change%
    const latestClose = spyBars[spyBars.length - 1].c;
    const prevClose = spyBars[spyBars.length - 2].c;
    const spyChangePct = ((latestClose - prevClose) / prevClose) * 100;

    // Classify market state
    const marketState = classifyMarketState({
      spy_bars: spyBars,
      vix,
      spy_change_pct: spyChangePct,
      qqq_change_pct: 0, // not used in current logic
    });

    console.log(`[marketState] ${marketState.label} | SPY vs SMA50: ${marketState.spy_vs_sma50.toFixed(2)}% | VIX: ${marketState.vix.toFixed(2)}`);

    const response = {
      isOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
      timestamp: clock.timestamp,
      marketState: {
        state: marketState.state,
        label: marketState.label,
        color: marketState.color,
        advice: marketState.advice,
        spy_vs_sma50: marketState.spy_vs_sma50,
        vix: marketState.vix,
        dip_buying_enabled: marketState.dip_buying_enabled,
      },
    };

    // Update cache
    cache = { data: response, timestamp: Date.now() };

    return NextResponse.json(response, { headers: rateLimitHeaders(limit) });
  } catch (error: any) {
    console.log('Market route error:', error.message);
    console.log('Stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}
