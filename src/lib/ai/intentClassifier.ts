// ── Intent Classifier ─────────────────────────────────────────
// Classifies user messages into intent categories to route
// to the appropriate AI pipeline. Handles multi-intent messages.

import { callLLM } from './client';
import { INTENT_CLASSIFICATION_SYSTEM } from './prompts';
import type { LLMOptions } from './client';

// ── Types ──────────────────────────────────────────────────────
export interface ClassifiedIntent {
  intent: string;
  confidence: number;
  priority: number;
  condition?: string;
}

export interface IntentEntities {
  action?: string;
  symbol?: string;
  quantity?: string;
  price?: string;
  condition?: string;
  [key: string]: string | undefined;
}

export interface IntentClassification {
  intents: ClassifiedIntent[];
  primary_intent: string;
  mentioned_symbols: string[];
  entities: IntentEntities;
  requires_portfolio_data: boolean;
  requires_market_data: boolean;
  is_compound: boolean;
  suggested_workflow: string[];
}

// ── Default (fallback when LLM unavailable) ───────────────────
function classifyLocally(message: string): IntentClassification {
  const upper = message.toUpperCase();

  // Extract ticker symbols ($1,000 to $5,000 look like CUSIP fragments, ignore)
  const tickerRegex = /\b([A-Z]{1,5})\b/g;
  const symbols: string[] = [];
  let match;
  while ((match = tickerRegex.exec(upper)) !== null) {
    const sym = match[1];
    // Filter out common non-ticker words
    const nonTickers = new Set([
      'A', 'I', 'THE', 'IS', 'IT', 'AT', 'IN', 'ON', 'AND', 'OR', 'FOR',
      'BUY', 'SELL', 'HOW', 'WHAT', 'WHY', 'WHEN', 'CAN', 'ARE', 'WAS',
      'THIS', 'THAT', 'WITH', 'FROM', 'YOUR', 'YOU', 'NOT', 'DO', 'TO',
      'AN', 'BE', 'BY', 'HE', 'SHE', 'WE', 'IF', 'SO', 'NO', 'ME', 'MY',
      'HAS', 'HAD', 'ALL', 'ANY', 'PUT', 'CALL', 'NEW', 'NOW', 'TOP',
      'CEO', 'CFO', 'USA', 'ETF', 'IPO', 'GDP', 'CPI', 'FOMC', 'VIX',
      'RSI', 'MACD', 'P/E', 'EPS', 'PEG', 'YOY', 'QOQ', 'MTD', 'YTD',
      'AI', 'OK', 'HI', 'HEY',
    ]);
    if (!nonTickers.has(sym) && !symbols.includes(sym)) {
      symbols.push(sym);
    }
  }

  // Determine intents from keywords
  const intents: ClassifiedIntent[] = [];

  // STOCK_RESEARCH
  if (
    symbols.length > 0 &&
    (upper.includes('TELL') ||
      upper.includes('RESEARCH') ||
      upper.includes('INFO') ||
      upper.includes('ABOUT') ||
      upper.includes('WHAT IS') ||
      upper.includes('WHO IS') ||
      upper.includes('ANALYZE') ||
      upper.includes('LOOK INTO') ||
      upper.includes('THINK'))
  ) {
    intents.push({ intent: 'STOCK_RESEARCH', confidence: 80, priority: 1 });
  }

  // RECOMMENDATION_REQUEST
  if (
    upper.includes('BUY') ||
    upper.includes('RECOMMEND') ||
    upper.includes('SUGGEST') ||
    upper.includes('IDEA') ||
    upper.includes('PICK') ||
    upper.includes('LOOKING GOOD') ||
    upper.includes('OPPORTUNITY')
  ) {
    intents.push({ intent: 'RECOMMENDATION_REQUEST', confidence: 75, priority: intents.length + 1 });
  }

  // EXECUTION_HELP
  if (
    upper.includes('PLACE') ||
    upper.includes('ORDER') ||
    upper.includes('EXECUTE') ||
    upper.includes('TRADE') ||
    (upper.includes('BUY') && symbols.length > 0) ||
    (upper.includes('SELL') && symbols.length > 0)
  ) {
    intents.push({ intent: 'EXECUTION_HELP', confidence: 70, priority: intents.length + 1 });
  }

  // PORTFOLIO_INQUIRY
  if (
    upper.includes('PORTFOLIO') ||
    upper.includes('HOLDING') ||
    upper.includes('ALLOCATION') ||
    upper.includes('HOW AM I DOING') ||
    upper.includes('MY POSITIONS') ||
    upper.includes('BIGGEST HOLDING')
  ) {
    intents.push({ intent: 'PORTFOLIO_INQUIRY', confidence: 85, priority: intents.length + 1 });
  }

  // RISK_ANALYSIS
  if (
    upper.includes('RISK') ||
    upper.includes('DANGER') ||
    upper.includes('CONCENTRATED') ||
    upper.includes('EXPOSURE') ||
    upper.includes('SAFE')
  ) {
    intents.push({ intent: 'RISK_ANALYSIS', confidence: 75, priority: intents.length + 1 });
  }

  // POSITION_MANAGEMENT
  if (
    upper.includes('TRIM') ||
    upper.includes('CLOSE') ||
    upper.includes('TAKE PROFIT') ||
    upper.includes('STOP LOSS') ||
    upper.includes('ADD MORE') ||
    upper.includes('REDUCE')
  ) {
    intents.push({ intent: 'POSITION_MANAGEMENT', confidence: 80, priority: intents.length + 1 });
  }

  // MARKET_ANALYSIS
  if (
    upper.includes('MARKET') ||
    upper.includes('SECTOR') ||
    upper.includes('INDEX') ||
    upper.includes('SPY') ||
    upper.includes('QQQ') ||
    upper.includes('VIX') ||
    upper.includes('ECONOMY') ||
    upper.includes('FED')
  ) {
    intents.push({ intent: 'MARKET_ANALYSIS', confidence: 75, priority: intents.length + 1 });
  }

  // EDUCATIONAL
  if (
    upper.includes('WHAT IS') ||
    upper.includes('EXPLAIN') ||
    upper.includes('HOW DOES') ||
    upper.includes('DEFINE') ||
    upper.includes('MEANING') ||
    upper.includes('TUTORIAL')
  ) {
    intents.push({ intent: 'EDUCATIONAL', confidence: 80, priority: intents.length + 1 });
  }

  // Fallback to GENERAL_CHAT
  if (intents.length === 0) {
    intents.push({ intent: 'GENERAL_CHAT', confidence: 60, priority: 1 });
  }

  // Sort by confidence descending
  intents.sort((a, b) => b.confidence - a.confidence);
  // Re-assign priorities
  intents.forEach((intent, i) => (intent.priority = i + 1));

  return {
    intents,
    primary_intent: intents[0]?.intent || 'GENERAL_CHAT',
    mentioned_symbols: symbols,
    entities: {
      action: intents.find((i) => i.intent === 'EXECUTION_HELP') ? 'unknown' : undefined,
      symbol: symbols[0],
    },
    requires_portfolio_data: ['PORTFOLIO_INQUIRY', 'RISK_ANALYSIS', 'POSITION_MANAGEMENT', 'RECOMMENDATION_REQUEST'].includes(
      intents[0]?.intent
    ),
    requires_market_data: ['MARKET_ANALYSIS', 'STOCK_RESEARCH', 'RECOMMENDATION_REQUEST'].includes(
      intents[0]?.intent
    ),
    is_compound: intents.length > 1,
    suggested_workflow: intents.map(
      (i) => `Handle ${i.intent} (confidence: ${i.confidence}%)`
    ),
  };
}

// ── LLM-powered Classification ─────────────────────────────────
export async function classifyIntent(
  message: string,
  opts?: { useLLM?: boolean }
): Promise<IntentClassification> {
  // If LLM not requested or not available, use local classifier
  if (!opts?.useLLM) {
    return classifyLocally(message);
  }

  try {
    const response = await callLLM(message, {
      systemPrompt: INTENT_CLASSIFICATION_SYSTEM,
      promptType: 'INTENT_CLASSIFICATION',
      temperature: 0.0,
      max_tokens: 500,
    });

    // Try to parse JSON from the response
    const content = response.content;
    // Extract JSON block if wrapped in markdown
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as IntentClassification;
      return parsed;
    }

    // Fallback to local if parsing fails
    return classifyLocally(message);
  } catch (error) {
    console.warn('[Intent Classifier] LLM failed, using local:', error);
    return classifyLocally(message);
  }
}

// ── Helper: Check if intent requires portfolio data ────────────
export function intentNeedsPortfolio(intent: string): boolean {
  return ['PORTFOLIO_INQUIRY', 'RISK_ANALYSIS', 'POSITION_MANAGEMENT', 'RECOMMENDATION_REQUEST'].includes(intent);
}

// ── Helper: Check if intent requires market data ────────────────
export function intentNeedsMarket(intent: string): boolean {
  return ['MARKET_ANALYSIS', 'STOCK_RESEARCH', 'RECOMMENDATION_REQUEST'].includes(intent);
}

// ── Helper: Get the best system prompt for an intent ────────────
export function getSystemPromptForIntent(intent: string): string {
  // This will be imported dynamically to avoid circular deps
  const { CHAT_ASSISTANT_SYSTEM } = require('./prompts');
  return CHAT_ASSISTANT_SYSTEM;
}

// ── Helper: Build a contextual prompt prefix ────────────────────
export function buildContextualPrefix(
  classification: IntentClassification
): string {
  const { primary_intent, is_compound, intents, suggested_workflow } = classification;

  let prefix = `[Intent: ${primary_intent}]\n`;

  if (is_compound) {
    prefix += `[Compound query detected with ${intents.length} intents]\n`;
    prefix += `[Workflow: ${suggested_workflow.join(' → ')}]\n`;
  }

  return prefix;
}
