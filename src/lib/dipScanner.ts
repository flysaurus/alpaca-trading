import type { MarketState } from './marketState';

// ── Top 100 S&P 500 symbols by market cap ───────────────────────
const SP500_SYMBOLS: string[] = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','BRK.B','LLY','JPM','V',
  'UNH','XOM','MA','PG','JNJ','HD','ABBV','MRK','CVX','BAC',
  'COST','NFLX','CRM','AMD','WMT','TMO','LIN','MCD','CSCO','GE',
  'ABT','NOW','DHR','AXP','ISRG','GS','SPGI','BLK','TXN','SYK',
  'AMAT','BKNG','PLD','ADI','VRTX','REGN','PANW','CB','SO','DUK',
  'MO','CL','MDLZ','TGT','EMR','AON','ITW','PH','MMM','SHW',
  'ECL','APD','ROK','ETN','DOV','MSCI','MCO','ICE','CME','NDAQ',
  'CBOE','SCHW','MS','WFC','USB','PNC','TFC','COF','AIG','PRU',
  'MET','AFL','UPS','FDX','DAL','UAL','AAL','LUV','NSC','UNP',
  'CSX','DE','CAT','HON','RTX','LMT','NOC','GD','BA','HII',
];

export interface DipCandidate {
  symbol: string;
  score: number;
  grade: string;
  change_pct: number;
  current_price: number;
  volume_ratio: number;
  rsi: number | null;
  drop_score: number;
  state_score: number;
  rsi_score: number;
  vol_score: number;
  quality_score: number;
  in_watchlist: boolean;
  suggested_amount: number;
  stop_loss_pct: number;
}

const APCA_KEY = process.env.ALPACA_API_KEY;
const APCA_SECRET = process.env.ALPACA_SECRET_KEY;

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': APCA_KEY || '',
    'APCA-API-SECRET-KEY': APCA_SECRET || '',
  };
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function fetchSnapshots(symbols: string[]): Promise<Record<string, any>> {
  const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(','))}`;
  const res = await fetch(url, { headers: getAlpacaHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca snapshots: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json;
}

async function fetchBarsForRSI(symbol: string): Promise<number[]> {
  const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=1Day&limit=25&feed=iex`;
  const res = await fetch(url, { headers: getAlpacaHeaders() });
  if (!res.ok) return [];
  const json = await res.json();
  const bars = json.bars?.[symbol] || [];
  return bars.map((b: any) => b.c || b.ClosePrice || 0).filter((c: number) => c > 0);
}

export async function scanForQualityDips(
  watchlistSymbols: string[],
  marketState: MarketState
): Promise<DipCandidate[]> {
  if (!marketState.dip_buying_enabled) {
    console.log('[dipScanner] Dip buying disabled in current market state:', marketState.state);
    return [];
  }

  // Step 1 — Merge and deduplicate universe
  const universe = Array.from(new Set([...SP500_SYMBOLS, ...watchlistSymbols]));
  console.log(`[dipScanner] Scanning ${universe.length} symbols`);

  // Step 2 — Fetch snapshots in batches of 100
  const allSnapshots: Record<string, any> = {};
  for (let i = 0; i < universe.length; i += 100) {
    const batch = universe.slice(i, i + 100);
    try {
      const snaps = await fetchSnapshots(batch);
      Object.assign(allSnapshots, snaps);
    } catch (err: any) {
      console.warn(`[dipScanner] Batch ${i}-${i + 100} failed:`, err.message);
    }
  }

  console.log(`[dipScanner] Fetched ${Object.keys(allSnapshots).length} snapshots`);

  // Step 3 — Filter stocks down 5%+ today
  const movers: Array<{
    symbol: string;
    snap: any;
    changePct: number;
    currentPrice: number;
    todayVolume: number;
    avgVolume: number;
    volRatio: number;
    inWatchlist: boolean;
  }> = [];

  for (const symbol of Object.keys(allSnapshots)) {
    const snap = allSnapshots[symbol];
    const dailyBar = snap.DailyBar || snap.dailyBar || {};
    const prevDailyBar = snap.PrevDailyBar || snap.prevDailyBar || {};

    const close = dailyBar.c || dailyBar.C || 0;
    const open = dailyBar.o || dailyBar.O || 0;
    const prevClose = prevDailyBar.c || prevDailyBar.C || open || close;
    const todayVolume = dailyBar.v || dailyBar.V || 0;
    const avgVolume = dailyBar.vw || dailyBar.VW || close || 1; // Use VWAP proxy if no avg

    if (!close || !prevClose) continue;

    const changePct = (close - prevClose) / prevClose;
    if (changePct > -0.05) continue; // Only down 5%+

    // Estimate average volume from VWAP if needed, or use a rough proxy
    // Alpaca snapshots don't have 20-day avg, so we use a heuristic
    const volRatio = todayVolume / (avgVolume || 1);

    movers.push({
      symbol,
      snap,
      changePct,
      currentPrice: close,
      todayVolume,
      avgVolume,
      volRatio,
      inWatchlist: watchlistSymbols.includes(symbol),
    });
  }

  console.log(`[dipScanner] Found ${movers.length} movers down 5%+`);
  if (movers.length === 0) return [];

  // Step 4 — Preliminary scoring (RSI = neutral 10)
  const preliminary: Array<{
    symbol: string;
    changePct: number;
    currentPrice: number;
    volRatio: number;
    inWatchlist: boolean;
    dropScore: number;
    stateScore: number;
    volScore: number;
    qualityScore: number;
    preliminaryScore: number;
  }> = [];

  for (const m of movers) {
    const dropPct = Math.abs(m.changePct * 100);

    // Factor 1: Drop size (0-20)
    let dropScore = 0;
    if (dropPct >= 5 && dropPct <= 8) dropScore = 20;
    else if (dropPct > 8 && dropPct <= 12) dropScore = 16;
    else if (dropPct > 12 && dropPct <= 15) dropScore = 12;
    else if (dropPct > 15 && dropPct <= 20) dropScore = 6;
    else if (dropPct > 20) dropScore = 2;

    // Factor 2: Market state (0-20)
    let stateScore = 0;
    if (marketState.state === 'bull_trending') stateScore = 20;
    else if (marketState.state === 'bull_volatile') stateScore = 12;
    else if (marketState.state === 'neutral_volatile') stateScore = 5;
    else stateScore = 0;

    // Factor 4: Volume confirmation (0-20)
    let volScore = 0;
    if (m.volRatio < 1.5) volScore = 20;
    else if (m.volRatio < 2.5) volScore = 12;
    else if (m.volRatio < 4) volScore = 6;
    else volScore = 2;

    // Factor 5: S&P 500 membership (0-20)
    const inSP500 = SP500_SYMBOLS.includes(m.symbol);
    const qualityScore = inSP500 ? 20 : 8;

    const preliminaryScore = dropScore + stateScore + 10 + volScore + qualityScore;

    preliminary.push({
      symbol: m.symbol,
      changePct: m.changePct,
      currentPrice: m.currentPrice,
      volRatio: m.volRatio,
      inWatchlist: m.inWatchlist,
      dropScore,
      stateScore,
      volScore,
      qualityScore,
      preliminaryScore,
    });
  }

  // Step 5 — Fetch RSI for top 20 candidates
  const top20 = preliminary
    .sort((a, b) => b.preliminaryScore - a.preliminaryScore)
    .slice(0, 20);

  console.log(`[dipScanner] Fetching RSI for top ${top20.length} candidates`);

  const withRSI = await Promise.all(
    top20.map(async (candidate) => {
      try {
        const closes = await fetchBarsForRSI(candidate.symbol);
        if (closes.length >= 15) {
          const rsi = calculateRSI(closes);
          return { ...candidate, rsi };
        }
        return { ...candidate, rsi: null };
      } catch {
        return { ...candidate, rsi: null };
      }
    })
  );

  // Step 6 — Final scoring and return top 5 with score >= 50
  const graded: DipCandidate[] = withRSI.map((c) => {
    // Factor 3: RSI (0-20)
    let rsiScore = 10; // neutral default
    if (c.rsi !== null) {
      if (c.rsi < 30) rsiScore = 20;
      else if (c.rsi < 40) rsiScore = 15;
      else if (c.rsi < 50) rsiScore = 8;
      else rsiScore = 3;
    }

    const totalScore = c.dropScore + c.stateScore + rsiScore + c.volScore + c.qualityScore;

    let grade = 'C';
    if (totalScore >= 80) grade = 'A';
    else if (totalScore >= 65) grade = 'B';

    return {
      symbol: c.symbol,
      score: totalScore,
      grade,
      change_pct: c.changePct * 100,
      current_price: c.currentPrice,
      volume_ratio: c.volRatio,
      rsi: c.rsi,
      drop_score: c.dropScore,
      state_score: c.stateScore,
      rsi_score: rsiScore,
      vol_score: c.volScore,
      quality_score: c.qualityScore,
      in_watchlist: c.inWatchlist,
      suggested_amount: 500, // 0.5% of $100k
      stop_loss_pct: 8,
    };
  });

  const results = graded
    .filter((c) => c.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  console.log(`[dipScanner] Returning ${results.length} candidates`);
  return results;
}
