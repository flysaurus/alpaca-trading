'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, ChevronDown, Trash2, RefreshCw, Activity } from 'lucide-react';
import {
  getWatchlists,
  saveWatchlists,
  getActiveWatchlistId,
  setActiveWatchlistId,
  createWatchlist,
  Watchlist,
} from '@/lib/watchlists';
import { fetchApi } from '@/lib/api-helper';
import SymbolSearch from './SymbolSearch';

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  bid: number | null;
  ask: number | null;
}

export default function WatchlistWidget() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // White dot indicator component for special symbols (XLK, SPY)
  const WhiteDotIndicator = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      className="w-full h-full"
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load on mount
  useEffect(() => {
    const lists = getWatchlists();
    setWatchlists(lists);
    const active = getActiveWatchlistId();
    setActiveId(active || lists[0]?.id || null);
  }, []);

  const activeList = watchlists.find((w) => w.id === activeId);

  const fetchQuotes = useCallback(async () => {
    if (!activeList || activeList.symbols.length === 0) {
      setQuotes({});
      setLoading(false);
      return;
    }
    try {
      const res = await fetchApi(`/api/quotes?symbols=${activeList.symbols.join(',')}`);
      const json = await res.json();
      if (json.data) {
        const map: Record<string, Quote> = {};
        for (const q of json.data) map[q.symbol] = q;
        setQuotes(map);
      }
    } catch (err) {
      console.error('Quotes error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeList?.symbols.join(',')]);

  useEffect(() => {
    setLoading(true);
    fetchQuotes();
    const i = setInterval(fetchQuotes, 5000);
    return () => clearInterval(i);
  }, [fetchQuotes]);

  const addSymbol = (sym?: string) => {
    const symbol = (sym || newSymbol).trim().toUpperCase();
    if (!symbol || !activeList) return;
    if (activeList.symbols.includes(symbol)) {
      setNewSymbol('');
      setShowAdd(false);
      return;
    }
    const updated = watchlists.map((w) =>
      w.id === activeId ? { ...w, symbols: [...w.symbols, symbol] } : w
    );
    setWatchlists(updated);
    saveWatchlists(updated);
    setNewSymbol('');
    setShowAdd(false);
    setRemovingSymbol(null);
  };

  const removeSymbol = (sym: string) => {
    if (!activeList) return;
    setRemovingSymbol(sym);
    setTimeout(() => {
      const updated = watchlists.map((w) =>
        w.id === activeId
          ? { ...w, symbols: w.symbols.filter((s) => s !== sym) }
          : w
      );
      setWatchlists(updated);
      saveWatchlists(updated);
      setRemovingSymbol(null);
    }, 200);
  };

  const createList = () => {
    if (!newListName.trim()) return;
    const newList = createWatchlist(newListName.trim());
    const updated = [...watchlists, newList];
    setWatchlists(updated);
    saveWatchlists(updated);
    setActiveId(newList.id);
    setActiveWatchlistId(newList.id);
    setNewListName('');
    setShowCreate(false);
  };

  const deleteList = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchlists.length <= 1) return;
    if (!confirm('Delete this watchlist?')) return;
    const updated = watchlists.filter((w) => w.id !== id);
    setWatchlists(updated);
    saveWatchlists(updated);
    if (activeId === id) {
      const next = updated[0]?.id || null;
      setActiveId(next);
      setActiveWatchlistId(next || '');
    }
  };

  const switchList = (id: string) => {
    setActiveId(id);
    setActiveWatchlistId(id);
    setShowDropdown(false);
  };

  const displaySymbols = activeList?.symbols || [];

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155] light:border-[#e2e8f0]">
      {/* Header */}
      <div className="px-4 py-2 border-b border-[#1e232b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <h3 className="text-[15px] font-semibold dark:text-text-primary-dark light:text-text-primary-light">Watchlist</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1 text-sm dark:text-text-primary-dark light:text-text-primary-light hover:dark:text-text-primary-dark light:text-text-primary-light dark:bg-bg-input-dark light:bg-bg-input-light px-2 py-1 rounded border dark:border-[#334155] light:border-[#e2e8f0] transition"
            >
              {activeList?.name || 'Select'}
              <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showDropdown && (
              <div className={`absolute right-0 top-full mt-1 w-56 dark:bg-[#1e293b] light:bg-white dark:border-[#334155] light:border-[#e2e8f0] border rounded-lg shadow-xl z-50 ${
                watchlists.length > 3 ? 'max-h-44 overflow-y-auto' : ''
              }`}>
                <div className="py-1">
                  {watchlists.map((w) => (
                    <div
                      key={w.id}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer transition dark:text-[#f9fafb] light:text-[#0f172a] dark:hover:bg-[#334155] light:hover:bg-[#f1f5f9] ${
                        w.id === activeId ? 'bg-amber-500/10 text-amber-400' : ''
                      }`}
                      onClick={() => switchList(w.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium truncate">{w.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{w.symbols.length}</span>
                      </div>
                      {watchlists.length > 1 && (
                        <button
                          onClick={(e) => deleteList(w.id, e)}
                          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--red)] transition flex-shrink-0 rounded-md hover:bg-[var(--red-soft)]"
                          title="Delete watchlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="dark:border-t-[#334155] light:border-t-[#e2e8f0] border-t px-3 py-2">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setShowCreate(true);
                    }}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition"
                  >
                    <Plus className="w-3 h-3" /> New watchlist
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Symbol
          </button>
          <button
            onClick={fetchQuotes}
            className="p-1.5 text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light hover:bg-[var(--hover-bg)] rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Create watchlist */}
      {showCreate && (
        <div className="px-4 py-3 border-b border-[#1e232b] dark:bg-bg-input-dark light:bg-bg-input-light/50">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Watchlist name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createList()}
              className="flex-1 dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg px-3 py-1.5 text-xs dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light"
              autoFocus
            />
            <button
              onClick={createList}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded-lg transition"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewListName('');
              }}
              className="px-2 py-1.5 text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light text-xs transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Symbols grid */}
      {loading ? (
        <div className="flex gap-3 p-4 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-24 h-14 bg-[var(--hover-bg)]/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : displaySymbols.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">Add symbols to this watchlist</p>
        </div>
      ) : (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {displaySymbols.map((sym) => {
            const q = quotes[sym];
            const isRemoving = removingSymbol === sym;
            const isSpecial = sym === 'XLK' || sym === 'SPY';
            if (!q) {
              return (
                <div
                  key={sym}
                  className={`flex-shrink-0 dark:bg-bg-input-dark light:bg-bg-input-light rounded-lg px-3 py-2 min-w-[90px] border dark:border-[#334155] light:border-[#e2e8f0]/50 relative transition-opacity ${isRemoving ? 'opacity-0' : 'opacity-100'} ${isSpecial ? 'border-amber-500/30' : ''}`}
                >
                  {isSpecial && (
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5">
                      <WhiteDotIndicator />
                    </div>
                  )}
                  <button
                    onClick={() => removeSymbol(sym)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--hover-bg)] rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--red)] transition z-10"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-[10px] font-bold text-[#6b7280] tracking-wider">{sym}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">—</p>
                  <p className="text-[10px] text-[var(--text-subtle)]">No data</p>
                </div>
              );
            }
            const isUp = q.changePercent >= 0;
            return (
              <div
                key={q.symbol}
                className={`flex-shrink-0 rounded-lg px-3 py-2 min-w-[110px] border relative transition-opacity ${
                  isUp ? 'bg-[var(--green)]/10 border-[var(--green)]/20' : 'bg-[var(--red)]/10 border-[var(--red)]/20'
                } ${isRemoving ? 'opacity-0' : 'opacity-100'} ${isSpecial ? 'border-amber-500/30' : ''}`}
              >
                {isSpecial && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5">
                    <WhiteDotIndicator />
                  </div>
                )}
                <button
                  onClick={() => removeSymbol(q.symbol)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--hover-bg)] rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--red)] transition z-10"
                >
                  <X className="w-3 h-3" />
                </button>
                <p className="text-base font-semibold dark:text-text-primary-dark light:text-text-primary-light">{q.symbol}</p>
                <p className="text-sm font-medium font-[family-name:var(--font-mono)] dark:text-text-primary-dark light:text-text-primary-light tabular-nums leading-none mt-0.5">
                  ${q.price.toFixed(2)}
                </p>
                <div className={`flex items-center gap-1.5 mt-1 ${isUp ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  <span className="text-xs font-medium font-[family-name:var(--font-mono)]">
                    {isUp ? '+' : ''}{q.change.toFixed(2)}
                  </span>
                  <span className="text-xs font-medium font-[family-name:var(--font-mono)] px-1 py-0.5 rounded dark:bg-bg-input-dark light:bg-bg-input-light/60">
                    {isUp ? '▲' : '▼'} {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add symbol — hidden while creating a new watchlist */}
      {!showCreate && (
      <div className="px-4 py-2 border-t border-[#1e232b]">
        {showAdd && (
          <div className="flex gap-2 items-start">
            <SymbolSearch
              value={newSymbol}
              onChange={(s) => setNewSymbol(s)}
              onSelect={(s) => addSymbol(s)}
              placeholder="Type symbol or search..."
              className="flex-1"
            />
            <button
              onClick={() => addSymbol()}
              className="px-3 py-2 bg-[var(--green-soft)] hover:bg-[#15803d] dark:text-text-primary-dark light:text-text-primary-light text-xs font-bold rounded-lg transition mt-0"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setNewSymbol('');
              }}
              className="px-2 py-1.5 text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light text-xs transition"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
