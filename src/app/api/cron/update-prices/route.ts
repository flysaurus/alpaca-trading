import { NextResponse } from 'next/server';

const ALPACA_TRADE_URL = 'https://paper-api.alpaca.markets';

function getAlpacaCreds() {
  const keyId = process.env.ALPACA_API_KEY || '';
  const secretKey = process.env.ALPACA_SECRET_KEY || '';
  return { keyId, secretKey };
}

export async function GET() {
  try {
    const { getClient } = await import('@/lib/supabase');
    const supabase = getClient();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ── 7-day updates ──────────────────────────────────────────
    const { data: recs7d } = await supabase
      .from('scanner_recommendations')
      .select('id, symbol, price_at_recommendation, date')
      .is('price_7d', null)
      .lte('date', sevenDaysAgo);

    let updated7d = 0;
    if (recs7d && recs7d.length > 0) {
      const { keyId, secretKey } = getAlpacaCreds();
      const symbols = [...new Set(recs7d.map((r: any) => r.symbol))].join(',');

      const quoteRes = await fetch(
        `https://data.alpaca.markets/v2/stocks/quotes?symbols=${encodeURIComponent(symbols)}&feed=iex`,
        {
          headers: {
            'APCA-API-KEY-ID': keyId,
            'APCA-API-SECRET-KEY': secretKey,
          },
        }
      );

      const quotes = quoteRes.ok ? await quoteRes.json() : {};

      for (const rec of recs7d as any[]) {
        const quote = quotes?.quotes?.[rec.symbol];
        const currentPrice = quote?.bp || quote?.ap || null;
        if (!currentPrice || !rec.price_at_recommendation) continue;

        const return7d = ((currentPrice - rec.price_at_recommendation) / rec.price_at_recommendation) * 100;

        const { error } = await supabase
          .from('scanner_recommendations')
          .update({ price_7d: currentPrice, return_7d: return7d })
          .eq('id', rec.id);

        if (!error) updated7d++;
      }
    }

    // ── 30-day updates ─────────────────────────────────────────
    const { data: recs30d } = await supabase
      .from('scanner_recommendations')
      .select('id, symbol, price_at_recommendation, date')
      .is('price_30d', null)
      .lte('date', thirtyDaysAgo);

    let updated30d = 0;
    if (recs30d && recs30d.length > 0) {
      const { keyId, secretKey } = getAlpacaCreds();
      const symbols = [...new Set(recs30d.map((r: any) => r.symbol))].join(',');

      const quoteRes = await fetch(
        `https://data.alpaca.markets/v2/stocks/quotes?symbols=${encodeURIComponent(symbols)}&feed=iex`,
        {
          headers: {
            'APCA-API-KEY-ID': keyId,
            'APCA-API-SECRET-KEY': secretKey,
          },
        }
      );

      const quotes = quoteRes.ok ? await quoteRes.json() : {};

      for (const rec of recs30d as any[]) {
        const quote = quotes?.quotes?.[rec.symbol];
        const currentPrice = quote?.bp || quote?.ap || null;
        if (!currentPrice || !rec.price_at_recommendation) continue;

        const return30d = ((currentPrice - rec.price_at_recommendation) / rec.price_at_recommendation) * 100;

        const { error } = await supabase
          .from('scanner_recommendations')
          .update({ price_30d: currentPrice, return_30d: return30d })
          .eq('id', rec.id);

        if (!error) updated30d++;
      }
    }

    console.log(`[Cron] Updated prices: ${updated7d} 7-day, ${updated30d} 30-day`);

    return NextResponse.json({
      action: 'update_recommendation_prices',
      timestamp: new Date().toISOString(),
      updated7d,
      updated30d,
    });
  } catch (err: any) {
    console.error('[Cron] Price update failed:', err.message);
    return NextResponse.json(
      { error: `Price update failed: ${err.message}` },
      { status: 500 }
    );
  }
}
