'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Brain,
  DollarSign,
  Layers,
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Settings,
  History,
  BarChart3,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Calendar,
} from 'lucide-react';
import SymbolSearch from '@/components/SymbolSearch';

// ── Strategy Types ───────────────────────────────────────────────
interface DCAConfig {
  symbol: string;
  amount_usd: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  start_date: string;
  end_date?: string;
  active: boolean;
}

interface AllocationItem {
  id: string;
  symbol: string;
  weight: number;
}

interface RebalanceConfig {
  target_allocations: AllocationItem[];
  threshold: number;
  mode: 'full' | 'cash-only';
  active: boolean;
}

interface MomentumConfig {
  universe: string[];
  lookback_days: number;
  top_n: number;
  bottom_n?: number;
  active: boolean;
}

interface MeanReversionConfig {
  symbol: string;
  lookback: number;
  z_score_threshold: number;
  active: boolean;
}

interface Position {
  symbol: string;
  qty: number;
  marketValue: number;
}

// ── localStorage helpers ─────────────────────────────────────────
const LS_KEYS = {
  dca: 'alpaca-strategy-dca',
  rebalance: 'alpaca-strategy-rebalance',
  momentum: 'alpaca-strategy-momentum',
  meanreversion: 'alpaca-strategy-meanreversion',
};

function loadConfig<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return fallback;
}

function saveConfig<T>(key: string, config: T) {
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch { /* ignore */ }
}

// ── Strategy Cards Component ─────────────────────────────────────
function StrategyCard({
  title,
  icon: Icon,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  icon: any;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-[var(--card-bg)] rounded-xl border ${enabled ? 'border-amber-500/30' : 'border-[var(--border)]'} p-5 transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${enabled ? 'bg-amber-500/10 text-amber-400' : 'bg-[var(--app-bg)] text-[var(--text-muted)]'}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{description}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={`p-2.5 rounded-lg transition-colors ${
            enabled
              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
              : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
          }`}
        >
          {enabled ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
      </div>

      <div className={`space-y-4 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        {children}
      </div>
    </div>
  );
}

// ── DCA helpers ──────────────────────────────────────────────────
function getNextExecutionDates(start: string, end: string | undefined, frequency: string, count: number = 5): Date[] {
  const dates: Date[] = [];
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  let current = new Date(startDate);

  while (dates.length < count) {
    if (endDate && current > endDate) break;
    if (current >= new Date()) {
      dates.push(new Date(current));
    }
    if (frequency === 'daily') {
      current.setDate(current.getDate() + 1);
    } else if (frequency === 'weekly') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }
  return dates;
}

function getExecutionsBetween(start: string, end: string | undefined, frequency: string): number {
  if (!end) return Infinity;
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  let current = new Date(s);
  while (current <= e) {
    count++;
    if (frequency === 'daily') current.setDate(current.getDate() + 1);
    else if (frequency === 'weekly') current.setDate(current.getDate() + 7);
    else current.setMonth(current.getMonth() + 1);
  }
  return count;
}

// ── DCA Strategy Component ───────────────────────────────────────
function DCAStrategy() {
  const [config, setConfig] = useState<DCAConfig>(() =>
    loadConfig<DCAConfig>(LS_KEYS.dca, {
      symbol: 'SPY',
      amount_usd: 100,
      frequency: 'weekly',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      active: false,
    })
  );

  const [enabled, setEnabled] = useState(config.active);

  useEffect(() => {
    if (enabled) {
      saveConfig(LS_KEYS.dca, { ...config, active: true });
    } else {
      saveConfig(LS_KEYS.dca, { ...config, active: false });
    }
  }, [config, enabled]);

  const upcoming = useMemo(() => {
    if (!enabled) return [];
    return getNextExecutionDates(config.start_date, config.end_date || undefined, config.frequency, 5);
  }, [enabled, config.start_date, config.end_date, config.frequency]);

  const totalExecutions = useMemo(() => {
    if (!config.end_date) return null;
    return getExecutionsBetween(config.start_date, config.end_date, config.frequency);
  }, [config.start_date, config.end_date, config.frequency]);

  const totalAmount = totalExecutions ? totalExecutions * config.amount_usd : null;

  return (
    <StrategyCard
      title="Dollar Cost Averaging"
      icon={DollarSign}
      description="Invest fixed amounts regularly to reduce timing risk"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Symbol</label>
          <SymbolSearch
            value={config.symbol}
            onChange={(s) => setConfig({ ...config, symbol: s })}
            placeholder="Search symbol..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Amount ($)</label>
            <input
              type="number"
              value={config.amount_usd}
              onChange={(e) => setConfig({ ...config, amount_usd: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Frequency</label>
            <select
              value={config.frequency}
              onChange={(e) => setConfig({ ...config, frequency: e.target.value as any })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Start Date</label>
            <input
              type="date"
              value={config.start_date}
              onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">End Date</label>
            <input
              type="date"
              value={config.end_date || ''}
              onChange={(e) => setConfig({ ...config, end_date: e.target.value || undefined })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="bg-[var(--app-bg)] rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Calendar className="w-4 h-4 text-amber-400" />
            Next Executions
          </div>
          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{d.toLocaleDateString()}</span>
                  <span className="text-[var(--text-primary)] font-medium">${config.amount_usd.toLocaleString()}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-sm font-bold">
                <span className="text-[var(--text-primary)]">Total (projected)</span>
                <span className="text-amber-400">
                  {totalAmount !== null ? `$${totalAmount.toLocaleString()}` : '∞'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No upcoming executions</p>
          )}
        </div>
      </div>
    </StrategyCard>
  );
}

// ── Rebalance Strategy Component ─────────────────────────────────
function RebalanceStrategy({ positions }: { positions: Position[] }) {
  const [config, setConfig] = useState<RebalanceConfig>(() =>
    loadConfig<RebalanceConfig>(LS_KEYS.rebalance, {
      target_allocations: [
        { id: '1', symbol: 'SPY', weight: 0.6 },
        { id: '2', symbol: 'QQQ', weight: 0.3 },
        { id: '3', symbol: 'BND', weight: 0.1 },
      ],
      threshold: 0.05,
      mode: 'full',
      active: false,
    })
  );

  const [enabled, setEnabled] = useState(config.active);

  useEffect(() => {
    if (enabled) {
      saveConfig(LS_KEYS.rebalance, { ...config, active: true });
    } else {
      saveConfig(LS_KEYS.rebalance, { ...config, active: false });
    }
  }, [config, enabled]);

  const totalTargetWeight = useMemo(() =>
    config.target_allocations.reduce((sum, a) => sum + a.weight, 0),
    [config.target_allocations]
  );

  const portfolioValue = useMemo(() =>
    positions.reduce((sum, p) => sum + p.marketValue, 0),
    [positions]
  );

  const driftData = useMemo(() => {
    return config.target_allocations.map((alloc) => {
      const pos = positions.find((p) => p.symbol === alloc.symbol);
      const actualValue = pos ? pos.marketValue : 0;
      const actualWeight = portfolioValue > 0 ? actualValue / portfolioValue : 0;
      const drift = actualWeight - alloc.weight;
      return {
        symbol: alloc.symbol,
        target: alloc.weight,
        actual: actualWeight,
        drift,
      };
    });
  }, [config.target_allocations, positions, portfolioValue]);

  const addAllocation = () => {
    setConfig({
      ...config,
      target_allocations: [
        ...config.target_allocations,
        { id: `${Date.now()}`, symbol: '', weight: 0 },
      ],
    });
  };

  const removeAllocation = (id: string) => {
    setConfig({
      ...config,
      target_allocations: config.target_allocations.filter((a) => a.id !== id),
    });
  };

  const updateAllocation = (id: string, updates: Partial<AllocationItem>) => {
    setConfig({
      ...config,
      target_allocations: config.target_allocations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    });
  };

  return (
    <StrategyCard
      title="Portfolio Rebalancing"
      icon={Layers}
      description="Maintain target allocations by buying/selling when drift exceeds threshold"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[var(--text-primary)] block mb-2">Target Allocations</label>
          <div className="space-y-2">
            {config.target_allocations.map((alloc) => (
              <div key={alloc.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <SymbolSearch
                    value={alloc.symbol}
                    onChange={(s) => updateAllocation(alloc.id, { symbol: s })}
                    placeholder="Symbol"
                  />
                </div>
                <input
                  type="number"
                  value={alloc.weight}
                  onChange={(e) => updateAllocation(alloc.id, { weight: Number(e.target.value) })}
                  className="w-20 px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
                  step="0.01"
                  min="0"
                  max="1"
                />
                <span className="text-sm text-[var(--text-muted)] w-10">{(alloc.weight * 100).toFixed(0)}%</span>
                <button
                  onClick={() => removeAllocation(alloc.id)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--red)] transition"
                  title="Remove"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addAllocation}
            className="mt-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition"
          >
            + Add Symbol
          </button>
          <div className={`mt-1 text-xs font-medium ${Math.abs(totalTargetWeight - 1) < 0.01 ? 'text-[var(--green)]' : 'text-amber-400'}`}>
            Total: {(totalTargetWeight * 100).toFixed(0)}%
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Threshold</label>
            <input
              type="number"
              value={config.threshold}
              onChange={(e) => setConfig({ ...config, threshold: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              step="0.01"
              min="0.01"
              max="0.5"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Mode</label>
            <select
              value={config.mode}
              onChange={(e) => setConfig({ ...config, mode: e.target.value as any })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
            >
              <option value="full">Full (Buy/Sell)</option>
              <option value="cash-only">Cash Only (Buy Only)</option>
            </select>
          </div>
        </div>

        <div className="bg-[var(--app-bg)] rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Current Drift
          </div>
          {driftData.length > 0 ? (
            <div className="space-y-1.5">
              {driftData.map((d) => (
                <div key={d.symbol} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)] font-medium">{d.symbol}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--text-muted)]">Target {(d.target * 100).toFixed(0)}%</span>
                    <span className="text-[var(--text-primary)]">Actual {(d.actual * 100).toFixed(1)}%</span>
                    <span className={`font-bold ${Math.abs(d.drift) > config.threshold ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>
                      {d.drift >= 0 ? '+' : ''}{(d.drift * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No allocations configured</p>
          )}
        </div>
      </div>
    </StrategyCard>
  );
}

// ── Momentum Strategy Component ───────────────────────────────────
function MomentumStrategy() {
  const [config, setConfig] = useState<MomentumConfig>(() =>
    loadConfig<MomentumConfig>(LS_KEYS.momentum, {
      universe: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'],
      lookback_days: 30,
      top_n: 5,
      bottom_n: 2,
      active: false,
    })
  );

  const [enabled, setEnabled] = useState(config.active);

  useEffect(() => {
    if (enabled) {
      saveConfig(LS_KEYS.momentum, { ...config, active: true });
    } else {
      saveConfig(LS_KEYS.momentum, { ...config, active: false });
    }
  }, [config, enabled]);

  return (
    <StrategyCard
      title="Momentum Strategy"
      icon={TrendingUp}
      description="Buy top performing stocks, sell underperformers based on price momentum"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Universe (comma-separated)</label>
          <input
            type="text"
            value={config.universe.join(', ')}
            onChange={(e) => setConfig({ ...config, universe: e.target.value.split(',').map((s) => s.trim().toUpperCase()) })}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Lookback (days)</label>
            <input
              type="number"
              value={config.lookback_days}
              onChange={(e) => setConfig({ ...config, lookback_days: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              min="10"
              max="365"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Top N</label>
            <input
              type="number"
              value={config.top_n}
              onChange={(e) => setConfig({ ...config, top_n: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              min="1"
              max="20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Bottom N</label>
            <input
              type="number"
              value={config.bottom_n || 0}
              onChange={(e) => setConfig({ ...config, bottom_n: Number(e.target.value) || undefined })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              min="0"
              max="20"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mt-3">
        <BarChart3 className="w-4 h-4" />
        <span>Top momentum: {enabled ? 'Calculating...' : 'Not active'}</span>
      </div>
    </StrategyCard>
  );
}

// ── Mean Reversion Strategy Component ──────────────────────────────
function MeanReversionStrategy() {
  const [config, setConfig] = useState<MeanReversionConfig>(() =>
    loadConfig<MeanReversionConfig>(LS_KEYS.meanreversion, {
      symbol: 'SPY',
      lookback: 20,
      z_score_threshold: 2,
      active: false,
    })
  );

  const [enabled, setEnabled] = useState(config.active);

  useEffect(() => {
    if (enabled) {
      saveConfig(LS_KEYS.meanreversion, { ...config, active: true });
    } else {
      saveConfig(LS_KEYS.meanreversion, { ...config, active: false });
    }
  }, [config, enabled]);

  return (
    <StrategyCard
      title="Mean Reversion"
      icon={TrendingDown}
      description="Buy oversold, sell overbought when price deviates significantly from mean"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Symbol</label>
          <SymbolSearch
            value={config.symbol}
            onChange={(s) => setConfig({ ...config, symbol: s })}
            placeholder="Search symbol..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Lookback (days)</label>
            <input
              type="number"
              value={config.lookback}
              onChange={(e) => setConfig({ ...config, lookback: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              min="10"
              max="200"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Z-Score Threshold</label>
            <input
              type="number"
              value={config.z_score_threshold}
              onChange={(e) => setConfig({ ...config, z_score_threshold: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              min="1"
              max="3"
              step="0.1"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mt-3">
        <AlertCircle className="w-4 h-4" />
        <span>Current signal: {enabled ? 'Calculating...' : 'Not active'}</span>
      </div>
    </StrategyCard>
  );
}

// ── Execution History Component ───────────────────────────────────
function ExecutionHistory() {
  const [history] = useState([
    {
      id: 1,
      strategy: 'DCA',
      action: 'Buy SPY',
      timestamp: '2026-05-07 09:30:00',
      status: 'completed',
      details: '5 shares @ $420.50',
    },
    {
      id: 2,
      strategy: 'Rebalance',
      action: 'Sell QQQ',
      timestamp: '2026-05-07 10:15:00',
      status: 'completed',
      details: '10 shares @ $445.20',
    },
    {
      id: 3,
      strategy: 'Momentum',
      action: 'Buy AAPL',
      timestamp: '2026-05-07 11:00:00',
      status: 'pending',
      details: '3 shares @ $175.80',
    },
  ]);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <History className="w-5 h-5 text-amber-400" />
          Execution History
        </h3>
      </div>

      <div className="space-y-2">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between p-3 bg-[var(--app-bg)] rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${
                entry.status === 'completed' ? 'bg-green-500' :
                entry.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{entry.action}</p>
                <p className="text-xs text-[var(--text-muted)]">{entry.details}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--text-muted)]">{entry.strategy}</p>
              <p className="text-xs text-[var(--text-muted)]">{entry.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Strategies Page ─────────────────────────────────────────
export default function StrategiesPage() {
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    async function fetchPositions() {
      try {
        const res = await fetch('/api/account');
        const json = await res.json();
        if (!json.error && json.positions) {
          setPositions(json.positions.map((p: any) => ({
            symbol: p.symbol,
            qty: p.qty,
            marketValue: p.marketValue,
          })));
        }
      } catch {
        // ignore
      }
    }
    fetchPositions();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
              <Brain className="w-7 h-7 text-amber-400" />
              Strategy Engine
            </h1>
            <p className="text-base text-[var(--text-secondary)] mt-2">
              Configure and automate trading strategies with execution scheduling and backtesting
            </p>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold bg-[var(--app-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors border border-[var(--border)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to AI Strategies
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <DCAStrategy />
          <RebalanceStrategy positions={positions} />
          <MomentumStrategy />
          <MeanReversionStrategy />
        </div>

        <ExecutionHistory />
      </div>
    </div>
  );
}
