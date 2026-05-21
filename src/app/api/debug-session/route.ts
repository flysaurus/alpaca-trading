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
    // List all cookie names (no values — just to see what's being sent)
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    results.all_cookies = allCookies.map(c => c.name);

    // Step 1: Check our session cookie
    const userId = cookieStore.get('alpaca_session_id')?.value;
    results.step1_session_cookie = userId ? `found: ${userId.slice(0, 8)}...` : 'MISSING';

    // Step 1b: Check Supabase auth cookies
    const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'));
    results.supabase_auth_cookies = supabaseCookies.length > 0 
      ? `${supabaseCookies.length} cookies found: ${supabaseCookies.map(c => c.name).join(', ')}`
      : 'NONE — not logged into Supabase';

    if (!userId) {
      results.status = 'no_cookie';
      return NextResponse.json(results);
    }

    // Step 2: Check env
    results.step2_env = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasVaultKey: !!process.env.VAULT_ENCRYPTION_KEY,
      vaultKeyLen: process.env.VAULT_ENCRYPTION_KEY?.length || 0,
    };

    // Step 3: Try decrypt
    try {
      const keys = await decryptKeys(userId);
      results.step3_decrypt = keys
        ? `OK: apiKey ${keys.apiKey.slice(0, 4)}...`
        : 'NULL';
      results.status = keys ? 'ok' : 'no_keys';
    } catch (err: any) {
      results.step3_decrypt = `ERROR: ${err.message}`;
      results.status = 'decrypt_error';
    }
  } catch (err: any) {
    results.fatal = err.message;
    results.status = 'fatal';
  }

  return NextResponse.json(results);
}
