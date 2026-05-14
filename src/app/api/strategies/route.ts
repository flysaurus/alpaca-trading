import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user_id query param' },
        { status: 400 }
      );
    }

    const { data, error } = await getClient()
      .from('strategies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API /strategies] GET error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategies: data || [] });
  } catch (err: any) {
    console.error('[API /strategies] GET unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, type, name, params, is_active } = body;

    if (!user_id || !type || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, type, name' },
        { status: 400 }
      );
    }

    // Ensure user exists (same pattern as supabase.ts)
    const { error: insertErr } = await getClient()
      .from('users')
      .insert({ id: user_id })
      .select()
      .single();
    if (insertErr && !insertErr.message.includes('duplicate')) {
      console.warn('ensureUser insert error:', insertErr.message);
    }

    const { data, error } = await getClient()
      .from('strategies')
      .insert({
        user_id,
        type,
        name,
        params: params || {},
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[API /strategies] Supabase insert error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to save strategy' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, strategy: data });
  } catch (err: any) {
    console.error('[API /strategies] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
