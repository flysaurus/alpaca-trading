export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}

const STORAGE_KEY = 'alpaca-trading-watchlists';
const ACTIVE_KEY = 'alpaca-trading-active-watchlist';

export function getWatchlists(): Watchlist[] {
  if (typeof window === 'undefined') return getDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return getDefaults();
}

export function saveWatchlists(watchlists: Watchlist[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
}

export function getActiveWatchlistId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveWatchlistId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_KEY, id);
}

export function createWatchlist(name: string, symbols: string[] = []): Watchlist {
  return {
    id: `wl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name,
    symbols: symbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
  };
}

function getDefaults(): Watchlist[] {
  return [
    {
      id: 'default-tech',
      name: 'Tech Giants',
      symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META'],
    },
    {
      id: 'default-etfs',
      name: 'ETFs',
      symbols: ['SPY', 'QQQ', 'IWM', 'ARKK', 'XLF', 'XLE', 'TLT', 'GLD'],
    },
    {
      id: 'default-meme',
      name: 'Momentum',
      symbols: ['AMD', 'COIN', 'PLTR', 'MSTR', 'HOOD'],
    },
  ];
}
