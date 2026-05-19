'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/auth';

/**
 * Client-side OAuth callback page.
 * Handles both PKCE (code exchange) and implicit (hash fragment) flows.
 * Supabase's detectSessionInUrl picks up #access_token from the URL hash.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // getSession() triggers detectSessionInUrl which picks up
        // #access_token from the URL hash (implicit flow).
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[auth/callback] Session error:', sessionError.message);
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          console.log('[auth/callback] Session established, redirecting to dashboard');
          router.push('/');
        } else {
          console.error('[auth/callback] No session after callback');
          setError('Unable to establish session');
        }
      } catch (err: any) {
        console.error('[auth/callback] Unexpected error:', err);
        setError(err?.message || 'An unexpected error occurred');
      }
    };

    handleCallback();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm rounded-lg transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">Completing sign-in…</p>
      </div>
    </div>
  );
}
