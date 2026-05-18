import { NextRequest, NextResponse } from 'next/server';
import { encryptAndStoreKeys } from '@/lib/supabase-vault';

/**
 * POST /api/setup-keys
 *
 * Receives Alpaca API key, secret key, and master password from the client.
 * Encrypts and stores them in Supabase Vault via pgcrypto.
 * Keys are encrypted server-side — never stored in plaintext.
 *
 * Body: { userId: string, apiKey: string, secretKey: string, masterPassword: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, apiKey, secretKey, masterPassword } = body;

    // Validate required fields
    if (!userId || !apiKey || !secretKey || !masterPassword) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Basic API key format validation (Alpaca keys start with PK/APCA-API-KEY-ID)
    if (
      !apiKey.startsWith('PK') &&
      !apiKey.startsWith('APCA-API-KEY-ID') &&
      !apiKey.startsWith('AK')
    ) {
      return NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 400 }
      );
    }

    // Master password strength check (handled client-side too, but verify server-side)
    if (masterPassword.length < 12) {
      return NextResponse.json(
        { error: 'Master password must be at least 12 characters' },
        { status: 400 }
      );
    }

    // Encrypt and store in Supabase Vault
    const error = await encryptAndStoreKeys(
      userId,
      apiKey,
      secretKey,
      masterPassword
    );

    if (error) {
      console.error('[setup-keys] Vault storage failed:', error);
      return NextResponse.json(
        { error: 'Failed to store keys' },
        { status: 500 }
      );
    }

    console.log(`[setup-keys] Keys stored for user ${userId.slice(0, 8)}...`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[setup-keys] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
