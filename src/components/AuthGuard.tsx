'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/auth';

/**
 * AuthGuard — client-side auth state & onboarding routing.
 *
 * Runs AFTER middleware (which just checks cookie existence).
 * Here we actually validate the session and handle routing:
 * - No session → /login
 * - Session but no vault keys → /onboarding
 * - Session + keys → allow access
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);

  const PUBLIC = ['/login', '/auth/callback'];
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        console.log('[AuthGuard] session:', session ? 'found' : 'null', 'path:', pathname);

        if (!session && !isPublic) {
          console.log('[AuthGuard] → /login');
          router.push('/login');
          return;
        }

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
  }, [router, pathname, isPublic]);

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
