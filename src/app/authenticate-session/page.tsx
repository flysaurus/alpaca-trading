'use client';

import { useState } from 'react';
import { supabase } from '@/lib/auth';
import { useRouter } from 'next/navigation';

/**
 * AuthenticateSessionPage
 *
 * After keys are stored, the user enters their master password
 * to decrypt the Alpaca keys server-side and create a session.
 * The session holds decrypted keys in server memory for 24 hours.
 */
export default function AuthenticateSessionPage() {
  const router = useRouter();
  const [masterPassword, setMasterPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Send password to server to verify, decrypt keys, and create session
      const response = await fetch('/api/authenticate-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          masterPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Authentication failed');
      }

      // Clear password from memory immediately
      setMasterPassword('');

      // Redirect to dashboard — session cookie is now set
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    'w-full px-4 py-2 dark:bg-[#1e293b] light:bg-[#f8fafc] border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light text-sm placeholder:text-text-muted-dark focus:outline-none focus:ring-2 dark:ring-teal-500/50 light:ring-teal-500/30 focus:border-teal-500 transition';

  return (
    <div className="min-h-screen flex items-center justify-center dark:bg-[#0f172a] light:bg-[#f1f5f9]">
      <form
        onSubmit={handleSubmit}
        className="w-96 space-y-4 p-8 rounded-2xl dark:bg-[#1e293b] light:bg-white border dark:border-[#334155] light:border-[#e2e8f0] shadow-xl"
      >
        <div>
          <h1 className="text-2xl font-bold dark:text-[#f9fafb] light:text-[#0f172a] mb-1">
            Unlock Session
          </h1>
          <p className="text-xs dark:text-text-muted-dark light:text-text-muted-light">
            Enter your master password to decrypt Alpaca keys and start a
            24-hour session.
          </p>
        </div>

        <input
          type="password"
          placeholder="Master Password"
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
          required
          autoFocus
          className={inputClasses}
        />

        {error && (
          <p className="text-xs text-red-500 dark:bg-red-500/10 light:bg-red-500/5 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Authenticating…' : 'Unlock'}
        </button>

        <p className="text-[10px] text-center dark:text-text-muted-dark light:text-text-muted-light">
          Session valid for 24 hours · Keys never leave the server
        </p>
      </form>
    </div>
  );
}
