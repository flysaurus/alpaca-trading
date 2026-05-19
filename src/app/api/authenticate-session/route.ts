import { NextResponse } from 'next/server';
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
export async function POST(request: Request) {
  try {
    const { userId, masterPassword } = await request.json();

    if (!userId || !masterPassword) {
      return NextResponse.json(
        { error: 'Missing credentials' },
        { status: 400 }
      );
    }

    // Verify master password against stored bcrypt hash
    const valid = await verifyMasterPassword(userId, masterPassword);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Decrypt keys from Supabase Vault
    const keys = await decryptKeys(userId);
    if (!keys) {
      return NextResponse.json(
        { error: 'Keys not found' },
        { status: 404 }
      );
    }

    // Create server-side session (24h) — stores keys in memory Map
    await createSession(userId, keys.apiKey, keys.secretKey);

    // Clear keys from local variables (they're now in the session Map only)
    keys.apiKey = '';
    keys.secretKey = '';

    console.log(`[auth-session] Session created for user ${userId.slice(0, 8)}...`);

    const response = NextResponse.json({ success: true });

    // Explicitly set the session cookie on the response
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
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
