// ── AI Module Barrel Export ────────────────────────────────────

export { callLLM, callLLMStream, callClaudeConversation, callDeepSeekStructured } from './client';
export type { Provider, PromptType, LLMOptions, LLMResponse } from './client';

export {
  RECOMMENDATION_ENGINE_SYSTEM,
  CHAT_ASSISTANT_SYSTEM,
  RISK_ANALYSIS_SYSTEM,
  MARKET_CONTEXT_SYSTEM,
  INTENT_CLASSIFICATION_SYSTEM,
  PORTFOLIO_MANAGEMENT_SYSTEM,
  PROMPT_ROUTING,
  PROMPT_ENGINEERING_TIPS,
} from './prompts';

export { classifyIntent, intentNeedsPortfolio, intentNeedsMarket, buildContextualPrefix } from './intentClassifier';
export type { IntentClassification, ClassifiedIntent, IntentEntities } from './intentClassifier';

export { analyzeMarketContext } from './marketContext';
export type { MarketInput, MarketAnalysis } from './marketContext';

export { analyzeRisk } from './riskAnalyzer';
export type { RiskAnalysisInput, AIRiskAnalysis, RiskItem } from './riskAnalyzer';

export { analyzePortfolio } from './portfolioManager';
export type {
  PortfolioSnapshot,
  PortfolioPosition,
  PortfolioAnalysis,
  AllocationGap,
  ConcentrationWarning,
  RebalanceSuggestion,
} from './portfolioManager';

export { generateRecommendation } from './recommendationEngine';
export type { RecommendationInput, RecommendationOutput } from './recommendationEngine';
