// ── Risk Analyzer ──────────────────────────────────────────────
// DeepSeek-powered risk assessment with structured JSON output.
// Falls back to the existing riskScore.ts calculator when LLM unavailable.

import { callLLM } from './client';
import { RISK_ANALYSIS_SYSTEM } from './prompts';
import { calculateRiskScore, type RiskScore } from '../riskScore';

export interface RiskAnalysisInput {
  positions: Array<{
    symbol: string;
    qty: number;
    market_value: number;
    current_price: number;
    rsi?: number;
    unrealized_plpc?: number;
    week52_high?: number;
    week52_low?: number;
    cost_basis?: number;
  }>;
  account: {
    equity: number;
    cash: number;
    buying_power?: number;
    day_pnl?: number;
  };
  vix: number | null;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface RiskItem {
  category: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  mitigation: string;
}

export interface AIRiskAnalysis {
  total_risk_score: number; // 1-10
  risks: RiskItem[];
  recommended_stop_loss: string;
  recommended_position_size: string;
  confidence_in_analysis: 'High' | 'Medium' | 'Low';
  generated_at: string;
  // Augmented with calculated risk score
  calculated_risk: RiskScore;
}

function buildRiskPrompt(input: RiskAnalysisInput): string {
  const lines: string[] = [];

  lines.push('## Portfolio Summary');
  const equity = input.account.equity || 0;
  const cash = input.account.cash || 0;
  const invested = equity - cash;
  const cashPct = equity > 0 ? ((cash / equity) * 100).toFixed(1) : '0';

  lines.push(`- **Total Equity:** $${equity.toFixed(2)}`);
  lines.push(`- **Invested:** $${invested.toFixed(2)}`);
  lines.push(`- **Cash:** $${cash.toFixed(2)} (${cashPct}%)`);
  lines.push(`- **Risk Tolerance:** ${input.risk_tolerance}`);
  lines.push(`- **VIX:** ${input.vix !== null ? input.vix.toFixed(1) : 'N/A'}`);
  lines.push('');

  lines.push('## Positions');
  if (input.positions.length === 0) {
    lines.push('No open positions.');
  } else {
    for (const pos of input.positions) {
      const allocPct = equity > 0 ? ((pos.market_value / equity) * 100).toFixed(1) : '0';
      const pnlStr = pos.unrealized_plpc !== undefined
        ? `${(pos.unrealized_plpc * 100).toFixed(2)}%`
        : 'N/A';
      const rsiStr = pos.rsi !== undefined ? `RSI ${pos.rsi.toFixed(1)}` : '';
      const pctFromHigh = pos.week52_high && pos.current_price
        ? `${(((pos.current_price - pos.week52_high) / pos.week52_high) * 100).toFixed(1)}% from 52w high`
        : '';

      lines.push(
        `- **${pos.symbol}:** ${pos.qty} shares @ $${pos.current_price?.toFixed(2) || '?'}, ` +
        `${allocPct}% of portfolio, P&L: ${pnlStr} ${rsiStr} ${pctFromHigh}`
      );
    }
  }

  lines.push('');
  lines.push('## Risk Tolerance Adjustments');
  if (input.risk_tolerance === 'conservative') {
    lines.push('- Prefer lower position sizes (<5% per position)');
    lines.push('- Wider diversification preferred');
    lines.push('- Tighter stop losses (3-5%)');
  } else if (input.risk_tolerance === 'aggressive') {
    lines.push('- Can accept higher position sizes (up to 12%)');
    lines.push('- Concentrated bets acceptable');
    lines.push('- Wider stop losses (8-12%) to allow volatility');
  } else {
    lines.push('- Moderate position sizes (5-8% per position)');
    lines.push('- Balanced diversification');
    lines.push('- Standard stop losses (5-8%)');
  }

  lines.push('');
  lines.push('Analyze the portfolio risk and return this JSON:');
  lines.push('');
  lines.push(JSON.stringify({
    total_risk_score: 5,
    risks: [
      {
        category: 'Concentration Risk',
        severity: 'High',
        description: 'NVDA represents 35% of portfolio',
        mitigation: 'Trim NVDA to 15% or less',
      },
    ],
    recommended_stop_loss: '5% trailing stop on all positions',
    recommended_position_size: '5% max per new position',
    confidence_in_analysis: 'High',
  }, null, 2));

  return lines.join('\n');
}

function parseRiskAnalysis(content: string, input: RiskAnalysisInput): AIRiskAnalysis {
  const calculatedRisk = calculateRiskScore(input.positions, input.account, input.vix);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        total_risk_score: parsed.total_risk_score || Math.round(calculatedRisk.score / 10),
        risks: parsed.risks || [],
        recommended_stop_loss: parsed.recommended_stop_loss || '5% trailing stop',
        recommended_position_size: parsed.recommended_position_size || '5% max per position',
        confidence_in_analysis: parsed.confidence_in_analysis || 'Medium',
        generated_at: new Date().toISOString(),
        calculated_risk: calculatedRisk,
      };
    }
  } catch (e) {
    console.warn('[Risk Analyzer] Failed to parse LLM response:', e);
  }

  // Fallback: convert calculated risk score to the AI format
  const risks: RiskItem[] = [];
  const factors = calculatedRisk.factors;

  if (factors.concentration.score > 10) {
    risks.push({
      category: 'Concentration Risk',
      severity: factors.concentration.score > 18 ? 'High' : 'Medium',
      description: factors.concentration.detail,
      mitigation: 'Diversify by trimming largest position',
    });
  }

  if (factors.cash_buffer.score > 10) {
    risks.push({
      category: 'Cash Buffer Risk',
      severity: factors.cash_buffer.score > 15 ? 'High' : 'Medium',
      description: factors.cash_buffer.detail,
      mitigation: 'Maintain 10-20% cash buffer for opportunities',
    });
  }

  if (factors.volatility.score > 10) {
    risks.push({
      category: 'Volatility Risk',
      severity: factors.volatility.score > 18 ? 'High' : 'Medium',
      description: factors.volatility.detail,
      mitigation: 'Reduce position sizes, tighten stops',
    });
  }

  if (factors.rsi_extremes.score > 5) {
    risks.push({
      category: 'Overbought Risk',
      severity: factors.rsi_extremes.score > 10 ? 'High' : 'Medium',
      description: factors.rsi_extremes.detail,
      mitigation: 'Consider trimming overbought positions (RSI > 70)',
    });
  }

  if (factors.diversification.score > 5) {
    risks.push({
      category: 'Diversification Risk',
      severity: factors.diversification.score > 10 ? 'High' : 'Medium',
      description: factors.diversification.detail,
      mitigation: 'Add positions across different sectors',
    });
  }

  return {
    total_risk_score: Math.round(calculatedRisk.score / 10),
    risks,
    recommended_stop_loss: '5% trailing stop on all positions',
    recommended_position_size: '5% max per new position',
    confidence_in_analysis: 'Medium',
    generated_at: new Date().toISOString(),
    calculated_risk: calculatedRisk,
  };
}

export async function analyzeRisk(
  input: RiskAnalysisInput,
  useLLM: boolean = true
): Promise<AIRiskAnalysis> {
  if (!useLLM) {
    return parseRiskAnalysis('', input);
  }

  try {
    const prompt = buildRiskPrompt(input);
    const response = await callLLM(prompt, {
      systemPrompt: RISK_ANALYSIS_SYSTEM,
      promptType: 'RISK_ANALYSIS', // Routes to DeepSeek for structured analysis
      temperature: 0.0, // Deterministic for risk assessment
      max_tokens: 800,
    });

    return parseRiskAnalysis(response.content, input);
  } catch (error) {
    console.warn('[Risk Analyzer] LLM failed, using rules-based fallback:', error);
    return parseRiskAnalysis('', input);
  }
}
