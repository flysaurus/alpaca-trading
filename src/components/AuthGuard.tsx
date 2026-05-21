'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/auth';

/**
 * AuthGuard — client-side auth protection with comprehensive logging.
 */

const PUBLIC_PATHS = ['/login', '/setup-keys', '/authenticate-session', '/auth/callback', '/onboarding'];
const EXEMPT_PATHS = [...PUBLIC_PATHS, '/api', '/_next', '/favicon.ico', '/manifest'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);
  const [debug, setDebug] = useState<string[]>([]);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isExempt = EXEMPT_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    const logs: string[] = [];

    const checkAuth = async () => {
      try {
        // Log document cookies (before auth check)
        const cookieStr = typeof document !== 'undefined' ? document.cookie : 'SSR';
        const supabaseCookies = cookieStr !== 'SSR'
          ? cookieStr.split('; ').filter(c => c.startsWith('sb-'))
          : [];
        logs.push(`📦 Cookies on page: ${cookieStr === 'SSR' ? 'SSR' : supabaseCookies.length + ' supabase cookies'}`);
        supabaseCookies.forEach(c => logs.push(`  🍪 ${c.substring(0, 80)}`));

        // Check session
        logs.push('🔍 Calling supabase.auth.getSession()...');
        const start = Date.now();
        const { data: { session }, error } = await supabase.auth.getSession();
        const elapsed = Date.now() - start;

        if (error) {
          logs.push(`❌ getSession error (${elapsed}ms): ${error.message}`);
        } else if (session) {
          logs.push(`✅ Session found (${elapsed}ms): user=${session.user.id.slice(0, 8)}..., expires=${new Date(session.expires_at! * 1000).toISOString()}`);
        } else {
          logs.push(`⚠️ No session (${elapsed}ms) — getSession returned null`);
        }

        logs.push(`📍 Pathname: ${pathname}, isPublic: ${isPublic}`);

        if (!session && !isPublic) {
          logs.push('🚫 No session + not public → NOT redirecting (debug mode)');
          setDebug(logs);
          setIsLoading(false);
          return;
        }

        if (session && !isExempt) {
          logs.push('🔑 Checking vault for stored keys...');
          try {
            const { data: hashData, error: rpcError } = await supabase
              .rpc('vault_get_password_hash', { p_user_id: session.user.id });

            if (rpcError) {
              logs.push(`❌ vault RPC error: ${rpcError.message}`);
            }

            if (!hashData) {
              logs.push('📝 No keys stored (debug: would redirect to /onboarding)');
            }
            logs.push('✅ Keys found in vault');
          } catch (e: any) {
            logs.push(`❌ vault RPC threw: ${e?.message}`);
          }
        }

        logs.push('✅ Auth check passed');
        setDebug(logs);
        setIsAuth(true);
      } catch (err: any) {
        logs.push(`💥 checkAuth crashed: ${err?.message}`);
        setDebug(logs);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthGuard] onAuthStateChange:', event, session?.user?.id?.slice(0, 8));
      if (!session && !isPublic) {
        router.push('/login');
      }
    });

    return () => {
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
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-[#0f172a] light:bg-[#f1f5f9] px-4">
        <div className="max-w-md w-full">
          <p className="text-sm text-red-400 mb-4">Authentication check failed.</p>
          <pre className="text-xs text-zinc-500 whitespace-pre-wrap bg-zinc-900 p-3 rounded">
            {debug.map((line, i) => <div key={i}>{line}</div>)}
          </pre>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
