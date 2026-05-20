import { NextResponse } from 'next/server';
import { createAlpacaClient } from '@/lib/alpaca';
import { encryptAndStoreKeys } from '@/lib/supabase-vault';

/**
 * POST /api/setup-keys
 *
 * Receives Alpaca API key, secret key, and master password from the client.
 * Validates credentials with Alpaca before encrypting and storing them.
 * Keys are encrypted server-side — never stored in plaintext.
 *
 * Body: { userId: string, apiKey: string, secretKey: string, masterPassword: string }
 */
export async function POST(request: Request) {
  try {
    const { userId, apiKey, secretKey, masterPassword } = await request.json();

    if (!userId || !apiKey || !secretKey || !masterPassword) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate keys with Alpaca before storing
    // Onboarding defaults to paper trading — pass paper: true explicitly
    try {
      const alpaca = createAlpacaClient(apiKey, secretKey, true);
      await alpaca.getAccount();
    } catch {
      return NextResponse.json(
        { error: 'Invalid Alpaca credentials' },
        { status: 400 }
      );
    }

    // Store encrypted in Supabase
    const error = await encryptAndStoreKeys(
      userId,
      apiKey,
      secretKey,
      masterPassword
    );

    if (error) {
      return NextResponse.json(
        { error },
        { status: 500 }
      );
    }

    console.log(`[setup-keys] Validated & stored keys for user ${userId.slice(0, 8)}...`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[setup-keys] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
