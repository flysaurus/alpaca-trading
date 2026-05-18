import { NextRequest, NextResponse } from 'next/server';
import { verifyMasterPassword, decryptKeys } from '@/lib/supabase-vault';
import { createSession } from '@/lib/session';

/**
 * POST /api/authenticate-session
 *
 * Receives master password from the client, verifies it against
 * the stored bcrypt hash, decrypts Alpaca keys from Supabase Vault,
 * and creates a server-side session holding the keys in memory.
 *
 * Body: { userId: string, masterPassword: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, masterPassword } = body;

    if (!userId || !masterPassword) {
      return NextResponse.json(
        { error: 'Missing userId or masterPassword' },
        { status: 400 }
      );
    }

    // Step 1: Verify master password against stored bcrypt hash
    const valid = await verifyMasterPassword(userId, masterPassword);

    if (!valid) {
      console.log(`[auth-session] Invalid password for user ${userId.slice(0, 8)}...`);
      return NextResponse.json(
        { error: 'Invalid master password' },
        { status: 401 }
      );
    }

    // Step 2: Decrypt Alpaca keys from Supabase Vault
    const keys = await decryptKeys(userId);

    if (!keys) {
      console.error(`[auth-session] Key decryption failed for user ${userId.slice(0, 8)}...`);
      return NextResponse.json(
        { error: 'Failed to decrypt keys. Try re-entering your Alpaca keys.' },
        { status: 500 }
      );
    }

    // Step 3: Create server-side session (in-memory key cache + HTTP-only cookie)
    await createSession(userId, keys.apiKey, keys.secretKey);

    console.log(`[auth-session] Session created for user ${userId.slice(0, 8)}...`);

    const response = NextResponse.json({ success: true });

    // createSession sets the cookie via next/headers internally —
    // but we also set it explicitly on the response object for reliability
    response.cookies.set('alpaca_session_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[auth-session] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
