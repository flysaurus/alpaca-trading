/**
 * Backtesting engine for dip scanner + sell signals.
 * Tracks signal outcomes and computes hit rates.
 */

export interface BacktestResult {
  total_signals: number;
  profitable_signals: number;
  hit_rate: number;
  avg_return_7d: number | null;
  avg_return_30d: number | null;
  by_grade: Record<string, GradeStats>;
  recent_signals: SignalOutcome[];
}

export interface GradeStats {
  count: number;
  profitable: number;
  hit_rate: number;
  avg_return: number | null;
}

export interface SignalOutcome {
  symbol: string;
  date: string;
  score: number;
  grade: string;
  price_at_rec: number;
  current_price: number | null;
  return_pct: number | null;
  days_held: number;
  profitable: boolean | null;
}

const APCA_KEY = process.env.ALPACA_API_KEY;
const APCA_SECRET = process.env.ALPACA_SECRET_KEY;

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': APCA_KEY || '',
    'APCA-API-SECRET-KEY': APCA_SECRET || '',
  };
}

/**
 * Fetch current snapshots for a list of symbols.
 */
async function fetchCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const unique = [...new Set(symbols)];

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    try {
      const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(batch.join(','))}`;
      const res = await fetch(url, { headers: getAlpacaHeaders() });
      if (!res.ok) continue;
      const data = await res.json();
      for (const sym of Object.keys(data)) {
        const snap = data[sym];
        const bar = snap.dailyBar || snap.DailyBar || {};
        const price = bar.c || bar.C || snap.latestTrade?.p || snap.latestQuote?.bp || 0;
        if (price > 0) prices[sym] = price;
      }
    } catch (err: any) {
      console.warn(`[backtest] Snapshots batch failed:`, err.message);
    }
  }
  return prices;
}

/**
 * Fetch historical bars for checking price at a specific date offset.
 */
async function fetchBarsForDate(
  symbol: string,
  dateStr: string,
  offsetDays: number
): Promise<number | null> {
  try {
    // Get target date: dateStr + offsetDays
    const targetDate = new Date(dateStr);
    targetDate.setDate(targetDate.getDate() + offsetDays);

    // Format for Alpaca
    const end = targetDate.toISOString().split('T')[0];
    const start = new Date(targetDate);
    start.setDate(start.getDate() - 5); // 5-day window around target
    const startStr = start.toISOString().split('T')[0];

    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=1Day&start=${startStr}&end=${end}&limit=10&feed=iex`;
    const res = await fetch(url, { headers: getAlpacaHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const bars = (data.bars?.[symbol] || []) as Array<{ c?: number; C?: number; t?: string }>;
    if (bars.length === 0) return null;

    // Return closest bar
    const lastBar = bars[bars.length - 1];
    return lastBar.c ?? lastBar.C ?? null;
  } catch {
    return null;
  }
}

/**
 * Compute backtest stats from scanner signal history.
 * Accepts signal records from Supabase or similar.
 */
export async function computeBacktestStats(
  signals: Array<{
    symbol: string;
    date: string;
    score: number;
    grade?: string;
    price_at_rec: number;
  }>,
  outcomeLookbackDays = 60
): Promise<BacktestResult> {
  if (signals.length === 0) {
    return {
      total_signals: 0,
      profitable_signals: 0,
      hit_rate: 0,
      avg_return_7d: null,
      avg_return_30d: null,
      by_grade: {},
      recent_signals: [],
    };
  }

  // Group signals by symbol to batch-fetch prices
  const symbolSet = new Set(signals.map(s => s.symbol));
  const currentPrices = await fetchCurrentPrices([...symbolSet]);

  const outcomes: SignalOutcome[] = signals.map((s) => {
    const daysSinceSignal = Math.ceil(
      (Date.now() - new Date(s.date + 'T00:00:00Z').getTime()) / 86400000
    );
    const currentPrice = currentPrices[s.symbol] ?? null;
    const returnPct = currentPrice && s.price_at_rec > 0
      ? ((currentPrice - s.price_at_rec) / s.price_at_rec) * 100
      : null;

    const grade = s.grade || (
      s.score >= 85 ? 'A' : s.score >= 70 ? 'B' : 'C'
    );

    return {
      symbol: s.symbol,
      date: s.date,
      score: s.score,
      grade,
      price_at_rec: s.price_at_rec,
      current_price: currentPrice,
      return_pct: returnPct,
      days_held: Math.max(0, daysSinceSignal),
      profitable: returnPct !== null ? returnPct > 0 : null,
    };
  });

  // Filter to signals with measurable outcomes (at least 7 days old)
  const measurable = outcomes.filter(o => o.days_held >= 7 && o.profitable !== null);
  const profitable = measurable.filter(o => o.profitable === true);

  // Grade-level stats
  const byGrade: Record<string, GradeStats> = {};
  const gradeGroups: Record<string, SignalOutcome[]> = {};
  for (const o of measurable) {
    if (!gradeGroups[o.grade]) gradeGroups[o.grade] = [];
    gradeGroups[o.grade].push(o);
  }

  for (const [grade, signals] of Object.entries(gradeGroups)) {
    const profitableGrade = signals.filter(s => s.profitable);
    const returns = signals
      .map(s => s.return_pct)
      .filter((r): r is number => r !== null);

    byGrade[grade] = {
      count: signals.length,
      profitable: profitableGrade.length,
      hit_rate: signals.length > 0 ? profitableGrade.length / signals.length : 0,
      avg_return: returns.length > 0
        ? returns.reduce((a, b) => a + b, 0) / returns.length
        : null,
    };
  }

  // Avg returns
  const returns7d = measurable
    .filter(o => o.days_held >= 7)
    .map(o => o.return_pct)
    .filter((r): r is number => r !== null);

  const returns30d = measurable
    .filter(o => o.days_held >= 30)
    .map(o => o.return_pct)
    .filter((r): r is number => r !== null);

  return {
    total_signals: measurable.length,
    profitable_signals: profitable.length,
    hit_rate: measurable.length > 0 ? profitable.length / measurable.length : 0,
    avg_return_7d: returns7d.length > 0
      ? returns7d.reduce((a, b) => a + b, 0) / returns7d.length
      : null,
    avg_return_30d: returns30d.length > 0
      ? returns30d.reduce((a, b) => a + b, 0) / returns30d.length
      : null,
    by_grade: byGrade,
    recent_signals: outcomes.slice(0, 20), // last 20 for display
  };
}
