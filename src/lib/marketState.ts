export interface MarketState {
  state: string;
  label: string;
  color: string;
  advice: string;
  spy_vs_sma50: number;
  vix: number;
  dip_buying_enabled: boolean;
}

export function classifyMarketState(data: {
  spy_bars: { c: number }[];
  vix: number;
  spy_change_pct: number;
  qqq_change_pct: number;
}): MarketState {
  const { spy_bars, vix, spy_change_pct } = data;

  // Fallback if insufficient data
  if (spy_bars.length < 5) {
    return {
      state: 'neutral_volatile',
      label: 'Neutral',
      color: '#f59e0b',
      advice: 'Insufficient data — check back during market hours',
      spy_vs_sma50: 0,
      vix: vix || 20,
      dip_buying_enabled: false,
    };
  }

  // Calculate 50-day SMA from all available closes (use whatever we have)
  const sma50 = spy_bars.reduce((sum, b) => sum + b.c, 0) / spy_bars.length;

  // Current SPY price
  const currentPrice = spy_bars[spy_bars.length - 1].c;

  // % above/below 50d SMA
  const spy_vs_sma50 = ((currentPrice - sma50) / sma50) * 100;

  let state: string;
  let label: string;
  let color: string;
  let advice: string;

  if (currentPrice > sma50 && vix < 20 && spy_change_pct > -0.5) {
    state = 'bull_trending';
    label = 'Bull Trending';
    color = '#00d4aa';
    advice = 'Favorable conditions — look for quality entries';
  } else if (currentPrice > sma50 && vix >= 20 && vix < 28) {
    state = 'bull_volatile';
    label = 'Bull Volatile';
    color = '#f59e0b';
    advice = 'Uptrend intact but choppy — size positions smaller';
  } else if (currentPrice > sma50 && vix >= 28) {
    state = 'neutral_volatile';
    label = 'Neutral / Volatile';
    color = '#f59e0b';
    advice = 'High volatility — wait for VIX to cool before entering';
  } else if (currentPrice < sma50 && vix < 28) {
    state = 'bear_trending';
    label = 'Bear Trending';
    color = '#ef4444';
    advice = 'Downtrend — focus on capital preservation';
  } else {
    state = 'bear_volatile';
    label = 'Bear Volatile';
    color = '#ef4444';
    advice = 'High risk — reduce exposure, hold cash';
  }

  const dip_buying_enabled = state === 'bull_trending' || state === 'bull_volatile';

  return {
    state,
    label,
    color,
    advice,
    spy_vs_sma50,
    vix,
    dip_buying_enabled,
  };
}
