// ── AI Advisor API — generate suggestions on the server ───────────

import { NextRequest, NextResponse } from 'next/server';
import { generateSuggestions, type AdvisorConfig } from '@/lib/ai-advisor';
import { requireSession } from '@/lib/session';

const DEFAULT_CONFIG: AdvisorConfig = {
  confidence_threshold: 70,
  max_position_size_pct: 10,
  allowed_actions: ['buy', 'sell', 'hold', 'watch'],
  risk_tolerance: 'moderate',
};

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

    // Require valid session (generateSuggestions calls getBars which uses session keys)
    const keys = await requireSession();
    if (!keys) {
      return NextResponse.json({ error: 'Session expired, re-authenticate' }, { status: 401 });
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
