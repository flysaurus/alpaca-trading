import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface SellOrder {
  symbol: string
  qty: number
  side: 'sell'
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { orders, basketId } = body as { orders: SellOrder[]; basketId?: string }

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: 'No orders provided' }, { status: 400 })
    }

    const results: { symbol: string; status: string; error?: string }[] = []
    const supabase = getServerSupabase()

    for (const order of orders) {
      try {
        // Place market sell via Alpaca
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
              side: 'sell',
              type: 'market',
              time_in_force: 'day',
            }),
          }
        )

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.message || `Alpaca error ${response.status}`)
        }

        results.push({ symbol: order.symbol, status: 'filled' })

        // Update basket position if part of a basket
        if (basketId) {
          await supabase
            .from('basket_positions')
            .update({ status: 'sold', sold_at: new Date().toISOString() })
            .eq('basket_id', basketId)
            .eq('symbol', order.symbol)
            .eq('user_id', userId)

          // Check if all positions in basket are sold
          const { data: remaining } = await supabase
            .from('basket_positions')
            .select('id')
            .eq('basket_id', basketId)
            .eq('user_id', userId)
            .neq('status', 'sold')

          if (!remaining || remaining.length === 0) {
            await supabase
              .from('baskets')
              .update({ status: 'archived', archived_at: new Date().toISOString() })
              .eq('id', basketId)
          }
        }
      } catch (err: any) {
        console.error(`Sell error ${order.symbol}:`, err.message)
        results.push({ symbol: order.symbol, status: 'failed', error: err.message })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    console.error('Sell API error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
