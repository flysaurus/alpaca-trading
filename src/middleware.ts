import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware
 *
 * Currently PASS-THROUGH only.
 * All auth checks are handled client-side by AuthGuard.
 * This avoids SSR cookie issues on Vercel serverless.
 */

export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
