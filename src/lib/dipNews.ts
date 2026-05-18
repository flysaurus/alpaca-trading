import { callLLM } from './ai/client';

export interface DipReason {
  /** Detailed stock-specific cause of this dip — NOT a template */
  reason: string;
  recovery_probability: 'HIGH' | 'MEDIUM' | 'LOW';
  one_line_summary: string;
  red_flags: string[];
}

// In-memory cache per symbol
const cache = new Map<string, { timestamp: number; data: DipReason }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface DipClassifierContext {
  symbol: string;
  changePercent: number;      // e.g. -7.2 (negative = drop)
  priceYesterday: number;
  priceToday: number;
  headlines: string[];
  rsi: number | null;
  marketState: string;        // e.g. 'bull_trending', 'bear_volatile'
  volRatio: number;           // today volume / yesterday volume
}

export async function classifyDipReason(ctx: DipClassifierContext): Promise<DipReason> {
  const { symbol, changePercent, priceYesterday, priceToday, headlines, rsi, marketState, volRatio } = ctx;

  const now = Date.now();
  const cached = cache.get(symbol);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const dropPct = Math.abs(changePercent).toFixed(1);
  const rsiStr = rsi !== null ? rsi.toFixed(1) : 'unknown';
  const headlinesStr = headlines.length > 0
    ? headlines.map(h => `"${h}"`).join('; ')
    : 'No specific news headlines found for today';

  const prompt = `Stock: ${symbol}
Drop: -${dropPct}% (from $${priceYesterday.toFixed(2)} → $${priceToday.toFixed(2)})
Headlines: ${headlinesStr}
RSI: ${rsiStr}
Market: ${marketState}
Volume: ${volRatio.toFixed(1)}x normal

Analyze specifically what caused THIS drop for ${symbol}.
Not a template. Unique reason for ${symbol}.

Consider:
- Did they miss earnings? By how much?
- Is the whole sector down? Check headlines for sector context
- Company-specific news? Product recall, guidance, management change
- Macro factors only? Check if headlines point to Fed, tariffs, geopolitical
- Fraud, SEC probe, or major lawsuit — check for legal keywords in headlines

Return JSON:
{
  "reason": "specific cause for this stock",
  "recovery_probability": "HIGH|MEDIUM|LOW",
  "one_line_summary": "unique one-liner",
  "red_flags": []
}`;

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('LLM timeout')), 30000)
  );

  let raw: string;
  try {
    raw = await Promise.race([
      callLLM(prompt, { temperature: 0.2, max_tokens: 400 }),
      timeoutPromise,
    ]);
  } catch (err: any) {
    console.warn(`[dipNews] LLM failed for ${symbol}:`, err.message);
    return {
      reason: `Unable to classify — ${symbol} dropped ${dropPct}% on ${marketState} market`,
      recovery_probability: 'MEDIUM',
      one_line_summary: `${symbol} dropped ${dropPct}% — analysis unavailable`,
      red_flags: [],
    };
  }

  console.log(`[dipNews] Raw LLM response for ${symbol}:`, raw);

  let parsed: DipReason;
  try {
    // Try direct parse first
    parsed = JSON.parse(raw) as DipReason;
  } catch {
    // Try extracting from markdown fences
    const clean = raw
      .replace(/^```(?:json)?\s*$/gm, '')
      .replace(/^```$/gm, '');
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as DipReason;
      } catch {
        parsed = fallbackDipReason(symbol, dropPct, marketState);
      }
    } else {
      parsed = fallbackDipReason(symbol, dropPct, marketState);
    }
  }

  // Validate required fields
  if (!parsed.reason || !parsed.one_line_summary || !Array.isArray(parsed.red_flags)) {
    parsed = fallbackDipReason(symbol, dropPct, marketState);
  }

  cache.set(symbol, { timestamp: now, data: parsed });
  return parsed;
}

function fallbackDipReason(symbol: string, dropPct: string, marketState: string): DipReason {
  return {
    reason: `${symbol} dropped ${dropPct}% — unable to determine specific cause (analysis error)`,
    recovery_probability: 'MEDIUM',
    one_line_summary: `${symbol} dropped ${dropPct}% — analysis unavailable`,
    red_flags: [],
  };
}

export function isDipSafe(reason: DipReason): boolean {
  const combined = `${reason.reason} ${reason.one_line_summary} ${reason.red_flags.join(' ')}`.toLowerCase();

  // Block on fraud, legal, SEC, lawsuit keywords
  const fraudKeywords = ['fraud', 'sec probe', 'sec investigation', 'lawsuit', 'class action', 'doj', 'criminal'];
  for (const kw of fraudKeywords) {
    if (combined.includes(kw)) return false;
  }

  // Block on company-specific structural problems with low recovery
  if (
    reason.recovery_probability === 'LOW' &&
    (combined.includes('bankruptcy') || combined.includes('restructuring') || combined.includes('delisting'))
  ) {
    return false;
  }

  return true;
}
