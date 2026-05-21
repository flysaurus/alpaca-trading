'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/auth';

/**
 * Client-side OAuth callback page.
 *
 * After Google redirects back with ?code=xxx, this page:
 * 1. Exchanges the code for a Supabase session
 * 2. Waits for cookies to be stored
 * 3. Redirects to the main app
 *
 * Uses window.location.href (not router.push) to ensure
 * a full page load — this guarantees cookies are properly
 * sent on the next request.
 */
export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const processed = useRef(false);
  const [status, setStatus] = useState('Signing you in…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/';

    if (!code) {
      setError('No authentication code received. Please try signing in again.');
      return;
    }

    setStatus('Exchanging code for session…');

    supabase.auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          console.error('[callback] Exchange failed:', exchangeError);
          setError(`Authentication failed: ${exchangeError.message}`);
          return;
        }

        setStatus('Session established! Redirecting…');

        // Use a short delay + window.location for a full navigation.
        // This ensures cookies are flushed before the next request.
        setTimeout(() => {
          window.location.href = next;
        }, 500);
      })
      .catch((err: any) => {
        console.error('[callback] Unexpected error:', err);
        setError(err?.message || 'An unexpected error occurred');
      });
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <a
            href="/login"
            className="inline-block px-6 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-500 transition"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">{status}</p>
      </div>
    </div>
  );
}
