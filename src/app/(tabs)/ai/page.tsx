'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  AlertTriangle,
  ChevronRight,
  Play,
  Pause,
  Settings,
  BarChart3,
  Layers,
  DollarSign,
  Activity,
  Sparkles,
  Info,
  Bot,
} from 'lucide-react';
import { useDashboard } from '@/lib/dashboard-context';

// ── Types ───────────────────────────────────────────────────────
interface AISignal {
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'watch';
  confidence: number;
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
  suggestedPositionSize: number;
  stopLossPct: number;
  takeProfitPct: number;
  signals: {
    price: string;
    sentiment: string;
    insider: string;
    macro: string;
  };
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: any;
  status: 'active' | 'paused' | 'available';
  tradesToday: number;
}

// ── Helpers ─────────────────────────────────────────────────────
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const fmt$ = (n: number) => '$' + n.toFixed(0);

function getRiskColor(level: string) {
  switch (level) {
    case 'low': return 'text-[#22d66e] bg-[#166534]/20 border-[#166534]/30';
    case 'medium': return 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/30';
    case 'high': return 'text-[#f87171] bg-[#991b1b]/20 border-[#991b1b]/30';
    default: return 'text-[#6b7280] bg-[#1f2937] border-[#1f2937]';
  }
}

function getActionColor(action: string) {
  switch (action) {
    case 'buy': return 'text-[#22d66e] bg-[#166534]/20';
    case 'sell': return 'text-[#f87171] bg-[#991b1b]/20';
    case 'hold': return 'text-[#f59e0b] bg-[#f59e0b]/10';
    default: return 'text-[#6b7280] bg-[#1f2937]';
  }
}

// ── Mock AI signals (will be replaced by real API call) ────────
const MOCK_SIGNALS: AISignal[] = [
  {
    symbol: 'AAPL',
    action: 'buy',
    confidence: 82,
    reasoning: 'RSI recovering from oversold territory, MACD crossover forming, positive earnings sentiment',
    riskLevel: 'medium',
    suggestedPositionSize: 5,
    stopLossPct: 4.5,
    takeProfitPct: 12,
    signals: { price: 'RSI 42, MACD bullish', sentiment: 'Positive', insider: 'No activity', macro: 'Favorable' },
  },
  {
    symbol: 'NVDA',
    action: 'buy',
    confidence: 91,
    reasoning: 'Strong momentum post-earnings, volume surge confirming breakout, AI demand tailwinds',
    riskLevel: 'medium',
    suggestedPositionSize: 7,
    stopLossPct: 5.0,
    takeProfitPct: 15,
    signals: { price: 'Breakout confirmed', sentiment: 'Very Positive', insider: 'Net buys', macro: 'Strong' },
  },
  {
    symbol: 'TSLA',
    action: 'sell',
    confidence: 76,
    reasoning: 'RSI overbought at 78, bearish divergence on daily, negative news flow on deliveries',
    riskLevel: 'high',
    suggestedPositionSize: 4,
    stopLossPct: 6.0,
    takeProfitPct: 10,
    signals: { price: 'RSI 78, overbought', sentiment: 'Negative', insider: 'Selling', macro: 'Neutral' },
  },
  {
    symbol: 'MSFT',
    action: 'hold',
    confidence: 65,
    reasoning: 'Consolidating near highs, mixed signals from cloud revenue trends, wait for clarity',
    riskLevel: 'low',
    suggestedPositionSize: 3,
    stopLossPct: 3.5,
    takeProfitPct: 8,
    signals: { price: 'Consolidation', sentiment: 'Neutral', insider: 'No activity', macro: 'Stable' },
  },
  {
    symbol: 'AMD',
    action: 'watch',
    confidence: 58,
    reasoning: 'Potential reversal forming but lacks volume confirmation, monitor for entry signal',
    riskLevel: 'medium',
    suggestedPositionSize: 0,
    stopLossPct: 0,
    takeProfitPct: 0,
    signals: { price: 'Potential reversal', sentiment: 'Mixed', insider: 'No activity', macro: 'Neutral' },
  },
];

const STRATEGIES: Strategy[] = [
  { id: 'dca', name: 'Dollar Cost Avg', description: 'Fixed amount at regular intervals', icon: DollarSign, status: 'available', tradesToday: 0 },
  { id: 'rebalance', name: 'Rebalancing', description: 'Maintain target allocations', icon: Layers, status: 'available', tradesToday: 0 },
  { id: 'momentum', name: 'Momentum', description: 'Buy winners, sell losers', icon: TrendingUp, status: 'paused', tradesToday: 2 },
  { id: 'meanrev', name: 'Mean Reversion', description: 'Buy oversold, sell overbought', icon: Activity, status: 'active', tradesToday: 1 },
];

// ── AI Market Brief ─────────────────────────────────────────────
function MarketBrief() {
  const [brief, setBrief] = useState<string>('');

  useEffect(() => {
    const briefs = [
      'Market showing mixed signals. Tech momentum remains strong while energy faces headwinds. AI sector continues its uptrend with NVDA leading. Consider increasing exposure to semiconductor names.',
      'Pre-market indicators suggest cautious optimism. Bond yields declining favor growth stocks. Watch for FOMC minutes impact on afternoon session.',
      'Broad market grinding higher on low volume. Breadth indicators weakening — be selective. Defensive positioning recommended for next 48 hours.',
    ];
    setBrief(briefs[Math.floor(Math.random() * briefs.length)]);
  }, []);

  return (
    <div className="bg-gradient-to-br from-[#161920] to-[#111318] rounded-2xl border border-[#1f2937] p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-[#f59e0b]/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-[#f59e0b]" />
          <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">AI Market Brief</span>
        </div>
        <p className="text-xs text-[#c8d0dc] leading-relaxed">{brief}</p>
        <div className="flex items-center gap-3 mt-3">
          <span className="flex items-center gap-1 text-[10px] text-[#22d66e]">
            <TrendingUp className="w-3 h-3" /> 8 buy signals
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[#f87171]">
            <TrendingDown className="w-3 h-3" /> 3 sell signals
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[#6b7280]">
            <Minus className="w-3 h-3" /> 5 hold
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AI Signal Card ──────────────────────────────────────────────
function SignalCard({ signal }: { signal: AISignal }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const isBuy = signal.action === 'buy';
  const isSell = signal.action === 'sell';

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--app-bg)] flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-[var(--text-primary)]">{signal.symbol.slice(0, 2)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">{signal.symbol}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getActionColor(signal.action)}`}>
                {signal.action.toUpperCase()}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getRiskColor(signal.riskLevel)}`}>
                {signal.riskLevel.toUpperCase()} RISK
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{signal.reasoning}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="flex items-center gap-1 justify-end">
            <Brain className="w-3 h-3 text-[var(--accent)]" />
            <span className="text-sm font-bold font-mono text-[var(--accent)]">{signal.confidence}%</span>
          </div>
          <span className="text-[9px] text-[var(--text-muted)]">confidence</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border)]/50 pt-3">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">{signal.reasoning}</p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-[var(--app-bg)] rounded-lg p-2">
              <p className="text-[9px] text-[var(--text-muted)]">Price Action</p>
              <p className="text-[10px] text-[var(--text-primary)] font-medium">{signal.signals.price}</p>
            </div>
            <div className="bg-[var(--app-bg)] rounded-lg p-2">
              <p className="text-[9px] text-[var(--text-muted)]">Sentiment</p>
              <p className="text-[10px] text-[var(--text-primary)] font-medium">{signal.signals.sentiment}</p>
            </div>
            <div className="bg-[var(--app-bg)] rounded-lg p-2">
              <p className="text-[9px] text-[var(--text-muted)]">Insider Flow</p>
              <p className="text-[10px] text-[var(--text-primary)] font-medium">{signal.signals.insider}</p>
            </div>
            <div className="bg-[var(--app-bg)] rounded-lg p-2">
              <p className="text-[9px] text-[var(--text-muted)]">Macro</p>
              <p className="text-[10px] text-[var(--text-primary)] font-medium">{signal.signals.macro}</p>
            </div>
          </div>

          {signal.action !== 'watch' && (
            <div className="flex items-center justify-between mb-3 bg-[var(--app-bg)] rounded-lg p-2">
              <div className="text-center flex-1">
                <p className="text-[9px] text-[var(--text-muted)]">Position Size</p>
                <p className="text-sm font-bold font-mono text-[var(--text-primary)]">{signal.suggestedPositionSize}%</p>
              </div>
              <div className="w-px h-8 bg-[var(--border)]" />
              <div className="text-center flex-1">
                <p className="text-[9px] text-[var(--text-muted)]">Stop Loss</p>
                <p className="text-sm font-bold font-mono text-[#f87171]">-{signal.stopLossPct}%</p>
              </div>
              <div className="w-px h-8 bg-[var(--border)]" />
              <div className="text-center flex-1">
                <p className="text-[9px] text-[var(--text-muted)]">Take Profit</p>
                <p className="text-sm font-bold font-mono text-[#22d66e]">+{signal.takeProfitPct}%</p>
              </div>
            </div>
          )}

          <button
            onClick={() => router.push(`/trade?symbol=${signal.symbol}&side=${isSell ? 'sell' : 'buy'}`)}
            className={`w-full py-2.5 rounded-lg font-bold text-xs tracking-wider transition active:scale-[0.98] ${
              isSell
                ? 'bg-[#991b1b]/20 text-[#f87171] hover:bg-[#991b1b]/30'
                : 'bg-[var(--accent)] text-black hover:bg-[#d97706]'
            }`}
          >
            {isSell ? 'Review Sell Order' : isBuy ? 'Review Buy Order' : 'Add to Watchlist'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Strategy Card ───────────────────────────────────────────────
function StrategyCard({ strategy }: { strategy: Strategy }) {
  const Icon = strategy.icon;
  const isActive = strategy.status === 'active';
  const isPaused = strategy.status === 'paused';

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isActive ? 'bg-[var(--accent)]/10' : isPaused ? 'bg-[#f59e0b]/10' : 'bg-[var(--app-bg)]'
          }`}>
            <Icon className={`w-5 h-5 ${isActive ? 'text-[var(--accent)]' : isPaused ? 'text-[#f59e0b]' : 'text-[var(--text-muted)]'}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">{strategy.name}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{strategy.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {strategy.tradesToday > 0 && (
            <span className="text-[10px] text-[var(--text-muted)]">{strategy.tradesToday} today</span>
          )}
          <button className={`p-2 rounded-lg transition ${
            isActive ? 'bg-[#166534]/20 text-[#22d66e]' :
            isPaused ? 'bg-[#f59e0b]/10 text-[#f59e0b]' :
            'bg-[var(--app-bg)] text-[var(--text-muted)]'
          }`}>
            {isActive ? <Play className="w-4 h-4" /> : isPaused ? <Pause className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Risk Controls ───────────────────────────────────────────────
function RiskControls() {
  const [riskLevel, setRiskLevel] = useState('moderate');
  const [maxPosition, setMaxPosition] = useState(10);

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Risk Controls</h3>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Risk Level</p>
          <div className="grid grid-cols-3 gap-2">
            {['conservative', 'moderate', 'aggressive'].map((r) => (
              <button
                key={r}
                onClick={() => setRiskLevel(r)}
                className={`py-2 rounded-lg text-[10px] font-bold transition ${
                  riskLevel === r
                    ? r === 'conservative' ? 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30' :
                      r === 'aggressive' ? 'bg-[#f87171]/20 text-[#f87171] border border-[#f87171]/30' :
                      'bg-[var(--accent)] text-black'
                    : 'bg-[var(--app-bg)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Max Position Size</p>
            <span className="text-xs font-bold font-mono text-[var(--text-primary)]">{maxPosition}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            value={maxPosition}
            onChange={(e) => setMaxPosition(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────
export default function AIPage() {
  const { account } = useDashboard();
  const router = useRouter();
  const [signals, setSignals] = useState<AISignal[]>(MOCK_SIGNALS);
  const [loading, setLoading] = useState(false);

  const refreshSignals = useCallback(async () => {
    setLoading(true);
    // In production, this would call /api/advisor/suggest
    setTimeout(() => {
      setSignals([...MOCK_SIGNALS].sort(() => Math.random() - 0.5));
      setLoading(false);
    }, 800);
  }, []);

  const buyCount = signals.filter((s) => s.action === 'buy').length;
  const sellCount = signals.filter((s) => s.action === 'sell').length;
  const holdCount = signals.filter((s) => s.action === 'hold').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">AI Assistant</h2>
        </div>
        <button
          onClick={refreshSignals}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
        >
          <Sparkles className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Scanning...' : 'Rescan'}
        </button>
      </div>

      {/* Market Brief */}
      <MarketBrief />

      {/* Signal Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#166534]/10 rounded-xl border border-[#166534]/20 p-3 text-center">
          <p className="text-lg font-bold text-[#22d66e]">{buyCount}</p>
          <p className="text-[9px] text-[#22d66e]/70 uppercase tracking-wider">Buy</p>
        </div>
        <div className="bg-[#991b1b]/10 rounded-xl border border-[#991b1b]/20 p-3 text-center">
          <p className="text-lg font-bold text-[#f87171]">{sellCount}</p>
          <p className="text-[9px] text-[#f87171]/70 uppercase tracking-wider">Sell</p>
        </div>
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-3 text-center">
          <p className="text-lg font-bold text-[var(--text-muted)]">{holdCount}</p>
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Hold</p>
        </div>
      </div>

      {/* AI Signals */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">AI Signals</h3>
          <span className="text-[10px] text-[var(--text-muted)]">{signals.length} active</span>
        </div>
        <div className="space-y-2">
          {signals.map((signal) => (
            <SignalCard key={signal.symbol} signal={signal} />
          ))}
        </div>
      </div>

      {/* Deployed Strategies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Deployed Strategies</h3>
          <button
            onClick={() => router.push('/strategies')}
            className="text-[10px] text-[var(--accent)] font-semibold flex items-center gap-0.5"
          >
            Manage <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-2">
          {STRATEGIES.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      </div>

      {/* Risk Controls */}
      <RiskControls />

      {/* Disclaimer */}
      <div className="bg-[var(--app-bg)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-[var(--text-secondary)]">Disclaimer:</span> AI signals are informational only and not financial advice. Always do your own research. Past performance does not guarantee future results.
            </p>
            <div className="flex items-center gap-1 mt-2">
              <Info className="w-3 h-3 text-[var(--accent)]" />
              <p className="text-[9px] text-[var(--accent)] font-semibold">
                Paper trading recommended for testing strategies
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
