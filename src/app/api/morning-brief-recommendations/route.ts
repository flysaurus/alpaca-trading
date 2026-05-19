import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';

const ALPACA_TRADE_URL = 'https://paper-api.alpaca.markets';

async function fetchAlpacaAccount(apiKey: string, secretKey: string) {
  const res = await fetch(`${ALPACA_TRADE_URL}/v2/account`, {
    headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': secretKey },
  });
  if (!res.ok) throw new Error(`Account fetch failed: ${res.status}`);
  return res.json();
}

async function fetchAlpacaPositions(apiKey: string, secretKey: string) {
  const res = await fetch(`${ALPACA_TRADE_URL}/v2/positions`, {
    headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': secretKey },
  });
  if (!res.ok) throw new Error(`Positions fetch failed: ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  try {
    // Require valid session
    const keys = await requireSession();
    if (!keys) {
      return NextResponse.json({ error: 'Session expired, re-authenticate' }, { status: 401 });
    }

    // Check cache in daily_suggestions for today
    const today = new Date().toISOString().split('T')[0];
    const { getClient, ensureUserByAlpacaId } = await import('@/lib/supabase');

    const account = await fetchAlpacaAccount(keys.apiKey, keys.secretKey);
    const userId = await ensureUserByAlpacaId(account.id);

    const { data: cachedRow } = await getClient()
      .from('daily_suggestions')
      .select('suggestions')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    // Check if today's morning recommendations already stored
    if (cachedRow?.suggestions?.recommendations) {
      return NextResponse.json({
        recommendations: cachedRow.suggestions.recommendations,
        cached: true,
        timestamp: new Date().toISOString(),
      });
    }

    // Not cached — generate fresh
    const baseUrl = new URL(req.url).origin;

    // 1. Fetch market state
    const marketRes = await fetch(`${baseUrl}/api/market`, {
      next: { revalidate: 60 },
    });
    const marketData = marketRes.ok ? await marketRes.json() : {};
    const marketState = marketData.marketState || {};

    // 2. Fetch portfolio
    const positions = await fetchAlpacaPositions(keys.apiKey, keys.secretKey);
    const equity = parseFloat(account.equity || 0);
    const cash = parseFloat(account.cash || 0);

    const portfolio = {
      account: { equity, cash, buying_power: account.buying_power },
      positions: (positions || []).map((p: any) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty || 0),
        market_value: parseFloat(p.market_value || 0),
        current_price: parseFloat(p.current_price || p.lastday_price || 0),
        unrealized_pl: parseFloat(p.unrealized_pl || 0),
        unrealized_plpc: parseFloat(p.unrealized_plpc || 0),
      })),
    };

    // Build watchlist from positions
    const watchlist: string[] = Array.from(new Set(
      portfolio.positions.map((p: any) => p.symbol)
    ));

    // 3. Generate recommendations
    const { generateMorningRecommendations } = await import(
      '@/lib/morningBriefRecommendations'
    );
    const recs = await generateMorningRecommendations(
      portfolio,
      marketState,
      watchlist
    );

    return NextResponse.json({
      recommendations: recs,
      cached: false,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[morning-brief-recs] Failed:', err.message);
    return NextResponse.json(
      { error: `Failed: ${err.message}` },
      { status: 500 }
    );
  }
}
