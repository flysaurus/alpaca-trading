// ── Types ───────────────────────────────────────────────────────
export interface MomentumConfig {
  universe: string[]; // Symbols to analyze
  lookback_days: number; // Lookback period (e.g., 30, 60, 90)
  top_n: number; // Number of top momentum stocks to buy
  bottom_n?: number; // Number of bottom momentum stocks to sell (for rotation)
  active: boolean;
}

export interface StockPerformance {
  symbol: string;
  price: number;
  return_1d: number;
  return_1w: number;
  return_1m: number;
  return_3m: number;
  momentum_score: number; // Combined score
  volatility: number;
  trend_strength: number;
}

// ── Fetch Price Data ────────────────────────────────────────────
async function fetchBars(symbol: string, days: number): Promise<number[]> {
  try {
    const res = await fetch(`/api/bars?symbol=${symbol}&limit=${days}&timeframe=1Day`);
    const json = await res.json();
    
    if (!json.bars) return [];
    
    // Return close prices in chronological order
    return json.bars.map((bar: any) => bar.c).reverse();
  } catch {
    return [];
  }
}

// ── Calculate Momentum Score ────────────────────────────────────
export function calculateMomentumScore(prices: number[]): StockPerformance {
  if (prices.length < 2) {
    return {
      symbol: 'UNKNOWN',
      price: 0,
      return_1d: 0,
      return_1w: 0,
      return_1m: 0,
      return_3m: 0,
      momentum_score: 0,
      volatility: 0,
      trend_strength: 0,
    };
  }
  
  const currentPrice = prices[prices.length - 1];
  const prices1d = prices.slice(-2);
  const prices1w = prices.slice(-7);
  const prices1m = prices.slice(-30);
  const prices3m = prices.slice(-90);
  
  const return_1d = prices1d.length >= 2 ? (prices1d[prices1d.length - 1] - prices1d[0]) / prices1d[0] : 0;
  const return_1w = prices1w.length >= 2 ? (prices1w[prices1w.length - 1] - prices1w[0]) / prices1w[0] : 0;
  const return_1m = prices1m.length >= 2 ? (prices1m[prices1m.length - 1] - prices1m[0]) / prices1m[0] : 0;
  const return_3m = prices3m.length >= 2 ? (prices3m[prices3m.length - 1] - prices3m[0]) / prices3m[0] : 0;
  
  // Momentum score: weighted average of returns (favor longer-term momentum)
  const momentum_score = 
    return_1d * 0.1 + 
    return_1w * 0.2 + 
    return_1m * 0.3 + 
    return_3m * 0.4;
  
  // Volatility: standard deviation of daily returns
  let volatility = 0;
  if (prices.length >= 3) {
    const dailyReturns = [];
    for (let i = 1; i < prices.length; i++) {
      dailyReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
    volatility = Math.sqrt(dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyReturns.length);
  }
  
  // Trend strength: correlation with upward trend
  let trend_strength = 0;
  if (prices.length >= 10) {
    const x = Array.from({ length: 10 }, (_, i) => i);
    const y = prices.slice(-10);
    const n = 10;
    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = y.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
    const sumXX = x.reduce((s, xi) => s + xi * xi, 0);
    
    const denominator = n * sumXX - sumX * sumX;
    if (denominator !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denominator;
      trend_strength = Math.min(Math.max(slope / (currentPrice * 0.001), -1), 1); // Normalize
    }
  }
  
  return {
    symbol: 'UNKNOWN',
    price: currentPrice,
    return_1d,
    return_1w,
    return_1m,
    return_3m,
    momentum_score,
    volatility,
    trend_strength,
  };
}

// ── Get Momentum for Universe ───────────────────────────────────
export async function calculateMomentum(config: MomentumConfig): Promise<StockPerformance[]> {
  const performances: StockPerformance[] = [];
  
  for (const symbol of config.universe) {
    try {
      const prices = await fetchBars(symbol, Math.max(config.lookback_days, 90));
      if (prices.length >= 2) {
        const perf = calculateMomentumScore(prices);
        perf.symbol = symbol;
        performances.push(perf);
      }
    } catch (err) {
      console.warn(`[Momentum] Error for ${symbol}:`, err);
    }
  }
  
  // Sort by momentum score descending
  return performances.sort((a, b) => b.momentum_score - a.momentum_score);
}

// ── Get Rotation Signals ────────────────────────────────────────
export async function getRotationSignals(config: MomentumConfig): Promise<{
  toBuy: string[];
  toSell: string[];
}> {
  const performances = await calculateMomentum(config);
  
  const toBuy = performances.slice(0, config.top_n).map(p => p.symbol);
  const toSell = config.bottom_n 
    ? performances.slice(-config.bottom_n).map(p => p.symbol)
    : [];
  
  return { toBuy, toSell };
}

// ── Generate Momentum Strategy Actions ──────────────────────────
export async function generateMomentumActions(
  config: MomentumConfig,
  currentPositions: string[],
  portfolioValue: number,
  cashAvailable: number
): Promise<{
  toBuy: Array<{ symbol: string; allocation: number }>;
  toSell: string[];
}> {
  const performances = await calculateMomentum(config);
  
  // Calculate cash allocation per top stock
  const cashPerStock = cashAvailable / config.top_n;
  
  const toBuy: Array<{ symbol: string; allocation: number }> = [];
  for (const perf of performances.slice(0, config.top_n)) {
    const qty = Math.floor(cashPerStock / perf.price);
    if (qty > 0) {
      toBuy.push({
        symbol: perf.symbol,
        allocation: qty,
      });
    }
  }
  
  const toSell = config.bottom_n
    ? performances.slice(-config.bottom_n).map(p => p.symbol).filter(s => currentPositions.includes(s))
    : [];
  
  return { toBuy, toSell };
}
