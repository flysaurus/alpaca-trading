// ── POST /api/ai/risk — AI Risk Analysis ───────────────────────
// Accepts portfolio + account data, returns structured risk assessment.
// Falls back to rules-based calculation when LLM unavailable.

import { NextRequest, NextResponse } from 'next/server';
import { analyzeRisk } from '@/lib/ai/riskAnalyzer';
import type { RiskAnalysisInput } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input: RiskAnalysisInput = {
      positions: body.positions || [],
      account: {
        equity: parseFloat(body.account?.equity || body.account?.total_equity || 0),
        cash: parseFloat(body.account?.cash || 0),
        buying_power: parseFloat(body.account?.buying_power || 0),
        day_pnl: parseFloat(body.account?.day_pnl || 0),
      },
      vix: typeof body.vix === 'number' ? body.vix : null,
      risk_tolerance: body.risk_tolerance || 'moderate',
    };

    const useLLM = body.use_llm !== false; // Default true, explicitly set false to use rules-only

    const analysis = await analyzeRisk(input, useLLM);

    return NextResponse.json({
      success: true,
      analysis,
      provider: useLLM ? 'deepseek' : 'rules-based',
    });
  } catch (error: any) {
    console.error('[API] /ai/risk failed:', error);
    return NextResponse.json(
      { error: error.message || 'Risk analysis failed' },
      { status: 500 }
    );
  }
}
