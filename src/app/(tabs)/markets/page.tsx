'use client';

import MarketIndicesBar from '@/components/MarketIndicesBar';

export default function MarketsPage() {
  return (
    <div className="space-y-3">
      <MarketIndicesBar />
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">Markets tab — coming in Phase 3</p>
      </div>
    </div>
  );
}
