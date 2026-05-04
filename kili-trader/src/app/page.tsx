'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Shield,
  Scan,
  Activity,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
} from 'lucide-react';

interface AccountData {
  account: {
    cash: number;
    portfolioValue: number;
    buyingPower: number;
    equity: number;
    dayTradeCount: number;
    status: string;
  };
  positions: Array<{
    symbol: string;
    qty: number;
    marketValue: number;
    avgEntryPrice: number;
    currentPrice: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    changeToday: number;
  }>;
  risk: {
    totalExposure: number;
    unrealizedPnL: number;
    pnlPercent: number;
    largestPosition: number;
    largestPositionPercent: number;
  };
}

interface ScanSignal {
  symbol: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  rsi: number;
  signal: string;
  score: number;
  reason: string[];
}

interface MarketStatus {
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-slate-800">{value}</p>
          {sub && <p className="text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [signals, setSignals] = useState<ScanSignal[]>([]);
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);

  const fetchAccount = async () => {
    try {
      const res = await fetch('/api/account');
      const json = await res.json();
      if (!json.error) setAccount(json);
    } catch (err) {
      console.error('Account fetch failed:', err);
    }
  };

  const fetchMarket = async () => {
    try {
      const res = await fetch('/api/market');
      const json = await res.json();
      if (!json.error) setMarket(json);
    } catch (err) {
      console.error('Market fetch failed:', err);
    }
  };

  const runScan = async () => {
    setScanLoading(true);
    try {
      const res = await fetch('/api/scan');
      const json = await res.json();
      if (!json.error) setSignals(json.signals);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchAccount(), fetchMarket(), runScan()]);
      setLoading(false);
    };
    init();

    const interval = setInterval(() => {
      fetchAccount();
      fetchMarket();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <Zap className="w-8 h-8 text-amber-500 animate-pulse mx-auto mb-3" />
          <p className="text-slate-500">Loading Kili Trader...</p>
        </div>
      </div>
    );
  }

  const unrealizedPL = account?.risk?.unrealizedPnL || 0;
  const isProfitable = unrealizedPL >= 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500 p-2 rounded-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Kili Trader</h1>
                <p className="text-xs text-slate-500">Paper Trading · Risk-First Approach</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {market && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  market.isOpen
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  <Activity className="w-4 h-4" />
                  {market.isOpen ? 'Market Open' : 'Market Closed'}
                </div>
              )}
              <button
                onClick={runScan}
                disabled={scanLoading}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
              >
                <Scan className="w-4 h-4" />
                {scanLoading ? 'Scanning...' : 'Scan'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Account Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Portfolio"
            value={`$${(account?.account.portfolioValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`Cash: $${(account?.account.cash || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color="bg-emerald-500"
          />
          <StatCard
            icon={isProfitable ? TrendingUp : TrendingDown}
            label="Unrealized P&L"
            value={`${isProfitable ? '+' : ''}$${unrealizedPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`${(account?.risk.pnlPercent || 0).toFixed(2)}%`}
            color={isProfitable ? 'bg-emerald-500' : 'bg-red-500'}
          />
          <StatCard
            icon={Shield}
            label="Buying Power"
            value={`$${(account?.account.buyingPower || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="Leverage-enabled"
            color="bg-blue-500"
          />
          <StatCard
            icon={AlertTriangle}
            label="Day Trades"
            value={`${account?.account.dayTradeCount || 0}/3`}
            sub="Pattern day trade rule"
            color="bg-amber-500"
          />
        </div>

        {/* Open Positions */}
        {account && account.positions.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold text-slate-800">Open Positions</h2>
              <span className="text-xs text-slate-400">({account.positions.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 pr-4">Symbol</th>
                    <th className="pb-2 pr-4">Qty</th>
                    <th className="pb-2 pr-4">Entry</th>
                    <th className="pb-2 pr-4">Current</th>
                    <th className="pb-2 pr-4">Market Value</th>
                    <th className="pb-2 pr-4">P&L</th>
                    <th className="pb-2">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {account.positions.map((pos) => (
                    <tr key={pos.symbol} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-4 font-medium">{pos.symbol}</td>
                      <td className="py-2 pr-4">{pos.qty}</td>
                      <td className="py-2 pr-4">${pos.avgEntryPrice.toFixed(2)}</td>
                      <td className="py-2 pr-4">${pos.currentPrice.toFixed(2)}</td>
                      <td className="py-2 pr-4">${pos.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className={`py-2 pr-4 font-medium ${pos.unrealizedPL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL.toFixed(2)}
                      </td>
                      <td className={`py-2 ${pos.unrealizedPLPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {pos.unrealizedPLPercent >= 0 ? '+' : ''}{pos.unrealizedPLPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scanner Signals */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Scan className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-slate-800">Scanner Signals</h2>
            </div>
            <button
              onClick={runScan}
              disabled={scanLoading}
              className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50"
            >
              {scanLoading ? 'Scanning...' : 'Refresh'}
            </button>
          </div>

          {signals.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Scan className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No signals detected</p>
              <p className="text-xs mt-1">Market may be quiet or no setups match criteria</p>
            </div>
          ) : (
            <div className="space-y-3">
              {signals.slice(0, 10).map((signal) => (
                <div
                  key={signal.symbol}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <p className="font-bold text-slate-800">{signal.symbol}</p>
                      <p className="text-xs text-slate-500">${signal.price.toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          signal.changePercent >= 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent.toFixed(1)}%
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {signal.signal}
                        </span>
                        <span className="text-xs text-slate-400">
                          Score: {signal.score}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        RSI {signal.rsi.toFixed(1)} · Vol {signal.volumeRatio.toFixed(1)}x avg
                      </p>
                      <p className="text-xs text-slate-400">
                        {signal.reason.join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {signal.changePercent >= 0 ? (
                      <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Entry Stub */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-purple-500" />
            <h2 className="font-semibold text-slate-800">Quick Order</h2>
          </div>
          <p className="text-sm text-slate-500">
            Order entry will be available after connecting your Alpaca API keys. 
            Set <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">ALPACA_API_KEY</code> and{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">ALPACA_SECRET_KEY</code> in your environment.
          </p>
        </div>
      </main>
    </div>
  );
}
