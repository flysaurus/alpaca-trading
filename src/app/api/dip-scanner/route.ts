import { NextRequest, NextResponse } from 'next/server';
import { scanForQualityDips, DipCandidate } from '@/lib/dipScanner';
import { classifyDipReason, isDipSafe, DipReason, DipClassifierContext } from '@/lib/dipNews';

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
}

export async function GET(request: NextRequest) {
  const now = Date.now();
  const historyDays = parseInt(request.nextUrl.searchParams.get('history') || '0', 10);

  // ── History mode: return last N days of saved candidates grouped by date ──
  if (historyDays > 0) {
    return getHistoryResponse(historyDays);
  }

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

    // 4b. Call classifyDipReason with full context
    const priceYesterday = candidate.current_price / (1 + candidate.change_pct / 100);
    const classifyCtx: DipClassifierContext = {
      symbol: candidate.symbol,
      changePercent: candidate.change_pct,
      priceYesterday,
      priceToday: candidate.current_price,
      headlines,
      rsi: candidate.rsi,
      marketState: marketState.state,
      volRatio: candidate.volume_ratio,
    };
    const dipReason = await classifyDipReason(classifyCtx);

    // 4c. Filter out unsafe dips
    const safeToBuy = isDipSafe(dipReason);

    enrichedCandidates.push({
      ...candidate,
      news_reason: dipReason,
      safe_to_buy: safeToBuy,
      suggested_entry: candidate.current_price,
      suggested_stop: candidate.current_price * (1 - candidate.stop_loss_pct / 100),
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
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .limit(1)
        .single();
      const userId = userData?.id || '00000000-0000-0000-0000-000000000000';

      for (const candidate of enrichedCandidates) {
        await supabase
          .from('scanner_recommendations')
          .upsert({
            user_id: userId,
            date: today,
            symbol: candidate.symbol,
            action: candidate.safe_to_buy ? 'buy' : 'watch',
            score: candidate.score,
            change_pct_at_rec: candidate.change_pct,
            price_at_rec: candidate.current_price,
            suggested_amount: candidate.suggested_amount,
            user_action: 'pending'
          }, { onConflict: 'user_id,date,symbol' });
      }

      console.log('Saved', enrichedCandidates.length, 'recs to DB');
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

// ── History mode: fetch saved recommendations from Supabase ──
async function getHistoryResponse(days: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: records, error } = await supabase
    .from('scanner_recommendations')
    .select('*')
    .gte('date', startDate)
    .order('date', { ascending: false })
    .order('time_slot', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[dip-scanner] History query failed:', error.message);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }

  // Group by date
  const groups: Record<string, {
    date: string;
    time_slots: string[];
    candidates: Array<{
      symbol: string;
      score: number;
      action: string;
      price_at_rec: number;
      change_pct_at_rec: number;
      suggested_amount: number;
      time_slot: string;
      user_action: string;
      safe_to_buy: boolean;
    }>;
  }> = {};

  for (const r of (records || []) as any[]) {
    const date = r.date;
    if (!groups[date]) {
      groups[date] = { date, time_slots: [], candidates: [] };
    }
    if (r.time_slot && !groups[date].time_slots.includes(r.time_slot)) {
      groups[date].time_slots.push(r.time_slot);
    }
    groups[date].candidates.push({
      symbol: r.symbol,
      score: r.score || 0,
      action: r.action || 'watch',
      price_at_rec: r.price_at_rec || 0,
      change_pct_at_rec: r.change_pct_at_rec || 0,
      suggested_amount: r.suggested_amount || 0,
      time_slot: r.time_slot || 'unknown',
      user_action: r.user_action || 'pending',
      safe_to_buy: r.action === 'buy',
    });
  }

  const sortedGroups = Object.values(groups).sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  return NextResponse.json({
    history_mode: true,
    days,
    start_date: startDate,
    groups: sortedGroups,
    total_dates: sortedGroups.length,
    total_candidates: sortedGroups.reduce((sum, g) => sum + g.candidates.length, 0),
    cached: false,
  });
}
