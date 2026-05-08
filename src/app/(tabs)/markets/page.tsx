'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  TrendingUp,
  Eye,
  Brain,
  Bitcoin,
  Activity,
  Plus,
  Check,
  ArrowRight,
  X,
} from 'lucide-react';
import MarketIndicesBar from '@/components/MarketIndicesBar';
import { getWatchlists, saveWatchlists } from '@/lib/watchlists';

type Section = 'trending' | 'watchlist' | 'ai' | 'crypto' | 'options';

interface Asset {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  signal?: string;
  score?: number;
}

function fmt$(n: number) {
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'watchlist', label: 'Watchlist', icon: Eye },
  { id: 'ai', label: 'AI Picks', icon: Brain },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'options', label: 'Options', icon: Activity },
];

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'COIN', 'MSTR', 'RIOT', 'MARA', 'HOOD', 'SQ'];
const OPTIONS_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'META', 'AMZN', 'GOOGL', 'MSFT', 'IWM', 'TLT'];
const TRENDING_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'AMD', 'COIN', 'PLTR', 'ARKK', 'IWM'];

export default function MarketsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [watchlistSymbols, setWatchlistSymbols] = useState<Set<string>>(new Set());

  // Load watchlist
  useEffect(() => {
    try {
      const lists = getWatchlists();
      const active = lists.find((l) => l.id === localStorage.getItem('alpaca-active-watchlist')) || lists[0];
      if (active) {
        setWatchlistSymbols(new Set(active.symbols));
      }
    } catch { /* ignore */ }
  }, []);

  const toggleWatchlist = useCallback((symbol: string) => {
    setWatchlistSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);

      // Persist
      try {
        const lists = getWatchlists();
        const activeId = localStorage.getItem('alpaca-active-watchlist') || lists[0]?.id;
        const list = lists.find((l) => l.id === activeId);
        if (list) {
          list.symbols = Array.from(next);
          saveWatchlists(lists);
        }
      } catch { /* ignore */ }

      return next;
    });
  }, []);

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes?symbols=${symbols.join(',')}`);
      const json = await res.json();
      const data = (json.data || []).map((d: any) => ({
        symbol: d.symbol,
        price: d.price || 0,
        change: d.change || 0,
        changePercent: d.changePercent || 0,
      }));
      setAssets(data);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchScan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scan');
      const json = await res.json();
      const data = (json.results || []).map((d: any) => ({
        symbol: d.symbol,
        price: d.price || 0,
        change: d.price * (d.changePercent / 100) || 0,
        changePercent: d.changePercent || 0,
        signal: d.signal,
        score: d.score,
      }));
      setAssets(data);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data based on section
  useEffect(() => {
    if (searchQuery) return; // search overrides
    switch (activeSection) {
      case 'trending':
        fetchScan();
        break;
      case 'watchlist':
        fetchQuotes(Array.from(watchlistSymbols));
        break;
      case 'ai':
        fetchScan();
        break;
      case 'crypto':
        fetchQuotes(CRYPTO_SYMBOLS);
        break;
      case 'options':
        fetchQuotes(OPTIONS_SYMBOLS);
        break;
    }
  }, [activeSection, watchlistSymbols, fetchQuotes, fetchScan, searchQuery]);

  // Search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) return;
    const timer = setTimeout(() => {
      fetchQuotes([searchQuery.toUpperCase()]);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchQuotes]);

  const filteredAssets = searchQuery
    ? assets.filter((a) => a.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    : assets;

  // AI picks: top 10 by score
  const aiAssets = activeSection === 'ai'
    ? [...assets].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10)
    : filteredAssets;

  const displayAssets = activeSection === 'ai' ? aiAssets : filteredAssets;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search symbol..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--card-bg)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => { setActiveSection(s.id); setSearchQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                active
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--card-bg)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Market Indices */}
      <MarketIndicesBar />

      {/* Asset List */}
      <div className="space-y-2">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && displayAssets.length === 0 && (
          <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">No assets found</p>
          </div>
        )}

        {!loading && displayAssets.map((asset) => {
          const isUp = asset.changePercent >= 0;
          const inWatchlist = watchlistSymbols.has(asset.symbol);

          return (
            <button
              key={asset.symbol}
              onClick={() => router.push(`/trade?symbol=${asset.symbol}`)}
              className="w-full flex items-center justify-between p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/50 active:scale-[0.99] transition-all text-left"
            >
              <div className="flex items-center gap-3">
                {/* Symbol avatar */}
                <div className="w-10 h-10 rounded-xl bg-[var(--app-bg)] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{asset.symbol.slice(0, 2)}</span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{asset.symbol}</p>
                    {asset.signal && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                        asset.signal === 'breakout' || asset.signal === 'gap_up'
                          ? 'bg-[#166534]/20 text-[#22d66e]'
                          : asset.signal === 'oversold'
                          ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'bg-[var(--app-bg)] text-[var(--text-muted)]'
                      }`}>
                        {asset.signal.replace('_', ' ').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs font-mono text-[var(--text-secondary)]">{fmt$(asset.price)}</p>
                    <p className={`text-[10px] font-mono font-semibold ${isUp ? 'text-[#22d66e]' : 'text-[#f87171]'}`}>
                      {fmtPct(asset.changePercent)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Watchlist toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleWatchlist(asset.symbol); }}
                  className={`p-2 rounded-lg transition ${
                    inWatchlist
                      ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'bg-[var(--app-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {inWatchlist ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
                <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
