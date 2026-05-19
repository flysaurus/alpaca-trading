import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js Edge Middleware
 *
 * Runs on every request before the route handler.
 * - Checks for a valid Supabase session via cookies.
 * - Redirects unauthenticated users to /login.
 * - Attaches user ID to request headers for downstream use.
 */

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/login',
  '/onboarding',              // First-time user onboarding
  '/setup-keys',              // One-time Alpaca key setup
  '/authenticate-session',    // Master password entry
  '/auth/callback',
  '/api',        // API routes handle their own auth
  '/_next',      // Next.js internals
  '/favicon.ico',
  '/manifest.ts',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through without auth check
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Create a server-side Supabase client using the request cookies
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
            // We need a response to set cookies, but for read-only middleware
            // we don't set cookies here. The callback route handles session setup.
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // No valid session → redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check if user has completed onboarding (keys stored in vault)
  // Skip this check on the onboarding page itself
  if (pathname !== '/onboarding') {
    const { data: hashData } = await supabase
      .rpc('vault_get_password_hash', { p_user_id: session.user.id });

    if (!hashData) {
      console.log('[middleware] No keys stored — redirecting to onboarding');
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  // Session exists → attach user ID to request headers
  const response = NextResponse.next();
  response.headers.set('x-user-id', session.user.id);
  response.headers.set('x-user-email', session.user.email || '');

  return response;
}

/**
 * Configure which paths the middleware runs on.
 * We match everything except Next.js static files and images.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
