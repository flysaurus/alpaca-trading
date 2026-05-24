// ── Portfolio Manager ──────────────────────────────────────────
// AI-powered portfolio optimization: allocation analysis,
// rebalancing suggestions, and concentration warnings.

import { callLLM } from './client';
import { PORTFOLIO_MANAGEMENT_SYSTEM } from './prompts';

export interface PortfolioPosition {
  symbol: string;
  qty: number;
  market_value: number;
  current_price: number;
  unrealized_plpc?: number;
  sector?: string;
  cost_basis?: number;
}

export interface PortfolioSnapshot {
  positions: PortfolioPosition[];
  equity: number;
  cash: number;
  buying_power: number;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface AllocationGap {
  sector: string;
  current_pct: number;
  target_pct: number;
  gap_pct: number;
  action: 'buy' | 'sell' | 'hold';
  recommendation: string;
}

export interface ConcentrationWarning {
  type: 'stock' | 'sector';
  name: string;
  current_pct: number;
  threshold_pct: number;
  severity: 'warning' | 'danger';
  suggestion: string;
}

export interface RebalanceSuggestion {
  action: 'buy' | 'sell' | 'trim';
  symbol: string;
  amount: number;
  reason: string;
  priority: number; // 1 = highest
}

export interface PortfolioAnalysis {
  allocation_gaps: AllocationGap[];
  concentration_warnings: ConcentrationWarning[];
  rebalance_suggestions: RebalanceSuggestion[];
  cash_deployment_strategy: string;
  overall_health: 'excellent' | 'good' | 'needs_attention' | 'critical';
  summary: string;
  generated_at: string;
}

// ── Portfolio health (rules-based, no AI needed) ───────────────
function calculatePortfolioHealth(snapshot: PortfolioSnapshot): PortfolioAnalysis {
  const { positions, equity, cash, risk_tolerance } = snapshot;
  const allocationGaps: AllocationGap[] = [];
  const concentrationWarnings: ConcentrationWarning[] = [];
  const rebalanceSuggestions: RebalanceSuggestion[] = [];

  const cashPct = equity > 0 ? (cash / equity) * 100 : 0;

  // ── Sector allocation (S&P 500 reference) ──
  const sectorTargets: Record<string, { min: number; max: number }> = {
    Technology: { min: 20, max: 30 },
    Healthcare: { min: 10, max: 15 },
    Financials: { min: 10, max: 15 },
    Industrials: { min: 6, max: 10 },
    Consumer: { min: 6, max: 10 },
    Energy: { min: 3, max: 5 },
    Utilities: { min: 2, max: 4 },
    'Real Estate': { min: 2, max: 4 },
  };

  // Calculate sector allocations
  const sectorValues: Record<string, number> = {};
  for (const pos of positions) {
    const sector = pos.sector || 'Other';
    sectorValues[sector] = (sectorValues[sector] || 0) + pos.market_value;
  }

  for (const [sector, target] of Object.entries(sectorTargets)) {
    const currentPct = equity > 0 ? ((sectorValues[sector] || 0) / equity) * 100 : 0;
    const targetPct = (target.min + target.max) / 2;
    const gap = targetPct - currentPct;

    if (Math.abs(gap) > 3) {
      allocationGaps.push({
        sector,
        current_pct: currentPct,
        target_pct: targetPct,
        gap_pct: gap,
        action: gap > 0 ? 'buy' : 'sell',
        recommendation: gap > 0
          ? `Add ${gap.toFixed(1)}% to ${sector} (currently ${currentPct.toFixed(1)}%)`
          : `Reduce ${sector} by ${Math.abs(gap).toFixed(1)}% (currently ${currentPct.toFixed(1)}%)`,
      });

      if (gap > 0 && gap > 5) {
        rebalanceSuggestions.push({
          action: 'buy',
          symbol: sector,
          amount: Math.round((gap / 100) * equity),
          reason: `${sector} underweight by ${gap.toFixed(1)}%`,
          priority: gap > 10 ? 1 : 3,
        });
      }
    }
  }

  // ── Concentration warnings ──
  for (const pos of positions) {
    const allocPct = equity > 0 ? (pos.market_value / equity) * 100 : 0;

    if (allocPct > 30) {
      concentrationWarnings.push({
        type: 'stock',
        name: pos.symbol,
        current_pct: allocPct,
        threshold_pct: 30,
        severity: 'danger',
        suggestion: `Trim ${pos.symbol} to below 15% — currently ${allocPct.toFixed(1)}% of portfolio`,
      });
      rebalanceSuggestions.push({
        action: 'trim',
        symbol: pos.symbol,
        amount: Math.round(pos.market_value * 0.5),
        reason: `Extreme concentration: ${allocPct.toFixed(1)}% in ${pos.symbol}`,
        priority: 1,
      });
    } else if (allocPct > 20) {
      concentrationWarnings.push({
        type: 'stock',
        name: pos.symbol,
        current_pct: allocPct,
        threshold_pct: 20,
        severity: 'warning',
        suggestion: `Consider reducing ${pos.symbol} from ${allocPct.toFixed(1)}% to 15%`,
      });
    }
  }

  // Sector concentration
  for (const [sector, value] of Object.entries(sectorValues)) {
    const sectorPct = equity > 0 ? (value / equity) * 100 : 0;
    if (sectorPct > 40) {
      concentrationWarnings.push({
        type: 'sector',
        name: sector,
        current_pct: sectorPct,
        threshold_pct: 40,
        severity: 'danger',
        suggestion: `${sector} at ${sectorPct.toFixed(1)}% — diversify away from this sector`,
      });
    }
  }

  // ── Cash deployment ──
  let cashDeploymentStrategy = '';
  if (cashPct > 50) {
    cashDeploymentStrategy = `High cash position (${cashPct.toFixed(1)}%). Deploy 20% into underweight sectors over 4-6 weeks.`;
  } else if (cashPct > 30) {
    cashDeploymentStrategy = `Elevated cash (${cashPct.toFixed(1)}%). Deploy 10% into highest-conviction underweight sectors.`;
  } else if (cashPct > 20) {
    cashDeploymentStrategy = `Healthy cash buffer (${cashPct.toFixed(1)}%). Use 5-10% for opportunistic buys.`;
  } else if (cashPct > 10) {
    cashDeploymentStrategy = `Adequate cash (${cashPct.toFixed(1)}%). Maintain for opportunities.`;
  } else {
    cashDeploymentStrategy = `Low cash (${cashPct.toFixed(1)}%). Build buffer before new positions.`;
  }

  // ── Overall health ──
  const dangerCount = concentrationWarnings.filter((w) => w.severity === 'danger').length;
  const warningCount = concentrationWarnings.filter((w) => w.severity === 'warning').length;
  const gapSum = allocationGaps.reduce((sum, g) => sum + Math.abs(g.gap_pct), 0);

  let overallHealth: PortfolioAnalysis['overall_health'] = 'good';
  if (dangerCount >= 2 || gapSum > 30) {
    overallHealth = 'critical';
  } else if (dangerCount >= 1 || gapSum > 20) {
    overallHealth = 'needs_attention';
  } else if (warningCount > 2 || gapSum > 10) {
    overallHealth = 'good';
  } else {
    overallHealth = 'excellent';
  }

  return {
    allocation_gaps: allocationGaps,
    concentration_warnings: concentrationWarnings,
    rebalance_suggestions: rebalanceSuggestions.sort((a, b) => a.priority - b.priority).slice(0, 5),
    cash_deployment_strategy: cashDeploymentStrategy,
    overall_health: overallHealth,
    summary: `Portfolio health: ${overallHealth}. ${dangerCount} critical issues, ${warningCount} warnings. ${allocationGaps.length} sector gaps.`,
    generated_at: new Date().toISOString(),
  };
}

// ── AI-enhanced analysis ───────────────────────────────────────
function buildPortfolioPrompt(snapshot: PortfolioSnapshot): string {
  const lines: string[] = [];

  lines.push('## Portfolio Snapshot');
  lines.push(`- **Total Equity:** $${snapshot.equity.toFixed(2)}`);
  lines.push(`- **Cash:** $${snapshot.cash.toFixed(2)} (${((snapshot.cash / snapshot.equity) * 100).toFixed(1)}%)`);
  lines.push(`- **Buying Power:** $${snapshot.buying_power.toFixed(2)}`);
  lines.push(`- **Risk Tolerance:** ${snapshot.risk_tolerance}`);
  lines.push(`- **Positions:** ${snapshot.positions.length}`);
  lines.push('');

  lines.push('## Positions');
  if (snapshot.positions.length === 0) {
    lines.push('100% cash — no positions.');
  } else {
    for (const pos of snapshot.positions) {
      const allocPct = ((pos.market_value / snapshot.equity) * 100).toFixed(1);
      const pnlStr = pos.unrealized_plpc !== undefined
        ? `${(pos.unrealized_plpc * 100).toFixed(2)}%`
        : 'N/A';
      lines.push(
        `- **${pos.symbol}** (${pos.sector || 'Unknown'}): ` +
        `${pos.qty} shares, $${pos.market_value.toFixed(2)}, ` +
        `${allocPct}% of portfolio, P&L: ${pnlStr}`
      );
    }
  }

  lines.push('');
  lines.push('Analyze the portfolio and suggest improvements. Focus on:');
  lines.push('1. Sector balance vs S&P 500 reference allocations');
  lines.push('2. Concentration risks (single stock > 15%, single sector > 35%)');
  lines.push('3. Cash deployment strategy');
  lines.push('4. Top 3 specific actions to improve the portfolio');
  lines.push('');
  lines.push('Keep it actionable and specific. Mention dollar amounts.');

  return lines.join('\n');
}

export async function analyzePortfolio(
  snapshot: PortfolioSnapshot,
  useLLM: boolean = false
): Promise<PortfolioAnalysis> {
  // Rules-based analysis always works — AI is optional enhancement
  const baseAnalysis = calculatePortfolioHealth(snapshot);

  if (!useLLM) {
    return baseAnalysis;
  }

  try {
    const prompt = buildPortfolioPrompt(snapshot);
    const response = await callLLM(prompt, {
      systemPrompt: PORTFOLIO_MANAGEMENT_SYSTEM,
      promptType: 'PORTFOLIO_MANAGEMENT', // Routes to DeepSeek
      temperature: 0.1,
      max_tokens: 800,
    });

    // Merge AI insights with calculated analysis
    // The AI summary can enhance the rules-based output
    baseAnalysis.summary = response.content.slice(0, 500);

    return baseAnalysis;
  } catch (error) {
    console.warn('[Portfolio Manager] LLM failed, using rules-based:', error);
    return baseAnalysis;
  }
}
