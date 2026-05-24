// ── POST /api/ai/portfolio — Portfolio Analysis ─────────────────
// Accepts portfolio snapshot, returns allocation gaps,
// concentration warnings, and rebalancing suggestions.

import { NextRequest, NextResponse } from 'next/server';
import { analyzePortfolio } from '@/lib/ai/portfolioManager';
import type { PortfolioSnapshot } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const snapshot: PortfolioSnapshot = {
      positions: (body.positions || []).map((p: any) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty || p.quantity || 0),
        market_value: parseFloat(p.market_value || 0),
        current_price: parseFloat(p.current_price || 0),
        unrealized_plpc: typeof p.unrealized_plpc === 'number' ? p.unrealized_plpc : undefined,
        sector: p.sector || undefined,
        cost_basis: typeof p.cost_basis === 'number' ? p.cost_basis : undefined,
      })),
      equity: parseFloat(body.equity || body.total_equity || 0),
      cash: parseFloat(body.cash || 0),
      buying_power: parseFloat(body.buying_power || 0),
      risk_tolerance: body.risk_tolerance || 'moderate',
    };

    const useLLM = body.use_llm === true; // Default false (rules-based is comprehensive)

    const analysis = await analyzePortfolio(snapshot, useLLM);

    return NextResponse.json({
      success: true,
      analysis,
      provider: useLLM ? 'deepseek' : 'rules-based',
    });
  } catch (error: any) {
    console.error('[API] /ai/portfolio failed:', error);
    return NextResponse.json(
      { error: error.message || 'Portfolio analysis failed' },
      { status: 500 }
    );
  }
}
