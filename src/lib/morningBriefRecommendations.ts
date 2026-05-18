import { callLLM } from '@/lib/ai/client';
import { scanForQualityDips, DipCandidate } from '@/lib/dipScanner';
import { MarketState } from '@/lib/marketState';

// ── Alpaca helpers ───────────────────────────────────────────────
function getAlpacaCreds() {
  return {
    key: process.env.ALPACA_API_KEY || '',
    secret: process.env.ALPACA_SECRET_KEY || '',
  };
}

const ALPACA_DATA = 'https://data.alpaca.markets';

async function fetchBars(
  symbols: string[],
  days: number = 5
): Promise<Record<string, number[]>> {
  const { key, secret } = getAlpacaCreds();
  if (!key || !secret) return {};

  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - (days + 2) * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const result: Record<string, number[]> = {};

  // Fetch in parallel batches of 5
  const batches = [];
  for (let i = 0; i < symbols.length; i += 5) {
    batches.push(symbols.slice(i, i + 5));
  }

  for (const batch of batches) {
    const promises = batch.map(async (sym) => {
      try {
        const url = `${ALPACA_DATA}/v2/stocks/${sym}/bars?start=${start}&end=${end}&timeframe=1D&limit=${days + 1}&adjustment=raw`;
        const res = await fetch(url, {
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (!res.ok) return;
        const json = await res.json();
        const bars = (json.bars || []) as any[];
        result[sym] = bars.map((b: any) => b.c).filter((c: number) => c > 0);
      } catch {
        // skip
      }
    });
    await Promise.all(promises);
  }

  return result;
}

// ── Scan: Momentum ───────────────────────────────────────────────
interface MomentumResult {
  symbol: string;
  returns_5d: number;
  score: number;
}

async function scanMomentum(
  symbols: string[]
): Promise<MomentumResult[]> {
  if (symbols.length === 0) return [];

  console.log(`[MorningBrief] Scanning momentum for ${symbols.length} symbols`);
  const bars = await fetchBars(symbols, 5);

  const results: MomentumResult[] = [];
  for (const sym of symbols) {
    const prices = bars[sym];
    if (!prices || prices.length < 3) continue;

    const returns5d = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
    // Score: absolute return weighted by consistency (more bars = more confidence)
    const score = Math.min(100, Math.max(0, 50 + returns5d * 5));

    results.push({ symbol: sym, returns_5d: parseFloat(returns5d.toFixed(2)), score });
  }

  // Sort by returns descending, take top 5
  return results.sort((a, b) => b.returns_5d - a.returns_5d).slice(0, 5);
}

// ── Scan: Value ──────────────────────────────────────────────────
interface ValueResult {
  symbol: string;
  current_price: number;
  avg_20d: number;
  discount_pct: number;
  score: number;
}

async function scanValue(
  symbols: string[]
): Promise<ValueResult[]> {
  if (symbols.length === 0) return [];

  console.log(`[MorningBrief] Scanning value for ${symbols.length} symbols`);
  const bars = await fetchBars(symbols, 20);

  const results: ValueResult[] = [];
  for (const sym of symbols) {
    const prices = bars[sym];
    if (!prices || prices.length < 5) continue;

    const current = prices[prices.length - 1];
    const avg20 = prices.reduce((a, b) => a + b, 0) / prices.length;
    const discount = ((current - avg20) / avg20) * 100;

    // Negative = below avg (potentially undervalued)
    if (discount < -1) {
      const score = Math.min(100, Math.max(0, 50 + Math.abs(discount) * 3));
      results.push({
        symbol: sym,
        current_price: parseFloat(current.toFixed(2)),
        avg_20d: parseFloat(avg20.toFixed(2)),
        discount_pct: parseFloat(discount.toFixed(2)),
        score,
      });
    }
  }

  // Sort by most discounted, take top 5
  return results.sort((a, b) => a.discount_pct - b.discount_pct).slice(0, 5);
}

// ── Main: Generate Recommendations ───────────────────────────────
export interface MorningRecommendation {
  symbol: string;
  action: 'buy';
  reason: string;
  strategy: 'Quality Dip' | 'Momentum' | 'Value';
  score: number; // 0-100
  entry_range: string;
}

export async function generateMorningRecommendations(
  portfolioContext: Record<string, any>,
  marketState: MarketState,
  watchlist: string[]
): Promise<MorningRecommendation[]> {
  // Combine watchlist with a core universe for scanning
  const sp500Subset = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','JNJ',
    'WMT','PG','XOM','UNH','HD','BAC','MA','DIS','NFLX','ADBE'];
  const universe = Array.from(new Set([...watchlist, ...sp500Subset]));

  // Strategy 1: Quality Dips (via existing dip scanner)
  let dipCandidates: Pick<DipCandidate, 'symbol' | 'score' | 'grade' | 'current_price' | 'change_pct'>[] = [];
  try {
    const dips = await scanForQualityDips(watchlist, marketState);
    dipCandidates = dips.slice(0, 5).map(d => ({
      symbol: d.symbol,
      score: d.score,
      grade: d.grade,
      current_price: d.current_price,
      change_pct: d.change_pct,
    }));
    console.log(`[MorningBrief] Quality dips found: ${dipCandidates.length}`);
  } catch (err: any) {
    console.warn('[MorningBrief] Dip scan failed:', err.message);
  }

  // Strategy 2: Momentum
  let momentumStocks: MomentumResult[] = [];
  try {
    momentumStocks = await scanMomentum(universe);
    console.log(`[MorningBrief] Momentum stocks found: ${momentumStocks.length}`);
  } catch (err: any) {
    console.warn('[MorningBrief] Momentum scan failed:', err.message);
  }

  // Strategy 3: Value
  let valueStocks: ValueResult[] = [];
  try {
    valueStocks = await scanValue(universe);
    console.log(`[MorningBrief] Value stocks found: ${valueStocks.length}`);
  } catch (err: any) {
    console.warn('[MorningBrief] Value scan failed:', err.message);
  }

  // If no candidates found, return empty
  if (dipCandidates.length === 0 && momentumStocks.length === 0 && valueStocks.length === 0) {
    console.log('[MorningBrief] No candidates from any strategy');
    return [];
  }

  // Build LLM prompt
  const prompt = `Market state: ${JSON.stringify(marketState)}

Quality dips (top 5): ${JSON.stringify(dipCandidates)}
Momentum (top 5): ${JSON.stringify(momentumStocks)}
Value (top 5): ${JSON.stringify(valueStocks)}

Combine all three strategies and rank the top 5 overall stocks to buy.
Consider diversification across strategies — don't pick all from one bucket.
For each, include an entry range based on current price (e.g., "$94-98" for a $96 stock).

Return ONLY valid JSON array — no markdown, no explanation:
[{
  "symbol": "AAPL",
  "action": "buy",
  "reason": "one line reason",
  "strategy": "Quality Dip|Momentum|Value",
  "score": 85,
  "entry_range": "$94-98"
}]`;

  let rawResponse: string;
  try {
    rawResponse = await callLLM(prompt);
    console.log(`[MorningBrief] LLM response length: ${rawResponse.length}`);
  } catch (err: any) {
    console.error('[MorningBrief] LLM call failed:', err.message);
    return [];
  }

  // Parse JSON (handle markdown code blocks)
  let recommendations: MorningRecommendation[];
  try {
    const clean = rawResponse
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    recommendations = JSON.parse(clean);
  } catch (err: any) {
    console.error('[MorningBrief] Failed to parse LLM response:', err.message);
    console.error('[MorningBrief] Raw response:', rawResponse.slice(0, 200));
    return [];
  }

  console.log(`[MorningBrief] Generated ${recommendations.length} recommendations`);

  // Store in daily_suggestions
  try {
    const { getClient, ensureUserByAlpacaId } = await import('@/lib/supabase');
    const supabase = getClient();

    // Resolve user ID from Alpaca account
    let userId: string | null = null;
    try {
      const accountRes = await fetch('https://paper-api.alpaca.markets/v2/account', {
        headers: {
          'APCA-API-KEY-ID': getAlpacaCreds().key,
          'APCA-API-SECRET-KEY': getAlpacaCreds().secret,
        },
      });
      if (accountRes.ok) {
        const account = await accountRes.json();
        userId = await ensureUserByAlpacaId(account.id);
      }
    } catch {
      console.warn('[MorningBrief] Could not resolve userId for storage');
    }

    const today = new Date().toISOString().split('T')[0];
    const { error: insertError } = await supabase
      .from('daily_suggestions')
      .upsert(
        {
          user_id: userId,
          date: today,
          market_state: marketState,
          suggestions: {
            recommendations,
            dipCandidates,
            momentumStocks,
            valueStocks,
            timestamp: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      );

    if (insertError) {
      console.error('[MorningBrief] Failed to store suggestions:', insertError.message);
    } else {
      console.log('[MorningBrief] Stored suggestions for', today);
    }
  } catch (err: any) {
    console.warn('[MorningBrief] Supabase storage failed:', err.message);
  }

  return recommendations;
}
