// ── Types ───────────────────────────────────────────────────────
export interface NewsAlert {
  id: string;
  symbol: string;
  keywords: string[];
  sentiment: 'any' | 'bullish' | 'bearish';
  createdAt: string;
  triggeredAt?: string;
  active: boolean;
}

export interface AlertTrigger {
  alertId: string;
  symbol: string;
  headline: string;
  sentiment: string;
  triggeredAt: string;
}

// ── Storage ─────────────────────────────────────────────────────
const ALERTS_KEY = 'alpaca-trading-news-alerts';
const TRIGGERS_KEY = 'alpaca-trading-alert-triggers';

export function getAlerts(): NewsAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: NewsAlert[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export function getTriggers(): AlertTrigger[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TRIGGERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addTrigger(trigger: AlertTrigger): void {
  if (typeof window === 'undefined') return;
  const triggers = getTriggers();
  triggers.unshift(trigger);
  // Keep last 100
  if (triggers.length > 100) triggers.pop();
  localStorage.setItem(TRIGGERS_KEY, JSON.stringify(triggers));
}

export function createAlert(
  symbol: string,
  keywords: string[],
  sentiment: 'any' | 'bullish' | 'bearish' = 'any'
): NewsAlert {
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    symbol: symbol.toUpperCase(),
    keywords: keywords.map(k => k.toLowerCase().trim()).filter(Boolean),
    sentiment,
    createdAt: new Date().toISOString(),
    active: true,
  };
}

export function checkAlertAgainstNews(
  alert: NewsAlert,
  headline: string,
  summary: string,
  newsSentiment: string
): boolean {
  if (!alert.active) return false;

  const text = `${headline} ${summary}`.toLowerCase();

  // Check keywords
  const keywordMatch = alert.keywords.length === 0 || alert.keywords.some(k => text.includes(k));
  if (!keywordMatch) return false;

  // Check sentiment filter
  if (alert.sentiment !== 'any' && newsSentiment !== alert.sentiment) {
    return false;
  }

  return true;
}
