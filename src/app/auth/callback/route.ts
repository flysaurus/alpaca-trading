import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /auth/callback
 *
 * Server-side OAuth callback — REQUIRED by @supabase/ssr PKCE flow.
 * The PKCE code verifier is stored in an HTTP-only cookie that only
 * the server can read. This route:
 * 1. Reads the code verifier from the request cookies
 * 2. Exchanges the auth code for a Supabase session
 * 3. Sets the session cookies on the redirect response
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (!code) {
    console.error('[auth/callback] No code in URL');
    return NextResponse.redirect(new URL('/login?error=no_code', requestUrl.origin));
  }

  // Create the redirect response FIRST so cookies are set on it
  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  // Create server client with cookie read/write on the redirect response
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
    console.error('[auth/callback] Exchange failed:', error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
    );
  }

  console.log('[auth/callback] Session established → redirecting to', next);
  return response;
}
