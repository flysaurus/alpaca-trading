'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  Activity,
  BarChart3,
  List,
  Clock,
  Zap,
  ChevronRight,
  X,
  Menu,
  Radio,
  RadioTower,
  LayoutDashboard,
  CandlestickChart,
  Settings,
  Newspaper,
  Bell,
  Brain,
  Bot,
  PieChart,
} from 'lucide-react';
import WatchlistWidget from '@/components/WatchlistWidget';
import MarketIndicesBar from '@/components/MarketIndicesBar';
import NewsIntelligence from '@/components/NewsIntelligence';
import SettingsPanel from '@/components/SettingsPanel';
import { buildAllocationData, buildPerformanceData } from '@/lib/portfolioAnalytics';
import { PerformanceCard, AllocationCard } from '@/components/PerformanceCharts';
import SymbolSearch from '@/components/SymbolSearch';
import EnhancedPositions from '@/components/EnhancedPositions';;
import { AlertRule } from '@/lib/notifications';
import OrderFilterBar, { applyOrderFilters, type OrderFilters } from '@/components/OrderFilters';
import { initTheme } from '@/lib/theme';
import AIStrategiesTab from '@/components/AIStrategiesTab';
import AIAdvisorPage from '@/app/advisor/page';

/* ─────────── Types ─────────── */
interface Position {
  symbol: string;
  qty: number;
  marketValue: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
  side: 'long' | 'short';
}

interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: string;
  status: string;
  filledQty: number;
  filledAvgPrice: number | null;
  createdAt: string;
  limitPrice: number | null;
  stopPrice: number | null;
}

interface AccountData {
  account: {
    cash: number;
    portfolioValue: number;
    buyingPower: number;
    equity: number;
    dayTradeCount: number;
    status: string;
    tradingMode: string;
  };
  positions: Position[];
  risk: {
    totalExposure: number;
    unrealizedPnL: number;
    pnlPercent: number;
    largestPosition: number;
    largestPositionPercent: number;
  };
}

/* ─────────── Helpers ─────────── */
function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

/* ─────────── Sidebar ─────────── */
function Sidebar({ active, onChange }: { active: string; onChange: (s: string) => void }) {
  const items = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'positions', icon: CandlestickChart, label: 'Positions' },
    { id: 'ai-advisor', icon: Brain, label: 'AI Advisor' },
    { id: 'ai-strategies', icon: BarChart3, label: 'AI & Strategies' },
    { id: 'orders', icon: List, label: 'Orders' },
    { id: 'scanner', icon: Zap, label: 'Scanner' },
    { id: 'news', icon: Newspaper, label: 'News' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className="hidden sm:flex flex-col w-14 bg-[var(--surface-bg)] border-r border-[#1e232b] items-center py-4 gap-1 z-20">
      <div className="mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
          <RadioTower className="w-4 h-4 text-black" />
        </div>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isActive
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
            }`}
            title={item.label}
          >
            <Icon className="w-[18px] h-[18px]" />
          </button>
        );
      })}
    </aside>
  );
}

/* ─────────── Mobile Nav ─────────── */
function MobileNav({ active, onChange, showNotifications, setShowNotifications }: { active: string; onChange: (s: string) => void; showNotifications: boolean; setShowNotifications: (v: boolean) => void }) {
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('alpaca-trading-notifications');
      if (stored) {
        const data = JSON.parse(stored);
        setNotificationCount(data.unread || 0);
      }
    } catch {
      // Ignore
    }
  }, []);

  const items = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dash' },
    { id: 'positions', icon: CandlestickChart, label: 'Pos' },
    { id: 'ai-strategies', icon: Brain, label: 'AI' },
    { id: 'orders', icon: List, label: 'Orders' },
    { id: 'news', icon: Newspaper, label: 'News' },
    { id: 'settings', icon: Settings, label: 'Set' },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-[var(--surface-bg)] border-t border-[#1e232b] z-30 flex justify-around py-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition ${
              isActive ? 'text-amber-400' : 'text-[var(--text-muted)]'
            }`}
          >
            <Icon className="w-6 h-6 sm:w-5 sm:h-5" />
            <span className="text-[10px]">{item.label}</span>
          </button>
        );
      })}
      {/* Notification bell on mobile */}
      <button
        onClick={() => setShowNotifications(true)}
        className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition text-[var(--text-muted)] relative"
      >
        <Bell className="w-6 h-6 sm:w-5 sm:h-5" />
        {notificationCount > 0 && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-amber-500 text-black text-[8px] font-bold flex items-center justify-center rounded-full">
            {notificationCount}
          </span>
        )}
      </button>
    </nav>
  );
}

/* ─────────── Notifications Dropdown ─────────── */
function NotificationsDropdown({ 
  show, 
  onClose 
}: { 
  show: boolean; 
  onClose: () => void 
}) {
  const [notifications, setNotifications] = useState<Record<string, any>[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('alpaca-trading-notifications');
      if (stored) {
        const data = JSON.parse(stored);
        setNotifications(data.list || []);
        setUnreadCount(data.unread || 0);
      }
    } catch {
      // Ignore
    }
  }, []);

  const markAllRead = () => {
    try {
      const stored = localStorage.getItem('alpaca-trading-notifications');
      const data = stored ? JSON.parse(stored) : { list: [], unread: 0 };
      data.list.forEach((n: any) => n.read = true);
      data.unread = 0;
      localStorage.setItem('alpaca-trading-notifications', JSON.stringify(data));
      setUnreadCount(0);
      setNotifications([...data.list]);
    } catch {
      // Ignore
    }
  };

  if (!show) return null;

  return (
    <div className="fixed top-16 right-4 w-80 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] shadow-2xl z-50 max-h-[60vh] overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-bg)]">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Notifications</h3>
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-8 h-8 text-[var(--hover-bg)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">No notifications yet</p>
          </div>
        ) : (
          notifications.map((note: any) => (
            <div key={note.id} className={`p-3 rounded-lg mb-2 ${note.read ? 'bg-[var(--app-bg)]/30' : 'bg-[var(--surface-bg)]/50 border border-[var(--border)]/30'}`}>
              <div className="flex items-start gap-2">
                <Bell className={`w-4 h-4 flex-shrink-0 mt-0.5 ${note.priority === 'high' ? 'text-amber-500' : 'text-[var(--text-secondary)]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">{note.title}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{note.message}</p>
                  <div className="flex items-center gap-2 mt-2 text-[9px] text-[var(--text-subtle)]">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--app-bg)] uppercase">{note.type}</span>
                    {note.symbol && <span className="font-bold text-[var(--text-primary)]">{note.symbol}</span>}
                    <span>• {new Date(note.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-bg)]">
        <button 
          onClick={markAllRead} 
          disabled={unreadCount === 0}
          className="w-full py-1.5 text-xs font-bold text-amber-500 hover:bg-amber-500/10 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark All Read
        </button>
      </div>
    </div>
  );
}

/* ─────────── Top Bar ─────────── */
function TopBar({ account, marketOpen }: { account: AccountData | null; marketOpen: boolean }) {
  const portfolioValue = account?.account.portfolioValue || 0;
  const unrealizedPL = account?.risk?.unrealizedPnL || 0;
  const pnlPercent = account?.risk?.pnlPercent || 0;
  const cash = account?.account.cash || 0;
  const bp = account?.account.buyingPower || 0;
  const isProfitable = unrealizedPL >= 0;
  
  // Notification badge (hardcoded for now, would integrate with real store)
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  
  // Load notifications from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('alpaca-trading-notifications');
      if (stored) {
        const data = JSON.parse(stored);
        setNotificationCount(data.unread || 0);
      }
    } catch {
      // Ignore
    }
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-[var(--app-bg)]/90 backdrop-blur-xl border-b border-[#1e232b]">
      <div className="flex items-center gap-4 px-4 py-3 overflow-x-auto">
        {/* Portfolio */}
        <div className="flex-shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">Portfolio</p>
          <p className="text-lg font-bold font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">
            ${fmtUSD(portfolioValue)}
          </p>
        </div>

        {/* P&L */}
        <div className="flex-shrink-0 min-w-[100px]">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">Day P&L</p>
          <div className="flex items-center gap-1.5">
            {isProfitable ? (
              <TrendingUp className="w-3.5 h-3.5 text-[var(--green)]" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-[var(--red)]" />
            )}
            <p className={`text-sm font-bold font-[family-name:var(--font-mono)] tabular-nums ${isProfitable ? 'text-[var(--green)] text-green-glow' : 'text-[var(--red)] text-red-glow'}`}>
              {isProfitable ? '+' : ''}{fmtUSD(unrealizedPL)}
            </p>
          </div>
          <p className={`text-[10px] font-[family-name:var(--font-mono)] tabular-nums ${isProfitable ? 'text-[#166534]' : 'text-[#991b1b]'}`}>
            {fmtPct(pnlPercent)}
          </p>
        </div>

        {/* Buying Power */}
        <div className="flex-shrink-0 min-w-[100px]">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">Buying Power</p>
          <p className="text-sm font-bold font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">
            ${fmtInt(bp)}
          </p>
        </div>

        {/* Cash */}
        <div className="flex-shrink-0 min-w-[80px]">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">Cash</p>
          <p className="text-sm font-bold font-[family-name:var(--font-mono)] text-[var(--text-secondary)] tabular-nums">
            ${fmtInt(cash)}
          </p>
        </div>

        {/* Market Status */}
        <div className="flex-shrink-0 ml-auto flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-[var(--green)] animate-pulse' : 'bg-[var(--red)]'}`} />
          <span className="text-[10px] uppercase tracking-widest text-[#6b7280] font-medium">
            {marketOpen ? 'Market Open' : 'Market Closed'}
          </span>
          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--card-bg)] px-2 py-0.5 rounded border border-[#1e232b]">
            {account?.account.tradingMode === 'live' ? 'LIVE' : 'PAPER'}
          </span>
          
          {/* Notification Badge */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] rounded-lg transition"
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center rounded-full">
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────── Positions Widget (deprecated, replaced by EnhancedPositions) ─────────── */
function PositionsWidget({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] p-6 text-center">
        <BarChart3 className="w-8 h-8 text-[#1e232b] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e232b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CandlestickChart className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Positions</h3>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-bg)] px-2 py-0.5 rounded">{positions.length} open</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[#1e232b]">
              <th className="px-4 py-2 font-medium">Symbol</th>
              <th className="px-4 py-2 font-medium text-right">Qty</th>
              <th className="px-4 py-2 font-medium text-right">Price</th>
              <th className="px-4 py-2 font-medium text-right">Value</th>
              <th className="px-4 py-2 font-medium text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const isProfitable = p.unrealizedPL >= 0;
              return (
                <tr key={p.symbol} className="border-b border-[var(--border)]/50 hover:bg-[var(--hover-bg)]/30 transition">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-[var(--hover-bg)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
                        {p.symbol.slice(0, 2)}
                      </div>
                      <span className="font-semibold text-[var(--text-primary)]">{p.symbol}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-secondary)] tabular-nums">{p.qty}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">${fmtUSD(p.currentPrice)}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-[var(--text-primary)] tabular-nums">${fmtInt(p.marketValue)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <p className={`font-[family-name:var(--font-mono)] text-xs tabular-nums ${isProfitable ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                      {isProfitable ? '+' : ''}{fmtUSD(p.unrealizedPL)}
                    </p>
                    <p className={`font-[family-name:var(--font-mono)] text-[10px] tabular-nums ${isProfitable ? 'text-[#166534]' : 'text-[#991b1b]'}`}>
                      {fmtPct(p.unrealizedPLPercent)}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────── Orders Widget ─────────── */
function OrdersWidget({ orders, onCancel }: { orders: Order[]; onCancel: (id: string) => void }) {
  if (orders.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] p-6 text-center">
        <List className="w-8 h-8 text-[#1e232b] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No orders</p>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    new: 'text-[#3b82f6]',
    partially_filled: 'text-amber-400',
    filled: 'text-[var(--green)]',
    done_for_day: 'text-[#6b7280]',
    canceled: 'text-[var(--red)]',
    expired: 'text-[#6b7280]',
    replaced: 'text-[#3b82f6]',
    pending_cancel: 'text-amber-400',
    pending_replace: 'text-amber-400',
    accepted: 'text-[var(--green)]',
    pending_new: 'text-amber-400',
    stopped: 'text-[var(--red)]',
    rejected: 'text-[var(--red)]',
    suspended: 'text-[var(--red)]',
    calculated: 'text-[#6b7280]',
  };

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e232b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Orders</h3>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-bg)] px-2 py-0.5 rounded">{orders.length}</span>
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--card-bg)]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[#1e232b]">
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Symbol</th>
              <th className="px-4 py-2 font-medium">Side</th>
              <th className="px-4 py-2 font-medium text-right">Qty</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--hover-bg)]/30 transition">
                <td className="px-4 py-2 text-[#6b7280] font-[family-name:var(--font-mono)] text-[11px] tabular-nums">
                  {new Date(o.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-2 font-semibold text-[var(--text-primary)]">{o.symbol}</td>
                <td className="px-4 py-3 sm:py-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.side === 'buy' ? 'bg-[var(--green-soft)]/30 text-[var(--green)]' : 'bg-[var(--red-soft)]/30 text-[var(--red)]'}`}>
                    {o.side.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--text-secondary)] tabular-nums">{o.qty}</td>
                <td className="px-4 py-2 text-[10px] text-[var(--text-secondary)] uppercase">{o.type}</td>
                <td className="px-4 py-3 sm:py-2">
                  <span className={`text-[10px] font-medium ${statusColor[o.status] || 'text-[#6b7280]'}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 sm:py-2">
                  {(o.status === 'new' || o.status === 'pending_new' || o.status === 'accepted') && (
                    <button
                      onClick={() => onCancel(o.id)}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--red)] transition"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────── Trade Widget ─────────── */
function TradeWidget({ onRefresh }: { onRefresh: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc' | 'opg'>('day');
  const [limitPrice, setLimitPrice] = useState('');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Fetch live price when symbol changes
  useEffect(() => {
    if (!symbol || symbol.length < 1) {
      setLivePrice(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setPriceLoading(true);
      try {
        const res = await fetch(`/api/quotes?symbols=${symbol.toUpperCase()}`);
        const json = await res.json();
        const q = json.data?.[0];
        if (q) setLivePrice(q.price);
      } catch {
        setLivePrice(null);
      } finally {
        setPriceLoading(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [symbol]);

  const submit = async () => {
    if (!symbol || !qty) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          qty: Number(qty),
          side,
          type: orderType,
          timeInForce,
          ...(limitPrice && orderType === 'limit' ? { limitPrice: Number(limitPrice) } : {}),
        }),
      });
      const json = await res.json();
      setResult(json);
      if (json.success) {
        setSymbol('');
        setQty('');
        setLimitPrice('');
        setLivePrice(null);
        onRefresh();
      }
    } catch (err) {
      setResult({ error: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const notional = livePrice ? Number(qty || 0) * livePrice : 0;

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] p-4">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Quick Trade</h3>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wider transition ${
            side === 'buy'
              ? 'bg-[var(--green-soft)]/20 text-[var(--green)] border border-[#166534]/40'
              : 'bg-[var(--surface-bg)] text-[var(--text-muted)] border border-[#1e232b]'
          }`}
        >
          BUY
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wider transition ${
            side === 'sell'
              ? 'bg-[var(--red-soft)]/20 text-[var(--red)] border border-[#991b1b]/40'
              : 'bg-[var(--surface-bg)] text-[var(--text-muted)] border border-[#1e232b]'
          }`}
        >
          SELL
        </button>
      </div>

      <div className="space-y-2">
        {/* Symbol + Price */}
        <div className="relative">
          <SymbolSearch
            value={symbol}
            onChange={(s) => setSymbol(s)}
            placeholder="SYMBOL"
          />
          {priceLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] animate-pulse">...</span>
          )}
          {livePrice && !priceLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--green)] font-[family-name:var(--font-mono)]">
              ${livePrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Qty + Type + TIF */}
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="QTY"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="flex-1 bg-[var(--app-bg)] border border-[#1e232b] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-amber-500/50 font-[family-name:var(--font-mono)]"
          />
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
            className="bg-[var(--app-bg)] border border-[#1e232b] rounded-lg px-2 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-amber-500/50 font-[family-name:var(--font-mono)]"
          >
            <option value="market">MKT</option>
            <option value="limit">LMT</option>
          </select>
          <select
            value={timeInForce}
            onChange={(e) => setTimeInForce(e.target.value as 'day' | 'gtc' | 'opg')}
            className="bg-[var(--app-bg)] border border-[#1e232b] rounded-lg px-2 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-amber-500/50 font-[family-name:var(--font-mono)]"
            title="Time in Force"
          >
            <option value="day">DAY</option>
            <option value="gtc">GTC</option>
            <option value="opg">OPG</option>
          </select>
        </div>

        {orderType === 'limit' && (
          <input
            type="number"
            placeholder="LIMIT PRICE"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            className="w-full bg-[var(--app-bg)] border border-[#1e232b] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-amber-500/50 font-[family-name:var(--font-mono)]"
          />
        )}

        {/* Notional preview */}
        {notional > 0 && (
          <p className="text-[10px] text-[var(--text-muted)] text-right font-[family-name:var(--font-mono)]">
            ≈ ${notional.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        )}
      </div>

      <button
        onClick={submit}
        disabled={submitting || !symbol || !qty}
        className={`w-full mt-3 py-2.5 rounded-lg font-bold text-xs tracking-wider transition ${
          side === 'buy'
            ? 'bg-[var(--green-soft)] hover:bg-[#15803d] text-[var(--text-primary)]'
            : 'bg-[var(--red-soft)] hover:bg-[#b91c1c] text-[var(--text-primary)]'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {submitting ? 'SUBMITTING...' : `${side.toUpperCase()} ${symbol || '---'}`}
      </button>

      {result && (
        <div className={`mt-2 p-2 rounded-lg text-[11px] font-medium ${result.success ? 'bg-[var(--green-soft)]/10 text-[var(--green)] border border-[#166534]/20' : 'bg-[var(--red-soft)]/10 text-[var(--red)] border border-[#991b1b]/20'}`}>
          {result.success ? `✓ ${result.order?.symbol} ${result.order?.side.toUpperCase()} @ ${result.order?.type.toUpperCase()}` : `✗ ${result.error}`}
        </div>
      )}
    </div>
  );
}

/* ─────────── Performance and Allocation Card ─────────── */
function PerformanceAndAllocationCard({ portfolioValue, cash, positions }: { portfolioValue: number; cash: number; positions: Position[] }) {
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'>('3M');
  const [chartType, setChartType] = useState<'value' | 'pnl'>('value');
  const [allocationTab, setAllocationTab] = useState<'assetType' | 'sector'>('assetType');

  const portfolioData = {
    equity: portfolioValue,
    cash,
    portfolioValue,
    positions: positions.map(p => ({
      symbol: p.symbol,
      marketValue: p.marketValue,
      qty: p.qty,
      avgEntryPrice: p.avgEntryPrice,
    })),
  };

  const allocationData = buildAllocationData(portfolioData);
  const performanceData = buildPerformanceData(portfolioData, timeframe === '1M' ? 30 : timeframe === '3M' ? 90 : timeframe === '6M' ? 180 : timeframe === '1Y' ? 365 : 730);

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Performance & Allocation
        </h3>
        <div className="flex gap-1">
          {['1M', '3M', '6M', 'YTD', '1Y', 'ALL'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf as any)}
              className={`px-2 py-0.5 text-[9px] font-bold rounded transition ${
                timeframe === tf
                  ? 'bg-amber-500 text-black'
                  : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Type Toggle */}
      <div className="flex gap-2">
        {[
          { id: 'value', label: 'Portfolio Value' },
          { id: 'pnl', label: 'Daily P&L' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setChartType(m.id as any)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
              chartType === m.id
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Performance Chart */}
      <div className="h-32">
        <PerformanceChart data={performanceData} metric={chartType} />
      </div>

      {/* Allocation Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-[var(--text-secondary)]">Asset Type</h4>
          </div>
          <DonutChart data={allocationData.assetType} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-[var(--text-secondary)]">Sector</h4>
            <div className="flex gap-1">
              {(['assetType', 'sector'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAllocationTab(t)}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                    allocationTab === t
                      ? 'bg-amber-500 text-black'
                      : 'bg-[var(--app-bg)] text-[var(--text-muted)]'
                  }`}
                >
                  {t === 'assetType' ? 'Assets' : 'Sector'}
                </button>
              ))}
            </div>
          </div>
          <DonutChart data={allocationData.sector} />
        </div>
      </div>
    </div>
  );
}

function PerformanceChart({ data, metric }: { data: { date: string; value: number; pnl: number }[]; metric: 'value' | 'pnl' }) {
  if (data.length === 0) return null;

  const values = data.map(d => d[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((d[metric] - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const isProfitable = values[values.length - 1] > values[0];

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isProfitable ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isProfitable ? '#10b981' : '#ef4444'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={isProfitable ? '#10b981' : '#ef4444'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`0,100 ${points} 100,100`}
        fill="url(#chartGrad)"
      />
    </svg>
  );
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return null;
  
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-32 h-32 flex-shrink-0">
        <svg viewBox="-1 -1 2 2" className="w-full h-full -rotate-90">
          {data.map((item, i) => {
            const startPercent = cumulativePercent;
            const endPercent = cumulativePercent + item.value / total;
            const [startX, startY] = getCoordinatesForPercent(startPercent);
            const [endX, endY] = getCoordinatesForPercent(endPercent);
            const largeArcFlag = item.value / total > 0.5 ? 1 : 0;
            cumulativePercent += item.value / total;
            
            return (
              <path
                key={i}
                d={`M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`}
                stroke={item.color}
                strokeWidth={0.5}
                fill="none"
              />
            );
          })}
          <circle cx="0" cy="0" r="0.75" className="fill-[var(--app-bg)]" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-[var(--text-primary)]">100%</span>
        </div>
      </div>
      
      <div className="space-y-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[var(--text-primary)] flex-1 truncate">{item.label}</span>
            <span className="text-[var(--text-muted)] font-mono">{((item.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────── Ticker Widget ─────────── */
/* ─────────── Main Dashboard ─────────── */
export default function Dashboard() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [marketOpen, setMarketOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [orderFilters, setOrderFilters] = useState<OrderFilters>({ dateRange: 'all' });

  // Initialize theme on mount
  useEffect(() => { initTheme(); }, []);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setAccount(null);
      } else {
        setAccount(json);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
      setAccount(null);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?status=all&limit=20');
      const json = await res.json();
      if (!json.error) setOrders(json.orders || []);
    } catch (err) {
      console.error('Orders error:', err);
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/market');
      const json = await res.json();
      setMarketOpen(json.isOpen || false);
    } catch (err) {
      console.error('Market error:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchAccount(), fetchOrders(), fetchMarket()]);
    setLoading(false);
  }, [fetchAccount, fetchOrders, fetchMarket]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Check alerts when news is loaded (simulated - in production would integrate with real news feed)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('alpaca-trading-alerts');
      if (stored) {
        const alertsData = JSON.parse(stored);
        const alerts: AlertRule[] = alertsData.alerts || [];
        
        // Simulate checking alerts against a few recent news items
        // In production, this would call /api/news and check against alerts
        const sampleNews = [
          { symbol: 'AAPL', headline: 'Apple reports strong earnings beat', summary: 'AAPL beats Q2 earnings estimates', sentiment: 'bullish' },
          { symbol: 'TSLA', headline: 'Tesla delivery numbers miss expectations', summary: 'TSLA misses Q1 delivery guidance', sentiment: 'bearish' },
        ];
        
        for (const n of sampleNews) {
          for (const rule of alerts) {
            if (rule.symbol !== n.symbol) continue;
            const text = `${n.headline} ${n.summary}`.toLowerCase();
            const hasKeyword = rule.keywords.some(k => text.includes(k.toLowerCase()));
            if (!hasKeyword) continue;
            if (rule.sentiment !== 'any' && rule.sentiment !== n.sentiment) continue;
            
            // Add notification
            const note = {
              id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              type: 'alert',
              symbol: n.symbol,
              title: `Alert: ${n.symbol}`,
              message: n.headline,
              timestamp: Date.now(),
              read: false,
              priority: 'high' as const,
            };
            
            // Update localStorage
            const existing = localStorage.getItem('alpaca-trading-notifications');
            const existingData = existing ? JSON.parse(existing) : { list: [], unread: 0 };
            existingData.list.unshift(note);
            existingData.unread = (existingData.unread || 0) + 1;
            localStorage.setItem('alpaca-trading-notifications', JSON.stringify(existingData));
          }
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const cancelOrder = async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchOrders();
        await fetchAccount();
      }
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  if (loading && !account) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--app-bg)]">
        <div className="text-center">
          <Zap className="w-6 h-6 text-amber-400 animate-pulse mx-auto mb-3" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Connecting to Alpaca...</p>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center px-4">
        <div className="bg-[var(--card-bg)] border border-[var(--red-soft)]/30 rounded-2xl p-8 max-w-md w-full text-center">
          <Zap className="w-10 h-10 text-[var(--red)] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Connection Error</h3>
          <p className="text-sm text-[#6b7280] mb-4">{error || 'Failed to load account data'}</p>
          <button
            onClick={refreshAll}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-lg transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const positions = account?.positions || [];
  const filteredOrders = applyOrderFilters(orders, orderFilters);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] flex pb-16 sm:pb-0">
      <Sidebar active={activeTab} onChange={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar account={account} marketOpen={marketOpen} />
        <NotificationsDropdown show={showNotifications} onClose={() => setShowNotifications(false)} />

        <main className="flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto">
          {/* Market Indices Bar — CNBC style */}
          <MarketIndicesBar />

          {/* Watchlist */}
          <WatchlistWidget />

          {/* Grid */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Performance Chart */}
              <PerformanceCard 
                portfolioValue={account?.account.portfolioValue || 0}
                cash={account?.account.cash || 0}
                positions={positions}
              />
              
              {/* Allocation Chart */}
              <AllocationCard 
                portfolioValue={account?.account.portfolioValue || 0}
                cash={account?.account.cash || 0}
                positions={positions}
              />
              
              {/* Trade Widget */}
              <TradeWidget onRefresh={refreshAll} />
            </div>
          )}

          {activeTab === 'positions' && (
            <EnhancedPositions positions={positions} cash={account?.account.cash} portfolioValue={account?.account.portfolioValue} onRefresh={refreshAll} />
          )}

          {activeTab === 'orders' && (
            <>
              <OrderFilterBar filters={orderFilters} onChange={setOrderFilters} />
              <OrdersWidget orders={filteredOrders} onCancel={cancelOrder} />
            </>
          )}

          {activeTab === 'scanner' && (
            <div className="bg-[var(--card-bg)] rounded-xl border border-[#1e232b] p-8 text-center">
              <Zap className="w-8 h-8 text-[#1e232b] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-muted)]">Scanner coming in Phase 2</p>
            </div>
          )}

          {activeTab === 'news' && <NewsIntelligence embedded />}


          {activeTab === 'settings' && <SettingsPanel account={account} />}

          {activeTab === 'ai-advisor' && <AIAdvisorPage />}
          {activeTab === 'ai-strategies' && <AIStrategiesTab positions={positions} />}
        </main>
      </div>

      <MobileNav active={activeTab} onChange={setActiveTab} showNotifications={showNotifications} setShowNotifications={setShowNotifications} />
    </div>
  );
}
