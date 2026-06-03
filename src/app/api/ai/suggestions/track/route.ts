import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id') || 'default'
    const supabase = getServerSupabase()

    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()

    // Find stale suggestions (older than 24hrs since last tracking, or never tracked)
    const { data: stale } = await supabase
      .from('ai_suggestions')
      .select('id, symbol, suggested_price, created_at')
      .eq('user_id', userId)
      .is('outcome_30d', null)
      .or(`last_tracked_at.is.null,last_tracked_at.lt.${oneDayAgo}`)
      .limit(20)

    if (!stale?.length) {
      return NextResponse.json({ updated: true, count: 0 })
    }

    // Batch fetch current prices from Finnhub
    const symbols = [...new Set(stale.map((s: any) => s.symbol))]
    symbols.push('SPY')

    const finnhubKey = process.env.FINNHUB_API_KEY
    let priceMap: Record<string, number> = {}

    if (finnhubKey) {
      const prices = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`)
            const data = await res.json()
            return { symbol: sym, price: data.c || 0 }
          } catch {
            return { symbol: sym, price: 0 }
          }
        })
      )
      priceMap = Object.fromEntries(prices.map((p) => [p.symbol, p.price]))
    }

    // Update each suggestion
    for (const suggestion of stale) {
      const currentPrice = priceMap[suggestion.symbol]
      const suggestedPrice = suggestion.suggested_price
      if (!currentPrice || !suggestedPrice) continue

      const returnPct = ((currentPrice - suggestedPrice) / suggestedPrice) * 100
      const daysSince = Math.floor(
        (Date.now() - new Date(suggestion.created_at).getTime()) / 86400000
      )
      const is30DaysOld = daysSince >= 30

      const outcome = is30DaysOld
        ? returnPct > 2
          ? 'outperformed'
          : returnPct < -2
          ? 'underperformed'
          : 'neutral'
        : null

      await supabase
        .from('ai_suggestions')
        .update({
          price_30d: is30DaysOld ? currentPrice : null,
          return_30d: is30DaysOld ? returnPct : null,
          outcome_30d: outcome,
          last_tracked_at: new Date().toISOString(),
        })
        .eq('id', suggestion.id)
    }

    return NextResponse.json({ updated: true, count: stale.length })
  } catch (err: any) {
    console.error('Suggestions track API error:', err.message)
    // Never throw — always return 200
    return NextResponse.json({ updated: true, count: 0 })
  }
}
