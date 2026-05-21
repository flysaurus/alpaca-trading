import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyMasterPassword, decryptKeys } from '@/lib/supabase-vault';
import { createSession, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/session';

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

    const timestamp = Date.now();

    console.log(`[auth-session] Session created for user ${userId.slice(0, 8)}...`);

    // Build response with both cookies
    const response = NextResponse.json({
      success: true,
      diagnostics: {
        cookie_name: COOKIE_NAME,
        cookie_user_id: userId.slice(0, 8) + '...',
        timestamp,
        cookies_set: ['alpaca_session_id', 'alpaca_debug'],
      },
    });

    // Set the REAL session cookie (httpOnly, secure)
    response.cookies.set(COOKIE_NAME, userId, COOKIE_OPTIONS);

    // Set a DEBUG cookie (readable by JS) to verify cookie mechanism works
    response.cookies.set('alpaca_debug', `set_at_${timestamp}`, {
      httpOnly: false,  // readable by JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,  // 10 minutes
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
