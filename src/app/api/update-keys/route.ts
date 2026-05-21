import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAlpacaClient } from '@/lib/alpaca';
import { encryptAndStoreKeys } from '@/lib/supabase-vault';
import { verifyMasterPassword, decryptKeys } from '@/lib/supabase-vault';
import { clearKeys } from '@/lib/supabase-vault';
import { createSession } from '@/lib/session';

/**
 * POST /api/update-keys
 *
 * Update Alpaca API keys. Validates new keys, verifies current
 * master password, then rotates keys in the vault.
 *
 * Body: { apiKey: string, secretKey: string, masterPassword: string }
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

    let { apiKey, secretKey, masterPassword } = await request.json();

    // Strip whitespace
    apiKey = (apiKey || '').replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
    secretKey = (secretKey || '').replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

    if (!apiKey || !secretKey || !masterPassword) {
      return NextResponse.json(
        { error: 'API key, secret key, and master password are required' },
        { status: 400 }
      );
    }

    // Verify master password
    const valid = await verifyMasterPassword(userId, masterPassword);
    if (!valid) {
      return NextResponse.json(
        { error: 'Incorrect master password' },
        { status: 401 }
      );
    }

    // Validate new keys with Alpaca (defaults to paper)
    try {
      const alpaca = createAlpacaClient(apiKey, secretKey, true);
      await alpaca.getAccount();
    } catch {
      return NextResponse.json(
        { error: 'Invalid Alpaca credentials. Check your API key and secret.' },
        { status: 400 }
      );
    }

    // Clear old keys first
    await clearKeys(userId);

    // Store new encrypted keys
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

    // Update the session with new keys
    await createSession(userId, apiKey, secretKey);

    console.log(`[update-keys] Keys rotated for user ${userId.slice(0, 8)}...`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[update-keys] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
