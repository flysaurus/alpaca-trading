import { NextResponse } from 'next/server';
import { getPositionRecommendation, PositionRecommendation } from '@/lib/positionAnalysis';
import { getAlpacaNews, NewsItem } from '@/lib/news';
import { getEarningsData, getInsiderTrading, getNewsSentiment, getSectorMomentum } from '@/lib/stockAnalysis';

// In-memory cache: 24 hours per symbol
const cache = new Map<string, { data: PositionRecommendation; expiresAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

    // Check cache
    const cacheKey = symbol.toUpperCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    // Fetch recent news for symbol
    let recentNews: string[] = [];
    try {
      const newsItems: NewsItem[] = await getAlpacaNews([cacheKey], 5);
      recentNews = newsItems.map((n: NewsItem) => n.headline).filter(Boolean);
    } catch (err: any) {
      console.warn(`[PosRec] News fetch failed for ${cacheKey}:`, err.message);
    }

    // Fetch stock analysis data (non-blocking — null on failure)
    let stockAnalysis: any = {};
    try {
      const [earnings, insider, sentiment, sector] = await Promise.all([
        getEarningsData(cacheKey),
        getInsiderTrading(cacheKey),
        getNewsSentiment(cacheKey),
        getSectorMomentum(cacheKey),
      ]);
      stockAnalysis = {
        earnings: earnings || undefined,
        insider: insider || undefined,
        sentiment: sentiment || undefined,
        sector: sector || undefined,
      };
    } catch (err: any) {
      console.warn(`[PosRec] Stock analysis fetch failed for ${cacheKey}:`, err.message);
    }

    // Stub position + portfolio (caller provides real data via query params)
    const position = {
      symbol: cacheKey,
      qty: searchParams.get('qty') ? parseFloat(searchParams.get('qty')!) : 0,
      market_value: currentPrice * (searchParams.get('qty') ? parseFloat(searchParams.get('qty')!) : 0),
    };

    const portfolio = {
      portfolio_value: searchParams.get('equity') ? parseFloat(searchParams.get('equity')!) : 0,
    };

    const recommendation = await getPositionRecommendation(
      cacheKey,
      currentPrice,
      avgCost,
      unrealizedPL,
      position,
      portfolio,
      recentNews
    );

    // Cache for 24 hours
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
