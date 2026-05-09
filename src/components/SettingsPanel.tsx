'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  RotateCcw,
  AlertTriangle,
  User,
  Link2,
  Link2Off,
  Bell,
  BellOff,
  Moon,
  Sun,
  Lock,
  Server,
  Cpu,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Smartphone,
  Mail,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { getTheme, setTheme } from '@/lib/theme';

/* ── Types ─────────────────────────────────────────────────────── */

interface RiskSettings {
  maxPositionSize: number;
  maxDailyLoss: number;
  enableShorting: boolean;
  allowAfterHours: boolean;
}

interface NotificationSettings {
  telegramEnabled: boolean;
  desktopEnabled: boolean;
  orderAlerts: boolean;
  priceAlerts: boolean;
  newsAlerts: boolean;
  macroAlerts: boolean;
}

interface AccountInfo {
  account: {
    id?: string;
    portfolioValue: number;
    cash: number;
    buyingPower: number;
    equity: number;
    dayTradeCount?: number;
    status?: string;
    tradingMode?: string;
  };
  positions: any[];
  risk?: { score: number; level: string };
}

interface Props {
  account: AccountInfo | null;
}

/* ── Storage Keys ──────────────────────────────────────────────── */

const RISK_KEY = 'alpaca-trading-risk-settings';
const NOTIF_KEY = 'alpaca-trading-notification-settings';

const RISK_DEFAULTS: RiskSettings = {
  maxPositionSize: 5,
  maxDailyLoss: 2,
  enableShorting: false,
  allowAfterHours: true,
};

const NOTIF_DEFAULTS: NotificationSettings = {
  telegramEnabled: false,
  desktopEnabled: true,
  orderAlerts: true,
  priceAlerts: true,
  newsAlerts: false,
  macroAlerts: true,
};

/* ── Helpers ───────────────────────────────────────────────────── */

function loadRisk(): RiskSettings {
  if (typeof window === 'undefined') return RISK_DEFAULTS;
  try {
    const raw = localStorage.getItem(RISK_KEY);
    if (raw) return { ...RISK_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return RISK_DEFAULTS;
}

function saveRisk(settings: RiskSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RISK_KEY, JSON.stringify(settings));
}

function loadNotif(): NotificationSettings {
  if (typeof window === 'undefined') return NOTIF_DEFAULTS;
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) return { ...NOTIF_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return NOTIF_DEFAULTS;
}

function saveNotif(settings: NotificationSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIF_KEY, JSON.stringify(settings));
}

function useSavedToast() {
  const [show, setShow] = useState(false);
  const trigger = useCallback(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 1200);
    return () => clearTimeout(t);
  }, []);
  return { show, trigger };
}

function fmt$(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

/* ── Toggle Switch ─────────────────────────────────────────────── */

function Toggle({
  value,
  onChange,
  activeColor = 'bg-[var(--green)]',
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  activeColor?: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
        value ? activeColor : 'bg-[var(--hover-bg)]'
      }`}
      aria-pressed={value}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ── Settings Row ──────────────────────────────────────────────── */

function Row({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  action,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3.5 py-3.5 ${
        onClick && !disabled ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          iconBg || 'bg-[var(--surface-bg)]'
        }`}
      >
        <Icon className={`w-4 h-4 ${iconColor || 'text-[var(--text-secondary)]'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-[var(--text-muted)] truncate">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
      {onClick && !action && (
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
      )}
    </div>
  );
}

/* ── Section Card ──────────────────────────────────────────────── */

function Section({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {title}
          </h3>
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

/* ── Divider ───────────────────────────────────────────────────── */

function Divider() {
  return <div className="h-px bg-[var(--border)] my-1" />;
}

/* ── Main Component ────────────────────────────────────────────── */

export default function SettingsPanel({ account }: Props) {
  const [risk, setRisk] = useState<RiskSettings>(RISK_DEFAULTS);
  const [notif, setNotif] = useState<NotificationSettings>(NOTIF_DEFAULTS);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [apiHealth, setApiHealth] = useState<'checking' | 'ok' | 'error'>('checking');
  const toast = useSavedToast();

  // Derived
  const isLive = account?.account?.tradingMode === 'live';
  const accountId = account?.account?.id || '—';
  const portfolioValue = account?.account?.portfolioValue || 0;
  const positionCount = account?.positions?.length || 0;
  const riskScore = account?.risk?.score ?? 0;
  const riskLevel = account?.risk?.level || 'N/A';

  // Load persisted settings
  useEffect(() => {
    setRisk(loadRisk());
    setNotif(loadNotif());
    setThemeState(getTheme());
  }, []);

  // Check Alpaca API health
  useEffect(() => {
    let cancelled = false;
    fetch('/api/account')
      .then((r) => {
        if (!cancelled) setApiHealth(r.ok ? 'ok' : 'error');
      })
      .catch(() => {
        if (!cancelled) setApiHealth('error');
      });
    return () => { cancelled = true; };
  }, []);

  const updateRisk = (patch: Partial<RiskSettings>) => {
    const next = { ...risk, ...patch };
    setRisk(next);
    saveRisk(next);
    toast.trigger();
  };

  const updateNotif = (patch: Partial<NotificationSettings>) => {
    const next = { ...notif, ...patch };
    setNotif(next);
    saveNotif(next);
    toast.trigger();
  };

  const resetRisk = () => {
    setRisk(RISK_DEFAULTS);
    saveRisk(RISK_DEFAULTS);
    toast.trigger();
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    setTheme(next);
    toast.trigger();
  };

  return (
    <div className="space-y-4">
      {/* Saved toast */}
      {toast.show && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-[var(--green)] text-[var(--text-inverse)] text-xs font-bold px-4 py-2 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2">
          Saved
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TRADING MODE BANNER — very obvious, full width
          ═══════════════════════════════════════════════════════════ */}
      <div
        className={`rounded-2xl border p-4 flex items-center gap-4 ${
          isLive
            ? 'bg-[var(--red)]/10 border-[var(--red)]/25'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isLive ? 'bg-[var(--red)]/20' : 'bg-amber-500/15'
          }`}
        >
          <Shield
            className={`w-6 h-6 ${isLive ? 'text-[var(--red)]' : 'text-amber-400'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold ${
              isLive ? 'text-[var(--red)]' : 'text-amber-400'
            }`}
          >
            {isLive ? '🔴 LIVE TRADING' : '🟡 PAPER TRADING'}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            {isLive
              ? 'Real money is at stake. All safeguards are active.'
              : 'Simulated environment. No real money at risk.'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${
              isLive
                ? 'bg-[var(--red)]/20 text-[var(--red)]'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {isLive ? (
              <>
                <XCircle className="w-3 h-3" /> LIVE
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3" /> SAFE
              </>
            )}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PROFILE SECTION
          ═══════════════════════════════════════════════════════════ */}
      <Section>
        <Row
          icon={User}
          iconBg="bg-[var(--accent)]/10"
          iconColor="text-[var(--accent)]"
          title="Trading Account"
          subtitle={`ID: ${accountId}`}
          action={
            <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--app-bg)] px-2 py-1 rounded-full border border-[var(--border)]">
              {account?.account?.status || 'ACTIVE'}
            </span>
          }
        />
        <Divider />
        <div className="grid grid-cols-2 gap-3 py-3">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-0.5">
              Portfolio
            </p>
            <p className="text-base font-bold font-mono text-[var(--text-primary)]">
              {fmt$(portfolioValue)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-0.5">
              Positions
            </p>
            <p className="text-base font-bold font-mono text-[var(--text-primary)]">
              {positionCount}
            </p>
          </div>
        </div>
        <Divider />
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Risk Score</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {riskLevel} · {riskScore.toFixed(0)}/100
            </p>
          </div>
          <div className="w-24 h-2 bg-[var(--app-bg)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                riskScore > 70
                  ? 'bg-[var(--red)]'
                  : riskScore > 40
                  ? 'bg-[var(--accent)]'
                  : 'bg-[var(--green)]'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
            />
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          ALPACA CONNECTION
          ═══════════════════════════════════════════════════════════ */}
      <Section title="Broker Connection">
        <Row
          icon={apiHealth === 'ok' ? Link2 : Link2Off}
          iconBg={apiHealth === 'ok' ? 'bg-[var(--green)]/10' : 'bg-[var(--red)]/10'}
          iconColor={apiHealth === 'ok' ? 'text-[var(--green)]' : 'text-[var(--red)]'}
          title="Alpaca API"
          subtitle={
            apiHealth === 'checking'
              ? 'Checking connection…'
              : apiHealth === 'ok'
              ? 'Connected and responding'
              : 'Connection error — check credentials'
          }
          action={
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                apiHealth === 'ok'
                  ? 'bg-[var(--green)]/10 text-[var(--green)]'
                  : apiHealth === 'checking'
                  ? 'bg-[var(--app-bg)] text-[var(--text-muted)]'
                  : 'bg-[var(--red)]/10 text-[var(--red)]'
              }`}
            >
              {apiHealth === 'ok' ? 'ONLINE' : apiHealth === 'checking' ? '…' : 'ERROR'}
            </span>
          }
        />
        <Divider />
        <Row
          icon={Server}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Trading Mode"
          subtitle={isLive ? 'Live market orders' : 'Paper / simulation'}
          action={
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                isLive
                  ? 'bg-[var(--red)]/10 text-[var(--red)]'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              {isLive ? 'LIVE' : 'PAPER'}
            </span>
          }
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          RISK SETTINGS
          ═══════════════════════════════════════════════════════════ */}
      <Section title="Risk Settings">
        {/* Max Position Size */}
        <div className="py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Max Position Size
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                No position exceeds this % of portfolio
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-[var(--accent)]">
              {risk.maxPositionSize}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={risk.maxPositionSize}
            onChange={(e) => updateRisk({ maxPositionSize: Number(e.target.value) })}
            className="w-full h-2 bg-[var(--app-bg)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
          />
        </div>

        <Divider />

        {/* Max Daily Loss */}
        <div className="py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Max Daily Loss
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Halt trading if unrealized loss exceeds this
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-[var(--accent)]">
              {risk.maxDailyLoss}%
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={risk.maxDailyLoss}
            onChange={(e) => updateRisk({ maxDailyLoss: Number(e.target.value) })}
            className="w-full h-2 bg-[var(--app-bg)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
          />
        </div>

        <Divider />

        {/* Shorting Toggle */}
        <Row
          icon={SlidersHorizontal}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Short Selling"
          subtitle="Allow sell orders without existing position"
          action={
            <Toggle
              value={risk.enableShorting}
              onChange={(v) => updateRisk({ enableShorting: v })}
              activeColor="bg-[var(--red)]"
            />
          }
        />

        <Divider />

        {/* After-Hours Toggle */}
        <Row
          icon={Moon}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="After-Hours Trading"
          subtitle="Submit orders outside 9:30 AM – 4:00 PM ET"
          action={
            <Toggle
              value={risk.allowAfterHours}
              onChange={(v) => updateRisk({ allowAfterHours: v })}
            />
          }
        />

        <Divider />

        {/* Reset */}
        <button
          onClick={resetRisk}
          className="w-full flex items-center justify-center gap-2 py-3 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to defaults
        </button>
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          NOTIFICATIONS
          ═══════════════════════════════════════════════════════════ */}
      <Section title="Notifications">
        <Row
          icon={Bell}
          iconBg="bg-[var(--accent)]/10"
          iconColor="text-[var(--accent)]"
          title="Order Alerts"
          subtitle="Push when orders fill or fail"
          action={
            <Toggle
              value={notif.orderAlerts}
              onChange={(v) => updateNotif({ orderAlerts: v })}
            />
          }
        />
        <Divider />
        <Row
          icon={Bell}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Price Alerts"
          subtitle="Target hit and significant moves"
          action={
            <Toggle
              value={notif.priceAlerts}
              onChange={(v) => updateNotif({ priceAlerts: v })}
            />
          }
        />
        <Divider />
        <Row
          icon={Mail}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="News Alerts"
          subtitle="Keyword-matched news notifications"
          action={
            <Toggle
              value={notif.newsAlerts}
              onChange={(v) => updateNotif({ newsAlerts: v })}
            />
          }
        />
        <Divider />
        <Row
          icon={Server}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Macro Events"
          subtitle="FOMC, CPI, jobs reports, OPEX"
          action={
            <Toggle
              value={notif.macroAlerts}
              onChange={(v) => updateNotif({ macroAlerts: v })}
            />
          }
        />
        <Divider />
        <Row
          icon={Smartphone}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Telegram"
          subtitle="Send alerts to your Telegram bot"
          action={
            <Toggle
              value={notif.telegramEnabled}
              onChange={(v) => updateNotif({ telegramEnabled: v })}
            />
          }
        />
        <Divider />
        <Row
          icon={notif.desktopEnabled ? Bell : BellOff}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Desktop Push"
          subtitle="Browser notification badges"
          action={
            <Toggle
              value={notif.desktopEnabled}
              onChange={(v) => updateNotif({ desktopEnabled: v })}
            />
          }
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          APPEARANCE
          ═══════════════════════════════════════════════════════════ */}
      <Section title="Appearance">
        <Row
          icon={theme === 'dark' ? Moon : Sun}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title={theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          subtitle="Toggle app theme"
          action={
            <Toggle
              value={theme === 'dark'}
              onChange={toggleTheme}
              activeColor="bg-amber-500"
            />
          }
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          SECURITY
          ═══════════════════════════════════════════════════════════ */}
      <Section title="Security">
        <Row
          icon={Lock}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Local-Only Settings"
          subtitle="Risk & notification prefs stored on this device"
        />
        <Divider />
        <Row
          icon={Shield}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="No Server-Side Enforcement"
          subtitle="Redeploy to change hard limits"
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          API / ENVIRONMENT
          ═══════════════════════════════════════════════════════════ */}
      <Section title="Environment">
        <Row
          icon={Cpu}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="API Mode"
          subtitle="Alpaca brokerage endpoint"
          action={
            <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--app-bg)] px-2 py-1 rounded-full border border-[var(--border)]">
              {isLive ? 'LIVE' : 'PAPER'}
            </span>
          }
        />
        <Divider />
        <Row
          icon={Server}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Rate Limit"
          subtitle="30 requests / minute"
        />
        <Divider />
        <Row
          icon={ExternalLink}
          iconBg="bg-[var(--surface-bg)]"
          iconColor="text-[var(--text-secondary)]"
          title="Alpaca Dashboard"
          subtitle="Open broker dashboard in browser"
          onClick={() =>
            window.open(
              'https://app.alpaca.markets/',
              '_blank',
              'noopener,noreferrer'
            )
          }
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          AUTONOMOUS TRADING LINK
          ═══════════════════════════════════════════════════════════ */}
      <a
        href="/settings/autonomous"
        className="block bg-[var(--card-bg)] rounded-2xl border border-[var(--red)]/20 overflow-hidden active:scale-[0.98] transition-transform"
      >
        <div className="px-4 py-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[var(--red)]/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-[var(--red)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--red)]">Autonomous Trading</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Configure AI-powered automatic trading
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--red)]/50 flex-shrink-0" />
        </div>
      </a>

      {/* ═══════════════════════════════════════════════════════════
          APP VERSION
          ═══════════════════════════════════════════════════════════ */}
      <div className="text-center py-4 space-y-1">
        <p className="text-[10px] text-[var(--text-subtle)]">
          Alpaca Trading Terminal v0.1.0
        </p>
        <p className="text-[10px] text-[var(--text-subtle)]">
          Built with Next.js · Alpaca API · Recharts
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DISCLAIMER
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex items-start gap-2.5 text-[10px] text-[var(--text-muted)] px-1 pb-6">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-[var(--text-subtle)]" />
        <p className="leading-relaxed">
          These settings are stored locally in your browser. Server-side enforcement
          requires a redeploy with updated environment variables. Paper trading is
          strongly recommended for testing strategies.
        </p>
      </div>
    </div>
  );
}
