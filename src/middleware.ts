import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge Middleware — AUTH DISABLED for direct access.
 *
 * To re-enable auth later: revert git diff or uncomment the session check.
 * Currently lets everything through.
 */
export function middleware(request: NextRequest) {
  // AUTH DISABLED — direct access, no session check
  return NextResponse.next();

  /* === AUTH ENABLED (commented out) ===
  const { pathname } = request.nextUrl;

  const PUBLIC = ['/login', '/auth/callback', '/_next', '/api', '/favicon.ico'];
  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const supabaseRef = 'ixjnuoslbzytubpplkot';
  const hasSession = request.cookies.get(`sb-${supabaseRef}-auth-token.0`);

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
  === */
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
