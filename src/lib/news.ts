import { getAssets } from './alpaca';

// ── Types ───────────────────────────────────────────────────────
export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  symbols: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  images?: { url: string; size: string }[];
}

export interface KimiAnalysis {
  tradingImplications: string;
  keyTakeaways: string[];
  confidence: number;
}

export interface OpenRouterAnalysis {
  model: string;
  tradingImplications: string;
  keyTakeaways: string[];
  confidence: number;
}

export interface ScoredNews extends NewsItem {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -1 to +1
  relevanceScore: number; // 0 to 1
  openRouterAnalysis?: OpenRouterAnalysis;
}

// ── Alpaca News ─────────────────────────────────────────────────
// News API is on the Data API endpoint, not the trading API
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

export async function getAlpacaNews(symbols?: string[], limit = 50): Promise<NewsItem[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Alpaca API credentials missing');

  const url = new URL(`${ALPACA_DATA_BASE}/v1beta1/news`);
  if (symbols && symbols.length > 0) {
    url.searchParams.set('symbols', symbols.join(','));
  }
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'desc');

  console.log(`[News] Fetching from Alpaca at ${new Date().toISOString()}`);
  console.log(`[News] Alpaca URL: ${url.toString()}`);

  const res = await fetch(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca news error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const raw = json.news || [];

  console.log(`[News] Alpaca returned ${raw.length} items`);
  if (raw.length > 0) {
    console.log(`[News] First headline raw: "${raw[0].headline}"`);
    console.log(`[News] First headline source: ${raw[0].source}, symbols: ${(raw[0].symbols || []).join(',')}`);
  }

  return raw.map((n: any) => ({
    id: n.id || `${n.source}-${Date.parse(n.created_at)}`,
    headline: n.headline,
    summary: n.summary || '',
    source: n.source,
    url: n.url,
    symbols: n.symbols || [],
    author: n.author || n.source,
    createdAt: n.created_at,
    updatedAt: n.updated_at || n.created_at,
    images: n.images,
  }));
}

// ── NewsAPI.org ─────────────────────────────────────────────────
const NEWSAPI_BASE = 'https://newsapi.org/v2';

export async function getNewsApiHeadlines(
  query: string = 'stock market OR earnings OR fed OR inflation',
  category: string = 'business',
  pageSize = 20
): Promise<NewsItem[]> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) return []; // Graceful degradation

  const url = new URL(`${NEWSAPI_BASE}/everything`);
  url.searchParams.set('q', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('apiKey', key);
  // Last 48 hours
  const from = new Date(Date.now() - 48 * 3600 * 1000).toISOString().split('T')[0];
  url.searchParams.set('from', from);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    console.warn('[NewsAPI] Error:', res.status, text);
    return [];
  }

  const json = await res.json();
  const raw = json.articles || [];

  return raw.map((a: any) => ({
    id: `newsapi-${Date.parse(a.publishedAt)}-${a.title.slice(0, 20)}`,
    headline: a.title,
    summary: a.description || '',
    source: a.source?.name || 'NewsAPI',
    url: a.url,
    symbols: extractSymbolsFromText(`${a.title} ${a.description || ''}`),
    author: a.author || a.source?.name || 'NewsAPI',
    createdAt: a.publishedAt,
    updatedAt: a.publishedAt,
  }));
}

// ── Symbol extraction from text ─────────────────────────────────
const KNOWN_TICKERS = new Set([
  'AAPL','MSFT','GOOGL','AMZN','TSLA','NVDA','META','AMD','INTC','NFLX',
  'CRM','ADBE','PYPL','UBER','LYFT','COIN','HOOD','PLTR','MSTR','ARKK',
  'SPY','QQQ','IWM','XLF','XLE','TLT','GLD','VIX','DIA','EFA','EEM',
  'JPM','BAC','GS','MS','WFC','C','BRK','V','MA','AXP',
  'JNJ','PFE','UNH','ABBV','MRK','LLY','TMO','ABT',
  'XOM','CVX','COP','OXY','SLB','EOG',
  'DIS','NKE','MCD','SBUX','TGT','WMT','COST','HD','LOW',
  'BA','GE','CAT','DE','HON','RTX','LMT','UPS','FDX',
  'T','VZ','TMUS','CMCSA','CHTR',
  'P&G','KO','PEP','WMT','COST','TGT','UL',
  'GOOG','MSFT','META','SNAP','PINS','TWTR','SHOP','SQ','NET','CRWD',
  'ZM','DOCU','ROKU','PTON','BYND','DASH','ABNB','RIVN','LCID',
  'GME','AMC','BB','NOK','BBBY','SPCE','VLDR',
  'MRNA','BNTX','AZN','GILD','REGN','BIIB',
  'F','GM','STLA','TM','HMC',
  'DAL','UAL','AAL','LUV','JBLU',
  'OXY','MRO','DVN','FANG','MPC','PSX','VLO',
  'SOFI','AFRM','UPST','LMND','ROOT',
  'AI','SOUN','PLTR','PATH','SNOW','DDOG','S','OKTA',
  'SMCI','AVGO','QCOM','TXN','MU','LRCX','KLAC','AMAT',
  'TSM','ASML','ARM','NXPI','MRVL','MCHP',
]);

export function extractSymbolsFromText(text: string): string[] {
  const words = text.split(/[^A-Z]/g);
  const found = new Set<string>();
  for (const w of words) {
    if (w.length >= 1 && w.length <= 5 && KNOWN_TICKERS.has(w)) {
      found.add(w);
    }
  }
  return Array.from(found);
}

// ── Aggregate & Score ───────────────────────────────────────────
export async function aggregateNews(
  symbols?: string[],
  limit = 50
): Promise<ScoredNews[]> {
  const [alpacaNews, newsApiNews] = await Promise.all([
    getAlpacaNews(symbols, limit),
    getNewsApiHeadlines(
      symbols ? symbols.join(' OR ') : undefined,
      undefined,
      20
    ),
  ]);

  // Deduplicate by headline similarity (exact match or fuzzy)
  const seen = new Map<string, NewsItem>();
  for (const n of [...alpacaNews, ...newsApiNews]) {
    const key = n.headline.toLowerCase().trim().slice(0, 60);
    if (!seen.has(key)) {
      seen.set(key, n);
    }
  }

  const unique = Array.from(seen.values());
  return unique.map(scoreNewsItem).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ── Sentiment Scoring ───────────────────────────────────────────
const BULLISH_WORDS = new Set([
  'surge','rally','boom','bull','strong','beat','outperform','upgrade','buy',
  'growth','profit','record high','all-time high',' ATH ','momentum','breakout',
  'moon','rocket','gains','soar','jump','climb','rise','upside','target raised',
  'raised price target','exceeded expectations','better than expected','guidance raised',
  'partnership','deal','contract','expansion','launch','innovation','disruption',
  'dividend increase','share buyback','acquisition','merger','IPO','listing',
  'green light','approved','clearance','patent','AI','automation','efficiency',
  'demand','shortage','supply crunch','tailwind','catalyst','positive','optimistic',
  'confident','robust','solid','healthy','thriving','expanding','scaling','win',
  'victory','dominant','leading','top','best','premium','valuation','undervalued',
  'bargain','cheap','discount','accumulate','overweight','strong buy','conviction',
]);

const BEARISH_WORDS = new Set([
  'crash','drop','fall','plunge','tank','bear','weak','miss','underperform',
  'downgrade','sell','loss','decline','downturn','recession','layoff','cut',
  'bankruptcy','default','debt','liability','investigation','lawsuit','fine',
  'penalty','recall','defect','scandal','fraud','accounting irregularity',
  'restate','warning','guidance cut','lowered outlook','below expectations',
  'worse than expected','margin compression','competition threat','disruption risk',
  'regulatory risk','antitrust','tariff','sanction','embargo','supply chain issue',
  'shortage','delay','postponement','cancelled','terminated','fired','resigned',
  'CEO departure','board shakeup','activist','short seller','overvalued','bubble',
  'expensive','rich valuation','reduce','underweight','strong sell','avoid',
  'red flag','concern','worry','risk','threat','headwind','drag','pressure',
  'dilution','secondary offering','stock split reverse','margin call',
]);

export function scoreNewsItem(item: NewsItem): ScoredNews {
  const text = `${item.headline} ${item.summary}`.toLowerCase();
  let bullish = 0;
  let bearish = 0;

  for (const word of BULLISH_WORDS) {
    if (text.includes(word)) bullish++;
  }
  for (const word of BEARISH_WORDS) {
    if (text.includes(word)) bearish++;
  }

  const total = bullish + bearish;
  let sentimentScore = 0;
  if (total > 0) {
    sentimentScore = (bullish - bearish) / total;
  }

  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (sentimentScore > 0.2) sentiment = 'bullish';
  else if (sentimentScore < -0.2) sentiment = 'bearish';

  // Relevance: more symbols mentioned + recent + from known financial source
  let relevance = Math.min(item.symbols.length * 0.15, 0.5);
  const financialSources = new Set(['bloomberg','reuters','cnbc','marketwatch','seeking alpha','benzinga','the wall street journal','wsj','ft','financial times','morningstar','investopedia','yahoo finance']);
  if (financialSources.has(item.source.toLowerCase())) relevance += 0.3;
  if (text.length > 200) relevance += 0.1;
  relevance += Math.min(total * 0.05, 0.2);
  relevance = Math.min(relevance, 1);

  return {
    ...item,
    sentiment,
    sentimentScore,
    relevanceScore: relevance,
  };
}
