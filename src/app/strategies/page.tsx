'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';

// ── Strategy Types ───────────────────────────────────────────────
interface DCAConfig {
  symbol: string;
  amount_usd: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  start_date: string;
  end_date?: string;
  active: boolean;
}

interface RebalanceConfig {
  target_allocations: Record<string, number>;
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

// ── Strategy Cards Component ─────────────────────────────────────
function StrategyCard({ 
  title, 
  icon: Icon, 
  description, 
  enabled, 
  onToggle,
  children 
}: {
  title: string;
  icon: any;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-[var(--card-bg)] rounded-xl border ${enabled ? 'border-amber-500/20' : 'border-[var(--border)]'} p-4 transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${enabled ? 'bg-amber-500/10 text-amber-400' : 'bg-[var(--app-bg)] text-[var(--text-muted)]'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={`p-2 rounded-lg transition-colors ${
            enabled 
              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' 
              : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
          }`}
        >
          {enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>
      
      <div className={`space-y-3 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        {children}
      </div>
    </div>
  );
}

// ── DCA Strategy Component ───────────────────────────────────────
function DCAStrategy() {
  const [config, setConfig] = useState<DCAConfig>({
    symbol: 'SPY',
    amount_usd: 100,
    frequency: 'weekly',
    start_date: new Date().toISOString().split('T')[0],
    active: false,
  });

  const [enabled, setEnabled] = useState(false);

  return (
    <StrategyCard
      title="Dollar Cost Averaging"
      icon={DollarSign}
      description="Invest fixed amounts regularly to reduce timing risk"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Symbol</label>
          <input
            type="text"
            value={config.symbol}
            onChange={(e) => setConfig({...config, symbol: e.target.value})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Amount ($)</label>
          <input
            type="number"
            value={config.amount_usd}
            onChange={(e) => setConfig({...config, amount_usd: Number(e.target.value)})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Frequency</label>
          <select
            value={config.frequency}
            onChange={(e) => setConfig({...config, frequency: e.target.value as any})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Start Date</label>
          <input
            type="date"
            value={config.start_date}
            onChange={(e) => setConfig({...config, start_date: e.target.value})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Clock className="w-3 h-3" />
        <span>Next execution: {enabled ? 'Calculating...' : 'Not active'}</span>
      </div>
    </StrategyCard>
  );
}

// ── Rebalance Strategy Component ─────────────────────────────────
function RebalanceStrategy() {
  const [config, setConfig] = useState<RebalanceConfig>({
    target_allocations: {
      'SPY': 0.6,
      'QQQ': 0.3,
      'BND': 0.1,
    },
    threshold: 0.05,
    mode: 'full',
    active: false,
  });

  const [enabled, setEnabled] = useState(false);

  return (
    <StrategyCard
      title="Portfolio Rebalancing"
      icon={Layers}
      description="Maintain target allocations by buying/selling when drift exceeds threshold"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-2">Target Allocations</label>
          <div className="space-y-2">
            {Object.entries(config.target_allocations).map(([symbol, weight]) => (
              <div key={symbol} className="flex items-center gap-2">
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => {
                    const newAllocations = {...config.target_allocations};
                    delete newAllocations[symbol];
                    newAllocations[e.target.value] = weight;
                    setConfig({...config, target_allocations: newAllocations});
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
                />
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setConfig({
                    ...config,
                    target_allocations: {...config.target_allocations, [symbol]: Number(e.target.value)}
                  })}
                  className="w-16 px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
                  step="0.01"
                  min="0"
                  max="1"
                />
                <span className="text-xs text-[var(--text-muted)]">{(weight * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Threshold</label>
            <input
              type="number"
              value={config.threshold}
              onChange={(e) => setConfig({...config, threshold: Number(e.target.value)})}
              className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
              step="0.01"
              min="0.01"
              max="0.5"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Mode</label>
            <select
              value={config.mode}
              onChange={(e) => setConfig({...config, mode: e.target.value as any})}
              className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
            >
              <option value="full">Full (Buy/Sell)</option>
              <option value="cash-only">Cash Only (Buy Only)</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <AlertCircle className="w-3 h-3" />
        <span>Current drift: {enabled ? 'Calculating...' : 'Not active'}</span>
      </div>
    </StrategyCard>
  );
}

// ── Momentum Strategy Component ───────────────────────────────────
function MomentumStrategy() {
  const [config, setConfig] = useState<MomentumConfig>({
    universe: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'],
    lookback_days: 30,
    top_n: 5,
    bottom_n: 2,
    active: false,
  });

  const [enabled, setEnabled] = useState(false);

  return (
    <StrategyCard
      title="Momentum Strategy"
      icon={TrendingUp}
      description="Buy top performing stocks, sell underperformers based on price momentum"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Universe (comma-separated)</label>
          <input
            type="text"
            value={config.universe.join(', ')}
            onChange={(e) => setConfig({...config, universe: e.target.value.split(',').map(s => s.trim().toUpperCase())})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
          />
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Lookback (days)</label>
            <input
              type="number"
              value={config.lookback_days}
              onChange={(e) => setConfig({...config, lookback_days: Number(e.target.value)})}
              className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
              min="10"
              max="365"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Top N</label>
            <input
              type="number"
              value={config.top_n}
              onChange={(e) => setConfig({...config, top_n: Number(e.target.value)})}
              className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
              min="1"
              max="20"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Bottom N</label>
            <input
              type="number"
              value={config.bottom_n || 0}
              onChange={(e) => setConfig({...config, bottom_n: Number(e.target.value) || undefined})}
              className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
              min="0"
              max="20"
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <BarChart3 className="w-3 h-3" />
        <span>Top momentum: {enabled ? 'Calculating...' : 'Not active'}</span>
      </div>
    </StrategyCard>
  );
}

// ── Mean Reversion Strategy Component ──────────────────────────────
function MeanReversionStrategy() {
  const [config, setConfig] = useState<MeanReversionConfig>({
    symbol: 'SPY',
    lookback: 20,
    z_score_threshold: 2,
    active: false,
  });

  const [enabled, setEnabled] = useState(false);

  return (
    <StrategyCard
      title="Mean Reversion"
      icon={TrendingDown}
      description="Buy oversold, sell overbought when price deviates significantly from mean"
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Symbol</label>
          <input
            type="text"
            value={config.symbol}
            onChange={(e) => setConfig({...config, symbol: e.target.value.toUpperCase()})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Lookback (days)</label>
          <input
            type="number"
            value={config.lookback}
            onChange={(e) => setConfig({...config, lookback: Number(e.target.value)})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
            min="10"
            max="200"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">Z-Score Threshold</label>
          <input
            type="number"
            value={config.z_score_threshold}
            onChange={(e) => setConfig({...config, z_score_threshold: Number(e.target.value)})}
            className="w-full px-2 py-1 text-xs bg-[var(--app-bg)] border border-[var(--border)] rounded text-[var(--text-primary)]"
            min="1"
            max="3"
            step="0.1"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <AlertCircle className="w-3 h-3" />
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
      details: '5 shares @ $420.50'
    },
    {
      id: 2,
      strategy: 'Rebalance',
      action: 'Sell QQQ',
      timestamp: '2026-05-07 10:15:00',
      status: 'completed',
      details: '10 shares @ $445.20'
    },
    {
      id: 3,
      strategy: 'Momentum',
      action: 'Buy AAPL',
      timestamp: '2026-05-07 11:00:00',
      status: 'pending',
      details: '3 shares @ $175.80'
    },
  ]);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <History className="w-4 h-4 text-amber-400" />
          Execution History
        </h3>
      </div>
      
      <div className="space-y-2">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between p-2 bg-[var(--app-bg)] rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${
                entry.status === 'completed' ? 'bg-green-500' : 
                entry.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <div>
                <p className="text-xs font-medium text-[var(--text-primary)]">{entry.action}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{entry.details}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">{entry.strategy}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{entry.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Strategies Page ─────────────────────────────────────────
export default function StrategiesPage() {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <Brain className="w-6 h-6 text-amber-400" />
            Strategy Engine
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Configure and automate trading strategies with execution scheduling and backtesting
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <DCAStrategy />
          <RebalanceStrategy />
          <MomentumStrategy />
          <MeanReversionStrategy />
        </div>

        <ExecutionHistory />
      </div>
    </div>
  );
}