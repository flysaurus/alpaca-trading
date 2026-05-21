import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge Middleware — minimal, no Supabase api calls, no library imports.
 *
 * Just checks for the existence of the Supabase auth cookie.
 * If it exists → user signed in via Google → allow.
 * If it doesn't → redirect to /login.
 *
 * No JWT validation here — AuthGuard handles that client-side.
 * This is purely a "do you have a cookie gate."
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always-allow paths (no cookie required)
  const PUBLIC = ['/login', '/auth/callback', '/_next', '/api', '/favicon.ico'];
  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for Supabase session cookie (just existence check, no API call)
  const hasSession = request.cookies.get('sb-lhzidxwzdyxlrwkmkcdz-auth-token.0');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
