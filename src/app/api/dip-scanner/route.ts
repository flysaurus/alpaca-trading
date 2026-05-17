import { NextRequest, NextResponse } from 'next/server';
import { scanForQualityDips, DipCandidate } from '@/lib/dipScanner';
import { classifyDipReason, isDipSafe, DipReason } from '@/lib/dipNews';

// Simple in-memory cache for the entire response
interface CachedResponse {
  timestamp: number;
  data: NextResponse;
}

const RESPONSE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let responseCache: CachedResponse | null = null;

interface EnrichedCandidate extends DipCandidate {
  news_reason: DipReason;
  safe_to_buy: boolean;
  suggested_entry: number;
  suggested_stop: number;
  suggested_amount: number;
}

export async function GET(request: NextRequest) {
  const now = Date.now();

  // Return cached response if valid
  if (responseCache && now - responseCache.timestamp < RESPONSE_CACHE_TTL_MS) {
    return responseCache.data.clone();
  }

  // 1. Fetch market state from /api/market (internal call)
  const baseUrl = new URL(request.url).origin;
  const marketRes = await fetch(`${baseUrl}/api/market`, {
    next: { revalidate: 60 },
  });

  if (!marketRes.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch market state' },
      { status: 502 }
    );
  }

  const marketResponse = await marketRes.json();
  // Extract the nested marketState object (not the full response with isOpen/nextOpen)
  const marketState = marketResponse.marketState || marketResponse;
  console.log('[dip-scanner] Market state:', marketState.state, '| dip_buying_enabled:', marketState.dip_buying_enabled);

  // 2. Get watchlist symbols from header or query param
  const watchlistHeader = request.headers.get('x-watchlist');
  const watchlistParam = request.nextUrl.searchParams.get('watchlist');

  const watchlistRaw = watchlistHeader || watchlistParam || '';
  const watchlistSymbols = watchlistRaw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (watchlistSymbols.length === 0) {
    return NextResponse.json(
      { error: 'No watchlist provided. Use ?watchlist=AAPL,TSLA or x-watchlist header' },
      { status: 400 }
    );
  }

  // 3. Call scanForQualityDips
  const candidates = await scanForQualityDips(watchlistSymbols, marketState);

  // 4. For each candidate with score >= 50, fetch news and classify
  const enrichedCandidates: EnrichedCandidate[] = [];

  for (const candidate of candidates) {
    if ((candidate.score ?? 0) < 50) continue;

    // 4a. Fetch news from Alpaca
    const newsRes = await fetch(
      `https://data.alpaca.markets/v1beta1/news?symbols=${candidate.symbol}&limit=5`,
      {
        headers: {
          accept: 'application/json',
        },
      }
    );

    let headlines: string[] = [];
    if (newsRes.ok) {
      const newsData = await newsRes.json();
      headlines = (newsData.news || [])
        .map((n: { headline?: string }) => n.headline)
        .filter(Boolean);
    }

    // 4b. Call classifyDipReason
    const dipReason = await classifyDipReason(candidate.symbol, headlines);

    // 4c. Filter out unsafe dips
    const safeToBuy = isDipSafe(dipReason);

    enrichedCandidates.push({
      ...candidate,
      news_reason: dipReason,
      safe_to_buy: safeToBuy,
      suggested_entry: candidate.current_price,
      suggested_stop: candidate.current_price * 0.92,
      suggested_amount: 500,
    });
  }

  const totalScanned = candidates.length;
  const totalQualified = enrichedCandidates.length;

  // Save recommendations to Supabase
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const today = new Date().toISOString().split('T')[0];

      // Get a user_id — we don't have auth context here, so use a default
      // In production, this should come from the authenticated session
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .limit(1)
        .single();
      const userId = userData?.id || '00000000-0000-0000-0000-000000000000';

      const rows = enrichedCandidates.map((c) => ({
        user_id: userId,
        date: today,
        symbol: c.symbol,
        action: c.safe_to_buy ? 'buy' : 'watch',
        score: c.score,
        change_pct_at_recommendation: c.change_pct,
        price_at_recommendation: c.current_price,
        suggested_amount: c.suggested_amount,
        stop_loss: c.suggested_stop,
        news_reason: c.news_reason,
        market_state: marketState.state || 'unknown',
      }));

      const { error } = await supabase
        .from('scanner_recommendations')
        .upsert(rows, { onConflict: 'user_id,date,symbol' });

      if (error) {
        console.error('[dip-scanner] Supabase upsert error:', error.message);
      } else {
        console.log(`[dip-scanner] Saved ${rows.length} recommendations to Supabase`);
      }
    }
  } catch (err: any) {
    console.error('[dip-scanner] Failed to save recommendations:', err.message);
  }

  const payload = {
    market_state: marketState,
    scan_time: new Date().toISOString(),
    candidates: enrichedCandidates,
    total_scanned: totalScanned,
    total_qualified: totalQualified,
  };

  console.log(
    `[dip-scanner] scan complete, ${totalQualified} candidates found (scanned ${totalScanned})`
  );

  const response = NextResponse.json(payload);

  // Cache the response
  responseCache = { timestamp: now, data: response };

  return response.clone();
}
