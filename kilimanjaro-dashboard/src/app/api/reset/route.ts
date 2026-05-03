import { NextResponse } from 'next/server';
import { clearSupabaseData } from '@/lib/supabase';

// WARNING: This wipes all Supabase metrics + workouts.
// Use DELETE /api/reset?confirm=WIPE to actually run it.
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('confirm') !== 'WIPE') {
    return NextResponse.json(
      { error: 'Add ?confirm=WIPE to actually reset. This deletes all metrics and workouts from Supabase.' },
      { status: 400 }
    );
  }

  const ok = await clearSupabaseData();
  return NextResponse.json({
    success: ok,
    message: ok ? 'All Supabase data cleared' : 'Failed to clear data',
  });
}
