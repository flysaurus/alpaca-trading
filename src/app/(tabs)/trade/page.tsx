'use client';

import { useDashboard } from '@/lib/dashboard-context';

export default function TradePage() {
  const { account, refreshAll } = useDashboard();
  return (
    <div className="space-y-3">
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">Trade tab — coming in Phase 4</p>
        <p className="text-xs text-[var(--text-subtle)] mt-2">
          Buying Power: ${(account?.account?.buyingPower || 0).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
