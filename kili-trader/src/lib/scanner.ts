export interface ScanResult {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  rsi: number;
  signal: 'breakout' | 'gap_up' | 'oversold' | 'volume_spike' | 'momentum' | null;
  score: number;
  reason: string[];
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

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period + 1) return closes[closes.length - 1] * 0.02;

  let trSum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trSum += Math.max(tr1, tr2, tr3);
  }

  return trSum / period;
}

export function scanStock(symbol: string, bars: any[]): ScanResult | null {
  if (bars.length < 20) return null;

  const closes = bars.map((b) => b.ClosePrice || b.close || 0);
  const highs = bars.map((b) => b.HighPrice || b.high || 0);
  const lows = bars.map((b) => b.LowPrice || b.low || 0);
  const volumes = bars.map((b) => b.Volume || b.volume || 0);

  const currentPrice = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];
  const changePercent = ((currentPrice - prevPrice) / prevPrice) * 100;

  const volume = volumes[volumes.length - 1];
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = volume / (avgVolume || 1);

  const rsi = calculateRSI(closes);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, Math.min(50, closes.length));
  const atr = calculateATR(highs, lows, closes);

  let signal: ScanResult['signal'] = null;
  let score = 0;
  const reasons: string[] = [];

  // Breakout: price above SMA20 with volume
  if (currentPrice > sma20 * 1.02 && volumeRatio > 1.5) {
    signal = 'breakout';
    score += 30;
    reasons.push('Price broke above 20 SMA with volume');
  }

  // Gap up
  if (changePercent > 3 && volumeRatio > 2) {
    signal = 'gap_up';
    score += 25;
    reasons.push(`Gap up ${changePercent.toFixed(1)}% on ${volumeRatio.toFixed(1)}x volume`);
  }

  // Oversold bounce
  if (rsi < 30 && changePercent > 1) {
    signal = 'oversold';
    score += 20;
    reasons.push(`RSI ${rsi.toFixed(1)} oversold, bouncing`);
  }

  // Volume spike
  if (volumeRatio > 3 && Math.abs(changePercent) > 2) {
    signal = signal || 'volume_spike';
    score += 20;
    reasons.push(`${volumeRatio.toFixed(1)}x average volume`);
  }

  // Momentum: RSI rising, price above SMA50
  if (rsi > 55 && rsi < 75 && currentPrice > sma50 && changePercent > 0) {
    signal = signal || 'momentum';
    score += 15;
    reasons.push('Momentum building, bullish structure');
  }

  // Volatility filter: skip if ATR > 5% of price (too choppy)
  if (atr / currentPrice > 0.05) {
    score -= 15;
    reasons.push('High volatility warning');
  }

  // Minimum criteria
  if (score < 20) return null;

  return {
    symbol,
    price: currentPrice,
    changePercent,
    volume,
    avgVolume,
    volumeRatio,
    rsi,
    signal,
    score,
    reason: reasons,
  };
}

export function sortScanResults(results: ScanResult[]): ScanResult[] {
  return results.sort((a, b) => b.score - a.score);
}
