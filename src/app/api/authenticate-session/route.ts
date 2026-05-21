import { NextResponse } from 'next/server';
import { verifyMasterPassword, decryptKeys } from '@/lib/supabase-vault';
import { createSession, createSessionToken } from '@/lib/session';

/**
 * POST /api/authenticate-session
 *
 * Verifies master password, decrypts Alpaca keys from Supabase Vault,
 * creates a server-side session (in-memory Map), and returns a session
 * token that the client sends in the Authorization header on subsequent
 * requests.
 *
 * Body: { userId: string, masterPassword: string }
 * Returns: { success: true, token: string }
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

    // Generate session token for the client
    const token = createSessionToken(userId);

    console.log(`[auth-session] Session created for ${userId.slice(0, 8)}..., token: ${token.slice(0, 16)}...`);

    return NextResponse.json({ success: true, token, userId });
  } catch (err: any) {
    console.error('[auth-session] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
