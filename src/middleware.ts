import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js Edge Middleware
 *
 * Verifies authentication via getSession() — parses the JWT locally
 * from cookies. No Supabase API call needed, so it works reliably
 * in Edge runtime (no cold starts, no network issues).
 *
 * getUser() was causing the redirect loop because it makes an API
 * call that can fail on Vercel Edge.
 */

const PUBLIC_ROUTES = ['/login', '/auth/callback'];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname.startsWith(p));
}

async function getSessionFromCookies(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Attach refreshed tokens to the response
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and API routes through
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  try {
    const response = NextResponse.next();
    const session = await getSessionFromCookies(request, response);

    if (!session) {
      console.log(`[middleware] No session for ${pathname} → redirect to /login`);
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Session valid — pass through
    response.headers.set('x-user-id', session.user.id);
    return response;
  } catch (err: any) {
    console.error(`[middleware] Error checking ${pathname}:`, err.message);
    // Don't block on errors — let AuthGuard handle auth client-side
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
