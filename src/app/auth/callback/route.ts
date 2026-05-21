import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /auth/callback
 * Server-side OAuth callback. Handles PKCE code exchange.
 * The code verifier cookie (set by createBrowserClient) is HTTP-only,
 * so the exchange MUST happen server-side.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (!code) {
    console.error('[auth/callback] No code param in callback URL');
    // Redirect to login — the browser client will try detectSessionInUrl
    return NextResponse.redirect(new URL('/login', requestUrl.origin));
  }

  console.log('[auth/callback] Exchanging code for session...');

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] Code exchange failed:', error.message);
    const errorUrl = new URL('/login', requestUrl.origin);
    errorUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(errorUrl);
  }

  // Check if user has completed onboarding (keys stored in vault)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const userId = user.id;
    console.log(`[auth/callback] Checking onboarding for user ${userId.slice(0, 8)}...`);

    const { data: hashData, error: rpcError } = await supabase
      .rpc('vault_get_password_hash', { p_user_id: userId });

    if (rpcError) {
      console.error('[auth/callback] RPC error:', rpcError.message);
    }

    if (!hashData || rpcError) {
      // Fallback: direct table query
      const { data: userRow } = await supabase
        .from('users')
        .select('master_password_hash')
        .eq('id', userId)
        .maybeSingle();

      if (!userRow?.master_password_hash) {
        console.log('[auth/callback] New user — redirecting to onboarding');
        return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
      }
      console.log('[auth/callback] Keys found via direct query');
    } else {
      console.log('[auth/callback] Keys found via RPC');
    }
  }

  console.log('[auth/callback] Session established, redirecting to', next);
  return response;
}
