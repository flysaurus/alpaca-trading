'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  Power,
  PowerOff,
  Settings,
  Activity,
  Clock,
  Target,
  Zap,
  X,
  CheckCircle,
  XCircle,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────
interface AutonomousConfig {
  enabled: boolean;
  max_daily_autonomous_trades: number;
  confidence_threshold: number;
  max_position_size_pct: number;
  allowed_actions: Array<'buy' | 'sell' | 'hold' | 'watch'>;
  emergency_stop: boolean;
  last_trade_timestamp: string;
  daily_trade_count: number;
  trade_log: Array<{
    id: string;
    timestamp: string;
    symbol: string;
    action: string;
    confidence: number;
    position_size: number;
    status: 'executed' | 'failed' | 'cancelled';
    signal_snapshot: any;
  }>;
}

// ── Components ─────────────────────────────────────────────────────
function DangerBanner({ enabled }: { enabled: boolean }) {
  return (
    <div className={`border rounded-xl p-4 mb-6 ${
      enabled 
        ? 'bg-red-500/10 border-red-500/30' 
        : 'bg-gray-500/10 border-gray-500/30'
    }`}>
      <div className="flex items-center gap-3">
        <AlertTriangle className={`w-5 h-5 ${enabled ? 'text-red-500' : 'text-gray-500'}`} />
        <div>
          <h3 className={`text-sm font-bold ${enabled ? 'text-red-500' : 'text-gray-500'}`}>
            {enabled ? '⚠️ AUTONOMOUS MODE ENABLED' : 'Autonomous Mode Disabled'}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {enabled 
              ? 'AI will automatically execute trades based on suggestions. Monitor closely!'
              : 'AI suggestions require manual approval for execution.'
            }
          </p>
        </div>
      </div>
    </div>
  );
}

function TradeHistory({ trades }: { trades: AutonomousConfig['trade_log'] }) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          Autonomous Trade Log
        </h3>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {showHistory ? 'Hide' : 'Show'} ({trades.length})
        </button>
      </div>

      {showHistory && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {trades.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No autonomous trades yet</p>
          ) : (
            trades.map((trade, i) => (
              <div key={trade.id} className="flex items-center justify-between p-2 bg-[var(--app-bg)] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    trade.status === 'executed' ? 'bg-green-500' :
                    trade.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <div>
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      {trade.action.toUpperCase()} {trade.symbol}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {trade.timestamp} • {trade.confidence}% confidence
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">{trade.position_size}%</p>
                  <p className={`text-[10px] ${
                    trade.status === 'executed' ? 'text-green-500' :
                    trade.status === 'failed' ? 'text-red-500' : 'text-yellow-500'
                  }`}>
                    {trade.status}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function KillSwitch({ enabled, onEmergencyStop }: {
  enabled: boolean;
  onEmergencyStop: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleEmergencyStop = () => {
    if (confirmText === 'EMERGENCY STOP') {
      onEmergencyStop();
      setShowConfirm(false);
      setConfirmText('');
    }
  };

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Shield className="w-5 h-5 text-red-500" />
        <h3 className="text-sm font-bold text-red-500">Emergency Kill Switch</h3>
      </div>
      
      <p className="text-xs text-[var(--text-muted)] mb-3">
        Immediately cancels all pending orders and disables autonomous mode. Use only in emergencies.
      </p>

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
        >
          Activate Emergency Stop
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">
              Type "EMERGENCY STOP" to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[var(--app-bg)] border border-red-500/30 rounded text-[var(--text-primary)]"
              placeholder="EMERGENCY STOP"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowConfirm(false);
                setConfirmText('');
              }}
              className="flex-1 px-4 py-2 text-sm bg-[var(--app-bg)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEmergencyStop}
              disabled={confirmText !== 'EMERGENCY STOP'}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                confirmText === 'EMERGENCY STOP'
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              Stop All Trading
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Autonomous Settings Page ─────────────────────────────────
export default function AutonomousSettingsPage() {
  const [config, setConfig] = useState<AutonomousConfig>({
    enabled: false,
    max_daily_autonomous_trades: 5,
    confidence_threshold: 85,
    max_position_size_pct: 5,
    allowed_actions: ['buy'], // Start with buy-only for safety
    emergency_stop: false,
    last_trade_timestamp: '',
    daily_trade_count: 0,
    trade_log: [],
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const stored = localStorage.getItem('alpaca-trading-autonomous-config');
      if (stored) {
        const parsed = JSON.parse(stored);
        setConfig({ ...config, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load autonomous config:', error);
    }
  };

  const saveConfig = async (newConfig: AutonomousConfig) => {
    try {
      localStorage.setItem('alpaca-trading-autonomous-config', JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error('Failed to save autonomous config:', error);
    }
  };

  const toggleAutonomousMode = async () => {
    if (config.enabled) {
      // Disabling
      await saveConfig({ ...config, enabled: false });
    } else {
      // Enabling - show warning
      if (window.confirm('⚠️ WARNING: Enabling autonomous mode will allow AI to automatically execute trades. This can result in real financial losses. Are you sure you want to continue?')) {
        await saveConfig({ ...config, enabled: true });
      }
    }
  };

  const emergencyStop = async () => {
    setLoading(true);
    try {
      // Cancel all pending orders (mock)
      console.log('Emergency stop activated - cancelling all orders');
      
      // Disable autonomous mode
      await saveConfig({
        ...config,
        enabled: false,
        emergency_stop: true,
        trade_log: [
          ...config.trade_log,
          {
            id: `emergency-${Date.now()}`,
            timestamp: new Date().toISOString(),
            symbol: 'ALL',
            action: 'EMERGENCY_STOP',
            confidence: 100,
            position_size: 0,
            status: 'executed',
            signal_snapshot: { emergency: true },
          },
        ],
      });

      // Reset emergency flag after 5 seconds
      setTimeout(() => {
        setConfig((prev: AutonomousConfig) => {
          const updated = { ...prev, emergency_stop: false };
          localStorage.setItem('alpaca-trading-autonomous-config', JSON.stringify(updated));
          return updated;
        });
      }, 5000);
    } catch (error) {
      console.error('Emergency stop failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (updates: Partial<AutonomousConfig>) => {
    saveConfig({ ...config, ...updates });
  };

  const toggleAction = (action: 'buy' | 'sell' | 'hold' | 'watch') => {
    const newActions = config.allowed_actions.includes(action)
      ? config.allowed_actions.filter(a => a !== action)
      : [...config.allowed_actions, action];
    updateConfig({ allowed_actions: newActions });
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <Settings className="w-6 h-6 text-amber-400" />
            Autonomous Trading Settings
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Configure AI-powered autonomous trading with safety controls and emergency stops
          </p>
        </div>

        <DangerBanner enabled={config.enabled} />

        {/* Main Toggle */}
        <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Autonomous Mode</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Allow AI to automatically execute trading suggestions
              </p>
            </div>
            <button
              onClick={toggleAutonomousMode}
              disabled={loading}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                config.enabled
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {config.enabled ? (
                <>
                  <PowerOff className="w-4 h-4" />
                  Disable
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  Enable
                </>
              )}
            </button>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 mb-6">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Trading Parameters</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Max Daily Autonomous Trades: {config.max_daily_autonomous_trades}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={config.max_daily_autonomous_trades}
                onChange={(e) => updateConfig({ max_daily_autonomous_trades: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Confidence Threshold: {config.confidence_threshold}%
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={config.confidence_threshold}
                onChange={(e) => updateConfig({ confidence_threshold: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                Max Position Size: {config.max_position_size_pct}%
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={config.max_position_size_pct}
                onChange={(e) => updateConfig({ max_position_size_pct: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-2">Allowed Actions</label>
              <div className="flex flex-wrap gap-2">
                {(['buy', 'sell', 'hold', 'watch'] as const).map(action => (
                  <button
                    key={action}
                    onClick={() => toggleAction(action)}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                      config.allowed_actions.includes(action)
                        ? 'bg-amber-500 text-black'
                        : 'bg-[var(--app-bg)] text-[var(--text-muted)]'
                    }`}
                  >
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4 mb-6">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">Current Status</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[var(--text-muted)]">Daily Trade Count:</span>
              <span className="ml-2 text-[var(--text-primary)]">{config.daily_trade_count}/{config.max_daily_autonomous_trades}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Last Trade:</span>
              <span className="ml-2 text-[var(--text-primary)]">
                {config.last_trade_timestamp ? new Date(config.last_trade_timestamp).toLocaleString() : 'None'}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Mode:</span>
              <span className={`ml-2 font-medium ${
                config.enabled ? 'text-green-500' : 'text-gray-500'
              }`}>
                {config.enabled ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Emergency:</span>
              <span className={`ml-2 font-medium ${
                config.emergency_stop ? 'text-red-500' : 'text-green-500'
              }`}>
                {config.emergency_stop ? 'STOPPED' : 'NORMAL'}
              </span>
            </div>
          </div>
        </div>

        {/* Trade History */}
        <TradeHistory trades={config.trade_log} />

        {/* Emergency Kill Switch */}
        <KillSwitch enabled={config.enabled} onEmergencyStop={emergencyStop} />
      </div>
    </div>
  );
}