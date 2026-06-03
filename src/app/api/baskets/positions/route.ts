import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data: positions, error } = await supabase
      .from('basket_positions')
      .select('*, baskets!inner(name, emoji)')
      .eq('user_id', userId)
      .neq('status', 'sold')
      .order('created_at', { ascending: false })

    if (error) throw error

    const mapped = (positions || []).map((p: any) => ({
      ...p,
      basket_name: p.baskets?.name || 'Unknown',
      emoji: p.baskets?.emoji || '📊',
    }))

    return NextResponse.json({ positions: mapped })
  } catch (err: any) {
    console.error('Basket positions API error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
