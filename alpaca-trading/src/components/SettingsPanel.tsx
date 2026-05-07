'use client';

import { useState, useEffect } from 'react';
import { Shield, RotateCcw, AlertTriangle } from 'lucide-react';
import { getTheme, setTheme } from '@/lib/theme';

interface RiskSettings {
  maxPositionSize: number; // % of portfolio
  maxDailyLoss: number; // % of portfolio
  maxOpenPositions: number;
  enableShorting: boolean;
  allowAfterHours: boolean;
}

const STORAGE_KEY = 'alpaca-trading-risk-settings';

const DEFAULTS: RiskSettings = {
  maxPositionSize: 5,
  maxDailyLoss: 2,
  maxOpenPositions: 10,
  enableShorting: false,
  allowAfterHours: true,
};

function loadSettings(): RiskSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

function saveSettings(settings: RiskSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface Props {
  account: { account: { tradingMode?: string } } | null;
}

export default function SettingsPanel({ account }: Props) {
  const [settings, setSettings] = useState<RiskSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = (patch: Partial<RiskSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const reset = () => {
    setSettings(DEFAULTS);
    saveSettings(DEFAULTS);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const isLive = account?.account?.tradingMode === 'live';
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  useEffect(() => { setThemeState(getTheme()); }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    setTheme(next);
  };

  return (
    <div className="space-y-4 max-w-xl">
      {/* Mode Banner */}
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${
        isLive
          ? 'bg-[var(--red)]/10 border-[#ef4444]/20'
          : 'bg-amber-500/5 border-amber-500/20'
      }`}>
        <Shield className={`w-5 h-5 ${isLive ? 'text-[var(--red)]' : 'text-amber-400'}`} />
        <div>
          <p className={`text-sm font-bold ${isLive ? 'text-[var(--red)]' : 'text-amber-400'}`}>
            {isLive ? '🔴 LIVE TRADING' : 'PAPER TRADING'}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {isLive
              ? 'Real money. All safeguards active.'
              : 'Simulated trades. No real money at risk.'}
          </p>
        </div>
      </div>

      {/* Risk Settings */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] p-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Risk Settings</h3>
          <button
            onClick={reset}
            className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        {/* Max Position Size */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)]">Max Position Size</label>
            <span className="text-xs font-bold text-[var(--text-primary)] font-[family-name:var(--font-mono)]">
              {settings.maxPositionSize}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={settings.maxPositionSize}
            onChange={(e) => update({ maxPositionSize: Number(e.target.value) })}
            className="w-full h-1.5 bg-[var(--hover-bg)] rounded-full appearance-none cursor-pointer accent-amber-500"
          />
          <p className="text-[10px] text-[var(--text-muted)]">
            No single position can exceed {settings.maxPositionSize}% of portfolio value
          </p>
        </div>

        {/* Max Daily Loss */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)]">Max Daily Loss</label>
            <span className="text-xs font-bold text-[var(--text-primary)] font-[family-name:var(--font-mono)]">
              {settings.maxDailyLoss}%
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={settings.maxDailyLoss}
            onChange={(e) => update({ maxDailyLoss: Number(e.target.value) })}
            className="w-full h-1.5 bg-[var(--hover-bg)] rounded-full appearance-none cursor-pointer accent-amber-500"
          />
          <p className="text-[10px] text-[var(--text-muted)]">
            Trading halts if daily unrealized loss exceeds {settings.maxDailyLoss}%
          </p>
        </div>

        {/* Max Open Positions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)]">Max Open Positions</label>
            <span className="text-xs font-bold text-[var(--text-primary)] font-[family-name:var(--font-mono)]">
              {settings.maxOpenPositions}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={settings.maxOpenPositions}
            onChange={(e) => update({ maxOpenPositions: Number(e.target.value) })}
            className="w-full h-1.5 bg-[var(--hover-bg)] rounded-full appearance-none cursor-pointer accent-amber-500"
          />
          <p className="text-[10px] text-[var(--text-muted)]">
            Maximum number of simultaneous open positions
          </p>
        </div>

        {/* Shorting Toggle */}
        <div className="flex items-center justify-between py-2 border-t border-[#1e232b]">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Enable Short Selling</label>
            <p className="text-[10px] text-[var(--text-muted)]">Allow sell orders without existing position</p>
          </div>
          <button
            onClick={() => update({ enableShorting: !settings.enableShorting })}
            className={`relative w-11 h-6 rounded-full transition ${
              settings.enableShorting ? 'bg-[var(--red)]' : 'bg-[var(--hover-bg)]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.enableShorting ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* After-Hours Toggle */}
        <div className="flex items-center justify-between py-2 border-t border-[#1e232b]">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Allow After-Hours Trading</label>
            <p className="text-[10px] text-[var(--text-muted)]">Submit orders outside 9:30 AM - 4:00 PM ET</p>
          </div>
          <button
            onClick={() => update({ allowAfterHours: !settings.allowAfterHours })}
            className={`relative w-11 h-6 rounded-full transition ${
              settings.allowAfterHours ? 'bg-[var(--green)]' : 'bg-[var(--hover-bg)]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.allowAfterHours ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Saved indicator */}
        {saved && (
          <p className="text-[10px] text-[var(--green)] text-center">Settings saved</p>
        )}
      </div>

      {/* Theme Toggle */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] p-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Theme</label>
            <p className="text-[10px] text-[var(--text-muted)]">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-11 h-6 rounded-full transition ${theme === 'dark' ? 'bg-amber-500' : 'bg-[#3b82f6]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-[10px] text-[var(--text-muted)]">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>
          These settings are stored locally in your browser. Server-side enforcement requires
          a redeploy with updated environment variables. Paper trading recommended for testing.
        </p>
      </div>
    </div>
  );
}
