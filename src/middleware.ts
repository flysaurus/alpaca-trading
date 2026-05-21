import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js Edge Middleware
 *
 * Server-side auth check on every non-public request.
 * - Creates a Supabase client with proper cookie handling
 * - Verifies the user session using getUser() (validates JWT)
 * - Redirects unauthenticated users to /login
 * - API routes and public paths are exempt
 * - Onboarding redirect is handled client-side by AuthGuard
 */

const PUBLIC_PATHS = [
  '/login',
  '/onboarding',
  '/setup-keys',
  '/authenticate-session',
  '/auth/callback',
  '/api',
  '/_next',
  '/favicon.ico',
  '/manifest.ts',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths and API routes pass through without auth check
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Build Supabase client that reads from request cookies
  // and writes refreshed tokens to the response
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

  try {
    // getUser() validates the JWT from cookies (no extra API call needed
    // unless the token is expired, in which case it refreshes via setAll)
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.log(`[middleware] No valid user for ${pathname}: ${error?.message || 'no user'}`);
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Attach user to headers for downstream use
    response.headers.set('x-user-id', user.id);
    response.headers.set('x-user-email', user.email || '');

    return response;
  } catch (err: any) {
    console.error(`[middleware] Error on ${pathname}:`, err.message);
    // Don't block the user on transient errors — let AuthGuard handle it client-side
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
