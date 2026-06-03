'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboard } from '@/lib/dashboard-context'
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
}

interface PendingBasket {
  id: string
  name: string
  emoji: string
  description: string
  theme: string
  created_at: string
  basket_positions: BasketPosition[]
}

export default function TradePage() {
  const { account, refreshAll } = useDashboard()
  const router = useRouter()

  const [pendingBaskets, setPendingBaskets] = useState<PendingBasket[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dismissTarget, setDismissTarget] = useState<string | null>(null)

  const userId = 'default' // TODO: replace with real auth

  const fetchPendingBaskets = useCallback(async () => {
    setLoading(true)
    try {
      const { data: countData } = await supabase.rpc('get_pending_basket_count', {
        p_user_id: userId,
      })
      setPendingCount(countData ?? 0)

      const { data: basketsData } = await supabase
        .from('baskets')
        .select(`
          id,
          name,
          emoji,
          description,
          theme,
          created_at,
          basket_positions (
            symbol,
            company,
            sector,
            sub_theme,
            composite_score,
            conviction,
            reasoning,
            target_pct
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })

      setPendingBaskets(basketsData || [])
    } catch (err) {
      console.error('Failed to fetch pending baskets:', err)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchPendingBaskets()
  }, [fetchPendingBaskets])

  // Store count in localStorage for BottomNav badge
  useEffect(() => {
    localStorage.setItem('alpaca-pending-baskets', JSON.stringify({ count: pendingCount }))
    window.dispatchEvent(new Event('pending-baskets-changed'))
  }, [pendingCount])

  const handleDismissBasket = async (basketId: string) => {
    const { error } = await supabase
      .from('baskets')
      .update({ status: 'archived' })
      .eq('id', basketId)
      .eq('user_id', userId)

    if (!error) {
      setDismissTarget(null)
      fetchPendingBaskets()
    }
  }

  const handleWatchBasket = async (basketId: string) => {
    const basket = pendingBaskets.find((b) => b.id === basketId)
    if (!basket) return

    await supabase
      .from('basket_positions')
      .update({ is_watchlist_only: true, status: 'watchlist' })
      .eq('basket_id', basketId)

    await supabase
      .from('baskets')
      .update({ status: 'active' })
      .eq('id', basketId)

    const symbols = basket.basket_positions.map((p: BasketPosition) => p.symbol)

    try {
      await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      })
    } catch (err) {
      console.error('Watchlist add error:', err)
    }

    fetchPendingBaskets()
    router.push('/')
  }

  return (
    <div className="space-y-3 pb-4">
      {/* ===== READY TO EXECUTE SECTION ===== */}
      {pendingBaskets.length > 0 && (
        <div className="mb-2">
          {/* Section Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-white font-semibold text-sm tracking-wide uppercase">
              Ready to Execute
            </h2>
            <span className="bg-cyan-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {pendingBaskets.length}
            </span>
          </div>

          {/* Basket Cards */}
          {pendingBaskets.map((basket) => (
            <div
              key={basket.id}
              className="bg-slate-800 rounded-2xl p-4 mb-3 border border-cyan-500/20"
            >
              {/* Basket info */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{basket.emoji}</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{basket.name}</p>
                    <p className="text-slate-400 text-xs">
                      {basket.basket_positions?.length || 0} stocks · AI Generated
                    </p>
                  </div>
                </div>
                {/* Dismiss button */}
                <button
                  onClick={() => setDismissTarget(basket.id)}
                  className="text-slate-500 hover:text-slate-300 text-lg leading-none px-1"
                >
                  ×
                </button>
              </div>

              {/* Stock pills preview */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {basket.basket_positions?.slice(0, 6).map((pos) => (
                  <span
                    key={pos.symbol}
                    className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-lg"
                  >
                    {pos.symbol}
                  </span>
                ))}
                {(basket.basket_positions?.length || 0) > 6 && (
                  <span className="text-xs text-slate-500 px-2 py-1">
                    +{basket.basket_positions.length - 6} more
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/trade/basket/${basket.id}`)}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-medium py-2.5 rounded-xl text-sm transition"
                >
                  Review & Order →
                </button>
                <button
                  onClick={() => handleWatchBasket(basket.id)}
                  className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-400 text-sm hover:text-white transition"
                >
                  Watch
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== DISMISS CONFIRMATION MODAL ===== */}
      {dismissTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-t-2xl w-full max-w-lg p-6">
            <h3 className="text-white font-semibold text-lg mb-2">
              Dismiss Basket
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Dismiss this basket? You can restore it later from archived baskets.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDismissTarget(null)}
                className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 text-sm font-medium"
              >
                Keep for Later
              </button>
              <button
                onClick={() => handleDismissBasket(dismissTarget)}
                className="flex-1 py-3 rounded-xl bg-slate-700 text-white text-sm font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PLACEHOLDER FOR OTHER CONTENT ===== */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          {loading ? 'Loading…' : pendingBaskets.length === 0 ? 'No pending baskets. Generate one from the AI tab!' : 'Trade stocks directly'}
        </p>
        <p className="text-xs text-[var(--text-subtle)] mt-2">
          Buying Power: ${(account?.account?.buyingPower || 0).toLocaleString()}
        </p>
      </div>
    </div>
  )
}
