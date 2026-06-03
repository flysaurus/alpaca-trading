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
    const userId = req.headers.get('x-user-id') || 'default'

    const supabase = getServerSupabase()
    const { data: suggestions, error } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ suggestions: suggestions || [] })
  } catch (err: any) {
    console.error('AI suggestions API error:', err.message)
    return NextResponse.json({ suggestions: [] })
  }
}
