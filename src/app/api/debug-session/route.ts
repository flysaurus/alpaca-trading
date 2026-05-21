import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptKeys } from '@/lib/supabase-vault';

/**
 * GET /api/debug-session
 * Diagnostic endpoint to trace session recovery chain.
 */
export async function GET() {
  const results: Record<string, any> = {};

  try {
    // Step 1: Check cookie
    const cookieStore = await cookies();
    const userId = cookieStore.get('alpaca_session_id')?.value;
    results.step1_cookie = userId ? `found: ${userId.slice(0, 8)}...` : 'MISSING';

    if (!userId) {
      results.status = 'no_cookie';
      return NextResponse.json(results);
    }

    // Step 2: Try decrypt from vault
    try {
      results.step2_env = {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasVaultKey: !!process.env.VAULT_ENCRYPTION_KEY,
        vaultKeyLen: process.env.VAULT_ENCRYPTION_KEY?.length || 0,
      };

      const keys = await decryptKeys(userId);
      results.step3_decrypt = keys
        ? `success: apiKey=${keys.apiKey.slice(0, 4)}... secretKey=${keys.secretKey.slice(0, 4)}...`
        : 'NULL — no keys returned';
      results.status = keys ? 'ok' : 'no_keys';
    } catch (err: any) {
      results.step3_decrypt = `ERROR: ${err.message}`;
      results.step3_stack = err.stack?.slice(0, 500);
      results.status = 'decrypt_error';
    }
  } catch (err: any) {
    results.fatal = err.message;
    results.status = 'fatal';
  }

  return NextResponse.json(results);
}
