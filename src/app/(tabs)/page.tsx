'use client'

import { useDashboard } from '@/lib/dashboard-context'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShoppingCart,
  Brain,
  Zap,
  Wallet,
  Activity,
} from 'lucide-react'
import MarketIndicesBar from '@/components/MarketIndicesBar'
import PositionRow from '@/components/PositionRow'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

function fmt$(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

interface Basket {
  id: string
  name: string
  emoji: string
  description: string
  theme: string
  status: string
  created_at: string
}

interface BasketPosition {
  id: string
  basket_id: string
  symbol: string
  company: string
  sector: string
  qty: number
  market_value: number
  unrealized_pl: number
  unrealized_pl_pct: number
  current_price: number
  avg_entry_price: number
  sub_theme: string
  basket_name: string
  emoji: string
}

function PortfolioSparkline({ data }: { data: { date: string; value: number }[] }) {
  if (data.length === 0) return null
  const isUp = data[data.length - 1].value >= data[0].value

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
              if (!payload?.length) return null
              const v = payload[0].value as number
              return (
                <div className="bg-[#0d1117] border border-[#1f2937] rounded px-2 py-1 text-[10px] text-[#f9fafb]">
                  {fmt$(v)}
                </div>
              )
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Sell Modal ──────────────────────────────────────────────────

function SellModal({
  symbol,
  qty,
  marketValue,
  onConfirm,
  onCancel,
}: {
  symbol: string
  qty: number
  marketValue: number
  onConfirm: (qtyToSell: number) => void
  onCancel: () => void
}) {
  const [sellAll, setSellAll] = useState(true)
  const [partialQty, setPartialQty] = useState('')

  const qtyToSell = sellAll ? qty : parseInt(partialQty) || 0
  const estimatedProceeds = qtyToSell * (marketValue / qty)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-t-2xl w-full max-w-lg p-6 animate-slide-up">
        <h3 className="text-white font-semibold text-lg mb-1">Sell {symbol}</h3>
        <p className="text-slate-400 text-sm mb-4">
          {qty} shares · {fmt$(marketValue)}
        </p>

        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800 cursor-pointer">
            <input
              type="radio"
              checked={sellAll}
              onChange={() => setSellAll(true)}
              className="accent-cyan-500"
            />
            <span className="text-white text-sm">All ({qty} shares)</span>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800 cursor-pointer">
            <input
              type="radio"
              checked={!sellAll}
              onChange={() => setSellAll(false)}
              className="accent-cyan-500"
            />
            <span className="text-white text-sm">Partial:</span>
            <input
              type="number"
              value={partialQty}
              onChange={(e) => setPartialQty(e.target.value)}
              disabled={sellAll}
              placeholder="Shares"
              className="w-24 bg-slate-700 rounded-lg px-3 py-1.5 text-white text-sm border border-slate-600 disabled:opacity-50"
              min={1}
              max={qty}
            />
          </label>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          Est. proceeds:{' '}
          <span className="text-white font-semibold">{fmt$(estimatedProceeds)}</span>{' '}
          at market price
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(qtyToSell)}
            disabled={qtyToSell <= 0}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            Confirm Sell
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Basket Sell Modal ────────────────────────────────────────────

function BasketSellModal({
  basket,
  positions,
  onConfirm,
  onCancel,
}: {
  basket: Basket
  positions: BasketPosition[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const total = positions.reduce((s, p) => s + (p.market_value || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-t-2xl w-full max-w-lg p-6 animate-slide-up">
        <h3 className="text-white font-semibold text-lg mb-1">
          Sell {basket.emoji} {basket.name}
        </h3>
        <div className="space-y-2 my-4 max-h-60 overflow-y-auto">
          {positions.map((p) => (
            <div key={p.symbol} className="flex justify-between text-sm">
              <span className="text-slate-300">
                {p.symbol} · {p.qty || 0} shares
              </span>
              <span className="text-slate-400">{fmt$(p.market_value || 0)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm font-semibold mb-2 py-2 border-t border-slate-700">
          <span className="text-white">Total</span>
          <span className="text-white">
            {fmt$(total)} · {positions.length} orders at market price
          </span>
        </div>
        <p className="text-yellow-400 text-xs mb-4">
          ⚠️ All orders execute at current market price
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold"
          >
            Confirm & Sell All
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sell Portfolio Modal ─────────────────────────────────────────

function SellPortfolioModal({
  baskets,
  basketPositions,
  coreHoldings,
  onCancel,
}: {
  baskets: Basket[]
  basketPositions: BasketPosition[]
  coreHoldings: any[]
  onCancel: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [executing, setExecuting] = useState(false)

  const basketTotal = basketPositions.reduce((s, p) => s + (p.market_value || 0), 0)
  const coreTotal = coreHoldings.reduce((s: number, p: any) => s + (p.marketValue || 0), 0)
  const totalValue = basketTotal + coreTotal
  const totalOrders = basketPositions.length + coreHoldings.length

  const handleConfirm = async () => {
    if (confirmText !== 'SELL') return
    setExecuting(true)

    const allOrders = [
      ...basketPositions.map((p) => ({ symbol: p.symbol, qty: p.qty || 0, side: 'sell' as const })),
      ...coreHoldings.map((p: any) => ({ symbol: p.symbol, qty: p.qty || 0, side: 'sell' as const })),
    ]

    try {
      await fetch('/api/positions/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'default' },
        body: JSON.stringify({ orders: allOrders }),
      })
    } catch (err) {
      console.error('Sell all error:', err)
    }

    setExecuting(false)
    onCancel()
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-t-2xl w-full max-w-lg p-6 animate-slide-up">
        <h3 className="text-white font-semibold text-lg mb-1">⚠️ Sell Entire Portfolio</h3>
        <div className="space-y-2 my-4 max-h-40 overflow-y-auto">
          {baskets.map((b) => {
            const bps = basketPositions.filter((p) => p.basket_id === b.id)
            const bTotal = bps.reduce((s, p) => s + (p.market_value || 0), 0)
            return (
              <div key={b.id} className="flex justify-between text-sm">
                <span className="text-slate-300">
                  {b.emoji} {b.name}
                </span>
                <span className="text-slate-400">
                  {fmt$(bTotal)} · {bps.length} positions
                </span>
              </div>
            )
          })}
          {coreHoldings.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">📊 Core Holdings</span>
              <span className="text-slate-400">
                {fmt$(coreTotal)} · {coreHoldings.length} positions
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-between text-sm font-semibold mb-2 py-2 border-t border-slate-700">
          <span className="text-white">Total</span>
          <span className="text-white">
            {fmt$(totalValue)} · {totalOrders} orders
          </span>
        </div>
        <p className="text-red-400 text-sm mb-4">This will liquidate your entire portfolio.</p>
        <p className="text-slate-400 text-xs mb-2">Type SELL to confirm:</p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="SELL"
          className="w-full bg-slate-800 rounded-xl px-4 py-3 text-white text-sm border border-slate-600 mb-4"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmText !== 'SELL' || executing}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {executing ? 'Executing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────

export default function HomePage() {
  const { account, orders, refreshAll } = useDashboard()
  const router = useRouter()
  const [sparkData, setSparkData] = useState<{ date: string; value: number }[]>([])

  // New state
  const [baskets, setBaskets] = useState<Basket[]>([])
  const [basketPositions, setBasketPositions] = useState<BasketPosition[]>([])
  const [expandedBaskets, setExpandedBaskets] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set())
  const [sellTarget, setSellTarget] = useState<any>(null)
  const [showBasketSellModal, setShowBasketSellModal] = useState<Basket | null>(null)
  const [showPortfolioSellModal, setShowPortfolioSellModal] = useState(false)
  const [loadingBaskets, setLoadingBaskets] = useState(true)

  // Portfolio data
  const portfolioValue = account?.account?.portfolioValue || 0
  const cash = account?.account?.cash || 0
  const buyingPower = account?.account?.buyingPower || 0
  const equity = account?.account?.equity || 0
  const positions = account?.positions || []

  const totalPL = positions.reduce((s, p) => s + (p.unrealizedPL || 0), 0)
  const totalCost = positions.reduce((s, p) => s + (p.avgEntryPrice * p.qty), 0)
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0
  const isProfitable = totalPL >= 0

  const dayPL = positions.reduce((s, p) => s + (p.changeToday || 0) * p.qty, 0)
  const isDayProfitable = dayPL >= 0

  const recentOrders = orders.slice(0, 3)

  // Fetch baskets data
  useEffect(() => {
    async function fetchBaskets() {
      setLoadingBaskets(true)
      try {
        const [bRes, pRes] = await Promise.all([
          fetch('/api/baskets', { headers: { 'x-user-id': 'default' } }),
          fetch('/api/baskets/positions', { headers: { 'x-user-id': 'default' } }),
        ])
        const bData = await bRes.json()
        const pData = await pRes.json()
        setBaskets(bData.baskets || [])
        setBasketPositions(pData.positions || [])
      } catch (err) {
        console.error('Failed to fetch baskets:', err)
      }
      setLoadingBaskets(false)
    }
    fetchBaskets()
  }, [])

  // Sparkline
  useEffect(() => {
    fetch('/api/portfolio/history?period=1M&timeframe=1D')
      .then((r) => r.json())
      .then(({ history }) => {
        if (history?.timestamp) {
          const data = history.timestamp.slice(-7).map((ts: number, i: number) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            value: parseFloat(history.equity?.[history.timestamp.length - 7 + i] || 0),
          }))
          setSparkData(data)
        }
      })
      .catch(() => {})
  }, [])

  // Derive core holdings
  const basketPositionSymbols = useMemo(
    () => new Set(basketPositions.map((p) => p.symbol)),
    [basketPositions]
  )

  const coreHoldings = useMemo(
    () => positions.filter((p) => !basketPositionSymbols.has(p.symbol)),
    [positions, basketPositionSymbols]
  )

  const coreTotal = coreHoldings.reduce((s, p) => s + p.marketValue, 0)
  const corePnL = coreHoldings.reduce((s, p) => s + (p.unrealizedPL || 0), 0)
  const coreCost = coreHoldings.reduce((s, p) => s + p.avgEntryPrice * p.qty, 0)
  const corePnLPct = coreCost > 0 ? (corePnL / coreCost) * 100 : 0

  // Helpers
  const toggleBasket = (id: string) => {
    setExpandedBaskets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelect = (symbol: string) => {
    setSelectedPositions((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }

  const handleSellPosition = (position: any) => {
    setSellTarget(position)
  }

  const handleConfirmSell = async (qtyToSell: number) => {
    if (!sellTarget) return
    try {
      await fetch('/api/positions/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'default' },
        body: JSON.stringify({
          orders: [{ symbol: sellTarget.symbol, qty: qtyToSell, side: 'sell' }],
        }),
      })
    } catch (err) {
      console.error('Sell error:', err)
    }
    setSellTarget(null)
    refreshAll()
  }

  const handleSellBasket = (basket: Basket) => {
    setShowBasketSellModal(basket)
  }

  const handleConfirmBasketSell = async () => {
    if (!showBasketSellModal) return
    const bps = basketPositions.filter((p) => p.basket_id === showBasketSellModal.id)
    const orders = bps.map((p) => ({ symbol: p.symbol, qty: p.qty || 0, side: 'sell' as const }))
    try {
      await fetch('/api/positions/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'default' },
        body: JSON.stringify({ orders, basketId: showBasketSellModal.id }),
      })
    } catch (err) {
      console.error('Basket sell error:', err)
    }
    setShowBasketSellModal(null)
    refreshAll()
  }

  const handleSellCore = async () => {
    const orders = coreHoldings.map((p) => ({ symbol: p.symbol, qty: p.qty, side: 'sell' as const }))
    try {
      await fetch('/api/positions/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'default' },
        body: JSON.stringify({ orders }),
      })
    } catch (err) {
      console.error('Core sell error:', err)
    }
    refreshAll()
  }

  const handleSellSelected = async () => {
    const allPositions = [...positions, ...basketPositions.map((p) => ({ ...p, unrealizedPL: p.unrealized_pl, unrealizedPLPercent: p.unrealized_pl_pct, marketValue: p.market_value, avgEntryPrice: p.avg_entry_price }))]
    const selected = allPositions.filter((p: any) => selectedPositions.has(p.symbol))
    const orders = selected.map((p: any) => ({ symbol: p.symbol, qty: p.qty || 0, side: 'sell' as const }))
    try {
      await fetch('/api/positions/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'default' },
        body: JSON.stringify({ orders }),
      })
    } catch (err) {
      console.error('Multi sell error:', err)
    }
    setIsSelectMode(false)
    setSelectedPositions(new Set())
    refreshAll()
  }

  // Selected total for bottom bar
  const selectedTotal = useMemo(() => {
    const all = [...positions.map((p) => ({ symbol: p.symbol, value: p.marketValue }))]
    return all.filter((p) => selectedPositions.has(p.symbol)).reduce((s, p) => s + p.value, 0)
  }, [positions, selectedPositions])

  return (
    <div className="space-y-4">
      {/* ===== HERO CARD ===== */}
      <div className="bg-gradient-to-br from-[#161920] to-[#111318] rounded-2xl border border-[#1f2937] p-5 relative overflow-hidden">
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
          <PortfolioSparkline data={sparkData} />
        </div>
      </div>

      {/* ===== BUYING POWER + EQUITY CARDS ===== */}
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

      {/* ===== ACTION BAR ===== */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setIsSelectMode(!isSelectMode)
            setSelectedPositions(new Set())
          }}
          className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition ${
            isSelectMode
              ? 'bg-cyan-500/10 border-cyan-400 text-cyan-400'
              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-400/50'
          }`}
        >
          {isSelectMode ? 'Done Selecting' : '☰ Select & Sell'}
        </button>
        <button
          onClick={() => router.push('/baskets/create')}
          className="flex-1 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm font-semibold hover:border-[var(--accent)] transition"
        >
          + Create Basket
        </button>
      </div>

      {/* ===== HIERARCHICAL POSITIONS ===== */}
      {loadingBaskets ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-slate-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Basket Groups */}
          {baskets.map((basket) => {
            const bps = basketPositions.filter((p) => p.basket_id === basket.id)
            const bTotal = bps.reduce((s, p) => s + (p.market_value || 0), 0)
            const bCost = bps.reduce((s, p) => s + (p.avg_entry_price || 0) * (p.qty || 0), 0)
            const bPnL = bps.reduce((s, p) => s + (p.unrealized_pl || 0), 0)
            const bPnLPct = bCost > 0 ? (bPnL / bCost) * 100 : 0
            const isExpanded = expandedBaskets.has(basket.id)

            return (
              <div key={basket.id}>
                {/* Basket Header */}
                <div
                  onClick={() => toggleBasket(basket.id)}
                  className="flex items-center justify-between bg-slate-800 rounded-xl p-4 mb-1 cursor-pointer hover:bg-slate-800/80 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{basket.emoji}</span>
                    <div>
                      <p className="text-white font-medium text-sm">{basket.name}</p>
                      <p className="text-slate-400 text-xs">
                        {bps.length} positions · {fmt$(bTotal)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${bPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {bPnL >= 0 ? '+' : ''}
                      {bPnLPct.toFixed(1)}%
                    </span>
                    <span className="text-slate-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Basket Positions */}
                {isExpanded && (
                  <div className="ml-4 mb-2">
                    {bps.map((pos) => (
                      <PositionRow
                        key={pos.symbol}
                        position={{
                          symbol: pos.symbol,
                          qty: pos.qty || 0,
                          marketValue: pos.market_value || 0,
                          unrealizedPL: pos.unrealized_pl,
                          unrealizedPLPercent: pos.unrealized_pl_pct,
                          currentPrice: pos.current_price || 0,
                          avgEntryPrice: pos.avg_entry_price,
                          sector: pos.sector,
                        }}
                        onSell={() =>
                          handleSellPosition({
                            symbol: pos.symbol,
                            qty: pos.qty || 0,
                            marketValue: pos.market_value || 0,
                            currentPrice: pos.current_price || 0,
                          })
                        }
                        showBasketBadge={false}
                        isSelectable={isSelectMode}
                        isSelected={selectedPositions.has(pos.symbol)}
                        onSelect={() => toggleSelect(pos.symbol)}
                      />
                    ))}
                    <button
                      onClick={() => handleSellBasket(basket)}
                      className="w-full mt-2 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition"
                    >
                      Sell Entire Basket
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Core Holdings */}
          {coreHoldings.length > 0 && (
            <div>
              <div className="flex items-center justify-between bg-slate-800 rounded-xl p-4 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  <div>
                    <p className="text-white font-medium text-sm">Core Holdings</p>
                    <p className="text-slate-400 text-xs">
                      {coreHoldings.length} positions · {fmt$(coreTotal)}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${corePnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {corePnL >= 0 ? '+' : ''}
                  {corePnLPct.toFixed(1)}%
                </span>
              </div>

              <div className="ml-4 mb-2">
                {coreHoldings.map((pos) => (
                  <PositionRow
                    key={pos.symbol}
                    position={{
                      symbol: pos.symbol,
                      qty: pos.qty,
                      marketValue: pos.marketValue,
                      unrealizedPL: pos.unrealizedPL,
                      unrealizedPLPercent: pos.unrealizedPLPercent,
                      currentPrice: pos.currentPrice,
                      avgEntryPrice: pos.avgEntryPrice,
                      sector: '',
                    }}
                    onSell={() =>
                      handleSellPosition({
                        symbol: pos.symbol,
                        qty: pos.qty,
                        marketValue: pos.marketValue,
                        currentPrice: pos.currentPrice,
                      })
                    }
                    isSelectable={isSelectMode}
                    isSelected={selectedPositions.has(pos.symbol)}
                    onSelect={() => toggleSelect(pos.symbol)}
                  />
                ))}
                {coreHoldings.length > 0 && (
                  <button
                    onClick={handleSellCore}
                    className="w-full mt-2 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition"
                  >
                    Sell All Core Holdings
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {positions.length === 0 && baskets.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <p className="text-lg mb-1">No positions yet</p>
              <p className="text-sm">Start trading to build your portfolio</p>
            </div>
          )}
        </>
      )}

      {/* ===== SELL ENTIRE PORTFOLIO ===== */}
      {positions.length > 0 && (
        <button
          onClick={() => setShowPortfolioSellModal(true)}
          className="w-full py-3 rounded-xl border border-red-600/40 text-red-400 text-sm font-semibold hover:bg-red-500/10 transition"
        >
          ⚠️ Sell Entire Portfolio
        </button>
      )}

      {/* ===== RECENT ORDERS ===== */}
      {recentOrders.length > 0 && (
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-[var(--text-primary)]">Recent Orders</span>
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

      {/* ===== MODALS ===== */}
      {sellTarget && (
        <SellModal
          symbol={sellTarget.symbol}
          qty={sellTarget.qty}
          marketValue={sellTarget.marketValue}
          onConfirm={handleConfirmSell}
          onCancel={() => setSellTarget(null)}
        />
      )}

      {showBasketSellModal && (
        <BasketSellModal
          basket={showBasketSellModal}
          positions={basketPositions.filter((p) => p.basket_id === showBasketSellModal.id)}
          onConfirm={handleConfirmBasketSell}
          onCancel={() => setShowBasketSellModal(null)}
        />
      )}

      {showPortfolioSellModal && (
        <SellPortfolioModal
          baskets={baskets}
          basketPositions={basketPositions}
          coreHoldings={coreHoldings}
          onCancel={() => setShowPortfolioSellModal(false)}
        />
      )}

      {/* ===== MULTI-SELECT BOTTOM BAR ===== */}
      {isSelectMode && selectedPositions.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
          <div className="bg-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-2xl border border-slate-700">
            <div>
              <p className="text-white font-medium text-sm">{selectedPositions.size} selected</p>
              <p className="text-slate-400 text-xs">{fmt$(selectedTotal)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsSelectMode(false)
                  setSelectedPositions(new Set())
                }}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-400 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSellSelected}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium"
              >
                Sell Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
