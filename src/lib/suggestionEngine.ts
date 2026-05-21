export interface PortfolioContext {
  positions: {
    symbol: string;
    quantity: number;
    market_value: number;
    rsi?: number;
    current_price: number;
  }[];
  cash: number;
  total_equity: number;
}

export interface MarketState {
  sp500_change?: number;
  nasdaq_change?: number;
  vix?: number;
  [key: string]: unknown;
}

import { fetchApi } from '@/lib/api-helper';

export interface Suggestion {
  rank: number;
  type: 'quality_dip' | 'portfolio' | 'strategy';
  action: 'BUY' | 'SELL' | 'TRIM' | 'WATCH';
  symbol: string;
  confidence: number; // 1-10
  score: number; // 0-100
  reasoning: string;
  amount: number;
  stop_loss: number | null;
  signal_tags: string[];
  news_summary: string | null;
  recovery_history: string | null;
}

interface DipScannerCandidate {
  symbol: string;
  current_price: number;
  score?: number;
  safe_to_buy?: boolean;
  suggested_entry?: number;
  suggested_stop?: number;
  suggested_amount?: number;
  news_reason?: {
    one_line_summary?: string;
    reason?: string;
    recovery_probability?: string;
  };
  // allow other fields from dip scanner
  [key: string]: unknown;
}

interface StrategyRow {
  id: string;
  type: 'dca' | 'rebalance' | 'momentum' | 'mean_reversion';
  symbol?: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  last_run?: string;
  next_run?: string;
  // allow other fields
  [key: string]: unknown;
}

/**
 * Fetch quality dips from the dip-scanner API.
 */
async function fetchQualityDips(): Promise<DipScannerCandidate[]> {
  try {
    const res = await fetchApi('/api/dip-scanner', {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.candidates || []) as DipScannerCandidate[];
  } catch {
    return [];
  }
}

/**
 * Check active strategies from Supabase for triggers.
 */
async function fetchActiveStrategies(): Promise<StrategyRow[]> {
  try {
    // Dynamically import to avoid hard dependency if Supabase isn't configured
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseKey) return [];

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('strategies')
      .select('*')
      .eq('enabled', true);

    if (error) return [];
    return (data || []) as StrategyRow[];
  } catch {
    return [];
  }
}

/**
 * Check if today is a scheduled DCA buy date.
 */
function isTodayScheduledDCA(strategy: StrategyRow): boolean {
  const nextRun = strategy.next_run;
  if (!nextRun) return false;
  const today = new Date().toISOString().split('T')[0];
  return nextRun.startsWith(today);
}

/**
 * Check if any position has drifted beyond threshold.
 * We use a simplified check here — in practice this would compare
 * current allocation vs target allocation from strategy config.
 */
function hasRebalanceDrift(
  strategy: StrategyRow,
  portfolio: PortfolioContext
): boolean {
  const driftThreshold =
    (strategy.config?.drift_threshold as number) || 0.05;

  // Simplified: if any single position exceeds 20% it's a proxy for drift
  for (const pos of portfolio.positions) {
    const allocation = pos.market_value / portfolio.total_equity;
    if (allocation > 0.2 + driftThreshold) return true;
  }
  return false;
}

/**
 * Map dip scanner candidates to Suggestion objects.
 */
function mapDipToSuggestions(
  candidates: DipScannerCandidate[]
): Suggestion[] {
  return candidates.map((c) => {
    const score = (c.score ?? 0);
    const isHighScore = score >= 70;

    return {
      rank: 0, // assigned later
      type: 'quality_dip',
      action: c.safe_to_buy ? 'BUY' : 'WATCH',
      symbol: c.symbol,
      confidence: isHighScore ? 9 : 7,
      score: score,
      reasoning:
        c.news_reason?.one_line_summary ||
        `Quality dip detected for ${c.symbol}`,
      amount: c.suggested_amount || 500,
      stop_loss: c.suggested_stop || c.current_price * 0.92,
      signal_tags: [
        'quality_dip',
        c.news_reason?.reason || 'UNKNOWN',
        c.news_reason?.recovery_probability || 'MEDIUM',
      ],
      news_summary: c.news_reason?.one_line_summary || null,
      recovery_history: c.news_reason?.recovery_probability || null,
    };
  });
}

/**
 * Generate portfolio-based suggestions.
 */
function generatePortfolioSuggestions(
  portfolio: PortfolioContext
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const pos of portfolio.positions) {
    // RSI trim signal
    if (pos.rsi && pos.rsi > 68) {
      suggestions.push({
        rank: 0,
        type: 'portfolio',
        action: 'TRIM',
        symbol: pos.symbol,
        confidence: 7,
        score: 70,
        reasoning: `${pos.symbol} RSI is ${pos.rsi.toFixed(1)} — overbought, consider trimming`,
        amount: Math.round(pos.market_value * 0.15),
        stop_loss: null,
        signal_tags: ['rsi_overbought', 'trim'],
        news_summary: null,
        recovery_history: null,
      });
    }

    // Concentration risk
    const allocation = pos.market_value / portfolio.total_equity;
    if (allocation > 0.2) {
      suggestions.push({
        rank: 0,
        type: 'portfolio',
        action: 'TRIM',
        symbol: pos.symbol,
        confidence: 6,
        score: 65,
        reasoning: `${pos.symbol} is ${(allocation * 100).toFixed(1)}% of portfolio — reduce concentration risk`,
        amount: Math.round(pos.market_value * 0.1),
        stop_loss: null,
        signal_tags: ['concentration_risk', 'trim'],
        news_summary: null,
        recovery_history: null,
      });
    }
  }

  // Cash deployment signal
  const cashRatio = portfolio.cash / portfolio.total_equity;
  if (cashRatio > 0.3) {
    suggestions.push({
      rank: 0,
      type: 'portfolio',
      action: 'BUY',
      symbol: 'PORTFOLIO',
      confidence: 5,
      score: 55,
      reasoning: `Cash is ${(cashRatio * 100).toFixed(1)}% of portfolio — consider deploying capital`,
      amount: Math.round(portfolio.cash * 0.2),
      stop_loss: null,
      signal_tags: ['cash_deploy', 'rebalance'],
      news_summary: null,
      recovery_history: null,
    });
  }

  return suggestions;
}

/**
 * Generate strategy-based suggestions.
 */
async function generateStrategySuggestions(
  portfolio: PortfolioContext
): Promise<Suggestion[]> {
  const strategies = await fetchActiveStrategies();
  const suggestions: Suggestion[] = [];

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;

    if (strategy.type === 'dca' && isTodayScheduledDCA(strategy)) {
      suggestions.push({
        rank: 0,
        type: 'strategy',
        action: 'BUY',
        symbol: strategy.symbol || 'PORTFOLIO',
        confidence: 8,
        score: 80,
        reasoning: `DCA strategy scheduled for today — ${strategy.symbol || 'portfolio'}`,
        amount:
          (strategy.config?.amount as number) ||
          (strategy.config?.buy_amount as number) ||
          500,
        stop_loss: null,
        signal_tags: ['dca', 'scheduled'],
        news_summary: null,
        recovery_history: null,
      });
    }

    if (
      strategy.type === 'rebalance' &&
      hasRebalanceDrift(strategy, portfolio)
    ) {
      suggestions.push({
        rank: 0,
        type: 'strategy',
        action: 'TRIM',
        symbol: strategy.symbol || 'PORTFOLIO',
        confidence: 7,
        score: 75,
        reasoning: `Portfolio drift detected — rebalance needed`,
        amount:
          (strategy.config?.rebalance_amount as number) ||
          (strategy.config?.amount as number) ||
          500,
        stop_loss: null,
        signal_tags: ['rebalance', 'drift'],
        news_summary: null,
        recovery_history: null,
      });
    }
  }

  return suggestions;
}

/**
 * Rank suggestions per rules:
 *  1. quality_dip with score >= 70
 *  2. portfolio signals
 *  3. strategy triggers
 *  4. quality_dip with score 50-69
 */
function rankSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const groups = {
    highDips: [] as Suggestion[],
    portfolio: [] as Suggestion[],
    strategy: [] as Suggestion[],
    lowDips: [] as Suggestion[],
  };

  for (const s of suggestions) {
    if (s.type === 'quality_dip' && s.score >= 70) {
      groups.highDips.push(s);
    } else if (s.type === 'portfolio') {
      groups.portfolio.push(s);
    } else if (s.type === 'strategy') {
      groups.strategy.push(s);
    } else if (s.type === 'quality_dip' && s.score >= 50) {
      groups.lowDips.push(s);
    }
    // dips below 50 are dropped
  }

  // Sort within groups by score descending, then confidence descending
  const sortKey = (a: Suggestion, b: Suggestion) =>
    b.score - a.score || b.confidence - a.confidence;

  groups.highDips.sort(sortKey);
  groups.portfolio.sort(sortKey);
  groups.strategy.sort(sortKey);
  groups.lowDips.sort(sortKey);

  const ordered = [
    ...groups.highDips,
    ...groups.portfolio,
    ...groups.strategy,
    ...groups.lowDips,
  ];

  // Assign rank numbers
  return ordered.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Generate daily suggestions combining quality dips, portfolio signals,
 * and strategy triggers into one ranked list.
 */
export async function generateDailySuggestions(
  portfolio: PortfolioContext,
  marketState: MarketState
): Promise<Suggestion[]> {
  // Signal Type 1: Quality Dips
  const dipCandidates = await fetchQualityDips();
  const dipSuggestions = mapDipToSuggestions(dipCandidates);

  // Signal Type 2: Portfolio signals
  const portfolioSuggestions = generatePortfolioSuggestions(portfolio);

  // Signal Type 3: Strategy triggers
  const strategySuggestions = await generateStrategySuggestions(portfolio);

  // Combine and rank
  const allSuggestions = [
    ...dipSuggestions,
    ...portfolioSuggestions,
    ...strategySuggestions,
  ];

  const ranked = rankSuggestions(allSuggestions);

  // Return top 3
  return ranked.slice(0, 3);
}
