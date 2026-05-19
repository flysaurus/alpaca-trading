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
    // Encode error and redirect to login
    const errorUrl = new URL('/login', requestUrl.origin);
    errorUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(errorUrl);
  }

  console.log('[auth/callback] Session established, redirecting to', next);
  return response;
}
