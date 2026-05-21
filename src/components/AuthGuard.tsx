'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/auth';
import { getSessionToken } from '@/lib/api-helper';

/**
 * AuthGuard — client-side auth & vault session routing.
 *
 * Layers:
 * 1. No Supabase session → /login
 * 2. On token-exempt pages (onboarding, setup, auth pages) → allow
 * 3. Protected page + no session token → /authenticate-session (enter password)
 * 4. Protected page + valid token → allow (dashboard loads)
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);

  // Pages that don't need session token
  const PUBLIC = ['/login', '/auth/callback'];
  const TOKEN_EXEMPT = [...PUBLIC, '/onboarding', '/authenticate-session', '/setup-keys'];
  
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  const isTokenExempt = TOKEN_EXEMPT.some((p) => pathname.startsWith(p));

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        console.log('[AuthGuard] session:', session ? 'found' : 'null', '| path:', pathname);

        // Layer 1: No Supabase session
        if (!session && !isPublic) {
          console.log('[AuthGuard] No session → /login');
          router.push('/login');
          return;
        }

        // Layer 2: Exempt pages — allow without token
        if (isTokenExempt) {
          console.log('[AuthGuard] Token-exempt page — allowing');
          if (!cancelled) setIsAuth(true);
          return;
        }

        // Layer 3: Protected page — require session token
        const token = getSessionToken();
        if (!token) {
          console.log('[AuthGuard] No session token → /authenticate-session');
          router.push('/authenticate-session');
          return;
        }

        console.log('[AuthGuard] Session token found — allowing');
        if (!cancelled) setIsAuth(true);
      } catch (err) {
        console.error('[AuthGuard] error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !isPublic) {
        router.push('/login');
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [router, pathname, isPublic, isTokenExempt]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-[#0f172a] light:bg-[#f1f5f9]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm dark:text-text-secondary-dark light:text-text-secondary-light">
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (!isAuth && !isPublic) {
    return null;
  }

  return <>{children}</>;
}
