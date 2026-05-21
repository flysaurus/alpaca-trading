import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /auth/callback
 *
 * Google OAuth → exchange code → set cookies → redirect based on vault state.
 * The cookie-setting response is created first (before we know the redirect
 * target), then we return a new redirect with the correct URL but same cookies.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', requestUrl.origin));
  }

  // Buffer response for cookie accumulation
  let setCookieHeaders: string[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Buffer cookies as Set-Cookie header strings
          cookiesToSet.forEach(({ name, value, options }) => {
            let header = `${name}=${value}; Path=${options?.path || '/'}`;
            if (options?.maxAge) header += `; Max-Age=${options.maxAge}`;
            if (options?.domain) header += `; Domain=${options.domain}`;
            if (options?.sameSite) header += `; SameSite=${typeof options.sameSite === 'boolean' ? 'Lax' : options.sameSite}`;
            if (options?.secure) header += '; Secure';
            if (options?.httpOnly) header += '; HttpOnly';
            setCookieHeaders.push(header);
          });
        },
      },
    }
  );

  // Step 1: Exchange code → sets cookies on cookieResponse via setAll
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    console.error('[callback] exchangeCodeForSession failed:', error?.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message || 'Auth failed')}`, requestUrl.origin)
    );
  }

  const userId = data.session.user.id;
  const userEmail = data.session.user.email;
  console.log('[callback] Session OK for:', userEmail);

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

  // Step 3: Create redirect with correct URL, attach buffered cookies
  const finalResponse = NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
  setCookieHeaders.forEach((header) => {
    finalResponse.headers.append('set-cookie', header);
  });

  return finalResponse;
}
