'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/auth';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Processing sign-in…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Log everything for debugging
        console.log('[callback] Full URL:', window.location.href);
        console.log('[callback] Hash:', window.location.hash || '(empty)');
        console.log('[callback] Search:', window.location.search || '(empty)');

        // 1. Try PKCE code exchange
        const code = searchParams.get('code');
        if (code) {
          setStatus('Exchanging auth code…');
          console.log('[callback] Attempting PKCE exchange with code:', code.substring(0, 10) + '...');
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('[callback] exchangeCodeForSession failed:', exchangeError);
            setError(exchangeError.message);
            return;
          }
          console.log('[callback] PKCE exchange succeeded!');
          router.replace('/');
          return;
        }

        // 2. Try implicit flow — extract tokens from URL hash
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
          setStatus('Setting up session from token…');
          
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          console.log('[callback] Hash access_token present:', !!accessToken);
          console.log('[callback] Hash refresh_token present:', !!refreshToken);

          if (accessToken && refreshToken) {
            const { data, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (setSessionError) {
              console.error('[callback] setSession failed:', setSessionError);
              setError(setSessionError.message);
              return;
            }

            console.log('[callback] Session set via hash — user:', data.user?.email);
            router.replace('/');
            return;
          }
        }

        // 3. Last resort: detectSessionInUrl
        setStatus('Checking for existing session…');
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[callback] getSession error:', sessionError);
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          console.log('[callback] Existing session found — user:', data.session.user.email);
          router.replace('/');
          return;
        }

        console.error('[callback] FAILED: no code, no hash tokens, no session');
        setError('Authentication failed. No session data received.');
      } catch (err: any) {
        console.error('[callback] Unexpected error:', err);
        setError(err?.message || 'Unexpected error');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center max-w-sm px-4">
          <p className="text-red-400 mb-2 text-sm">{error}</p>
          <p className="text-zinc-600 text-xs mb-4">Check browser console (F12) for details</p>
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
        <p className="text-sm text-zinc-500">{status}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
