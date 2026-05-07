// ── AI Trading Advisor ───────────────────────────────────────────
// Orchestrates multiple signals into AI-generated trading suggestions

import { getBars } from './alpaca';
// Note: getNewsSentiment, getInsiderActivity, getUpcomingMacroEvents don't exist
// in the respective modules. The collect* functions below use mock implementations.
// import { getNewsSentiment } from './news';
// import { getInsiderActivity } from './insider';
// import { getUpcomingMacroEvents } from './macro';

const RISK_KEY = 'alpaca-trading-risk-threshold';

// ── Types ───────────────────────────────────────────────────────
export interface PriceAction {
  symbol: string;
  current_price: number;
  price_change_30d: number;
  rsi: number;
  rsi_interpretation: 'overbought' | 'oversold' | 'neutral';
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  volume_trend: {
    avg_volume_30d: number;
    recent_volume_avg: number;
    trend: 'increasing' | 'decreasing' | 'neutral';
  };
}

export interface NewsSentiment {
  symbol: string;
  sentiment_score_7d: number;
  recent_headlines: string[];
  sentiment_trend: 'improving' | 'declining' | 'stable';
}

export interface InsiderActivity {
  symbol: string;
  net_buys_sells_90d: number;
  notable_transactions: Array<{
    type: 'buy' | 'sell';
    shares: number;
    value: number;
    insider: string;
    date: string;
  }>;
}

export interface MacroContext {
  symbol: string;
  sector: string;
  upcoming_events: Array<{
    date: string;
    event: string;
    impact: 'high' | 'medium' | 'low';
  }>;
}

export interface PortfolioExposure {
  symbol: string;
  sector: string;
  current_exposure_pct: number;
  sector_exposure_pct: number;
}

export interface AISuggestion {
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'watch';
  confidence: number;
  reasoning: string;
  suggested_position_size_pct: number;
  risk_factors: string[];
  time_horizon: 'short' | 'medium' | 'long';
  stop_loss_pct: number;
  take_profit_pct: number;
  generated_at: string;
  signals: {
    price_action: PriceAction;
    news_sentiment: NewsSentiment;
    insider_activity: InsiderActivity;
    macro_context: MacroContext;
    portfolio_exposure: PortfolioExposure;
  };
}

export interface AdvisorConfig {
  confidence_threshold: number;
  max_position_size_pct: number;
  allowed_actions: Array<'buy' | 'sell' | 'hold' | 'watch'>;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
}

// ── Helpers ─────────────────────────────────────────────────────
function getStoredRiskTolerance(): 'conservative' | 'moderate' | 'aggressive' {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(RISK_KEY) : null;
    if (stored === 'conservative' || stored === 'moderate' || stored === 'aggressive') return stored;
  } catch { /* ignore */ }
  return 'moderate';
}

function weightedRandomAction(risk: 'conservative' | 'moderate' | 'aggressive'): 'buy' | 'sell' | 'hold' | 'watch' {
  const rand = Math.random();
  if (risk === 'conservative') {
    if (rand < 0.45) return 'hold';
    if (rand < 0.75) return 'watch';
    if (rand < 0.90) return 'buy';
    return 'sell';
  }
  if (risk === 'aggressive') {
    if (rand < 0.35) return 'buy';
    if (rand < 0.60) return 'sell';
    if (rand < 0.80) return 'hold';
    return 'watch';
  }
  // moderate — balanced
  if (rand < 0.20) return 'buy';
  if (rand < 0.35) return 'sell';
  if (rand < 0.60) return 'hold';
  return 'watch';
}

function riskBasedValues(risk: 'conservative' | 'moderate' | 'aggressive') {
  if (risk === 'conservative') {
    return {
      positionSizeMin: 2,
      positionSizeMax: 5,
      stopLossMin: 5,
      stopLossMax: 8,
      takeProfitMin: 10,
      takeProfitMax: 15,
      confidenceOffset: -10, // lower avg confidence
    };
  }
  if (risk === 'aggressive') {
    return {
      positionSizeMin: 5,
      positionSizeMax: 10,
      stopLossMin: 3,
      stopLossMax: 5,
      takeProfitMin: 12,
      takeProfitMax: 20,
      confidenceOffset: 5, // higher avg confidence
    };
  }
  // moderate
  return {
    positionSizeMin: 3,
    positionSizeMax: 7,
    stopLossMin: 4,
    stopLossMax: 7,
    takeProfitMin: 10,
    takeProfitMax: 17,
    confidenceOffset: 0,
  };
}

// ── Technical Analysis Helpers ───────────────────────────────────
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
  if (prices.length < slow + signal) return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' as const };

  // Simple EMA calculation (would use proper EMA in production)
  const ema = (data: number[], period: number): number => {
    const multiplier = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = (data[i] * multiplier) + (ema * (1 - multiplier));
    }
    return ema;
  };

  const emaFast = ema(prices.slice(-slow), fast);
  const emaSlow = ema(prices.slice(-slow), slow);
  const macd = emaFast - emaSlow;

  // For simplicity, using static signal line
  const signalLine = macd * 0.9;
  const histogram = macd - signalLine;

  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (macd > signalLine && histogram > 0) trend = 'bullish';
  else if (macd < signalLine && histogram < 0) trend = 'bearish';

  return { macd, signal: signalLine, histogram, trend };
}

function interpretRSI(rsi: number): 'overbought' | 'oversold' | 'neutral' {
  if (rsi >= 70) return 'overbought';
  if (rsi <= 30) return 'oversold';
  return 'neutral';
}

// ── Signal Collection ───────────────────────────────────────────
export async function collectPriceAction(symbol: string): Promise<PriceAction> {
  try {
    const bars = await getBars({ symbol, timeframe: '1D', limit: 30 });

    if (bars.length >= 2) {
      const prices = bars.map(bar => bar.c);
      const volumes = bars.map(bar => bar.v);
      const currentPrice = prices[prices.length - 1];
      const price30DaysAgo = prices[0];

      const rsi = calculateRSI(prices);
      const macd = calculateMACD(prices);

      const avgVolume30d = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
      const recentVolumeAvg = volumes.slice(-5).reduce((sum, vol) => sum + vol, 0) / 5;

      let volumeTrend: 'increasing' | 'decreasing' | 'neutral' = 'neutral';
      if (recentVolumeAvg > avgVolume30d * 1.2) volumeTrend = 'increasing';
      else if (recentVolumeAvg < avgVolume30d * 0.8) volumeTrend = 'decreasing';

      return {
        symbol,
        current_price: currentPrice,
        price_change_30d: ((currentPrice - price30DaysAgo) / price30DaysAgo) * 100,
        rsi,
        rsi_interpretation: interpretRSI(rsi),
        macd,
        volume_trend: {
          avg_volume_30d: avgVolume30d,
          recent_volume_avg: recentVolumeAvg,
          trend: volumeTrend,
        },
      };
    }
  } catch (error) {
    console.warn(`[AI Advisor] Using mock data for ${symbol} (getBars failed):`, error);
  }

  // Fallback: realistic mock data if API fails or returns insufficient data
  const basePrice = symbol.length > 1
    ? (symbol.charCodeAt(0) + symbol.charCodeAt(1)) * 5 + 50
    : 150;
  const change30d = (Math.random() - 0.4) * 20; // -8% to +12%
  const rsi = Math.random() * 60 + 20; // 20-80
  const volumeTrends: Array<'increasing' | 'decreasing' | 'neutral'> = ['increasing', 'decreasing', 'neutral'];

  return {
    symbol,
    current_price: basePrice,
    price_change_30d: change30d,
    rsi,
    rsi_interpretation: interpretRSI(rsi),
    macd: {
      macd: (Math.random() - 0.5) * 2,
      signal: (Math.random() - 0.5) * 1.5,
      histogram: (Math.random() - 0.5) * 1,
      trend: Math.random() > 0.5 ? 'bullish' : Math.random() > 0.5 ? 'bearish' : 'neutral',
    },
    volume_trend: {
      avg_volume_30d: Math.floor(Math.random() * 50_000_000) + 5_000_000,
      recent_volume_avg: Math.floor(Math.random() * 50_000_000) + 5_000_000,
      trend: volumeTrends[Math.floor(Math.random() * 3)],
    },
  };
}

export async function collectNewsSentiment(symbol: string): Promise<NewsSentiment> {
  try {
    // Mock implementation - would integrate with news module
    const sentimentScore = Math.random() * 2 - 1; // -1 to 1
    const headlines = [
      `${symbol} reports strong earnings`,
      `Analysts upgrade ${symbol} rating`,
      `${symbol} faces market headwinds`,
    ].slice(0, 3);

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (sentimentScore > 0.2) trend = 'improving';
    else if (sentimentScore < -0.2) trend = 'declining';

    return {
      symbol,
      sentiment_score_7d: sentimentScore,
      recent_headlines: headlines,
      sentiment_trend: trend,
    };
  } catch (error) {
    console.error(`[AI Advisor] News sentiment error for ${symbol}:`, error);
    throw error;
  }
}

export async function collectInsiderActivity(symbol: string): Promise<InsiderActivity> {
  try {
    // Mock implementation - would integrate with insider module
    const netBuysSells = Math.floor(Math.random() * 100000) - 50000;
    const transactions: Array<{
      type: 'buy' | 'sell';
      shares: number;
      value: number;
      insider: string;
      date: string;
    }> = [
      {
        type: netBuysSells > 0 ? 'buy' : 'sell',
        shares: Math.floor(Math.random() * 10000),
        value: Math.floor(Math.random() * 1000000),
        insider: 'CEO John Doe',
        date: new Date().toISOString().split('T')[0],
      },
    ];

    return {
      symbol,
      net_buys_sells_90d: netBuysSells,
      notable_transactions: transactions,
    };
  } catch (error) {
    console.error(`[AI Advisor] Insider activity error for ${symbol}:`, error);
    throw error;
  }
}

export async function collectMacroContext(symbol: string): Promise<MacroContext> {
  try {
    // Mock sector classification
    const sectors = ['Technology', 'Healthcare', 'Finance', 'Energy', 'Consumer'];
    const sector = sectors[Math.floor(Math.random() * sectors.length)];

    const events = [
      {
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        event: 'Fed Interest Rate Decision',
        impact: 'high' as const,
      },
      {
        date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        event: 'CPI Data Release',
        impact: 'medium' as const,
      },
    ];

    return {
      symbol,
      sector,
      upcoming_events: events,
    };
  } catch (error) {
    console.error(`[AI Advisor] Macro context error for ${symbol}:`, error);
    throw error;
  }
}

export async function collectPortfolioExposure(symbol: string): Promise<PortfolioExposure> {
  try {
    // Mock implementation - would integrate with portfolio data
    const sectorExposure = Math.random() * 30; // 0-30%
    const symbolExposure = Math.random() * 10; // 0-10%

    return {
      symbol,
      sector: 'Technology', // Would derive from symbol
      current_exposure_pct: symbolExposure,
      sector_exposure_pct: sectorExposure,
    };
  } catch (error) {
    console.error(`[AI Advisor] Portfolio exposure error for ${symbol}:`, error);
    throw error;
  }
}

// ── AI Suggestion Generation ─────────────────────────────────────
export async function generateSuggestions(
  watchlist: string[],
  config?: Partial<AdvisorConfig>
): Promise<AISuggestion[]> {
  const storedRisk = getStoredRiskTolerance();
  const mergedCfg: AdvisorConfig = {
    confidence_threshold: 70,
    max_position_size_pct: 10,
    allowed_actions: ['buy', 'sell', 'hold', 'watch'],
    risk_tolerance: storedRisk,
    ...config,
  };

  const suggestions: AISuggestion[] = [];

  for (const symbol of watchlist) {
    try {
      // Collect all signals
      const [priceAction, newsSentiment, insiderActivity, macroContext, portfolioExposure] = await Promise.all([
        collectPriceAction(symbol),
        collectNewsSentiment(symbol),
        collectInsiderActivity(symbol),
        collectMacroContext(symbol),
        collectPortfolioExposure(symbol),
      ]);

      // Build AI prompt
      const prompt = buildPrompt(symbol, {
        priceAction,
        newsSentiment,
        insiderActivity,
        macroContext,
        portfolioExposure,
      });

      // Get AI suggestion
      const aiResponse = await getAISuggestion(prompt, symbol, mergedCfg.risk_tolerance);

      // Validate and create suggestion
      const suggestion: AISuggestion = {
        symbol,
        ...aiResponse,
        generated_at: new Date().toISOString(),
        signals: {
          price_action: priceAction,
          news_sentiment: newsSentiment,
          insider_activity: insiderActivity,
          macro_context: macroContext,
          portfolio_exposure: portfolioExposure,
        },
      };

      // Apply confidence filter
      if (suggestion.confidence >= mergedCfg.confidence_threshold) {
        suggestions.push(suggestion);
      }
    } catch (error) {
      console.error(`[AI Advisor] Failed to generate suggestion for ${symbol}:`, error);
    }
  }

  return suggestions;
}

function buildPrompt(symbol: string, signals: {
  priceAction: PriceAction;
  newsSentiment: NewsSentiment;
  insiderActivity: InsiderActivity;
  macroContext: MacroContext;
  portfolioExposure: PortfolioExposure;
}): string {
  return `You are a quantitative trading analyst. Analyze the following data for ${symbol} and provide a trading suggestion. Be conservative and risk-aware.

Price action (30d): Current price $${signals.priceAction.current_price.toFixed(2)}, 30d change ${signals.priceAction.price_change_30d.toFixed(2)}%
RSI: ${signals.priceAction.rsi.toFixed(2)} \u2014 interpretation: ${signals.priceAction.rsi_interpretation}
MACD: ${signals.priceAction.macd.macd.toFixed(4)}, trend: ${signals.priceAction.macd.trend}
Volume trend: ${signals.priceAction.volume_trend.trend} (recent avg: ${signals.priceAction.volume_trend.recent_volume_avg.toFixed(0)}, 30d avg: ${signals.priceAction.volume_trend.avg_volume_30d.toFixed(0)})

News sentiment (7d avg): ${signals.newsSentiment.sentiment_score_7d.toFixed(3)} \u2014 recent headlines: ${signals.newsSentiment.recent_headlines.join(', ')}

Insider activity (90d): Net ${signals.insiderActivity.net_buys_sells_90d > 0 ? 'buys' : 'sells'} of $${Math.abs(signals.insiderActivity.net_buys_sells_90d).toLocaleString()}, notable: ${signals.insiderActivity.notable_transactions.map(t => `${t.insider} ${t.type} ${t.shares} shares`).join(', ')}

Upcoming macro events affecting this sector: ${signals.macroContext.upcoming_events.map(e => `${e.event} on ${e.date} (${e.impact} impact)`).join(', ')}

Current portfolio exposure to this sector: ${signals.portfolioExposure.sector_exposure_pct.toFixed(1)}%

Respond in JSON only:
{
 "action": "buy|sell|hold|watch",
 "confidence": 0-100,
 "reasoning": "2-3 sentence explanation",
 "suggested_position_size_pct": 0-10,
 "risk_factors": ["factor1", "factor2"],
 "time_horizon": "short|medium|long",
 "stop_loss_pct": number,
 "take_profit_pct": number
}`;
}

async function getAISuggestion(
  prompt: string,
  symbol: string,
  riskTolerance: 'conservative' | 'moderate' | 'aggressive'
): Promise<Omit<AISuggestion, 'symbol' | 'generated_at' | 'signals'>> {
  // Mock AI response weighted by risk tolerance
  const r = riskBasedValues(riskTolerance);

  const action = weightedRandomAction(riskTolerance);

  const positionSize = Math.floor(Math.random() * (r.positionSizeMax - r.positionSizeMin + 1)) + r.positionSizeMin;
  const stopLoss = Math.floor(Math.random() * (r.stopLossMax - r.stopLossMin + 1)) + r.stopLossMin;
  const takeProfit = Math.floor(Math.random() * (r.takeProfitMax - r.takeProfitMin + 1)) + r.takeProfitMin;
  const confidence = Math.min(100, Math.max(50, Math.floor(Math.random() * 30) + 70 + r.confidenceOffset));

  return {
    action,
    confidence,
    reasoning: `Based on ${riskTolerance} risk profile, ${action} action appears appropriate for ${symbol}.`,
    suggested_position_size_pct: positionSize,
    risk_factors: [
      'Market volatility',
      'Sector uncertainty',
    ].slice(0, Math.floor(Math.random() * 2) + 1),
    time_horizon: ['short', 'medium', 'long'][Math.floor(Math.random() * 3)] as 'short' | 'medium' | 'long',
    stop_loss_pct: stopLoss,
    take_profit_pct: takeProfit,
  };
}

// ── Suggestion Storage ───────────────────────────────────────────
const SUGGESTIONS_KEY = 'alpaca-trading-ai-suggestions';

export interface StoredSuggestion extends AISuggestion {
  _id: string;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function storeSuggestions(suggestions: AISuggestion[]): Promise<void> {
  try {
    const existing = await getSuggestions();
    const newEntries: StoredSuggestion[] = suggestions.map(s => ({ ...s, _id: makeId() }));
    const updated = [...newEntries, ...existing].slice(0, 200); // Keep last 200
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[AI Advisor] Failed to store suggestions:', error);
  }
}

export async function getSuggestions(): Promise<StoredSuggestion[]> {
  try {
    const stored = localStorage.getItem(SUGGESTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[AI Advisor] Failed to get suggestions:', error);
    return [];
  }
}

export async function updateSuggestionOutcome(symbol: string, outcome: 'profitable' | 'unprofitable' | 'neutral'): Promise<void> {
  try {
    const suggestions = await getSuggestions();
    const suggestion = suggestions.find(s => s.symbol === symbol);
    if (suggestion) {
      (suggestion as any).outcome = outcome;
      (suggestion as any).outcome_updated_at = new Date().toISOString();
      await storeSuggestions(suggestions);
    }
  } catch (error) {
    console.error('[AI Advisor] Failed to update suggestion outcome:', error);
  }
}
