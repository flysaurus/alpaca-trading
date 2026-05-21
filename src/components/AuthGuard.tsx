'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/auth';

/**
 * AuthGuard — client-side auth protection.
 *
 * Placed inside the root layout. Checks for a Supabase session on
 * mount and on every auth state change. Redirects to /login if
 * no session is present (public paths are exempted).
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);

  // Public paths that don't require authentication
  const PUBLIC_PATHS = ['/login', '/setup-keys', '/authenticate-session', '/auth/callback', '/onboarding'];
  const EXEMPT_PATHS = [...PUBLIC_PATHS, '/api', '/_next', '/favicon.ico', '/manifest'];

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isExempt = EXEMPT_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        console.log('[AuthGuard] Session:', session ? `user=${session.user.id.slice(0, 8)}...` : 'null');
        console.log('[AuthGuard] Pathname:', pathname, 'Public:', isPublic);

        if (!session && !isPublic) {
          console.log('[AuthGuard] No session — redirecting to /login');
          router.push('/login');
          return;
        }

        // Check if user has completed onboarding (keys stored)
        if (session && !isExempt) {
          const userId = session.user.id;
          try {
            const { data: hashData } = await supabase
              .rpc('vault_get_password_hash', { p_user_id: userId });

            if (!hashData) {
              console.log('[AuthGuard] No keys stored — redirecting to /onboarding');
              router.push('/onboarding');
              return;
            }
          } catch {
            // RPC failed — user might not exist in vault yet
            console.log('[AuthGuard] RPC failed — redirecting to /onboarding');
            router.push('/onboarding');
            return;
          }
        }

        setIsAuth(true);
      } catch (err) {
        console.error('[AuthGuard] Session check failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthGuard] Auth state changed:', event, session ? 'has session' : 'no session');
      if (!session && !isPublic) {
        router.push('/login');
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [router, pathname, isPublic]);

  // Show loading spinner while checking auth
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

  // Don't render children if not authenticated and not on a public page
  if (!isAuth && !isPublic) {
    return null;
  }

  return <>{children}</>;
}
