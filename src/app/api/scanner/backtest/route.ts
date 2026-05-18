import { NextRequest, NextResponse } from 'next/server';
import { computeBacktestStats } from '@/lib/backtest';

/**
 * GET /api/scanner/backtest
 * Returns hit rate + return stats for historical dip scanner signals.
 *
 * Fetches signals from Supabase scanner_recommendations,
 * computes current outcomes using Alpaca snapshots.
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all historical signals (up to 200)
    const { data: records, error } = await supabase
      .from('scanner_recommendations')
      .select('symbol, date, score, price_at_rec, action')
      .order('date', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[backtest] Supabase query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch signal history' },
        { status: 500 }
      );
    }

    const signals = (records || []).map((r: any) => ({
      symbol: r.symbol,
      date: r.date,
      score: r.score || 0,
      grade: r.score >= 85 ? 'A' : r.score >= 70 ? 'B' : 'C',
      price_at_rec: r.price_at_rec || 0,
    }));

    const stats = await computeBacktestStats(signals);

    return NextResponse.json({
      ...stats,
      cached: false,
      computed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[backtest] Error:', err.message);
    return NextResponse.json(
      { error: 'Backtest computation failed' },
      { status: 500 }
    );
  }
}
