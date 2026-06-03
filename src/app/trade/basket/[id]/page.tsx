'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface BasketPosition {
  symbol: string
  company: string
  sector: string
  sub_theme: string
  composite_score: number
  conviction: string
  reasoning: string
  target_pct: number
  currentPrice: number
  is_watchlist_only: boolean
}

interface Basket {
  id: string
  name: string
  emoji: string
  description: string
  theme: string
  status: string
  created_at: string
  basket_positions: BasketPosition[]
}

interface OrderLine {
  symbol: string
  company: string
  subTheme: string
  compositeScore: number
  conviction: string
  qty: number
  orderType: string
  timeInForce: string
  limitPrice: number
  currentPrice: number
  skipped: boolean
}

interface OrderResult {
  symbol: string
  status: 'pending' | 'filled' | 'failed'
  error?: string
}

function fmt$(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function distributeByScore(budget: number, positions: BasketPosition[], orders: OrderLine[]): number[] {
  const filtered = positions.filter((_, i) => !orders[i]?.skipped)
  const totalScore = filtered.reduce((sum, p) => sum + (p.composite_score || 50), 0)
  return positions.map((p, i) => {
    if (orders[i]?.skipped) return 0
    const weight = (p.composite_score || 50) / totalScore
    const allocation = budget * weight
    const qty = Math.floor(allocation / (p.currentPrice || 1))
    return Math.max(1, qty)
  })
}

function distributeEqually(budget: number, positions: BasketPosition[], orders: OrderLine[]): number[] {
  const active = positions.filter((_, i) => !orders[i]?.skipped).length
  if (active === 0) return positions.map(() => 0)
  const perStock = budget / active
  return positions.map((p, i) => {
    if (orders[i]?.skipped) return 0
    const qty = Math.floor(perStock / (p.currentPrice || 1))
    return Math.max(1, qty)
  })
}

export default function BasketOrderPage() {
  const router = useRouter()
  const params = useParams()
  const basketId = params?.id as string

  const [basket, setBasket] = useState<Basket | null>(null)
  const [loading, setLoading] = useState(true)
  const [budget, setBudget] = useState<string>('')
  const [distribution, setDistribution] = useState<'score' | 'equal'>('score')
  const [orders, setOrders] = useState<OrderLine[]>([])
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [orderResults, setOrderResults] = useState<OrderResult[]>([])
  const [buyingPower, setBuyingPower] = useState(0)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [bRes, pRes] = await Promise.all([
          fetch(`/api/baskets/${basketId}`),
          fetch('/api/portfolio/summary'),
        ])

        const bData = await bRes.json()
        const pData = await pRes.json()

        setBasket(bData.basket || bData)
        setBuyingPower(pData.account?.buying_power || pData.buyingPower || 0)

        const positions = (bData.basket?.basket_positions || bData.basket_positions || []) as BasketPosition[]
        const initialOrders: OrderLine[] = positions.map((p) => ({
          symbol: p.symbol,
          company: p.company || '',
          subTheme: p.sub_theme || '',
          compositeScore: p.composite_score || 50,
          conviction: p.conviction || 'medium',
          qty: 1,
          orderType: 'market',
          timeInForce: 'day',
          limitPrice: p.currentPrice || 0,
          currentPrice: p.currentPrice || 0,
          skipped: false,
        }))
        setOrders(initialOrders)
      } catch (err) {
        console.error('Failed to fetch basket:', err)
      }
      setLoading(false)
    }
    fetchData()
  }, [basketId])

  const handleBudgetChange = useCallback(
    (value: string | number) => {
      const v = typeof value === 'number' ? String(value) : value
      setBudget(v)
      const num = parseFloat(v)
      if (isNaN(num) || num <= 0 || !basket) return

      const positions = basket.basket_positions || []
      const qtys =
        distribution === 'score'
          ? distributeByScore(num, positions, orders)
          : distributeEqually(num, positions, orders)

      setOrders((prev) =>
        prev.map((o, i) => ({ ...o, qty: qtys[i] || 0 }))
      )
    },
    [basket, distribution, orders]
  )

  const updateOrderQty = (symbol: string, qty: number) => {
    setOrders((prev) => prev.map((o) => (o.symbol === symbol ? { ...o, qty } : o)))
  }

  const updateOrderType = (symbol: string, orderType: string) => {
    setOrders((prev) => prev.map((o) => (o.symbol === symbol ? { ...o, orderType } : o)))
  }

  const updateOrderTIF = (symbol: string, timeInForce: string) => {
    setOrders((prev) => prev.map((o) => (o.symbol === symbol ? { ...o, timeInForce } : o)))
  }

  const updateLimitPrice = (symbol: string, limitPrice: number) => {
    setOrders((prev) => prev.map((o) => (o.symbol === symbol ? { ...o, limitPrice } : o)))
  }

  const handleSkipStock = (symbol: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.symbol === symbol ? { ...o, skipped: !o.skipped, qty: o.skipped ? 1 : 0 } : o))
    )
  }

  const activeOrders = useMemo(() => orders.filter((o) => !o.skipped && o.qty > 0), [orders])
  const totalCost = useMemo(
    () => activeOrders.reduce((s, o) => s + o.qty * o.currentPrice, 0),
    [activeOrders]
  )

  const handlePlaceAllOrders = async () => {
    setIsExecuting(true)
    setShowConfirmModal(false)

    const orderPayload = activeOrders.map((o) => ({
      symbol: o.symbol,
      qty: o.qty,
      side: 'buy',
      type: o.orderType,
      time_in_force: o.timeInForce,
      limit_price: o.orderType === 'limit' ? o.limitPrice : undefined,
    }))

    const initial: OrderResult[] = activeOrders.map((o) => ({
      symbol: o.symbol,
      status: 'pending',
    }))
    setOrderResults(initial)

    try {
      const res = await fetch(`/api/baskets/${basketId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'default' },
        body: JSON.stringify({ orders: orderPayload, distribution }),
      })

      const data = await res.json()

      if (data.results) {
        setOrderResults(
          data.results.map((r: any) => ({
            symbol: r.symbol,
            status: r.status || 'filled',
            error: r.error,
          }))
        )
      }
    } catch (err) {
      console.error('Execution error:', err)
      setOrderResults((prev) =>
        prev.map((r) => (r.status === 'pending' ? { ...r, status: 'failed' } : r))
      )
    }

    setIsComplete(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading basket…</p>
        </div>
      </div>
    )
  }

  if (!basket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Basket not found</p>
      </div>
    )
  }

  // Execution progress screen
  if (isExecuting) {
    const failedCount = orderResults.filter((r) => r.status === 'failed').length
    const filledCount = orderResults.filter((r) => r.status === 'filled').length
    const allDone = isComplete

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="text-4xl mb-6">{allDone ? (failedCount > 0 ? '⚠️' : '✅') : '⏳'}</div>

        <h2 className="text-white font-semibold text-xl mb-2">
          {allDone ? (failedCount > 0 ? 'Some Orders Failed' : 'Orders Placed!') : 'Placing Orders…'}
        </h2>
        <p className="text-slate-400 text-sm mb-8">
          {basket.emoji} {basket.name}
        </p>

        <div className="w-full max-w-sm">
          {orderResults.map((result) => (
            <div key={result.symbol} className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-white text-sm">{result.symbol}</span>
              <span>
                {result.status === 'pending' && <span className="text-slate-400 text-xs">⏳ Placing…</span>}
                {result.status === 'filled' && <span className="text-green-400 text-xs">✅ Placed</span>}
                {result.status === 'failed' && (
                  <span className="text-red-400 text-xs">❌ Failed{result.error ? ` · ${result.error}` : ''}</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {isComplete && (
          <div className="flex gap-3 mt-8 w-full max-w-sm">
            <button
              onClick={() => router.push('/orders')}
              className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm"
            >
              View Orders
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 rounded-xl bg-cyan-500 text-white text-sm font-semibold"
            >
              View Portfolio
            </button>
          </div>
        )}
      </div>
    )
  }

  // Main order review screen
  return (
    <div className="flex flex-col min-h-screen bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-800">
        <button onClick={() => router.back()} className="text-slate-400 text-lg px-1">
          ←
        </button>
        <div>
          <h1 className="text-white font-semibold text-lg">
            {basket.emoji} {basket.name}
          </h1>
          <p className="text-slate-400 text-xs">Review and place orders</p>
        </div>
      </div>

      {/* Budget Input */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-800">
        <p className="text-slate-400 text-xs mb-2">Total budget for this basket</p>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-lg">$</span>
          <input
            type="number"
            value={budget}
            onChange={(e) => handleBudgetChange(e.target.value)}
            className="bg-transparent text-white text-2xl font-semibold flex-1 outline-none"
            placeholder="0"
          />
        </div>
        <p className="text-slate-500 text-xs mt-1">Available: ${(buyingPower || 0).toLocaleString()}</p>

        {/* Quick budget buttons */}
        <div className="flex gap-2 mt-3">
          {[1000, 5000, 10000, 25000].map((amt) => (
            <button
              key={amt}
              onClick={() => handleBudgetChange(amt)}
              className="text-xs bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-600 transition"
            >
              ${(amt / 1000).toFixed(0)}K
            </button>
          ))}
        </div>

        {/* Distribution toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setDistribution('score')}
            className={`text-xs px-3 py-1.5 rounded-lg transition ${
              distribution === 'score' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            By AI Score
          </button>
          <button
            onClick={() => setDistribution('equal')}
            className={`text-xs px-3 py-1.5 rounded-lg transition ${
              distribution === 'equal' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            Equal Split
          </button>
        </div>
      </div>

      {/* Order Rows */}
      <div className="flex-1 overflow-y-auto p-4 pb-32">
        {orders.map((order) => (
          <div key={order.symbol} className="bg-slate-800 rounded-xl p-4 mb-3">
            {/* Stock header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">{order.symbol}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      order.conviction === 'high'
                        ? 'bg-green-500/20 text-green-400'
                        : order.conviction === 'medium'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-slate-600 text-slate-400'
                    }`}
                  >
                    {order.conviction}
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  {order.subTheme} · Score: {order.compositeScore}/100
                </p>
              </div>
              {/* Skip button */}
              <button
                onClick={() => handleSkipStock(order.symbol)}
                className={`text-xs px-2 py-1 rounded-lg border transition ${
                  order.skipped
                    ? 'border-slate-600 text-slate-600'
                    : 'border-slate-600 text-slate-400 hover:border-red-400 hover:text-red-400'
                }`}
              >
                {order.skipped ? 'Skipped' : 'Skip'}
              </button>
            </div>

            {!order.skipped && (
              <>
                {/* Qty and order type */}
                <div className="flex gap-2 mb-2">
                  <div className="flex-1 bg-slate-900 rounded-lg px-3 py-2">
                    <p className="text-slate-500 text-xs mb-0.5">Shares</p>
                    <input
                      type="number"
                      value={order.qty}
                      onChange={(e) => updateOrderQty(order.symbol, parseInt(e.target.value) || 0)}
                      className="bg-transparent text-white text-sm font-semibold w-full outline-none"
                    />
                  </div>

                  <div className="bg-slate-900 rounded-lg px-3 py-2">
                    <p className="text-slate-500 text-xs mb-0.5">Type</p>
                    <select
                      value={order.orderType}
                      onChange={(e) => updateOrderType(order.symbol, e.target.value)}
                      className="bg-transparent text-white text-sm font-semibold outline-none"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                      <option value="stop">Stop</option>
                    </select>
                  </div>

                  <div className="bg-slate-900 rounded-lg px-3 py-2">
                    <p className="text-slate-500 text-xs mb-0.5">TIF</p>
                    <select
                      value={order.timeInForce}
                      onChange={(e) => updateOrderTIF(order.symbol, e.target.value)}
                      className="bg-transparent text-white text-sm font-semibold outline-none"
                    >
                      <option value="day">Day</option>
                      <option value="gtc">GTC</option>
                    </select>
                  </div>
                </div>

                {/* Limit price input when limit selected */}
                {order.orderType === 'limit' && (
                  <div className="bg-slate-900 rounded-lg px-3 py-2 mb-2">
                    <p className="text-slate-500 text-xs mb-0.5">Limit Price</p>
                    <input
                      type="number"
                      step="0.01"
                      value={order.limitPrice}
                      onChange={(e) =>
                        updateLimitPrice(order.symbol, parseFloat(e.target.value) || 0)
                      }
                      className="bg-transparent text-white text-sm font-semibold w-full outline-none"
                    />
                  </div>
                )}

                {/* Est cost */}
                <p className="text-slate-500 text-xs text-right">
                  Est. ~${((order.qty || 0) * (order.currentPrice || 0)).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-14 left-0 right-0 p-4 border-t border-slate-800 bg-slate-900 z-30">
        <div className="flex justify-between mb-3">
          <span className="text-slate-400 text-sm">{activeOrders.length} orders</span>
          <span className="text-white font-semibold">~${totalCost.toLocaleString()}</span>
        </div>

        {totalCost > buyingPower && (
          <p className="text-red-400 text-xs mb-2">
            ⚠️ Exceeds buying power by ${(totalCost - buyingPower).toLocaleString()}
          </p>
        )}

        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={activeOrders.length === 0 || totalCost > buyingPower}
          className="w-full bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3.5 rounded-xl text-sm transition"
        >
          Place {activeOrders.length} Orders →
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-t-2xl w-full max-w-lg p-6">
            <h3 className="text-white font-semibold text-lg mb-1">Confirm Orders</h3>
            <p className="text-slate-400 text-sm mb-4">
              {basket.emoji} {basket.name}
            </p>

            <div className="mb-4 max-h-60 overflow-y-auto">
              {activeOrders.map((order) => (
                <div
                  key={order.symbol}
                  className="flex justify-between py-2 border-b border-slate-800"
                >
                  <div>
                    <span className="text-white text-sm font-medium">BUY {order.symbol}</span>
                    <span className="text-slate-400 text-xs ml-2">
                      {order.qty} shares · {order.orderType}
                    </span>
                  </div>
                  <span className="text-white text-sm">
                    ~$
                    {((order.qty || 0) * (order.currentPrice || 0)).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between mb-4">
              <span className="text-slate-400">Total</span>
              <span className="text-white font-semibold">~${totalCost.toLocaleString()}</span>
            </div>

            <p className="text-slate-500 text-xs mb-4">
              ⚠️ Market orders execute at current price. Final cost may vary.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceAllOrders}
                className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-semibold"
              >
                Confirm & Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
