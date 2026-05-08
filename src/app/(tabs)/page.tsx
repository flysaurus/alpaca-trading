'use client';

import { useDashboard } from '@/lib/dashboard-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShoppingCart,
  Brain,
  Zap,
  Wallet,
  Activity,
  Eye,
  BarChart3,
} from 'lucide-react';
import MarketIndicesBar from '@/components/MarketIndicesBar';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

function fmt$(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

// Compact portfolio sparkline
function PortfolioSparkline({ data }: { data: { date: string; value: number }[] }) {
  if (data.length === 0) return null;
  const isUp = data[data.length - 1].value >= data[0].value;

  return (
    <div className="h-16 mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? '#22d66e' : '#f87171'} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isUp ? '#22d66e' : '#f87171'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={isUp ? '#22d66e' : '#f87171'}
            strokeWidth={2}
            fill="url(#sparkGrad)"
            dot={false}
          />
          <Tooltip
            content={({ payload }) => {
              if (!payload?.length) return null;
              const v = payload[0].value as number;
              return (
                <div className="bg-[#0d1117] border border-[#1f2937] rounded px-2 py-1 text-[10px] text-[#f9fafb]">
                  {fmt$(v)}
                </div>
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function HomePage() {
  const { account, orders, refreshAll } = useDashboard();
  const router = useRouter();
  const [sparkData, setSparkData] = useState<{ date: string; value: number }[]>([]);

  const portfolioValue = account?.account?.portfolioValue || 0;
  const cash = account?.account?.cash || 0;
  const buyingPower = account?.account?.buyingPower || 0;
  const equity = account?.account?.equity || 0;
  const positions = account?.positions || [];

  const totalPL = positions.reduce((s, p) => s + (p.unrealizedPL || 0), 0);
  const totalCost = positions.reduce((s, p) => s + (p.avgEntryPrice * p.qty), 0);
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const isProfitable = totalPL >= 0;

  const dayPL = positions.reduce((s, p) => s + (p.changeToday || 0) * p.qty, 0);
  const isDayProfitable = dayPL >= 0;

  const topPositions = [...positions]
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 3);

  const recentOrders = orders.slice(0, 3);

  // Fetch 7-day portfolio history for sparkline
  useEffect(() => {
    fetch('/api/portfolio/history?period=1M&timeframe=1D')
      .then((r) => r.json())
      .then(({ history }) => {
        if (history?.timestamp) {
          const data = history.timestamp.slice(-7).map((ts: number, i: number) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            value: parseFloat(history.equity?.[history.timestamp.length - 7 + i] || 0),
          }));
          setSparkData(data);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {/* ===== HERO CARD ===== */}
      <div className="bg-gradient-to-br from-[#161920] to-[#111318] rounded-2xl border border-[#1f2937] p-5 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#f59e0b]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">Portfolio Value</span>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isProfitable ? 'bg-[#166534]/20 text-[#22d66e]' : 'bg-[#991b1b]/20 text-[#f87171]'
            }`}>
              {isProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {fmtPct(totalPLPct)}
            </div>
          </div>

          <p className="text-4xl font-bold text-[#f9fafb] font-mono tracking-tight">{fmt$(portfolioValue)}</p>

          <div className="flex items-center gap-2 mt-2">
            <span className={`text-sm font-bold ${isDayProfitable ? 'text-[#22d66e]' : 'text-[#f87171]'}`}>
              {isDayProfitable ? '+' : ''}{fmt$(dayPL)}
            </span>
            <span className="text-xs text-[#6b7280]">today</span>
          </div>

          {/* Compact sparkline */}
          <PortfolioSparkline data={sparkData} />
        </div>
      </div>

      {/* ===== BUYING POWER CARD ===== */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Buying Power</span>
          </div>
          <p className="text-xl font-bold font-mono text-[var(--text-primary)]">{fmt$(buyingPower)}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Available to trade</p>
        </div>
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Equity</span>
          </div>
          <p className="text-xl font-bold font-mono text-[var(--text-primary)]">{fmt$(equity)}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Long market value</p>
        </div>
      </div>

      {/* ===== QUICK ACTIONS ===== */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => router.push('/trade')}
          className="flex flex-col items-center gap-2 py-4 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] active:scale-95 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Trade</span>
        </button>
        <button
          onClick={() => router.push('/ai')}
          className="flex flex-col items-center gap-2 py-4 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] active:scale-95 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <span className="text-xs font-semibold text-[var(--text-secondary)]">AI Scan</span>
        </button>
        <button
          onClick={refreshAll}
          className="flex flex-col items-center gap-2 py-4 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] active:scale-95 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Refresh</span>
        </button>
      </div>

      {/* ===== MARKET INDICES ===== */}
      <MarketIndicesBar />

      {/* ===== OPEN POSITIONS ===== */}
      {topPositions.length > 0 && (
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Positions</h3>
            </div>
            <button
              onClick={() => router.push('/account')}
              className="text-[10px] text-[var(--accent)] font-semibold flex items-center gap-0.5 hover:underline"
            >
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {topPositions.map((p) => (
              <button
                key={p.symbol}
                onClick={() => router.push(`/trade?symbol=${p.symbol}`)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--app-bg)] hover:bg-[var(--hover-bg)] transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-bg)] flex items-center justify-center">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{p.symbol.slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{p.symbol}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{p.qty} shares @ {fmt$(p.avgEntryPrice)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono text-[var(--text-primary)]">{fmt$(p.marketValue)}</p>
                  <p className={`text-[10px] font-mono font-semibold ${p.unrealizedPL >= 0 ? 'text-[#22d66e]' : 'text-[#f87171]'}`}>
                    {fmtPct(p.unrealizedPLPercent)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== RECENT ACTIVITY ===== */}
      {recentOrders.length > 0 && (
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Recent Orders</h3>
          </div>
          <div className="space-y-2">
            {recentOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between py-2.5 border-b border-[var(--border)]/50 last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                    o.side === 'buy' ? 'bg-[#166534]/20' : 'bg-[#991b1b]/20'
                  }`}>
                    <span className={`text-[9px] font-bold ${o.side === 'buy' ? 'text-[#22d66e]' : 'text-[#f87171]'}`}>
                      {o.side === 'buy' ? 'B' : 'S'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">{o.symbol}</p>
                    <p className="text-[9px] text-[var(--text-muted)]">{o.qty} @ {o.type.toUpperCase()}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  o.status === 'filled' ? 'bg-[#166534]/20 text-[#22d66e]' :
                  o.status === 'canceled' ? 'bg-[#991b1b]/20 text-[#f87171]' :
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
