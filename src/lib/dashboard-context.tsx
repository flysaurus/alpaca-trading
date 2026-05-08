'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AccountData {
  account: {
    portfolioValue: number;
    cash: number;
    buyingPower: number;
    equity: number;
    daytradeCount: number;
  };
  positions: Position[];
  risk: { score: number; level: string };
}

interface Position {
  symbol: string;
  qty: number;
  marketValue: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  changeToday: number;
  side: 'long' | 'short';
}

interface Order {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  filledQty: number;
  type: string;
  status: string;
  createdAt: string;
  filledAvgPrice?: number;
  limitPrice?: number;
  stopPrice?: number;
}

interface DashboardContextType {
  account: AccountData | null;
  orders: Order[];
  marketOpen: boolean;
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchAccount: () => Promise<void>;
  cancelOrder: (id: string) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [marketOpen, setMarketOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/account');
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setAccount(null);
      } else {
        setAccount(json);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
      setAccount(null);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?status=all&limit=20');
      const json = await res.json();
      if (!json.error) setOrders(json.orders || []);
    } catch (err) {
      console.error('Orders error:', err);
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/market');
      const json = await res.json();
      setMarketOpen(json.isOpen || false);
    } catch (err) {
      console.error('Market error:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchAccount(), fetchOrders(), fetchMarket()]);
    setLoading(false);
  }, [fetchAccount, fetchOrders, fetchMarket]);

  const cancelOrder = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchOrders();
        await fetchAccount();
      }
    } catch (err) {
      console.error('Cancel error:', err);
    }
  }, [fetchOrders, fetchAccount]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  return (
    <DashboardContext.Provider
      value={{ account, orders, marketOpen, loading, error, refreshAll, fetchOrders, fetchAccount, cancelOrder }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
