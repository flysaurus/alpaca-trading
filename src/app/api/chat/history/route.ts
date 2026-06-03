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

    const { data: messages, error } = await supabase
      .from('chat_history')
      .select('id, role, content, mode, model, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ messages: messages || [] })
  } catch (err: any) {
    console.error('Chat history load error:', err.message)
    return NextResponse.json({ messages: [] })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id') || 'default'
    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('user_id', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Chat history delete error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
