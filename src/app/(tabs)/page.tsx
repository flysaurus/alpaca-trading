'use client';

import { useDashboard } from '@/lib/dashboard-context';
import WatchlistWidget from '@/components/WatchlistWidget';
import MarketIndicesBar from '@/components/MarketIndicesBar';
import { PerformanceCard, AllocationCard } from '@/components/PerformanceCharts';


export default function HomePage() {
  const { account, refreshAll } = useDashboard();
  const portfolioValue = account?.account?.portfolioValue || 0;
  const cash = account?.account?.cash || 0;
  const positions = account?.positions || [];

  return (
    <div className="space-y-3">
      <MarketIndicesBar />
      <WatchlistWidget />
      <PerformanceCard portfolioValue={portfolioValue} cash={cash} positions={positions} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AllocationCard portfolioValue={portfolioValue} cash={cash} positions={positions} />
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 text-center">
          <p className="text-xs text-[var(--text-muted)]">Quick Trade — coming in Phase 4</p>
        </div>
      </div>
    </div>
  );
}
