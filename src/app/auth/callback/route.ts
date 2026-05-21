import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /auth/callback — Google OAuth callback.
 *
 * 1. Create redirect response with temp URL
 * 2. Exchange code → cookies set on response via setAll
 * 3. Check vault → determine real redirect URL
 * 4. Override Location header with correct URL
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', requestUrl.origin));
  }

  // Create the response FIRST — cookies accumulate on it during code exchange.
  // We use /login as a temp Location; we'll override it after vault check.
  const response = NextResponse.redirect(new URL('/login', requestUrl.origin));

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

  // Step 1: Exchange code → cookies set on response
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    console.error('[callback] exchangeCodeForSession failed:', error?.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message || 'Auth failed')}`, requestUrl.origin)
    );
  }

  const userId = data.session.user.id;
  console.log('[callback] Session OK for:', data.session.user.email);

  // Step 2: Check vault for stored Alpaca keys
  let redirectTo = '/onboarding';
  try {
    const { data: hashData } = await supabase
      .rpc('vault_get_password_hash', { p_user_id: userId });
    if (hashData) {
      redirectTo = '/authenticate-session';
    }
  } catch (e) {
    console.log('[callback] Vault check (new user):', e);
  }

  console.log('[callback] →', redirectTo);

  // Step 3: Override the redirect Location to the correct target
  // The cookies are already on the response from exchangeCodeForSession
  response.headers.set('Location', new URL(redirectTo, requestUrl.origin).toString());

  return response;
}
