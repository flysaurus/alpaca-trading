import { NextResponse } from 'next/server';
import { decryptKeys } from '@/lib/supabase-vault';
import { requireSession, parseSessionToken } from '@/lib/session';
import { createAlpacaClient } from '@/lib/alpaca';
import { headers } from 'next/headers';

/**
 * GET /api/diagnostics
 *
 * Traces the full data pipeline and reports exactly where it breaks.
 */
export async function GET() {
  const results: Record<string, any> = {};

  // 1. Check Authorization header
  try {
    const h = await headers();
    const authHeader = h.get('authorization');
    results.authorization_header = authHeader ? `${authHeader.substring(0, 30)}...` : 'MISSING';
  } catch (e: any) {
    results.authorization_header = `ERROR: ${e.message}`;
  }

  // 2. Parse session token
  try {
    const h = await headers();
    const authHeader = h.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const parsed = parseSessionToken(token);
      results.token_parsed = parsed ? {
        userId: parsed.userId.slice(0, 8) + '...',
        expiresAt: new Date(parsed.expiresAt).toISOString(),
        valid: parsed.expiresAt > Date.now(),
      } : 'INVALID';
    } else {
      results.token_parsed = 'no Bearer token';
    }
  } catch (e: any) {
    results.token_parsed = `ERROR: ${e.message}`;
  }

  // 3. requireSession
  try {
    const keys = await requireSession();
    results.require_session = keys ? {
      apiKey: keys.apiKey ? `${keys.apiKey.substring(0, 6)}...` : 'EMPTY',
      secretKey: keys.secretKey ? `${keys.secretKey.substring(0, 6)}...` : 'EMPTY',
    } : 'NULL (no session)';
  } catch (e: any) {
    results.require_session = `ERROR: ${e.message}`;
  }

  // 4. Direct vault decrypt
  try {
    const h = await headers();
    const authHeader = h.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const parsed = parseSessionToken(authHeader.slice(7));
      if (parsed) {
        const vaultKeys = await decryptKeys(parsed.userId);
        results.vault_decrypt = vaultKeys ? {
          hasApiKey: !!vaultKeys.apiKey,
          hasSecretKey: !!vaultKeys.secretKey,
          apiKeyLen: vaultKeys.apiKey?.length,
        } : 'NULL (no keys in vault)';
      }
    }
  } catch (e: any) {
    results.vault_decrypt = `ERROR: ${e.message}`;
  }

  // 5. Vault password hash check (does user exist?)
  try {
    const h = await headers();
    const authHeader = h.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const parsed = parseSessionToken(authHeader.slice(7));
      if (parsed) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data, error } = await supabase
          .rpc('vault_get_password_hash', { p_user_id: parsed.userId });
        results.vault_password_hash = error
          ? `ERROR: ${error.message}`
          : data
            ? 'FOUND'
            : 'NULL (no user in vault)';

        // Also check raw table
        const { data: rawData } = await supabase
          .from('user_keys')
          .select('has_key')
          .eq('user_id', parsed.userId)
          .single();

        results.user_keys_table = rawData
          ? { has_key: rawData.has_key }
          : 'NULL (no row)';
      }
    }
  } catch (e: any) {
    results.vault_password_hash = `ERROR: ${e.message}`;
  }

  // 6. Try Alpaca API call
  try {
    const keys = await requireSession();
    if (keys) {
      const client = createAlpacaClient(keys.apiKey, keys.secretKey, true);
      const account = await client.getAccount();
      results.alpaca_api = {
        status: account.status,
        cash: account.cash,
        portfolio_value: account.portfolio_value,
      };
    } else {
      results.alpaca_api = 'SKIPPED (no session keys)';
    }
  } catch (e: any) {
    results.alpaca_api = `ERROR: ${e.message}`;
  }

  // 7. Environment check
  results.env = {
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    has_supabase_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    has_vault_key: !!process.env.VAULT_ENCRYPTION_KEY,
    has_alpaca_key: !!process.env.ALPACA_API_KEY,
    has_alpaca_secret: !!process.env.ALPACA_SECRET_KEY,
    trading_mode: process.env.TRADING_MODE || 'paper',
    node_env: process.env.NODE_ENV,
  };

  return NextResponse.json(results);
}
