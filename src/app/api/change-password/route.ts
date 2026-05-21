import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { verifyMasterPassword } from '@/lib/supabase-vault';
import { hashPassword } from '@/lib/password-hash';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * POST /api/change-password
 *
 * Change the master password. Verifies current password,
 * then updates the stored bcrypt hash.
 *
 * Body: { currentPassword: string, newPassword: string }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('alpaca_session_id')?.value;

    if (!userId) {
      return NextResponse.json(
        { error: 'Session required. Please log in again.' },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 12) {
      return NextResponse.json(
        { error: 'New password must be at least 12 characters' },
        { status: 400 }
      );
    }

    // Verify current password
    const valid = await verifyMasterPassword(userId, currentPassword);
    if (!valid) {
      return NextResponse.json(
        { error: 'Incorrect current password' },
        { status: 401 }
      );
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update stored hash
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('vault_update_password', {
      p_user_id: userId,
      p_master_hash: newHash,
    });

    if (error) {
      console.error('[change-password] RPC error:', error.message);

      // If vault_update_password doesn't exist yet, fall back to vault_store_keys
      if (error.message.includes('function') || error.message.includes('not exist')) {
        return NextResponse.json(
          { error: 'Database function not available. Run supabase/migrations/002_update_password.sql in SQL Editor first.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    console.log(`[change-password] Password updated for user ${userId.slice(0, 8)}...`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[change-password] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
