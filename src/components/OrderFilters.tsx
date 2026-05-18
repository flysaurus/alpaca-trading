'use client';

import { useState } from 'react';
import { Filter, X, Calendar } from 'lucide-react';
import SymbolSearch from '@/components/SymbolSearch';

export interface OrderFilters {
  dateRange: 'today' | '7d' | '30d' | '60d' | '90d' | 'ytd' | 'custom' | 'all';
  startDate?: string;
  endDate?: string;
  symbol?: string;
  side?: 'buy' | 'sell' | 'all';
  status?: string;
}

interface Props {
  filters: OrderFilters;
  onChange: (filters: OrderFilters) => void;
}

const DATE_OPTIONS: { value: OrderFilters['dateRange']; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '60d', label: '60 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

export default function OrderFilterBar({ filters, onChange }: Props) {
  const [showFilters, setShowFilters] = useState(false);

  const update = (patch: Partial<OrderFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const activeCount = [
    filters.dateRange !== 'all',
    filters.symbol,
    filters.side && filters.side !== 'all',
    filters.status && filters.status !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
            showFilters || activeCount > 0
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-[var(--hover-bg)] dark:text-text-primary-dark light:text-text-primary-light border dark:border-[#334155] light:border-[#e2e8f0]'
          }`}
        >
          <Filter className="w-3 h-3" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 px-1.5 py-0 bg-amber-500 text-black rounded-full text-[9px] font-bold">
              {activeCount}
            </span>
          )}
        </button>

        {/* Quick chips */}
        {filters.dateRange !== 'all' && (
          <button
            onClick={() => update({ dateRange: 'all' })}
            className="flex items-center gap-1 px-2 py-1 bg-[var(--hover-bg)] rounded text-[10px] dark:text-text-primary-dark light:text-text-primary-light hover:dark:text-text-primary-dark light:text-text-primary-light transition"
          >
            <Calendar className="w-2.5 h-2.5" />
            {DATE_OPTIONS.find(d => d.value === filters.dateRange)?.label}
            <X className="w-2.5 h-2.5" />
          </button>
        )}
        {filters.symbol && (
          <button
            onClick={() => update({ symbol: undefined })}
            className="flex items-center gap-1 px-2 py-1 bg-[var(--hover-bg)] rounded text-[10px] dark:text-text-primary-dark light:text-text-primary-light hover:dark:text-text-primary-dark light:text-text-primary-light transition"
          >
            {filters.symbol} <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {showFilters && (
        <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155] light:border-[#e2e8f0] p-3 space-y-3">
          {/* Date Range */}
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Date Range</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ dateRange: opt.value })}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition ${
                    filters.dateRange === opt.value
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'dark:bg-bg-input-dark light:bg-bg-input-light dark:text-text-primary-dark light:text-text-primary-light border dark:border-[#334155] light:border-[#e2e8f0] hover:border-[var(--border-light)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {filters.dateRange === 'custom' && (
              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => update({ startDate: e.target.value })}
                    className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg px-3 py-1.5 pr-8 text-xs dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light font-[family-name:var(--font-mono)] appearance-none"
                  />
                  <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                </div>
                <span className="text-[var(--text-muted)] self-center">to</span>
                <div className="relative flex-1">
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => update({ endDate: e.target.value })}
                    className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg px-3 py-1.5 pr-8 text-xs dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light font-[family-name:var(--font-mono)] appearance-none"
                  />
                  <Calendar className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Symbol, Side, Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Symbol</label>
              <SymbolSearch
                value={filters.symbol || ''}
                onChange={(s) => update({ symbol: s || undefined })}
                onSelect={(s) => update({ symbol: s || undefined })}
                placeholder="ALL"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Side</label>
              <select
                value={filters.side || 'all'}
                onChange={(e) => update({ side: e.target.value as 'buy' | 'sell' | 'all' })}
                className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg px-3 py-1.5 text-xs dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
              >
                <option value="all">All</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Status</label>
              <select
                value={filters.status || 'all'}
                onChange={(e) => update({ status: e.target.value })}
                className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg px-3 py-1.5 text-xs dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
              >
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="filled">Filled</option>
                <option value="partially_filled">Partially Filled</option>
                <option value="canceled">Canceled</option>
                <option value="done_for_day">Done for Day</option>
              </select>
            </div>
          </div>

          {/* Clear all */}
          <button
            onClick={() => {
              onChange({ dateRange: 'all', symbol: undefined, side: 'all', status: 'all' });
            }}
            className="text-[10px] text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light transition"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

// Filter utility — generic over any order object with required fields
export function applyOrderFilters<T extends { symbol: string; side: string; status: string; createdAt: string }>(
  orders: T[],
  filters: OrderFilters
): T[] {
  return orders.filter((o) => {
    // Symbol filter
    if (filters.symbol && !o.symbol.toUpperCase().includes(filters.symbol.toUpperCase())) {
      return false;
    }

    // Side filter
    if (filters.side && filters.side !== 'all' && o.side !== filters.side) {
      return false;
    }

    // Status filter
    if (filters.status && filters.status !== 'all' && o.status !== filters.status) {
      return false;
    }

    // Date filter
    if (filters.dateRange && filters.dateRange !== 'all') {
      const orderDate = new Date(o.createdAt);
      const now = new Date();

      switch (filters.dateRange) {
        case 'today': {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (orderDate < today) return false;
          break;
        }
        case '7d': {
          const cutoff = new Date(now.getTime() - 7 * 86400 * 1000);
          if (orderDate < cutoff) return false;
          break;
        }
        case '30d': {
          const cutoff = new Date(now.getTime() - 30 * 86400 * 1000);
          if (orderDate < cutoff) return false;
          break;
        }
        case '60d': {
          const cutoff = new Date(now.getTime() - 60 * 86400 * 1000);
          if (orderDate < cutoff) return false;
          break;
        }
        case '90d': {
          const cutoff = new Date(now.getTime() - 90 * 86400 * 1000);
          if (orderDate < cutoff) return false;
          break;
        }
        case 'ytd': {
          const ytd = new Date(now.getFullYear(), 0, 1);
          if (orderDate < ytd) return false;
          break;
        }
        case 'custom': {
          if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (orderDate < start) return false;
          }
          if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (orderDate > end) return false;
          }
          break;
        }
      }
    }

    return true;
  });
}
