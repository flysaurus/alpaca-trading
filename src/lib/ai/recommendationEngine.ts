// ── Recommendation Engine ──────────────────────────────────────
// Replaces the mock getAISuggestion() in ai-advisor.ts with real
// LLM-powered analysis. Accepts collected signals and returns
// structured BUY/WAIT/PASS verdicts with entry/stop/target.

import { callLLM } from './client';
import { RECOMMENDATION_ENGINE_SYSTEM } from './prompts';

export interface RecommendationInput {
  symbol: string;
  priceAction: {
    current_price: number;
    price_change_30d: number;
    rsi: number;
    rsi_interpretation: 'overbought' | 'oversold' | 'neutral';
    macd: {
      trend: 'bullish' | 'bearish' | 'neutral';
      macd: number;
      signal: number;
    };
    volume_trend: {
      trend: 'increasing' | 'decreasing' | 'neutral';
    };
  };
  fundamentals?: {
    pe_ratio?: number;
    market_cap?: number;
    revenue_growth?: number;
  };
  newsSentiment: {
    sentiment_score_7d: number;
    recent_headlines: string[];
    sentiment_trend: 'improving' | 'declining' | 'stable';
  };
  insiderActivity: {
    net_buys_sells_90d: number;
    notable_transactions: Array<{
      type: 'buy' | 'sell';
      shares: number;
      insider: string;
    }>;
  };
  portfolioContext: {
    total_equity: number;
    cash: number;
    current_exposure_pct: number;
    sector_exposure_pct: number;
    risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  };
  marketContext?: {
    vix?: number;
    spy_change_pct?: number;
    sector?: string;
    sector_performance?: number;
  };
  analystConsensus?: {
    buys: number;
    holds: number;
    sells: number;
    avg_rating: number;
  };
  shortInterest?: {
    pct: number;
    days_to_cover: number;
  };
}

export interface RecommendationOutput {
  verdict: 'BUY' | 'WAIT' | 'PASS';
  confidence: number; // 1-10
  entry_price: string;
  stop_loss: string;
  target: string;
  position_size: string;
  upside_catalysts: string[];
  downside_risks: string[];
  time_horizon: string;
  summary: string;
  // Additional fields for UI compatibility
  suggested_position_size_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  risk_factors: string[];
}

function buildRecommendationPrompt(input: RecommendationInput): string {
  const { symbol, priceAction, fundamentals, newsSentiment, insiderActivity,
    portfolioContext, marketContext, analystConsensus, shortInterest } = input;

  const lines: string[] = [];

  lines.push(`## Stock: ${symbol}`);
  lines.push('');

  // Price action
  lines.push('### Price Action (30-day)');
  lines.push(`- **Current Price:** $${priceAction.current_price.toFixed(2)}`);
  lines.push(`- **30d Change:** ${priceAction.price_change_30d.toFixed(2)}%`);
  lines.push(`- **RSI:** ${priceAction.rsi.toFixed(1)} (${priceAction.rsi_interpretation})`);
  lines.push(`- **MACD Trend:** ${priceAction.macd.trend}`);
  lines.push(`- **Volume Trend:** ${priceAction.volume_trend.trend}`);
  lines.push('');

  // Fundamentals
  if (fundamentals) {
    lines.push('### Fundamentals');
    if (fundamentals.pe_ratio !== undefined) lines.push(`- **P/E:** ${fundamentals.pe_ratio.toFixed(1)}`);
    if (fundamentals.market_cap) lines.push(`- **Market Cap:** $${(fundamentals.market_cap / 1e9).toFixed(1)}B`);
    if (fundamentals.revenue_growth !== undefined) lines.push(`- **Revenue Growth:** ${fundamentals.revenue_growth.toFixed(1)}%`);
    lines.push('');
  }

  // News sentiment
  lines.push('### News Sentiment');
  lines.push(`- **7d Score:** ${newsSentiment.sentiment_score_7d.toFixed(2)} (${newsSentiment.sentiment_trend})`);
  if (newsSentiment.recent_headlines.length > 0) {
    lines.push('- **Recent Headlines:**');
    for (const h of newsSentiment.recent_headlines.slice(0, 3)) {
      lines.push(`  - ${h}`);
    }
  }
  lines.push('');

  // Insider activity
  lines.push('### Insider Activity (90d)');
  const netDirection = insiderActivity.net_buys_sells_90d >= 0 ? 'buying' : 'selling';
  lines.push(`- **Net:** $${Math.abs(insiderActivity.net_buys_sells_90d).toLocaleString()} ${netDirection}`);
  if (insiderActivity.notable_transactions.length > 0) {
    for (const t of insiderActivity.notable_transactions.slice(0, 3)) {
      lines.push(`  - ${t.insider}: ${t.type} ${t.shares.toLocaleString()} shares`);
    }
  }
  lines.push('');

  // Portfolio context
  lines.push('### Portfolio Context');
  lines.push(`- **Risk Tolerance:** ${portfolioContext.risk_tolerance}`);
  lines.push(`- **Total Equity:** $${portfolioContext.total_equity.toFixed(2)}`);
  lines.push(`- **Cash:** $${portfolioContext.cash.toFixed(2)}`);
  lines.push(`- **Current ${symbol} Exposure:** ${portfolioContext.current_exposure_pct.toFixed(1)}%`);
  lines.push(`- **Sector Exposure:** ${portfolioContext.sector_exposure_pct.toFixed(1)}%`);
  lines.push('');

  // Market context
  if (marketContext) {
    lines.push('### Market Context');
    if (marketContext.vix !== undefined) lines.push(`- **VIX:** ${marketContext.vix.toFixed(1)}`);
    if (marketContext.spy_change_pct !== undefined) lines.push(`- **SPY:** ${marketContext.spy_change_pct.toFixed(2)}%`);
    if (marketContext.sector) lines.push(`- **Sector:** ${marketContext.sector} (${(marketContext.sector_performance || 0).toFixed(1)}%)`);
    lines.push('');
  }

  // Analyst consensus
  if (analystConsensus) {
    lines.push('### Analyst Consensus');
    lines.push(`- **Ratings:** ${analystConsensus.buys} Buy / ${analystConsensus.holds} Hold / ${analystConsensus.sells} Sell`);
    lines.push(`- **Avg Rating:** ${analystConsensus.avg_rating.toFixed(1)}/5`);
    lines.push('');
  }

  // Short interest
  if (shortInterest) {
    lines.push('### Short Interest');
    lines.push(`- **Short %:** ${shortInterest.pct.toFixed(1)}%`);
    lines.push(`- **Days to Cover:** ${shortInterest.days_to_cover.toFixed(1)}`);
    lines.push('');
  }

  lines.push('Analyze and return your recommendation as JSON:');
  lines.push('');
  lines.push(JSON.stringify({
    verdict: 'BUY',
    confidence: 7,
    entry_price: '$150-155 range',
    stop_loss: '$142 (-5%)',
    target: '$175 (+16%)',
    position_size: '5% of portfolio ($5,000)',
    upside_catalysts: ['Earnings beat last quarter', 'Sector tailwind'],
    downside_risks: ['Macro uncertainty', 'High valuation'],
    time_horizon: '3-6 months',
    summary: 'Strong setup with acceptable risk.',
  }, null, 2));

  return lines.join('\n');
}

function parseRecommendation(content: string, input: RecommendationInput): RecommendationOutput {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      const stopLossPct = parseStopFromStr(parsed.stop_loss || '', input.priceAction.current_price);
      const targetPrice = parseTargetFromStr(parsed.target || '', input.priceAction.current_price);
      const takeProfitPct = targetPrice > input.priceAction.current_price
        ? ((targetPrice - input.priceAction.current_price) / input.priceAction.current_price) * 100
        : 10;

      return {
        verdict: parsed.verdict || 'WAIT',
        confidence: parsed.confidence || 5,
        entry_price: parsed.entry_price || `$${input.priceAction.current_price.toFixed(2)}`,
        stop_loss: parsed.stop_loss || `-${stopLossPct.toFixed(0)}%`,
        target: parsed.target || `+${takeProfitPct.toFixed(0)}%`,
        position_size: parsed.position_size || '5% of portfolio',
        upside_catalysts: parsed.upside_catalysts || [],
        downside_risks: parsed.downside_risks || [],
        time_horizon: parsed.time_horizon || 'medium',
        summary: parsed.summary || 'Analysis generated.',
        // Computed fields
        suggested_position_size_pct: extractPositionSizePct(
          parsed.position_size || '',
          input.portfolioContext.risk_tolerance
        ),
        stop_loss_pct: stopLossPct,
        take_profit_pct: takeProfitPct,
        risk_factors: parsed.downside_risks || ['Market volatility', 'Sector uncertainty'],
      };
    }
  } catch (e) {
    console.warn('[Recommendation Engine] Failed to parse LLM response:', e);
  }

  // Fallback: rules-based recommendation
  const risk = input.portfolioContext.risk_tolerance;
  const positionSize = risk === 'conservative' ? 3 : risk === 'aggressive' ? 8 : 5;
  const rsi = input.priceAction.rsi;
  const macdTrend = input.priceAction.macd.trend;

  let verdict: 'BUY' | 'WAIT' | 'PASS' = 'WAIT';
  let confidence = 5;

  if (rsi < 35 && macdTrend !== 'bearish') {
    verdict = 'BUY';
    confidence = 7;
  } else if (rsi > 70) {
    verdict = 'PASS';
    confidence = 7;
  } else if (rsi < 50 && input.newsSentiment.sentiment_score_7d > 0) {
    verdict = 'BUY';
    confidence = 6;
  }

  return {
    verdict,
    confidence,
    entry_price: `$${input.priceAction.current_price.toFixed(2)}`,
    stop_loss: `-5%`,
    target: `+10%`,
    position_size: `${positionSize}% of portfolio`,
    upside_catalysts: input.newsSentiment.sentiment_score_7d > 0
      ? ['Positive news sentiment'] : [],
    downside_risks: rsi > 60 ? ['RSI approaching overbought'] : [],
    time_horizon: 'medium',
    summary: `Rules-based ${verdict} for ${input.symbol}.`,
    suggested_position_size_pct: positionSize,
    stop_loss_pct: 5,
    take_profit_pct: 10,
    risk_factors: ['Market volatility'],
  };
}

function parseStopFromStr(stopStr: string, currentPrice: number): number {
  // Try to parse percentage like "-5%" or "$142 (-5%)"
  const pctMatch = stopStr.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return parseFloat(pctMatch[1]);
  return 5; // default
}

function parseTargetFromStr(targetStr: string, currentPrice: number): number {
  // Try to parse price like "$175 (+16%)" or "$175"
  const priceMatch = targetStr.match(/\$?(\d+(?:\.\d+)?)/);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price > currentPrice) return price;
  }
  return currentPrice * 1.1; // default +10%
}

function extractPositionSizePct(
  posStr: string,
  risk: 'conservative' | 'moderate' | 'aggressive'
): number {
  const pctMatch = posStr.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return parseFloat(pctMatch[1]);
  return risk === 'conservative' ? 3 : risk === 'aggressive' ? 8 : 5;
}

// ── Main entry point ───────────────────────────────────────────
export async function generateRecommendation(
  input: RecommendationInput,
  useLLM: boolean = true
): Promise<RecommendationOutput> {
  if (!useLLM) {
    return parseRecommendation('', input);
  }

  try {
    const prompt = buildRecommendationPrompt(input);
    const response = await callLLM(prompt, {
      systemPrompt: RECOMMENDATION_ENGINE_SYSTEM,
      promptType: 'RECOMMENDATION_ENGINE', // Routes to DeepSeek
      temperature: 0.1,
      max_tokens: 600,
    });

    return parseRecommendation(response.content, input);
  } catch (error) {
    console.warn('[Recommendation Engine] LLM failed, using rules-based:', error);
    return parseRecommendation('', input);
  }
}
