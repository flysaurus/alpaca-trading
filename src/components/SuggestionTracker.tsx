'use client'
import { useState, useEffect } from 'react'

interface TrackedSuggestion {
  id: string
  symbol: string
  company: string
  sector: string
  action: string
  suggested_price: number
  conviction: string
  return_30d: number | null
  outcome_30d: string | null
  last_tracked_at: string | null
  created_at: string
}

export default function SuggestionTracker() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [suggestions, setSuggestions] = useState<TrackedSuggestion[]>([])
  const [stats, setStats] = useState({
    total: 0,
    tracked: 0,
    outperformed: 0,
    hitRate: 0,
  })

  useEffect(() => {
    fetchSuggestions()
  }, [])

  async function fetchSuggestions() {
    try {
      const res = await fetch('/api/ai/suggestions', {
        headers: { 'x-user-id': 'default' },
      })
      const data = await res.json()
      const list = (data.suggestions || []) as TrackedSuggestion[]
      setSuggestions(list)

      const tracked = list.filter((s) => s.outcome_30d)
      const outperformed = tracked.filter((s) => s.outcome_30d === 'outperformed')
      setStats({
        total: list.length,
        tracked: tracked.length,
        outperformed: outperformed.length,
        hitRate: tracked.length > 0 ? Math.round((outperformed.length / tracked.length) * 100) : 0,
      })
    } catch (err) {
      console.error('Failed to fetch suggestions:', err)
    }
  }

  if (stats.total === 0) return null

  return (
    <div className="mx-0 mb-4">
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between bg-[var(--card-bg)] rounded-xl px-4 py-3 hover:bg-[var(--hover-bg)] transition border border-[var(--border)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📊</span>
          <span className="text-[var(--text-primary)] text-sm font-medium">AI Suggestions</span>
          <span className="text-[var(--text-muted)] text-xs">{stats.total} tracked</span>
        </div>
        <div className="flex items-center gap-3">
          {stats.tracked > 0 && (
            <span
              className={`text-xs font-medium ${
                stats.hitRate >= 60 ? 'text-[var(--green)]' : stats.hitRate >= 40 ? 'text-[var(--accent)]' : 'text-[var(--red)]'
              }`}
            >
              {stats.hitRate}% hit rate
            </span>
          )}
          <span className="text-[var(--text-muted)] text-xs">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="bg-[var(--card-bg)]/50 rounded-b-xl border-t border-[var(--border)] px-4 py-3">
          {/* Stats row */}
          {stats.tracked > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-semibold">{stats.tracked}</p>
                <p className="text-[var(--text-muted)] text-xs">Resolved</p>
              </div>
              <div className="text-center">
                <p className="text-[var(--green)] font-semibold">{stats.outperformed}</p>
                <p className="text-[var(--text-muted)] text-xs">Beat Market</p>
              </div>
              <div className="text-center">
                <p className={`font-semibold ${stats.hitRate >= 60 ? 'text-[var(--green)]' : 'text-[var(--accent)]'}`}>
                  {stats.hitRate}%
                </p>
                <p className="text-[var(--text-muted)] text-xs">Hit Rate</p>
              </div>
            </div>
          )}

          {/* Suggestion list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {suggestions.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-[var(--border)]/50 last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-primary)] text-sm font-medium">{s.symbol}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        s.conviction === 'high'
                          ? 'bg-[var(--green)]/10 text-[var(--green)]'
                          : s.conviction === 'medium'
                          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'bg-[var(--app-bg)] text-[var(--text-muted)]'
                      }`}
                    >
                      {s.conviction}
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)] text-xs">
                    Suggested ${(s.suggested_price || 0).toFixed(2)} ·{' '}
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  {s.return_30d !== null ? (
                    <>
                      <p className={`text-sm font-medium ${s.return_30d >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                        {s.return_30d >= 0 ? '+' : ''}
                        {s.return_30d?.toFixed(1)}%
                      </p>
                      <p className="text-xs">
                        {s.outcome_30d === 'outperformed'
                          ? '✅ Beat market'
                          : s.outcome_30d === 'underperformed'
                          ? '❌ Missed'
                          : '➡️ Neutral'}
                      </p>
                    </>
                  ) : (
                    <p className="text-[var(--text-muted)] text-xs">Tracking…</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {suggestions.length > 10 && (
            <p className="text-center text-[var(--text-muted)] text-xs mt-3">
              +{suggestions.length - 10} more suggestions
            </p>
          )}

          <p className="text-[var(--text-subtle)] text-xs text-center mt-3">30-day performance vs S&P 500</p>
        </div>
      )}
    </div>
  )
}
