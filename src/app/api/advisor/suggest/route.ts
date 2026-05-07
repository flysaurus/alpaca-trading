// ── AI Advisor API — generate suggestions on the server ───────────

import { NextRequest, NextResponse } from 'next/server';
import { generateSuggestions, type AdvisorConfig } from '@/lib/ai-advisor';

const DEFAULT_CONFIG: AdvisorConfig = {
  confidence_threshold: 70,
  max_position_size_pct: 10,
  allowed_actions: ['buy', 'sell', 'hold', 'watch'],
  risk_tolerance: 'moderate',
};

function getEnvKeys() {
  const key    = process.env.ALPACA_API_KEY    || '';
  const secret = process.env.ALPACA_SECRET_KEY || '';
  return { key, secret };
}

/*───────────────────────────────────────────────────────────
  POST /api/advisor/suggest
  body: { watchlist: string[], config?: Partial<AdvisorConfig> }
  Returns full AISuggestion[] for the given symbols.
───────────────────────────────────────────────────────────*/
export async function POST(req: NextRequest) {
  try {
    const { watchlist, config } = (await req.json()) as {
      watchlist: string[];
      config?: Partial<AdvisorConfig>;
    };

    if (!Array.isArray(watchlist) || watchlist.length === 0) {
      return NextResponse.json({ error: 'Missing or empty watchlist' }, { status: 400 });
    }

    const { key, secret } = getEnvKeys();
    if (!key || !secret) {
      return NextResponse.json(
        { error: 'Alpaca credentials not configured' },
        { status: 500 }
      );
    }

    const mergedCfg: AdvisorConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    const suggestions = await generateSuggestions(watchlist, mergedCfg);

    return NextResponse.json({ success: true, suggestions, symbolCount: watchlist.length });
  } catch (error: any) {
    console.error('[API] /advisor/suggest failed:', error);
    return NextResponse.json(
      { error: error.message || 'AI suggestion failed' },
      { status: 500 }
    );
  }
}
