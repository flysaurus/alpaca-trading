import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface ExecuteOrder {
  symbol: string
  qty: number
  side: string
  type: string
  time_in_force: string
  limit_price?: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-user-id') || 'default'
    const resolvedParams = await params
    const basketId = resolvedParams.id

    const body = await req.json()
    const { orders } = body as { orders: ExecuteOrder[] }

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: 'No orders provided' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const results: { symbol: string; status: string; error?: string }[] = []

    for (const order of orders) {
      try {
        const response = await fetch(
          `${process.env.ALPACA_BROKER_API_URL || 'https://paper-api.alpaca.markets'}/v2/orders`,
          {
            method: 'POST',
            headers: {
              'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
              'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              symbol: order.symbol,
              qty: String(order.qty),
              side: 'buy',
              type: order.type,
              time_in_force: order.time_in_force,
              limit_price: order.limit_price || undefined,
            }),
          }
        )

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.message || `Alpaca error ${response.status}`)
        }

        results.push({ symbol: order.symbol, status: 'filled' })

        // Update basket position status
        await supabase
          .from('basket_positions')
          .update({ status: 'ordered', ordered_at: new Date().toISOString(), ordered_qty: order.qty })
          .eq('basket_id', basketId)
          .eq('symbol', order.symbol)
          .eq('user_id', userId)
      } catch (err: any) {
        console.error(`Order error ${order.symbol}:`, err.message)
        results.push({ symbol: order.symbol, status: 'failed', error: err.message })
      }
    }

    // Move basket from draft to active after execution
    const failedAll = results.every((r) => r.status === 'failed')
    if (!failedAll) {
      await supabase
        .from('baskets')
        .update({ status: 'active' })
        .eq('id', basketId)
    }

    return NextResponse.json({ success: !failedAll, results })
  } catch (err: any) {
    console.error('Execute API error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
