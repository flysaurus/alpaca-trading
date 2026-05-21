'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/auth';

/**
 * Client-side OAuth callback.
 *
 * Reads the auth code from the URL, exchanges it for a session
 * using the browser's Supabase client. This avoids ALL server-side
 * cookie issues on Vercel serverless — the browser handles the
 * PKCE code verifier cookie natively.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get('code');

    if (!code) {
      console.error('[callback] No code in URL');
      router.push('/login?error=no_code');
      return;
    }

    // Exchange code for session — client-side PKCE
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error('[callback] Exchange failed:', error.message);
        router.push(`/login?error=${encodeURIComponent(error.message)}`);
        return;
      }

      console.log('[callback] Session established, redirecting to /');
      router.push('/');
    }).catch((err) => {
      console.error('[callback] Unexpected error:', err);
      router.push('/login?error=unexpected');
    });
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">Signing you in…</p>
      </div>
    </div>
  );
}
