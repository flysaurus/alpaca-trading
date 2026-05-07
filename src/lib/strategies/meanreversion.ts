// ── Types ───────────────────────────────────────────────────────
export interface MeanReversionConfig {
  symbol: string;
  lookback: number; // Lookback period (e.g., 20, 50, 100 days)
  z_score_threshold: number; // Revert when |z-score| > threshold
  active: boolean;
}

export interface MeanReversionSignal {
  symbol: string;
  current_price: number;
  mean: number;
  std_dev: number;
  z_score: number;
  signal: 'oversold' | 'overbought' | 'neutral';
  confidence: number; // 0-1 based on z-score magnitude
  bollinger_bands: {
    upper: number;
    middle: number;
    lower: number;
  };
}

// ── Fetch Price Data ────────────────────────────────────────────
async function fetchClosePrices(symbol: string, days: number): Promise<number[]> {
  try {
    const res = await fetch(`/api/bars?symbol=${symbol}&limit=${days}&timeframe=1Day`);
    const json = await res.json();
    
    if (!json.bars) return [];
    
    return json.bars.map((bar: any) => bar.c).reverse();
  } catch {
    return [];
  }
}

// ── Calculate Statistics ────────────────────────────────────────
function calculateStats(prices: number[]): { mean: number; stdDev: number } {
  if (prices.length === 0) return { mean: 0, stdDev: 0 };
  
  const n = prices.length;
  const mean = prices.reduce((s, p) => s + p, 0) / n;
  const variance = prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  return { mean, stdDev };
}

// ── Calculate Z-Score ───────────────────────────────────────────
function calculateZScore(currentPrice: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (currentPrice - mean) / stdDev;
}

// ── Calculate Bollinger Bands ───────────────────────────────────
function calculateBollingerBands(mean: number, stdDev: number): { upper: number; middle: number; lower: number } {
  const multiplier = 2; // 2 standard deviations
  return {
    upper: mean + multiplier * stdDev,
    middle: mean,
    lower: mean - multiplier * stdDev,
  };
}

// ── Get Mean Reversion Signal ───────────────────────────────────
export async function getMeanReversionSignal(config: MeanReversionConfig): Promise<MeanReversionSignal | null> {
  const prices = await fetchClosePrices(config.symbol, config.lookback);
  
  if (prices.length < 2) return null;
  
  const currentPrice = prices[prices.length - 1];
  const { mean, stdDev } = calculateStats(prices);
  const zScore = calculateZScore(currentPrice, mean, stdDev);
  const bands = calculateBollingerBands(mean, stdDev);
  
  // Determine signal
  let signal: 'oversold' | 'overbought' | 'neutral' = 'neutral';
  let confidence = 0;
  
  if (zScore < -config.z_score_threshold) {
    signal = 'oversold';
    confidence = Math.min(Math.abs(zScore) / config.z_score_threshold, 1);
  } else if (zScore > config.z_score_threshold) {
    signal = 'overbought';
    confidence = Math.min(Math.abs(zScore) / config.z_score_threshold, 1);
  }
  
  return {
    symbol: config.symbol,
    current_price: currentPrice,
    mean,
    std_dev: stdDev,
    z_score: zScore,
    signal,
    confidence,
    bollinger_bands: bands,
  };
}

// ── Generate Trading Action ─────────────────────────────────────
export async function generateMeanReversionAction(
  config: MeanReversionConfig,
  cashAvailable: number
): Promise<{ action: 'buy' | 'sell' | 'hold'; qty: number; confidence: number } | null> {
  const signal = await getMeanReversionSignal(config);
  
  if (!signal || signal.signal === 'neutral') {
    return { action: 'hold', qty: 0, confidence: 0 };
  }
  
  const qty = Math.floor(cashAvailable / signal.current_price);
  
  return {
    action: signal.signal === 'oversold' ? 'buy' : 'sell',
    qty,
    confidence: signal.confidence,
  };
}

// ── Check Multiple Symbols ──────────────────────────────────────
export async function checkMultipleReversion(configs: MeanReversionConfig[]): Promise<Map<string, MeanReversionSignal>> {
  const results = new Map<string, MeanReversionSignal>();
  
  for (const config of configs) {
    if (!config.active) continue;
    const signal = await getMeanReversionSignal(config);
    if (signal) {
      results.set(config.symbol, signal);
    }
  }
  
  return results;
}
