'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  DollarSign,
  Layers,
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Trash2,
  Plus,
  Edit3,
  Check,
  X,
  ArrowLeft,
  Calendar,
  BarChart3,
  History,
} from 'lucide-react';
import SymbolSearch from '@/components/SymbolSearch';

/* ── Types ─────────────────────────────────────────────────────── */

type StrategyType = 'dca' | 'rebalance' | 'momentum' | 'meanreversion';

interface BaseStrategy {
  id: string;
  type: StrategyType;
  name: string;
  active: boolean;
  createdAt: string;
}

interface DCAStrategy extends BaseStrategy {
  type: 'dca';
  config: {
    symbol: string;
    amount_usd: number;
    frequency: 'daily' | 'weekly' | 'monthly';
    start_date: string;
    end_date?: string;
  };
}

interface AllocationItem {
  id: string;
  symbol: string;
  weight: number;
}

interface RebalanceStrategy extends BaseStrategy {
  type: 'rebalance';
  config: {
    target_allocations: AllocationItem[];
    threshold: number;
    mode: 'full' | 'cash-only';
  };
}

interface MomentumStrategy extends BaseStrategy {
  type: 'momentum';
  config: {
    universe: string[];
    lookback_days: number;
    top_n: number;
    bottom_n?: number;
  };
}

interface MeanReversionStrategy extends BaseStrategy {
  type: 'meanreversion';
  config: {
    symbol: string;
    lookback: number;
    z_score_threshold: number;
  };
}

type Strategy = DCAStrategy | RebalanceStrategy | MomentumStrategy | MeanReversionStrategy;

/* ── Storage ───────────────────────────────────────────────────── */

const LS_KEY = 'alpaca-strategies-v2';

function loadStrategies(): Strategy[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveStrategies(strategies: Strategy[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(strategies));
  } catch { /* ignore */ }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ── Defaults ──────────────────────────────────────────────────── */

function defaultDCA(): DCAStrategy {
  return {
    id: makeId(),
    type: 'dca',
    name: 'DCA Strategy',
    active: false,
    createdAt: new Date().toISOString(),
    config: {
      symbol: 'SPY',
      amount_usd: 100,
      frequency: 'weekly',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
    },
  };
}

function defaultRebalance(): RebalanceStrategy {
  return {
    id: makeId(),
    type: 'rebalance',
    name: 'Rebalance Strategy',
    active: false,
    createdAt: new Date().toISOString(),
    config: {
      target_allocations: [
        { id: makeId(), symbol: 'SPY', weight: 0.6 },
        { id: makeId(), symbol: 'QQQ', weight: 0.3 },
        { id: makeId(), symbol: 'BND', weight: 0.1 },
      ],
      threshold: 0.05,
      mode: 'full',
    },
  };
}

function defaultMomentum(): MomentumStrategy {
  return {
    id: makeId(),
    type: 'momentum',
    name: 'Momentum Strategy',
    active: false,
    createdAt: new Date().toISOString(),
    config: {
      universe: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'],
      lookback_days: 90,
      top_n: 5,
      bottom_n: 3,
    },
  };
}

function defaultMeanReversion(): MeanReversionStrategy {
  return {
    id: makeId(),
    type: 'meanreversion',
    name: 'Mean Reversion Strategy',
    active: false,
    createdAt: new Date().toISOString(),
    config: {
      symbol: 'SPY',
      lookback: 20,
      z_score_threshold: 2.0,
    },
  };
}

/* ── Card Component ────────────────────────────────────────────── */

function StrategyCard({
  strategy,
  onToggle,
  onDelete,
  onUpdate,
}: {
  strategy: Strategy;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (s: Strategy) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Strategy>(strategy);

  const typeMeta: Record<StrategyType, { icon: any; color: string; label: string }> = {
    dca: { icon: DollarSign, color: 'text-emerald-400', label: 'DCA' },
    rebalance: { icon: Layers, color: 'text-blue-400', label: 'Rebalance' },
    momentum: { icon: TrendingUp, color: 'text-violet-400', label: 'Momentum' },
    meanreversion: { icon: BarChart3, color: 'text-amber-400', label: 'Mean Reversion' },
  };

  const meta = typeMeta[strategy.type];
  const Icon = meta.icon;

  const handleSave = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(strategy);
    setEditing(false);
  };

  const updateConfig = (patch: any) => {
    setDraft({ ...draft, config: { ...(draft.config as any), ...patch } } as Strategy);
  };

  return (
    <div className={`bg-[var(--card-bg)] rounded-2xl border ${strategy.active ? 'border-[var(--accent)]/30' : "dark:border-[#334155] light:border-[#e2e8f0]"} overflow-hidden transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${strategy.active ? 'bg-[var(--accent)]/10' : 'bg-[var(--surface-bg)]'}`}>
            <Icon className={`w-5 h-5 ${strategy.active ? meta.color : 'text-[var(--text-muted)]'}`} />
          </div>
          <div className="min-w-0">
            {editing ? (
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full bg-[var(--app-bg)] border border-[var(--border)] rounded px-2 py-1 text-sm font-bold text-[var(--text-primary)]"
              />
            ) : (
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{strategy.name}</h3>
            )}
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {editing ? (
            <>
              <button onClick={handleSave} className="p-2 rounded-lg text-[var(--green)] hover:bg-[var(--green)]/10 transition">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={handleCancel} className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={onDelete} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition">
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={onToggle}
                className={`p-2 rounded-lg transition-colors ${
                  strategy.active
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
                    : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                {strategy.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={`p-4 space-y-4 ${strategy.active || editing ? 'opacity-100' : 'opacity-50'}`}>
        {strategy.type === 'dca' && (
          <DCAForm config={(draft as DCAStrategy).config} onChange={updateConfig} disabled={!editing && !strategy.active} />
        )}
        {strategy.type === 'rebalance' && (
          <RebalanceForm config={(draft as RebalanceStrategy).config} onChange={updateConfig} disabled={!editing && !strategy.active} />
        )}
        {strategy.type === 'momentum' && (
          <MomentumForm config={(draft as MomentumStrategy).config} onChange={updateConfig} disabled={!editing && !strategy.active} />
        )}
        {strategy.type === 'meanreversion' && (
          <MeanReversionForm config={(draft as MeanReversionStrategy).config} onChange={updateConfig} disabled={!editing && !strategy.active} />
        )}
      </div>
    </div>
  );
}

/* ── DCA Form ──────────────────────────────────────────────────── */

function DCAForm({ config, onChange, disabled }: { config: DCAStrategy['config']; onChange: (c: any) => void; disabled: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Symbol</label>
        <SymbolSearch value={config.symbol} onChange={(s) => onChange({ symbol: s })} placeholder="Search..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Amount ($)</label>
          <input
            type="number"
            value={config.amount_usd}
            onChange={(e) => onChange({ amount_usd: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Frequency</label>
          <select
            value={config.frequency}
            onChange={(e) => onChange({ frequency: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Start Date</label>
          <div className="relative">
            <input
              type="date"
              value={config.start_date}
              onChange={(e) => onChange({ start_date: e.target.value })}
              disabled={disabled}
              className="w-full px-3 py-2 pr-9 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50 appearance-none"
            />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">End Date</label>
          <div className="relative">
            <input
              type="date"
              value={config.end_date || ''}
              onChange={(e) => onChange({ end_date: e.target.value || undefined })}
              disabled={disabled}
              className="w-full px-3 py-2 pr-9 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50 appearance-none"
            />
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Rebalance Form ────────────────────────────────────────────── */

function RebalanceForm({ config, onChange, disabled }: { config: RebalanceStrategy['config']; onChange: (c: any) => void; disabled: boolean }) {
  const totalWeight = config.target_allocations.reduce((s, a) => s + a.weight, 0);

  const addAlloc = () => {
    onChange({
      target_allocations: [...config.target_allocations, { id: makeId(), symbol: '', weight: 0 }],
    });
  };

  const removeAlloc = (id: string) => {
    onChange({ target_allocations: config.target_allocations.filter((a) => a.id !== id) });
  };

  const updateAlloc = (id: string, patch: Partial<AllocationItem>) => {
    onChange({
      target_allocations: config.target_allocations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--text-secondary)]">Target Allocations</label>
        <span className={`text-[11px] font-bold ${Math.abs(totalWeight - 1) < 0.01 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {Math.round(totalWeight * 100)}%
        </span>
      </div>
      <div className="space-y-2">
        {config.target_allocations.map((alloc) => (
          <div key={alloc.id} className="flex items-center gap-2">
            <SymbolSearch
              value={alloc.symbol}
              onChange={(s) => updateAlloc(alloc.id, { symbol: s })}
              placeholder="Symbol"
            />
            <input
              type="number"
              step="0.01"
              value={alloc.weight}
              onChange={(e) => updateAlloc(alloc.id, { weight: Number(e.target.value) })}
              disabled={disabled}
              className="w-20 px-2 py-1.5 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
              placeholder="Weight"
            />
            <button
              onClick={() => removeAlloc(alloc.id)}
              disabled={disabled}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--red)] disabled:opacity-30"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addAlloc}
        disabled={disabled}
        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-amber-300 disabled:opacity-30 transition"
      >
        <Plus className="w-3.5 h-3.5" /> Add allocation
      </button>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Threshold</label>
          <input
            type="number"
            step="0.01"
            value={config.threshold}
            onChange={(e) => onChange({ threshold: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Mode</label>
          <select
            value={config.mode}
            onChange={(e) => onChange({ mode: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          >
            <option value="full">Full</option>
            <option value="cash-only">Cash Only</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/* ── Momentum Form ─────────────────────────────────────────────── */

function MomentumForm({ config, onChange, disabled }: { config: MomentumStrategy['config']; onChange: (c: any) => void; disabled: boolean }) {
  const [symInput, setSymInput] = useState('');

  const addSym = (s: string) => {
    const up = s.toUpperCase().trim();
    if (up && !config.universe.includes(up)) {
      onChange({ universe: [...config.universe, up] });
    }
    setSymInput('');
  };

  const removeSym = (s: string) => {
    onChange({ universe: config.universe.filter((u) => u !== s) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Universe</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {config.universe.map((sym) => (
            <span key={sym} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--app-bg)] border border-[var(--border)] rounded-md text-xs text-[var(--text-primary)]">
              {sym}
              <button onClick={() => removeSym(sym)} className="text-[var(--text-muted)] hover:text-[var(--red)]">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <SymbolSearch value={symInput} onChange={setSymInput} onSelect={addSym} placeholder="Add symbol..." />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Lookback (days)</label>
          <input
            type="number"
            value={config.lookback_days}
            onChange={(e) => onChange({ lookback_days: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Top N</label>
          <input
            type="number"
            value={config.top_n}
            onChange={(e) => onChange({ top_n: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Bottom N</label>
          <input
            type="number"
            value={config.bottom_n || ''}
            onChange={(e) => onChange({ bottom_n: Number(e.target.value) || undefined })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}

/* ── Mean Reversion Form ───────────────────────────────────────── */

function MeanReversionForm({ config, onChange, disabled }: { config: MeanReversionStrategy['config']; onChange: (c: any) => void; disabled: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Symbol</label>
        <SymbolSearch value={config.symbol} onChange={(s) => onChange({ symbol: s })} placeholder="Search..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Lookback</label>
          <input
            type="number"
            value={config.lookback}
            onChange={(e) => onChange({ lookback: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Z-Score Threshold</label>
          <input
            type="number"
            step="0.1"
            value={config.z_score_threshold}
            onChange={(e) => onChange({ z_score_threshold: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}

/* ── Add Strategy Modal ────────────────────────────────────────── */

function AddStrategyModal({
  show,
  onClose,
  onAdd,
}: {
  show: boolean;
  onClose: () => void;
  onAdd: (type: StrategyType) => void;
}) {
  if (!show) return null;

  const types: { type: StrategyType; label: string; icon: any; desc: string }[] = [
    { type: 'dca', label: 'DCA', icon: DollarSign, desc: 'Dollar Cost Averaging' },
    { type: 'rebalance', label: 'Rebalance', icon: Layers, desc: 'Portfolio rebalancing' },
    { type: 'momentum', label: 'Momentum', icon: TrendingUp, desc: 'Momentum rotation' },
    { type: 'meanreversion', label: 'Mean Reversion', icon: BarChart3, desc: 'Z-score based signals' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card-bg)] rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] w-full max-w-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Add Strategy</h3>
          <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          {types.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.type}
                onClick={() => onAdd(t.type)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--app-bg)] hover:bg-[var(--hover-bg)] border border-[var(--border)] hover:border-[var(--accent)]/30 transition text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-bg)] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{t.label}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadStrategies();
    // Migrate old single-strategy format if present
    if (saved.length === 0) {
      const migrated: Strategy[] = [];
      try {
        const oldDca = localStorage.getItem('alpaca-strategy-dca');
        if (oldDca) {
          const parsed = JSON.parse(oldDca);
          migrated.push({
            id: makeId(),
            type: 'dca',
            name: 'DCA Strategy',
            active: parsed.active || false,
            createdAt: new Date().toISOString(),
            config: {
              symbol: parsed.symbol || 'SPY',
              amount_usd: parsed.amount_usd || 100,
              frequency: parsed.frequency || 'weekly',
              start_date: parsed.start_date || new Date().toISOString().split('T')[0],
              end_date: parsed.end_date || '',
            },
          });
        }
        const oldReb = localStorage.getItem('alpaca-strategy-rebalance');
        if (oldReb) {
          const parsed = JSON.parse(oldReb);
          migrated.push({
            id: makeId(),
            type: 'rebalance',
            name: 'Rebalance Strategy',
            active: parsed.active || false,
            createdAt: new Date().toISOString(),
            config: {
              target_allocations: parsed.target_allocations || [],
              threshold: parsed.threshold || 0.05,
              mode: parsed.mode || 'full',
            },
          });
        }
        const oldMom = localStorage.getItem('alpaca-strategy-momentum');
        if (oldMom) {
          const parsed = JSON.parse(oldMom);
          migrated.push({
            id: makeId(),
            type: 'momentum',
            name: 'Momentum Strategy',
            active: parsed.active || false,
            createdAt: new Date().toISOString(),
            config: {
              universe: parsed.universe || ['AAPL', 'MSFT', 'GOOGL'],
              lookback_days: parsed.lookback_days || 90,
              top_n: parsed.top_n || 5,
              bottom_n: parsed.bottom_n,
            },
          });
        }
        const oldMr = localStorage.getItem('alpaca-strategy-meanreversion');
        if (oldMr) {
          const parsed = JSON.parse(oldMr);
          migrated.push({
            id: makeId(),
            type: 'meanreversion',
            name: 'Mean Reversion Strategy',
            active: parsed.active || false,
            createdAt: new Date().toISOString(),
            config: {
              symbol: parsed.symbol || 'SPY',
              lookback: parsed.lookback || 20,
              z_score_threshold: parsed.z_score_threshold || 2.0,
            },
          });
        }
      } catch { /* ignore */ }
      setStrategies(migrated);
      if (migrated.length > 0) saveStrategies(migrated);
    } else {
      setStrategies(saved);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveStrategies(strategies);
  }, [strategies, loaded]);

  const addStrategy = (type: StrategyType) => {
    let s: Strategy;
    switch (type) {
      case 'dca': s = defaultDCA(); break;
      case 'rebalance': s = defaultRebalance(); break;
      case 'momentum': s = defaultMomentum(); break;
      case 'meanreversion': s = defaultMeanReversion(); break;
    }
    setStrategies((prev) => [...prev, s]);
    setShowAdd(false);
  };

  const toggleStrategy = (id: string) => {
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  };

  const deleteStrategy = (id: string) => {
    if (confirm('Delete this strategy?')) {
      setStrategies((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const updateStrategy = (updated: Strategy) => {
    setStrategies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const activeCount = strategies.filter((s) => s.active).length;

  return (
    <div className="min-h-screen bg-[var(--app-bg)] p-4 pb-20 sm:pb-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Brain className="w-6 h-6 text-[var(--accent)]" />
              Strategy Engine
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {strategies.length} strategy{strategies.length !== 1 ? 'ies' : 'y'} · {activeCount} active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold bg-[var(--card-bg)] text-[var(--text-primary)] rounded-lg border dark:border-[#334155] light:border-[#e2e8f0] hover:bg-[var(--hover-bg)] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </a>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold bg-[var(--accent)] text-black rounded-lg hover:bg-amber-600 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Strategy List */}
        {strategies.length === 0 ? (
          <div className="bg-[var(--card-bg)] rounded-2xl border dark:border-[#334155] light:border-[#e2e8f0] p-8 text-center">
            <Brain className="w-10 h-10 text-[var(--hover-bg)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">No strategies yet</p>
            <p className="text-xs text-[var(--text-subtle)] mt-1">Click Add to create your first strategy</p>
          </div>
        ) : (
          <div className="space-y-4">
            {strategies.map((s) => (
              <StrategyCard
                key={s.id}
                strategy={s}
                onToggle={() => toggleStrategy(s.id)}
                onDelete={() => deleteStrategy(s.id)}
                onUpdate={updateStrategy}
              />
            ))}
          </div>
        )}
      </div>

      <AddStrategyModal show={showAdd} onClose={() => setShowAdd(false)} onAdd={addStrategy} />
    </div>
  );
}
