import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_INVESTOR_STYLES = ['lynch', 'buffett', 'livermore', 'munger', 'soros']
const VALID_RISK_TOLERANCES = ['conservative', 'moderate', 'aggressive']

export async function PATCH(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id') || 'default'
    const body = await req.json()

    const updates: Record<string, any> = {}

    if (body.investor_style !== undefined) {
      if (!VALID_INVESTOR_STYLES.includes(body.investor_style)) {
        return NextResponse.json(
          { error: `Invalid investor style. Must be one of: ${VALID_INVESTOR_STYLES.join(', ')}` },
          { status: 400 }
        )
      }
      updates.investor_style = body.investor_style
    }

    if (body.risk_tolerance !== undefined) {
      if (!VALID_RISK_TOLERANCES.includes(body.risk_tolerance)) {
        return NextResponse.json(
          { error: `Invalid risk tolerance. Must be one of: ${VALID_RISK_TOLERANCES.join(', ')}` },
          { status: 400 }
        )
      }
      updates.risk_tolerance = body.risk_tolerance
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)

    if (error) throw error

    return NextResponse.json({ success: true, updates })
  } catch (err: any) {
    console.error('Preferences API error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
