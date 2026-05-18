/**
 * Sell signal detection for existing positions.
 * Technical triggers — not just LLM opinions.
 */

export interface SellSignal {
  symbol: string;
  signal_type: SellSignalType;
  confidence: number;       // 1-10
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  current_price: number;
  metadata?: Record<string, unknown>;
}

export type SellSignalType =
  | 'TRAILING_STOP_HIT'
  | 'RSI_OVERBOUGHT'
  | 'MOMENTUM_DEATH_CROSS'
  | 'POSITION_SIZE_DRIFT'
  | 'EARNINGS_RISK'
  | 'TAKE_PROFIT_TARGET';

export interface PositionForAnalysis {
  symbol: string;
  current_price: number;
  avg_entry_price: number;
  qty: number;
  market_value: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  total_equity: number;
}

export interface BarData {
  c: number;
  h: number;
  l: number;
  v: number;
  t: string;
}

const APCA_KEY = process.env.ALPACA_API_KEY;
const APCA_SECRET = process.env.ALPACA_SECRET_KEY;

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': APCA_KEY || '',
    'APCA-API-SECRET-KEY': APCA_SECRET || '',
  };
}

async function fetchBars(symbol: string, limit = 60): Promise<BarData[]> {
  try {
    const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=1Day&limit=${limit}&feed=iex`;
    const res = await fetch(url, { headers: getAlpacaHeaders() });
    if (!res.ok) return [];
    const json = await res.json();
    const bars = json.bars?.[symbol] || [];
    return bars
      .map((b: any) => ({
        c: b.c ?? b.ClosePrice ?? 0,
        h: b.h ?? b.HighPrice ?? 0,
        l: b.l ?? b.LowPrice ?? 0,
        v: b.v ?? b.Volume ?? 0,
        t: b.t ?? '',
      }))
      .filter((b: BarData) => b.c > 0);
  } catch {
    return [];
  }
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

function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Run all sell signal checks on a position.
 * Returns all triggered signals sorted by priority + confidence.
 */
export async function analyzePosition(
  pos: PositionForAnalysis
): Promise<SellSignal[]> {
  const bars = await fetchBars(pos.symbol, 60);
  const signals: SellSignal[] = [];
  const closes = bars.map(b => b.c);

  if (closes.length < 20) return signals; // Not enough data

  const currentPrice = pos.current_price;

  // ── 1. Trailing Stop Hit ──────────────────────────────────────
  // Calculate 20-day highest close as the trailing stop reference
  const recent20 = closes.slice(-20);
  const recentHigh = Math.max(...recent20);
  const drawdown = (recentHigh - currentPrice) / recentHigh * 100;

  if (drawdown > 10) {
    signals.push({
      symbol: pos.symbol,
      signal_type: 'TRAILING_STOP_HIT',
      confidence: 8,
      priority: 'HIGH',
      reason: `${drawdown.toFixed(1)}% below 20-day high of $${recentHigh.toFixed(2)} — trailing stop breached`,
      current_price: currentPrice,
      metadata: { recent_high: recentHigh, drawdown_pct: drawdown },
    });
  } else if (drawdown > 7) {
    signals.push({
      symbol: pos.symbol,
      signal_type: 'TRAILING_STOP_HIT',
      confidence: 5,
      priority: 'MEDIUM',
      reason: `${drawdown.toFixed(1)}% below 20-day high of $${recentHigh.toFixed(2)} — approaching stop level`,
      current_price: currentPrice,
      metadata: { recent_high: recentHigh, drawdown_pct: drawdown },
    });
  }

  // ── 2. RSI Overbought ─────────────────────────────────────────
  const rsi14 = calculateRSI(closes, 14);
  if (rsi14 > 75) {
    signals.push({
      symbol: pos.symbol,
      signal_type: 'RSI_OVERBOUGHT',
      confidence: 7,
      priority: 'MEDIUM',
      reason: `RSI(14) at ${rsi14.toFixed(1)} — significantly overbought, consider taking profits`,
      current_price: currentPrice,
      metadata: { rsi: rsi14 },
    });
  } else if (rsi14 > 70) {
    signals.push({
      symbol: pos.symbol,
      signal_type: 'RSI_OVERBOUGHT',
      confidence: 4,
      priority: 'LOW',
      reason: `RSI(14) at ${rsi14.toFixed(1)} — entering overbought territory`,
      current_price: currentPrice,
      metadata: { rsi: rsi14 },
    });
  }

  // ── 3. Momentum Death Cross ───────────────────────────────────
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  if (sma20 && sma50) {
    // Check if 20-day just crossed below 50-day (death cross)
    // Calculate yesterday's SMAs
    const closesMinus1 = closes.slice(0, -1);
    const sma20Prev = calculateSMA(closesMinus1, 20);
    const sma50Prev = calculateSMA(closesMinus1, 50);

    if (sma20Prev && sma50Prev && sma20Prev >= sma50Prev && sma20 < sma50) {
      signals.push({
        symbol: pos.symbol,
        signal_type: 'MOMENTUM_DEATH_CROSS',
        confidence: 7,
        priority: 'HIGH',
        reason: `Death cross: 20-day SMA ($${sma20.toFixed(2)}) crossed below 50-day SMA ($${sma50.toFixed(2)})`,
        current_price: currentPrice,
        metadata: { sma20, sma50, sma20_prev: sma20Prev, sma50_prev: sma50Prev },
      });
    }
  }

  // ── 4. Position Size Drift ─────────────────────────────────────
  if (pos.total_equity > 0) {
    const positionPct = pos.market_value / pos.total_equity * 100;
    if (positionPct > 20) {
      signals.push({
        symbol: pos.symbol,
        signal_type: 'POSITION_SIZE_DRIFT',
        confidence: 8,
        priority: 'HIGH',
        reason: `Position is ${positionPct.toFixed(1)}% of portfolio — concentration risk, consider trimming`,
        current_price: currentPrice,
        metadata: { position_pct: positionPct },
      });
    } else if (positionPct > 15) {
      signals.push({
        symbol: pos.symbol,
        signal_type: 'POSITION_SIZE_DRIFT',
        confidence: 5,
        priority: 'MEDIUM',
        reason: `Position growing to ${positionPct.toFixed(1)}% of portfolio — monitor`,
        current_price: currentPrice,
        metadata: { position_pct: positionPct },
      });
    }
  }

  // ── 5. Take Profit Target ─────────────────────────────────────
  const pnlPct = pos.unrealized_plpc;
  if (pnlPct > 30) {
    signals.push({
      symbol: pos.symbol,
      signal_type: 'TAKE_PROFIT_TARGET',
      confidence: 9,
      priority: 'HIGH',
      reason: `Up ${pnlPct.toFixed(1)}% — significant unrealized gains, consider taking partial profits`,
      current_price: currentPrice,
      metadata: { pnl_pct: pnlPct },
    });
  } else if (pnlPct > 20) {
    signals.push({
      symbol: pos.symbol,
      signal_type: 'TAKE_PROFIT_TARGET',
      confidence: 5,
      priority: 'MEDIUM',
      reason: `Up ${pnlPct.toFixed(1)}% — approaching profit target zone`,
      current_price: currentPrice,
      metadata: { pnl_pct: pnlPct },
    });
  }

  // ── 6. Earnings Risk ──────────────────────────────────────────
  try {
    const { getEarningsData } = await import('./stockAnalysis');
    const earnings = await getEarningsData(pos.symbol);
    if (earnings?.nextDate) {
      const nd = earnings.nextDate;
      if (nd) {
        const nextDate = new Date(nd);
        const daysAway = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
        if (daysAway < 7 && daysAway > 0) {
          signals.push({
            symbol: pos.symbol,
            signal_type: 'EARNINGS_RISK',
            confidence: 6,
            priority: 'HIGH',
            reason: `Earnings in ${daysAway} days (${nd}) — consider reducing position or hedging`,
            current_price: currentPrice,
            metadata: { earnings_date: nd, days_away: daysAway },
          });
        } else if (daysAway < 14 && daysAway > 0) {
          signals.push({
            symbol: pos.symbol,
            signal_type: 'EARNINGS_RISK',
            confidence: 3,
            priority: 'MEDIUM',
            reason: `Earnings in ${daysAway} days — volatility may increase`,
            current_price: currentPrice,
            metadata: { earnings_date: nd, days_away: daysAway },
          });
        }
      }
    }
  } catch {
    // Earnings data unavailable — skip
  }

  // Sort: HIGH priority first, then by confidence descending
  signals.sort((a, b) => {
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.confidence - a.confidence;
  });

  return signals;
}

/**
 * Batch analyze multiple positions.
 * Returns all signals grouped by position.
 */
export async function analyzeAllPositions(
  positions: PositionForAnalysis[]
): Promise<SellSignal[]> {
  const allSignals: SellSignal[] = [];
  for (const pos of positions) {
    try {
      const signals = await analyzePosition(pos);
      allSignals.push(...signals);
    } catch (err: any) {
      console.warn(`[sellSignals] Failed to analyze ${pos.symbol}:`, err.message);
    }
  }
  return allSignals;
}
