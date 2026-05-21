'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import { fetchApi } from '@/lib/api-helper';

interface AssetInfo {
  symbol: string;
  name: string;
  exchange: string;
}

interface Props {
  value: string;
  onChange: (symbol: string) => void;
  onSelect?: (symbol: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export default function SymbolSearch({ value, onChange, onSelect, placeholder = 'SYMBOL', className = '', autoFocus = false }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AssetInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchApi(`/api/symbols?q=${encodeURIComponent(q)}&limit=8`);
      const json = await res.json();
      setSuggestions(json.symbols || []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSuggestions(query);
    }, 150);
    return () => clearTimeout(timeout);
  }, [query, fetchSuggestions]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSymbol = (symbol: string) => {
    setQuery(symbol);
    onChange(symbol);
    if (onSelect) onSelect(symbol);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        selectSymbol(suggestions[selectedIndex].symbol);
      } else if (query) {
        selectSymbol(query.toUpperCase());
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setShowDropdown(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155] light:border-[#e2e8f0] rounded-lg pl-9 pr-3 py-2.5 text-[15px] dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light font-[family-name:var(--font-mono)] uppercase tracking-wider"
          autoFocus={autoFocus}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] animate-pulse">...</span>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-[var(--card-bg)] border dark:border-[#334155] light:border-[#e2e8f0] rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((asset, i) => (
            <button
              key={asset.symbol}
              onClick={() => selectSymbol(asset.symbol)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
                i === selectedIndex ? 'bg-[var(--hover-bg)]' : 'hover:bg-[var(--hover-bg)]/50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg dark:bg-bg-input-dark light:bg-bg-input-light flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)]">{asset.symbol}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{asset.name}</p>
              </div>
              <span className="text-[10px] text-[var(--text-subtle)] flex-shrink-0">{asset.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
