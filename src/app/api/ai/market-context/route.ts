// ── POST /api/ai/market-context — Market Regime Analysis ────────
// Accepts market data, returns contextual analysis of current
// market conditions and tactical adjustments.

import { NextRequest, NextResponse } from 'next/server';
import { analyzeMarketContext } from '@/lib/ai/marketContext';
import type { MarketInput } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input: MarketInput = {
      vix: typeof body.vix === 'number' ? body.vix : null,
      spy_change_pct: body.spy_change_pct ?? 0,
      qqq_change_pct: body.qqq_change_pct ?? 0,
      dia_change_pct: body.dia_change_pct,
      sector_performance: body.sector_performance,
      upcoming_events: body.upcoming_events,
      market_breadth: body.market_breadth,
      put_call_ratio: body.put_call_ratio,
      top_stories: body.top_stories?.slice(0, 5),
      is_open: body.is_open ?? true,
    };

    const useLLM = body.use_llm !== false;

    const analysis = await analyzeMarketContext(input, useLLM);

    return NextResponse.json({
      success: true,
      analysis,
      provider: useLLM ? 'claude' : 'rules-based',
    });
  } catch (error: any) {
    console.error('[API] /ai/market-context failed:', error);
    return NextResponse.json(
      { error: error.message || 'Market analysis failed' },
      { status: 500 }
    );
  }
}
