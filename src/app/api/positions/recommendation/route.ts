import { NextResponse } from 'next/server';
import { getPositionRecommendation, PositionRecommendation } from '@/lib/positionAnalysis';
import { getAlpacaNews, NewsItem } from '@/lib/news';
import { getEarningsData, getInsiderTrading, getNewsSentiment, getSectorMomentum } from '@/lib/stockAnalysis';

// In-memory cache: up to 1 hour per symbol (per Vercel function instance)
const cache = new Map<string, { data: PositionRecommendation; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(symbol: string): string {
  const hourSlot = Math.floor(Date.now() / 3600000);
  return `rec-${symbol.toUpperCase()}-${hourSlot}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const currentPrice = parseFloat(searchParams.get('currentPrice') || '0');
    const avgCost = parseFloat(searchParams.get('avgCost') || '0');
    const unrealizedPL = parseFloat(searchParams.get('unrealizedPL') || '0');

    if (!symbol || !currentPrice || !avgCost) {
      return NextResponse.json(
        { error: 'Missing required params: symbol, currentPrice, avgCost' },
        { status: 400 }
      );
    }

    // Check cache (hourly-per-symbol key for consistency)
    const sym = symbol.toUpperCase();
    const cacheKey = getCacheKey(symbol);
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[PosRec] CACHE HIT for ${sym} (key: ${cacheKey})`);
      return NextResponse.json({ ...cached.data, cached: true });
    }
    console.log(`[PosRec] CACHE MISS for ${sym} (key: ${cacheKey}), fetching fresh...`);
    console.log(`[PosRec] Inputs for ${sym}:`, { currentPrice, avgCost, unrealizedPL, qty: searchParams.get('qty'), equity: searchParams.get('equity') });

    // Fetch recent news for symbol
    let recentNews: string[] = [];
    try {
      const newsItems: NewsItem[] = await getAlpacaNews([sym], 5);
      recentNews = newsItems.map((n: NewsItem) => n.headline).filter(Boolean);
    } catch (err: any) {
      console.warn(`[PosRec] News fetch failed for ${sym}:`, err.message);
    }

    // Fetch stock analysis data (non-blocking — null on failure)
    let stockAnalysis: any = {};
    try {
      const [earnings, insider, sentiment, sector] = await Promise.all([
        getEarningsData(sym),
        getInsiderTrading(sym),
        getNewsSentiment(sym),
        getSectorMomentum(sym),
      ]);
      stockAnalysis = {
        earnings: earnings || undefined,
        insider: insider || undefined,
        sentiment: sentiment || undefined,
        sector: sector || undefined,
      };
    } catch (err: any) {
      console.warn(`[PosRec] Stock analysis fetch failed for ${sym}:`, err.message);
    }

    // Stub position + portfolio (caller provides real data via query params)
    const position = {
      symbol: sym,
      qty: searchParams.get('qty') ? parseFloat(searchParams.get('qty')!) : 0,
      market_value: currentPrice * (searchParams.get('qty') ? parseFloat(searchParams.get('qty')!) : 0),
    };

    const portfolio = {
      portfolio_value: searchParams.get('equity') ? parseFloat(searchParams.get('equity')!) : 0,
    };

    const recommendation = await getPositionRecommendation(
      sym,
      currentPrice,
      avgCost,
      unrealizedPL,
      position,
      portfolio,
      recentNews
    );

    console.log(`[PosRec] Fetched rec for ${sym} → ${recommendation.action}`, new Date().toISOString());

    // Cache: 1 hour per hourly slot
    cache.set(cacheKey, {
      data: { ...recommendation, stockAnalysis },
      expiresAt: Date.now() + CACHE_TTL,
    });

    return NextResponse.json({ ...recommendation, stockAnalysis, cached: false });
  } catch (err: any) {
    console.error('[PosRec] Recommendation failed:', err.message);
    return NextResponse.json(
      { error: `Failed to generate recommendation: ${err.message}` },
      { status: 500 }
    );
  }
}
