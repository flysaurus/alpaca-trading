import { callLLM } from '@/lib/ai/client';

export interface PositionRecommendation {
  action: 'hold' | 'sell' | 'buy';
  target_price: number;
  reasoning: string;
  confidence: number; // 1-10
  stockAnalysis?: Record<string, any>;
}

/**
 * Get AI recommendation for a single position.
 * Considers entry price, current P&L, recent news, and portfolio context.
 */
export async function getPositionRecommendation(
  symbol: string,
  currentPrice: number,
  avgCost: number,
  unrealizedPL: number,
  position: any,
  portfolio: any,
  recentNews: string[]
): Promise<PositionRecommendation> {
  const prompt = `User holds ${symbol}.
Entry: $${avgCost.toFixed(2)}
Current: $${currentPrice.toFixed(2)}
P&L: $${unrealizedPL.toFixed(2)} (${((unrealizedPL / (avgCost * (position.qty || 1))) * 100).toFixed(1)}%)
Qty: ${position.qty || 0}
Market Value: $${(position.market_value || 0).toFixed(2)}

Portfolio Equity: $${(portfolio.portfolio_value || 0).toFixed(2)}
${recentNews.length > 0 ? `Recent news: ${recentNews.join('; ')}` : ''}

Return ONLY valid JSON — no markdown, no explanation:
{
  "action": "hold" | "sell" | "buy",
  "target_price": number,
  "reasoning": "one sentence reasoning",
  "confidence": 1-10
}`;

  const response = await callLLM(prompt);
  return JSON.parse(response);
}
