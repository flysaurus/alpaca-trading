// ── Market Context Analyzer ────────────────────────────────────
// Generates market regime analysis using either Claude (nuanced)
// or DeepSeek (structured), depending on the use case.

import { callLLM } from './client';
import { MARKET_CONTEXT_SYSTEM } from './prompts';

export interface MarketInput {
  vix: number | null;
  spy_change_pct: number;
  qqq_change_pct: number;
  dia_change_pct?: number;
  sector_performance?: Array<{
    sector: string;
    change_pct: number;
  }>;
  upcoming_events?: Array<{
    date: string;
    event: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  market_breadth?: {
    advancers: number;
    decliners: number;
    unchanged: number;
  };
  put_call_ratio?: number;
  top_stories?: string[];
  is_open?: boolean;
}

export interface MarketAnalysis {
  theme: string;
  macro_regime: 'risk-on' | 'risk-off' | 'neutral-mixed';
  style_preference: 'growth' | 'value' | 'defensive' | 'cyclical' | 'balanced';
  sectors_to_favor: string[];
  sectors_to_avoid: string[];
  tactical_adjustments: string[];
  risk_reward_statement: string;
  confidence: 'high' | 'medium' | 'low';
  generated_at: string;
}

function buildMarketPrompt(input: MarketInput): string {
  const lines: string[] = [];

  lines.push('## Current Market Data');
  lines.push('');

  if (input.vix !== null && input.vix !== undefined) {
    lines.push(`- **VIX:** ${input.vix.toFixed(1)}`);
  } else {
    lines.push('- **VIX:** Not available');
  }

  lines.push(`- **SPY:** ${input.spy_change_pct.toFixed(2)}%`);
  lines.push(`- **QQQ:** ${input.qqq_change_pct.toFixed(2)}%`);
  if (input.dia_change_pct !== undefined) {
    lines.push(`- **DIA:** ${input.dia_change_pct.toFixed(2)}%`);
  }

  if (input.sector_performance && input.sector_performance.length > 0) {
    lines.push('');
    lines.push('## Sector Performance');
    for (const s of input.sector_performance) {
      lines.push(`- **${s.sector}:** ${s.change_pct.toFixed(2)}%`);
    }
  }

  if (input.upcoming_events && input.upcoming_events.length > 0) {
    lines.push('');
    lines.push('## Upcoming Events');
    for (const e of input.upcoming_events) {
      lines.push(`- ${e.date}: ${e.event} (${e.impact} impact)`);
    }
  }

  if (input.market_breadth) {
    lines.push('');
    lines.push('## Market Breadth');
    const total = input.market_breadth.advancers + input.market_breadth.decliners + input.market_breadth.unchanged;
    const advPct = total > 0 ? ((input.market_breadth.advancers / total) * 100).toFixed(1) : 'N/A';
    lines.push(`- Advancers: ${input.market_breadth.advancers} (${advPct}%)`);
    lines.push(`- Decliners: ${input.market_breadth.decliners}`);
    lines.push(`- Unchanged: ${input.market_breadth.unchanged}`);
  }

  if (input.put_call_ratio !== undefined) {
    lines.push('');
    lines.push(`## Put/Call Ratio: ${input.put_call_ratio.toFixed(2)}`);
  }

  if (input.top_stories && input.top_stories.length > 0) {
    lines.push('');
    lines.push('## Top Stories');
    for (const story of input.top_stories) {
      lines.push(`- ${story}`);
    }
  }

  lines.push('');
  lines.push(`Market is currently ${input.is_open ? 'OPEN' : 'CLOSED'}.`);
  lines.push('');
  lines.push('Analyze the market context and return your assessment in this JSON format:');
  lines.push('');
  lines.push(JSON.stringify({
    theme: 'One sentence dominant theme',
    macro_regime: 'risk-on|risk-off|neutral-mixed',
    style_preference: 'growth|value|defensive|cyclical|balanced',
    sectors_to_favor: ['sector1', 'sector2'],
    sectors_to_avoid: ['sector1'],
    tactical_adjustments: ['adjustment1', 'adjustment2'],
    risk_reward_statement: '1 sentence on risk/reward',
    confidence: 'high|medium|low',
  }, null, 2));

  return lines.join('\n');
}

function parseMarketAnalysis(content: string, input: MarketInput): MarketAnalysis {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        theme: parsed.theme || 'Mixed signals, no clear theme',
        macro_regime: parsed.macro_regime || 'neutral-mixed',
        style_preference: parsed.style_preference || 'balanced',
        sectors_to_favor: parsed.sectors_to_favor || [],
        sectors_to_avoid: parsed.sectors_to_avoid || [],
        tactical_adjustments: parsed.tactical_adjustments || [],
        risk_reward_statement: parsed.risk_reward_statement || 'Unclear risk/reward profile',
        confidence: parsed.confidence || 'medium',
        generated_at: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn('[Market Context] Failed to parse LLM response:', e);
  }

  // Fallback: rule-based analysis
  const vix = input.vix ?? 20;
  let macro_regime: MarketAnalysis['macro_regime'] = 'neutral-mixed';
  let style_preference: MarketAnalysis['style_preference'] = 'balanced';

  if (vix < 15 && input.spy_change_pct > 0 && input.qqq_change_pct > 0) {
    macro_regime = 'risk-on';
    style_preference = 'growth';
  } else if (vix > 25 || (input.spy_change_pct < -1 && input.qqq_change_pct < -1)) {
    macro_regime = 'risk-off';
    style_preference = 'defensive';
  }

  const sectorsUp = input.sector_performance?.filter((s) => s.change_pct > 0) || [];
  const sectorsDown = input.sector_performance?.filter((s) => s.change_pct < 0) || [];

  return {
    theme: vix < 15 ? 'Low volatility, supportive for equities' :
           vix > 25 ? 'Elevated fear, defensive positioning warranted' :
           'Mixed signals, wait for clearer direction',
    macro_regime,
    style_preference,
    sectors_to_favor: sectorsUp.slice(0, 3).map((s) => s.sector),
    sectors_to_avoid: sectorsDown.slice(0, 3).map((s) => s.sector),
    tactical_adjustments: [
      style_preference === 'defensive' ? 'Reduce high-beta exposure' : 'Stay invested with hedges',
      'Review stop-loss levels on all positions',
    ],
    risk_reward_statement: vix < 15 ? 'Favorable risk/reward for long positions' :
                           vix > 25 ? 'Elevated risk — size positions smaller' :
                           'Neutral — proceed with normal sizing',
    confidence: 'medium' as const,
    generated_at: new Date().toISOString(),
  };
}

export async function analyzeMarketContext(
  input: MarketInput,
  useLLM: boolean = true
): Promise<MarketAnalysis> {
  if (!useLLM) {
    return parseMarketAnalysis('', input);
  }

  try {
    const prompt = buildMarketPrompt(input);
    const response = await callLLM(prompt, {
      systemPrompt: MARKET_CONTEXT_SYSTEM,
      promptType: 'MARKET_CONTEXT', // Routes to Claude for nuanced analysis
      temperature: 0.3,
      max_tokens: 800,
    });

    return parseMarketAnalysis(response.content, input);
  } catch (error) {
    console.warn('[Market Context] LLM failed, using rules-based fallback:', error);
    return parseMarketAnalysis('', input);
  }
}
