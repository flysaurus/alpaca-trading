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
    // List all cookie names
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    results.all_cookies = allCookies.map(c => c.name);

    // Check ALL our cookies
    results.session_cookie = cookieStore.get('alpaca_session_id')?.value
      ? `found: ${cookieStore.get('alpaca_session_id')!.value.slice(0, 8)}...`
      : 'MISSING';
    results.debug_cookie = cookieStore.get('alpaca_debug')?.value
      ? `found: ${cookieStore.get('alpaca_debug')!.value}`
      : 'MISSING';

    // Check Supabase auth
    const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'));
    results.supabase_auth = supabaseCookies.length > 0
      ? `${supabaseCookies.length} cookies: ${supabaseCookies.map(c => c.name).join(', ')}`
      : 'NONE — not logged in';

    // If even the debug cookie is missing, cookies aren't being set at all
    if (!cookieStore.get('alpaca_session_id')?.value && !cookieStore.get('alpaca_debug')?.value) {
      results.status = 'no_cookies_at_all';
      results.hint = 'authenticate-session may not have been called or its cookies were dropped';
      return NextResponse.json(results);
    }

    const userId = cookieStore.get('alpaca_session_id')!.value;

    if (!userId) {
      results.status = 'no_session_cookie';
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
