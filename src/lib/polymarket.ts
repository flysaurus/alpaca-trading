// ── Types ───────────────────────────────────────────────────────
export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  category: string;
  endDate?: string;
  liquidity: number;
  volume: number;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: number[]; // implied probabilities 0-1
  volume: number;
  liquidity: number;
  endDate?: string;
  active: boolean;
  closed: boolean;
}

// ── Polymarket API ──────────────────────────────────────────────
const POLY_BASE = 'https://api.polymarket.com';

/**
 * Search Polymarket events by keyword
 */
export async function searchPolymarketEvents(
  query?: string,
  limit = 20
): Promise<PolymarketEvent[]> {
  const url = new URL(`${POLY_BASE}/events`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  if (query) {
    url.searchParams.set('search', query);
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn('[Polymarket] Events fetch failed:', res.status);
      return [];
    }
    const json = await res.json();
    return (json || []).map(parseEvent);
  } catch (err) {
    console.warn('[Polymarket] Error:', err);
    return [];
  }
}

/**
 * Get events by category (e.g. "politics", "crypto", "sports", "business")
 */
export async function getPolymarketByCategory(
  category: string,
  limit = 10
): Promise<PolymarketEvent[]> {
  const url = new URL(`${POLY_BASE}/events`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('category', category);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = await res.json();
    return (json || []).map(parseEvent);
  } catch {
    return [];
  }
}

/**
 * Get a specific event by slug
 */
export async function getPolymarketEvent(slug: string): Promise<PolymarketEvent | null> {
  try {
    const res = await fetch(`${POLY_BASE}/events/slug/${slug}`);
    if (!res.ok) return null;
    const json = await res.json();
    return parseEvent(json);
  } catch {
    return null;
  }
}

function parseEvent(raw: any): PolymarketEvent {
  const markets = (raw.markets || []).map((m: any) => ({
    id: m.id,
    question: m.question,
    slug: m.slug,
    outcomes: m.outcomes || [],
    outcomePrices: (m.outcomePrices || []).map((p: any) => {
      if (typeof p === 'number') return p;
      if (typeof p === 'string') {
        try {
          return JSON.parse(p);
        } catch {
          return 0.5;
        }
      }
      return 0.5;
    }),
    volume: m.volume || 0,
    liquidity: m.liquidity || 0,
    endDate: m.endDate,
    active: m.active ?? true,
    closed: m.closed ?? false,
  }));

  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    category: raw.category || 'general',
    endDate: raw.endDate,
    liquidity: raw.liquidity || 0,
    volume: raw.volume || 0,
    markets,
  };
}

// ── Map stock symbols to relevant Polymarket events ─────────────
export async function getRelevantPolymarketEvents(symbols?: string[]): Promise<PolymarketEvent[]> {
  const queries: string[] = [];

  if (symbols && symbols.length > 0) {
    // Search for each symbol
    for (const sym of symbols.slice(0, 3)) {
      queries.push(sym);
    }
  }

  // Always include macro/political events
  queries.push('Fed');
  queries.push('recession');

  const allEvents: PolymarketEvent[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    try {
      const events = await searchPolymarketEvents(q, 5);
      for (const e of events) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          allEvents.push(e);
        }
      }
    } catch {
      // ignore individual query failures
    }
  }

  // Also fetch trending business/finance events
  try {
    const business = await getPolymarketByCategory('business', 5);
    for (const e of business) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        allEvents.push(e);
      }
    }
  } catch {
    // ignore
  }

  return allEvents
    .filter(e => e.markets.some(m => m.active && !m.closed))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);
}
