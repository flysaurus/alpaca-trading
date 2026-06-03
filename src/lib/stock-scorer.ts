import { supabase } from './supabase'
import { getAnalystData, getNewsSentiment } from './external-data'

// ─── Interfaces ──────────────────────────────────────────────────────

export interface StockData {
  currentPrice: number
  change1d: number
  pe: number | null
  epsGrowth: number | null
  revenueGrowth: number | null
  profitMargin: number | null
  roe: number | null
  debtToEquity: number | null
  dividendYield: number | null
  priceToBook: number | null
  rsi14: number | null
  priceVs50MA: number | null
  priceVs200MA: number | null
  trend: string
  support: number | null
  resistance: number | null
  newsSentiment: string
  sentimentScore: number
  headlines: string[]
  analystConsensus: string | null
  analystCount: number
  targetMean: number | null
  targetHigh: number | null
  targetLow: number | null
  institutionalOwnership: number | null
  shortInterest: number | null
}

export interface StockScore {
  symbol: string
  company: string
  sector: string
  compositeScore: number
  fundamentalScore: number
  technicalScore: number
  sentimentScore: number
  analystScore: number
  styleFitScore: number
  conviction: 'high' | 'medium' | 'speculative'
  entryObservationLow: number | null
  entryObservationHigh: number | null
  data: StockData
}

// ─── Technical Helpers ───────────────────────────────────────────────

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0
  let losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round(100 - 100 / (1 + rs))
}

function calculateMA(closes: number[], period: number): number {
  if (closes.length < period) {
    return closes[closes.length - 1] || 0
  }
  const slice = closes.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function determineTrend(
  price: number,
  ma50: number,
  ma200: number,
  rsi: number
): string {
  if (price > ma50 && price > ma200 && rsi > 55) return 'strong_up'
  if (price > ma50 && price > ma200) return 'up'
  if (price < ma50 && price < ma200 && rsi < 45) return 'strong_down'
  if (price < ma50 && price < ma200) return 'down'
  return 'sideways'
}

// ─── Main Scorer ─────────────────────────────────────────────────────

export async function scoreStock(
  symbol: string,
  investorStyle: string,
  riskTolerance: string
): Promise<StockScore | null> {
  try {
    // Check cache
    const { data: cached } = await supabase
      .from('stock_analysis_cache')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single()

    // Coerce cached to a plain object (Supabase .single() may return an error object)
    const row: Record<string, any> | null =
      cached && !('error' in cached) ? (cached as Record<string, any>) : null

    const techFresh =
      row?.technicals_expires_at &&
      new Date(row.technicals_expires_at) > new Date()
    const fundFresh =
      row?.fundamentals_expires_at &&
      new Date(row.fundamentals_expires_at) > new Date()
    const analystFresh =
      row?.analyst_expires_at &&
      new Date(row.analyst_expires_at) > new Date()

    // Fetch only stale data
    const apiKey = process.env.FINNHUB_API_KEY
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split('T')[0]

    const [quote, metrics, candleData, newsData, analystData] =
      await Promise.all([
        !techFresh
          ? fetch(
              `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`
            )
              .then((r) => r.json())
              .catch(() => null)
          : Promise.resolve(null),
        !fundFresh
          ? fetch(
              `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`
            )
              .then((r) => r.json())
              .catch(() => null)
          : Promise.resolve(null),
        !techFresh
          ? fetch(
              `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&count=60&token=${apiKey}`
            )
              .then((r) => r.json())
              .catch(() => null)
          : Promise.resolve(null),
        !fundFresh
          ? fetch(
              `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${weekAgo}&to=${today}&token=${apiKey}`
            )
              .then((r) => r.json())
              .catch(() => null)
          : Promise.resolve(null),
        !analystFresh ? getAnalystData(symbol) : Promise.resolve(null),
      ])

    // Calculate technicals
    let rsi14: number | null = row?.rsi_14 ?? null
    let priceVs50MA: number | null = row?.price_vs_50ma ?? null
    let priceVs200MA: number | null = row?.price_vs_200ma ?? null
    let trend = row?.trend || 'sideways'
    let support: number | null = row?.support_level ?? null
    let resistance: number | null = row?.resistance_level ?? null

    if (candleData?.c && candleData.c.length > 0) {
      const closes: number[] = candleData.c
      rsi14 = calculateRSI(closes)
      const ma50 = calculateMA(closes, 50)
      const ma200 = calculateMA(closes, Math.min(200, closes.length))
      const currentPrice = closes[closes.length - 1]
      priceVs50MA = ma50 > 0 ? currentPrice / ma50 : null
      priceVs200MA = ma200 > 0 ? currentPrice / ma200 : null
      trend = determineTrend(currentPrice, ma50, ma200, rsi14 as number)
      support = Math.min(...closes.slice(-20))
      resistance = Math.max(...closes.slice(-20))
    }

    // Sentiment
    const headlines = Array.isArray(newsData)
      ? newsData.slice(0, 10).map((n: any) => n.headline)
      : []

    const sentiment =
      headlines.length > 0
        ? await getNewsSentiment(symbol, headlines)
        : {
            overall: (row?.news_sentiment || 'neutral') as
              | 'positive'
              | 'neutral'
              | 'negative',
            score: row?.news_sentiment_score || 0,
            headlines: [],
          }

    // Build stock data
    const m = metrics?.metric || {}

    const stockData: StockData = {
      currentPrice: quote?.c || 0,
      change1d: quote?.dp || 0,
      pe: m['peNormalizedAnnual'] ?? m['peTTM'] ?? row?.pe ?? null,
      epsGrowth:
        m['epsGrowth3Y'] ?? m['epsGrowthTTMYoy'] ?? row?.eps_growth ?? null,
      revenueGrowth:
        m['revenueGrowth3Y'] ??
        m['revenueGrowthTTMYoy'] ??
        row?.revenue_growth ??
        null,
      profitMargin:
        m['netProfitMarginAnnual'] ?? row?.profit_margin ?? null,
      roe: m['roeTTM'] ?? row?.roe ?? null,
      debtToEquity:
        m['totalDebt/totalEquityAnnual'] ?? row?.debt_to_equity ?? null,
      dividendYield:
        m['dividendYieldIndicatedAnnual'] ?? row?.dividend_yield ?? null,
      priceToBook: m['pbAnnual'] ?? row?.price_to_book ?? null,
      rsi14,
      priceVs50MA,
      priceVs200MA,
      trend,
      support,
      resistance,
      newsSentiment: sentiment.overall,
      sentimentScore: sentiment.score,
      headlines: sentiment.headlines,
      analystConsensus:
        analystData?.consensus ?? row?.analyst_consensus ?? null,
      analystCount:
        analystData?.analystCount ?? row?.analyst_count ?? 0,
      targetMean:
        analystData?.targetMean ?? row?.price_target_mean ?? null,
      targetHigh:
        analystData?.targetHigh ?? row?.price_target_high ?? null,
      targetLow:
        analystData?.targetLow ?? row?.price_target_low ?? null,
      institutionalOwnership:
        analystData?.institutionalOwnership ??
        row?.institutional_ownership ??
        null,
      shortInterest:
        analystData?.shortInterest ?? row?.short_interest ?? null,
    }

    // Update cache
    await supabase.from('stock_analysis_cache').upsert({
      symbol: symbol.toUpperCase(),
      pe: stockData.pe,
      eps_growth: stockData.epsGrowth,
      revenue_growth: stockData.revenueGrowth,
      profit_margin: stockData.profitMargin,
      roe: stockData.roe,
      debt_to_equity: stockData.debtToEquity,
      dividend_yield: stockData.dividendYield,
      price_to_book: stockData.priceToBook,
      rsi_14: stockData.rsi14,
      price_vs_50ma: stockData.priceVs50MA,
      price_vs_200ma: stockData.priceVs200MA,
      trend: stockData.trend,
      support_level: stockData.support,
      resistance_level: stockData.resistance,
      news_sentiment: stockData.newsSentiment,
      news_sentiment_score: stockData.sentimentScore,
      recent_headlines: stockData.headlines,
      analyst_consensus: stockData.analystConsensus,
      analyst_count: stockData.analystCount,
      price_target_mean: stockData.targetMean,
      price_target_high: stockData.targetHigh,
      price_target_low: stockData.targetLow,
      institutional_ownership: stockData.institutionalOwnership,
      short_interest: stockData.shortInterest,
      cached_at: new Date().toISOString(),
      technicals_expires_at: new Date(
        Date.now() + 3600000
      ).toISOString(),
      fundamentals_expires_at: new Date(
        Date.now() + 86400000
      ).toISOString(),
      analyst_expires_at: new Date(
        Date.now() + 86400000
      ).toISOString(),
    })

    // ═══════════════════════════════════════════════════════════════
    // SCORING
    // ═══════════════════════════════════════════════════════════════

    // 1. Fundamental Score (30pts)
    let fundamentalScore = 50
    const epsG = stockData.epsGrowth || 0
    const roe = stockData.roe || 0
    const d2e = stockData.debtToEquity || 0
    const margin = stockData.profitMargin || 0

    if (epsG > 30) fundamentalScore += 20
    else if (epsG > 15) fundamentalScore += 10
    else if (epsG > 5) fundamentalScore += 5
    else if (epsG < 0) fundamentalScore -= 15

    if (roe > 25) fundamentalScore += 15
    else if (roe > 15) fundamentalScore += 8
    else if (roe < 5) fundamentalScore -= 10

    if (d2e < 0.3) fundamentalScore += 10
    else if (d2e < 1) fundamentalScore += 5
    else if (d2e > 2) fundamentalScore -= 10

    if (margin > 25) fundamentalScore += 10
    else if (margin > 10) fundamentalScore += 5
    else if (margin < 0) fundamentalScore -= 15

    fundamentalScore = Math.max(0, Math.min(100, fundamentalScore))

    // 2. Technical Score (25pts)
    let technicalScore = 50
    const rsi = stockData.rsi14 || 50
    const vs50 = stockData.priceVs50MA || 1
    const vs200 = stockData.priceVs200MA || 1

    if (rsi < 30) technicalScore += 20
    else if (rsi < 45) technicalScore += 10
    else if (rsi > 75) technicalScore -= 20
    else if (rsi > 65) technicalScore -= 10

    if (vs50 > 1.1) technicalScore += 15
    else if (vs50 > 1.02) technicalScore += 8
    else if (vs50 < 0.9) technicalScore -= 15

    if (vs200 > 1.1) technicalScore += 10
    else if (vs200 > 1) technicalScore += 5
    else if (vs200 < 0.85) technicalScore -= 15

    technicalScore = Math.max(0, Math.min(100, technicalScore))

    // 3. Sentiment Score (20pts)
    const sentimentMap = {
      positive: 80,
      neutral: 50,
      negative: 20,
    }
    const sentimentScore =
      sentimentMap[
        stockData.newsSentiment as keyof typeof sentimentMap
      ] || 50

    // 4. Analyst Score (15pts)
    const consensusMap: Record<string, number> = {
      'Strong Buy': 95,
      Buy: 75,
      Hold: 50,
      Sell: 20,
      'Strong Sell': 5,
    }
    const analystScore = stockData.analystConsensus
      ? consensusMap[stockData.analystConsensus] || 50
      : 50

    // 5. Style Fit Score (10pts)
    let styleFitScore = 50

    switch (investorStyle) {
      case 'lynch': // Growth
        if (epsG > 25) styleFitScore += 25
        if ((stockData.revenueGrowth || 0) > 20) styleFitScore += 15
        if (trend === 'strong_up') styleFitScore += 10
        if (stockData.newsSentiment === 'positive') styleFitScore += 5
        if ((stockData.pe || 0) > 60) styleFitScore -= 15
        break

      case 'buffett': // Value
        if ((stockData.pe || 999) < 15) styleFitScore += 25
        if (roe > 20) styleFitScore += 20
        if (d2e < 0.5) styleFitScore += 10
        if ((stockData.priceToBook || 999) < 3) styleFitScore += 5
        if (epsG < 0) styleFitScore -= 20
        break

      case 'livermore': // Momentum
        if (trend === 'strong_up') styleFitScore += 30
        if (rsi > 50 && rsi < 70) styleFitScore += 20
        if (vs50 > 1.05) styleFitScore += 15
        if (trend === 'down' || trend === 'strong_down') styleFitScore -= 30
        break

      case 'munger': // Dividend
        if ((stockData.dividendYield || 0) > 3) styleFitScore += 30
        if ((stockData.dividendYield || 0) > 2) styleFitScore += 15
        if (roe > 15) styleFitScore += 15
        if (d2e < 1) styleFitScore += 10
        if (!stockData.dividendYield) styleFitScore -= 25
        break

      case 'soros': // Macro
        if (stockData.newsSentiment === 'positive') styleFitScore += 20
        if ((stockData.institutionalOwnership || 0) > 0.7) styleFitScore += 15
        if (stockData.analystConsensus === 'Strong Buy') styleFitScore += 15
        break
    }

    // Risk tolerance adjustment
    if (riskTolerance === 'conservative') {
      if (d2e > 1.5) styleFitScore -= 15
      if (rsi > 65) styleFitScore -= 10
      if ((stockData.shortInterest || 0) > 0.1) styleFitScore -= 10
      if ((stockData.dividendYield || 0) > 2) styleFitScore += 10
    }
    if (riskTolerance === 'aggressive') {
      if (epsG > 30) styleFitScore += 10
      if (trend === 'strong_up') styleFitScore += 10
      if (rsi > 60 && rsi < 75) styleFitScore += 5
    }

    styleFitScore = Math.max(0, Math.min(100, styleFitScore))

    // Composite (weighted)
    const compositeScore = Math.round(
      fundamentalScore * 0.3 +
        technicalScore * 0.25 +
        sentimentScore * 0.2 +
        analystScore * 0.15 +
        styleFitScore * 0.1
    )

    const conviction: 'high' | 'medium' | 'speculative' =
      compositeScore >= 75
        ? 'high'
        : compositeScore >= 50
          ? 'medium'
          : 'speculative'

    // Entry observations (technical only, not predictive)
    const entryObservationLow = stockData.support
    const entryObservationHigh = stockData.targetMean
      ? Math.min(stockData.targetMean, stockData.resistance || Infinity)
      : stockData.resistance

    return {
      symbol: symbol.toUpperCase(),
      company: row?.company || symbol,
      sector: row?.sector || '',
      compositeScore,
      fundamentalScore,
      technicalScore,
      sentimentScore,
      analystScore,
      styleFitScore,
      conviction,
      entryObservationLow,
      entryObservationHigh,
      data: stockData,
    }
  } catch (err) {
    console.error(`Score error ${symbol}:`, err)
    return null
  }
}
