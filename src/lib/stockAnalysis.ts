/**
 * Stock Analysis Module
 *
 * Provides fundamental, sentiment, insider, and sector data for any symbol.
 * All functions return null on error (no exceptions thrown).
 * Results are cached in-memory per TTL.
 */

// ── Cache helpers ────────────────────────────────────────────────
const cache = new Map<string, { data: any; expiresAt: number }>();

function cached<T>(key: string, fetchFn: () => Promise<T>, ttlMs: number): Promise<T | null> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.data as T);
  return fetchFn().then(data => {
    if (data !== null) cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data as T;
  }).catch(() => null);
}

// ── Alpaca helpers ───────────────────────────────────────────────
function getAlpacaCreds() {
  return {
    key: process.env.ALPACA_API_KEY || '',
    secret: process.env.ALPACA_SECRET_KEY || '',
  };
}

const ALPACA_DATA = 'https://data.alpaca.markets';

// ── 1. Earnings ──────────────────────────────────────────────────
export interface EarningsData {
  nextDate: string | null;
  lastEPS: number | null;
  beatOrMiss: 'beat' | 'miss' | 'inline' | null;
  surprisePercent: number | null;
}

export async function getEarningsData(symbol: string): Promise<EarningsData | null> {
  const sym = symbol.toUpperCase();
  const cacheKey = `earnings:${sym}`;

  return cached(cacheKey, async () => {
    try {
      // Fetch news filtered by symbol, look for earnings-related headlines
      const url = new URL(`${ALPACA_DATA}/v1beta1/news`);
      url.searchParams.set('symbols', sym);
      url.searchParams.set('limit', '20');
      url.searchParams.set('sort', 'desc');

      const { key, secret } = getAlpacaCreds();
      const res = await fetch(url.toString(), {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      });

      if (!res.ok) return null;
      const json = await res.json();
      const news = (json.news || []) as any[];

      // Scan headlines for earnings keywords
      const earningsNews = news.filter((n: any) => {
        const text = `${n.headline} ${n.summary || ''}`.toLowerCase();
        return text.includes('earnings') || text.includes('eps')
          || text.includes('quarterly') || text.includes('revenue');
      });

      const result: EarningsData = {
        nextDate: null,
        lastEPS: null,
        beatOrMiss: null,
        surprisePercent: null,
      };

      if (earningsNews.length > 0) {
        const latest = earningsNews[0];
        const date = new Date(latest.created_at || latest.updated_at);
        result.nextDate = date.toISOString().split('T')[0];

        // Try to extract beat/miss from headline text
        const text = `${latest.headline} ${latest.summary || ''}`.toLowerCase();
        if (text.includes('beat') || text.includes('exceed')) result.beatOrMiss = 'beat';
        else if (text.includes('miss') || text.includes('below')) result.beatOrMiss = 'miss';
        else result.beatOrMiss = 'inline';
      }

      console.log(`[StockAnalysis] Earnings for ${sym}:`, JSON.stringify(result));
      return result;
    } catch (err: any) {
      console.warn(`[StockAnalysis] Earnings fetch failed for ${sym}:`, err.message);
      return null;
    }
  }, 7 * 24 * 60 * 60 * 1000); // 7 days
}

// ── 2. Insider Trading ───────────────────────────────────────────
export interface InsiderTradingData {
  buys_90d: number;
  sells_90d: number;
  netChange: number;
  topBuyers: string[];
}

export async function getInsiderTrading(symbol: string): Promise<InsiderTradingData | null> {
  const sym = symbol.toUpperCase();

  try {
    // Mock data for now — Polygon free tier or SEC EDGAR could be wired later
    console.log(`[StockAnalysis] Insider trading for ${sym}: mock (no data source yet)`);
    return {
      buys_90d: 0,
      sells_90d: 0,
      netChange: 0,
      topBuyers: [],
    };
  } catch (err: any) {
    console.warn(`[StockAnalysis] Insider trading failed for ${sym}:`, err.message);
    return null;
  }
}

// ── 3. News Sentiment ────────────────────────────────────────────
export interface HeadlineSentiment {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface NewsSentimentData {
  headlines: HeadlineSentiment[];
  overallSentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to 1
}

function classifySentiment(headline: string): HeadlineSentiment {
  const text = headline.toLowerCase();
  const bullish = ['beat', 'surge', 'rally', 'jump', 'gain', 'upgrade', 'buy', 'outperform',
    'strong', 'profit', 'growth', 'record', 'rise', 'boost', 'positive', 'bullish'];
  const bearish = ['miss', 'drop', 'fall', 'plunge', 'decline', 'downgrade', 'sell',
    'underperform', 'weak', 'loss', 'crash', 'risk', 'negative', 'bearish', 'fear'];

  const bullScore = bullish.filter(w => text.includes(w)).length;
  const bearScore = bearish.filter(w => text.includes(w)).length;

  const sentiment = bullScore > bearScore ? 'positive'
    : bearScore > bullScore ? 'negative'
    : 'neutral';

  return { text: headline, sentiment };
}

export async function getNewsSentiment(symbol: string): Promise<NewsSentimentData | null> {
  const sym = symbol.toUpperCase();
  const cacheKey = `sentiment:${sym}`;

  return cached(cacheKey, async () => {
    try {
      const url = new URL(`${ALPACA_DATA}/v1beta1/news`);
      url.searchParams.set('symbols', sym);
      url.searchParams.set('limit', '5');
      url.searchParams.set('sort', 'desc');

      const { key, secret } = getAlpacaCreds();
      const res = await fetch(url.toString(), {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      });

      if (!res.ok) return null;
      const json = await res.json();
      const news = (json.news || []) as any[];

      const headlines: HeadlineSentiment[] = news
        .filter((n: any) => n.headline)
        .map((n: any) => classifySentiment(n.headline));

      const positive = headlines.filter(h => h.sentiment === 'positive').length;
      const negative = headlines.filter(h => h.sentiment === 'negative').length;
      const total = headlines.length || 1;

      const score = (positive - negative) / total; // -1 to 1
      const overallSentiment = score > 0.2 ? 'positive'
        : score < -0.2 ? 'negative'
        : 'neutral';

      const result: NewsSentimentData = { headlines, overallSentiment, score };
      console.log(`[StockAnalysis] Sentiment for ${sym}: ${overallSentiment} (${score.toFixed(2)})`);
      return result;
    } catch (err: any) {
      console.warn(`[StockAnalysis] Sentiment fetch failed for ${sym}:`, err.message);
      return null;
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
}

// ── 4. Sector Momentum ──────────────────────────────────────────
export interface SectorMomentumData {
  sectorName: string;
  sectorChangePercent: number;
  comparison: 'outperforming' | 'underperforming' | 'inline';
}

// Simple sector map by symbol pattern / common ETFs
const SECTOR_ETF_MAP: Record<string, string> = {
  XLK: 'Technology', VGT: 'Technology', QQQ: 'Technology',
  XLF: 'Financials', VFH: 'Financials',
  XLV: 'Healthcare', VHT: 'Healthcare',
  XLE: 'Energy', VDE: 'Energy',
  XLY: 'Consumer Cyclical', VCR: 'Consumer Cyclical',
  XLP: 'Consumer Staples', VDC: 'Consumer Staples',
  XLI: 'Industrials', VIS: 'Industrials',
  XLB: 'Materials', VAW: 'Materials',
  XLRE: 'Real Estate', VNQ: 'Real Estate',
  XLU: 'Utilities', VPU: 'Utilities',
  XLC: 'Communication Services', VOX: 'Communication Services',
  SMH: 'Semiconductors', SOXX: 'Semiconductors',
};

function guessSectorEft(symbol: string): string {
  // Simple heuristic — in practice, call Yahoo / Polygon for sector info
  const tech = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'AMZN', 'NVDA', 'AMD', 'INTC',
    'TSLA', 'CRM', 'ADBE', 'NFLX', 'AVGO', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'TXN'];
  const fin = ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'AXP', 'BLK', 'SCHW'];
  const health = ['JNJ', 'PFE', 'MRK', 'ABBV', 'UNH', 'LLY', 'TMO', 'DHR', 'ABT', 'BMY'];
  const energy = ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL'];
  const consumer = ['AMZN', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX', 'BKNG', 'CMG'];
  const comm = ['META', 'GOOGL', 'NFLX', 'DIS', 'VZ', 'T', 'TMUS', 'CMCSA', 'CHTR'];

  if (tech.includes(symbol) || symbol.startsWith('S')) return 'SMH'; // Semi for SMH-ish
  if (tech.includes(symbol)) return 'XLK';
  if (fin.includes(symbol)) return 'XLF';
  if (health.includes(symbol)) return 'XLV';
  if (energy.includes(symbol)) return 'XLE';
  if (consumer.includes(symbol)) return 'XLY';
  if (comm.includes(symbol)) return 'XLC';
  return 'XLK'; // default to tech
}

export async function getSectorMomentum(symbol: string): Promise<SectorMomentumData | null> {
  const sym = symbol.toUpperCase();
  const cacheKey = `sector:${sym}`;

  return cached(cacheKey, async () => {
    try {
      const sectorEtf = guessSectorEft(sym);

      // Fetch 5-day bars for sector ETF and SPY
      const { key, secret } = getAlpacaCreds();
      if (!key || !secret) return null;

      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };

      const [sectorRes, spyRes] = await Promise.all([
        fetch(`${ALPACA_DATA}/v2/stocks/${sectorEtf}/bars?start=${start}&end=${end}&timeframe=1D&limit=5&adjustment=raw`, { headers }),
        fetch(`${ALPACA_DATA}/v2/stocks/SPY/bars?start=${start}&end=${end}&timeframe=1D&limit=5&adjustment=raw`, { headers }),
      ]);

      if (!sectorRes.ok || !spyRes.ok) return null;

      const sectorJson = await sectorRes.json();
      const spyJson = await spyRes.json();

      const sectorBars = sectorJson.bars || [];
      const spyBars = spyJson.bars || [];

      if (sectorBars.length < 2 || spyBars.length < 2) return null;

      const sectorChange = ((sectorBars[sectorBars.length - 1].c - sectorBars[0].o) / sectorBars[0].o) * 100;
      const spyChange = ((spyBars[spyBars.length - 1].c - spyBars[0].o) / spyBars[0].o) * 100;

      const diff = sectorChange - spyChange;
      const comparison = diff > 0.5 ? 'outperforming'
        : diff < -0.5 ? 'underperforming'
        : 'inline';

      const sectorName = SECTOR_ETF_MAP[sectorEtf] || sectorEtf;

      const result: SectorMomentumData = {
        sectorName,
        sectorChangePercent: parseFloat(sectorChange.toFixed(2)),
        comparison,
      };

      console.log(`[StockAnalysis] Sector momentum for ${sym} (${sectorName}): ${result.sectorChangePercent}% vs SPY ${spyChange.toFixed(2)}% — ${comparison}`);
      return result;
    } catch (err: any) {
      console.warn(`[StockAnalysis] Sector momentum failed for ${sym}:`, err.message);
      return null;
    }
  }, 60 * 60 * 1000); // 1 hour
}

// ── 5. Short Interest ───────────────────────────────────────────
export interface ShortInterestData {
  shortInterestPercent: number | null;
  changePercent: number | null;
  daysToCover: number | null;
}

export async function getShortInterest(symbol: string): Promise<ShortInterestData | null> {
  const sym = symbol.toUpperCase();

  try {
    // Mock — requires Polygon Fundamentals API or FINRA short data
    console.log(`[StockAnalysis] Short interest for ${sym}: mock (no data source yet)`);
    return {
      shortInterestPercent: null,
      changePercent: null,
      daysToCover: null,
    };
  } catch (err: any) {
    console.warn(`[StockAnalysis] Short interest failed for ${sym}:`, err.message);
    return null;
  }
}

// ── 6. Analyst Ratings ──────────────────────────────────────────
export interface AnalystRatingsData {
  avgRating: number; // 1-5, 1=strong buy, 5=strong sell
  buyCount: number;
  holdCount: number;
  sellCount: number;
}

export async function getAnalystRatings(symbol: string): Promise<AnalystRatingsData | null> {
  const sym = symbol.toUpperCase();

  try {
    // Mock — requires Polygon / TipRanks / Yahoo Finance analyst data
    console.log(`[StockAnalysis] Analyst ratings for ${sym}: mock (no data source yet)`);
    return {
      avgRating: 3,
      buyCount: 0,
      holdCount: 0,
      sellCount: 0,
    };
  } catch (err: any) {
    console.warn(`[StockAnalysis] Analyst ratings failed for ${sym}:`, err.message);
    return null;
  }
}
