import { NextResponse } from 'next/server';
import { checkSupabaseHealth } from '@/lib/supabase';

export async function GET() {
  const supabaseCheck = await checkSupabaseHealth();
  return NextResponse.json({
    server: new Date().toISOString(),
    supabase: supabaseCheck,
  });
}
