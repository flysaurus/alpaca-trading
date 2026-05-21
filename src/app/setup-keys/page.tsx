'use client';

import { useState } from 'react';
import { supabase } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api-helper';

/**
 * SetupKeysPage
 *
 * One-time setup where the user enters their Alpaca API key,
 * secret key, and creates a master password. Keys are sent to
 * the server (never stored client-side) and encrypted in Supabase Vault.
 */
export default function SetupKeysPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [masterPasswordConfirm, setMasterPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (masterPassword !== masterPasswordConfirm) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (masterPassword.length < 12) {
      setError('Master password must be at least 12 characters');
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Send to server to encrypt + store via vault
      const response = await fetchApi('/api/setup-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          apiKey,
          secretKey,
          masterPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save keys');
      }

      // Clear sensitive data from state
      setApiKey('');
      setSecretKey('');
      setMasterPassword('');
      setMasterPasswordConfirm('');

      // Redirect to session authentication
      router.push('/authenticate-session');
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
            Set Up Alpaca Keys
          </h1>
          <p className="text-xs dark:text-text-muted-dark light:text-text-muted-light">
            Your keys are encrypted before storage and never leave the server.
          </p>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">
            Alpaca API Key
          </label>
          <input
            type="password"
            placeholder="PK…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            className={inputClasses}
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">
            Alpaca Secret Key
          </label>
          <input
            type="password"
            placeholder="SK…"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            required
            className={inputClasses}
          />
        </div>

        <div className="border-t dark:border-[#334155] light:border-[#e2e8f0] pt-4">
          <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">
            Master Password
          </label>
          <input
            type="password"
            placeholder="Min 12 characters"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            required
            className={inputClasses}
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide dark:text-text-secondary-dark light:text-text-secondary-light block mb-1">
            Confirm Master Password
          </label>
          <input
            type="password"
            placeholder="Re-enter master password"
            value={masterPasswordConfirm}
            onChange={(e) => setMasterPasswordConfirm(e.target.value)}
            required
            className={inputClasses}
          />
        </div>

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
          {loading ? 'Saving…' : 'Save Keys'}
        </button>
      </form>
    </div>
  );
}
