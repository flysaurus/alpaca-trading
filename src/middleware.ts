import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js Edge Middleware
 *
 * Lightweight auth check on every request.
 * - /api routes handle their own auth (token-based)
 * - Public paths are passed through
 * - All other routes require a valid Supabase session
 * - Onboarding redirect is handled by the route pages themselves
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

  // Allow public paths through without any check
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For all other paths: verify Supabase auth session
  let session = null;

  try {
    const response = NextResponse.next();

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

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.log(`[middleware] No valid session for ${pathname}: ${error?.message || 'no user'}`);
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Attach user info to headers for downstream use
    response.headers.set('x-user-id', user.id);
    response.headers.set('x-user-email', user.email || '');

    return response;
  } catch (err: any) {
    console.error(`[middleware] Error on ${pathname}:`, err.message);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
