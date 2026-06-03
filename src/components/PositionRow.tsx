'use client'

interface PositionRowProps {
  position: {
    symbol: string
    qty: number
    marketValue: number
    unrealizedPL?: number
    unrealizedPLPercent?: number
    unrealizedPnL?: number
    unrealizedPnLPercent?: number
    currentPrice: number
    avgEntryPrice?: number
    sector?: string
  }
  onSell: () => void
  showBasketBadge?: boolean
  basketName?: string
  isSelectable?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

function fmt$(n: number) {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

export default function PositionRow({
  position,
  onSell,
  showBasketBadge = false,
  basketName,
  isSelectable = false,
  isSelected = false,
  onSelect,
}: PositionRowProps) {
  const pl = position.unrealizedPL ?? position.unrealizedPnL ?? 0
  const plPct = position.unrealizedPLPercent ?? position.unrealizedPnLPercent ?? 0
  const isProfitable = pl >= 0

  return (
    <div
      className={`flex items-center justify-between bg-slate-800/50 rounded-xl p-3 mb-1 transition-all ${
        isSelected ? 'border border-cyan-500' : ''
      } ${isSelectable ? 'cursor-pointer hover:bg-slate-800/70' : ''}`}
      onClick={isSelectable ? onSelect : undefined}
    >
      {/* Checkbox in select mode */}
      {isSelectable && (
        <div
          className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center flex-shrink-0 ${
            isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600'
          }`}
        >
          {isSelected && <span className="text-white text-xs">✓</span>}
        </div>
      )}

      {/* Symbol + details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm truncate">{position.symbol}</span>
          {showBasketBadge && basketName && (
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded flex-shrink-0">
              {basketName}
            </span>
          )}
        </div>
        <p className="text-slate-400 text-xs">
          {position.qty} shares{position.sector ? ` · ${position.sector}` : ''}
        </p>
      </div>

      {/* Value + P&L */}
      <div className="text-right mr-3 flex-shrink-0">
        <p className="text-white text-sm font-medium">{fmt$(position.marketValue)}</p>
        <p className={`text-xs ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
          {pl >= 0 ? '+' : ''}
          {fmt$(Math.abs(pl))} ({plPct >= 0 ? '+' : ''}
          {plPct.toFixed(1)}%)
        </p>
      </div>

      {/* Sell button — hidden in select mode */}
      {!isSelectable && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSell()
          }}
          className="text-xs text-slate-400 hover:text-red-400 transition px-2 py-1 rounded border border-slate-700 hover:border-red-400/50 flex-shrink-0"
        >
          Sell
        </button>
      )}
    </div>
  )
}
