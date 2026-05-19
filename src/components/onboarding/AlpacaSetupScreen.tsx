'use client';

import { useState, FormEvent } from 'react';

interface Props {
  onSubmit: (apiKey: string, secretKey: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export default function AlpacaSetupScreen({ onSubmit, loading, error }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(apiKey, secretKey);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Connect Alpaca Account
        </h2>
        <p className="text-gray-400 text-sm">
          Your API keys are encrypted and never stored in plaintext
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pk_..."
            required
            className="w-full px-4 py-3 bg-[#1e293b] border border-[#334155] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Find at app.alpaca.markets → Settings → API Keys
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            Secret Key
          </label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="••••••••••••••••"
            required
            className="w-full px-4 py-3 bg-[#1e293b] border border-[#334155] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-semibold transition"
      >
        {loading ? 'Validating...' : 'Next'}
      </button>
    </form>
  );
}
