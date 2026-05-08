'use client';

import { useDashboard } from '@/lib/dashboard-context';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Wallet, ArrowRight, ShoppingCart, Brain, Zap } from 'lucide-react';
import MarketIndicesBar from '@/components/MarketIndicesBar';

function fmt$(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

export default function HomePage() {
  const { account, orders, refreshAll } = useDashboard();
  const router = useRouter();

  const portfolioValue = account?.account?.portfolioValue || 0;
  const cash = account?.account?.cash || 0;
  const buyingPower = account?.account?.buyingPower || 0;
  const positions = account?.positions || [];

  const totalPL = positions.reduce((s, p) => s + (p.unrealizedPL || 0), 0);
  const totalCost = positions.reduce((s, p) => s + (p.avgEntryPrice * p.qty), 0);
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const isProfitable = totalPL >= 0;

  const dayPL = positions.reduce((s, p) => s + (p.changeToday || 0) * p.qty, 0);
  const isDayProfitable = dayPL >= 0;

  const topPositions = [...positions]
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 5);

  const recentOrders = orders.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Hero Card */}
      <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Total Portfolio Value</span>
          <div className={`flex items-center gap-1 text-xs font-bold ${isProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {isProfitable ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {fmtPct(totalPLPct)}
          </div>
        </div>
        <p className="text-3xl font-bold text-[var(--text-primary)] font-mono tracking-tight">{fmt$(portfolioValue)}</p>
        <p className={`text-xs font-medium mt-1 ${isProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {isProfitable ? '+' : ''}{fmt$(totalPL)} today
        </p>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-[var(--border)]">
          <div>
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Day P&L</p>
            <p className={`text-sm font-bold font-mono ${isDayProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {isDayProfitable ? '+' : ''}{fmt$(dayPL)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Buying Power</p>
            <p className="text-sm font-bold font-mono text-[var(--text-primary)]">{fmt$(buyingPower)}</p>
          </div>
          <div>
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Cash</p>
            <p className="text-sm font-bold font-mono text-[var(--text-primary)]">{fmt$(cash)}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => router.push('/trade')}
          className="flex flex-col items-center gap-1.5 py-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition"
        >
          <ShoppingCart className="w-5 h-5 text-[var(--accent)]" />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Trade</span>
        </button>
        <button
          onClick={() => router.push('/ai')}
          className="flex flex-col items-center gap-1.5 py-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition"
        >
          <Brain className="w-5 h-5 text-[var(--accent)]" />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)]">AI Scan</span>
        </button>
        <button
          onClick={refreshAll}
          className="flex flex-col items-center gap-1.5 py-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition"
        >
          <Zap className="w-5 h-5 text-[var(--accent)]" />
          <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Refresh</span>
        </button>
      </div>

      {/* Market Indices */}
      <MarketIndicesBar />

      {/* Top Holdings */}
      {topPositions.length > 0 && (
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Top Holdings</h3>
            <button onClick={() => router.push('/account')} className="text-[10px] text-[var(--accent)] font-semibold flex items-center gap-0.5">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {topPositions.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[var(--app-bg)] flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[var(--text-primary)]">{p.symbol.slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">{p.symbol}</p>
                    <p className="text-[9px] text-[var(--text-muted)]">{p.qty} shares</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold font-mono text-[var(--text-primary)]">{fmt$(p.marketValue)}</p>
                  <p className={`text-[9px] font-mono ${p.unrealizedPL >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {fmtPct(p.unrealizedPLPercent)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentOrders.length > 0 && (
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-[var(--border)]/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${o.side === 'buy' ? 'bg-[var(--green-soft)]/20' : 'bg-[var(--red-soft)]/20'}`}>
                    <span className={`text-[8px] font-bold ${o.side === 'buy' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {o.side === 'buy' ? 'B' : 'S'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">{o.symbol}</p>
                    <p className="text-[9px] text-[var(--text-muted)]">{o.qty} @ {o.type.toUpperCase()}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  o.status === 'filled' ? 'bg-[var(--green-soft)]/20 text-[var(--green)]' :
                  o.status === 'canceled' ? 'bg-[var(--red-soft)]/20 text-[var(--red)]' :
                  'bg-[var(--app-bg)] text-[var(--text-muted)]'
                }`}>
                  {o.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
