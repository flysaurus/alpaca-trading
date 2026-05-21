'use client';
import { fetchApi } from '@/lib/api-helper';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Clock } from 'lucide-react';

interface Recommendation {
  symbol: string;
  action: 'buy';
  reason: string;
  strategy: 'Quality Dip' | 'Momentum' | 'Value';
  score: number;
  entry_range: string;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function isMarketHours(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minutes = et.getMinutes();
  const totalMinutes = hour * 60 + minutes;

  // 9:30 AM - 4:00 PM ET
  return totalMinutes >= 570 && totalMinutes < 960; // 9:30 = 570, 16:00 = 960
}

export default function MorningRecommendationsList() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(true);

  const fetchRecommendations = useCallback(async () => {
    try {
      // Check client-side cache
      const cached = sessionStorage.getItem('morningRecs');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setRecommendations(data);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      const res = await fetchApi('/api/morning-brief-recommendations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const recs = (json.recommendations || []) as Recommendation[];

      setRecommendations(recs);
      try {
        sessionStorage.setItem(
          'morningRecs',
          JSON.stringify({ data: recs, timestamp: Date.now() })
        );
      } catch { /* storage full */ }
      setError(null);
    } catch (err: any) {
      console.error('[MorningRecs] Fetch failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isMarketHours()) {
      setMarketOpen(false);
      setLoading(false);
      return;
    }

    fetchRecommendations();

    // Refresh every 30 minutes during market hours
    const interval = setInterval(fetchRecommendations, CACHE_TTL);
    return () => clearInterval(interval);
  }, [fetchRecommendations]);

  // Outside market hours
  if (!marketOpen) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border border-[#6366f1]/20 p-6 text-center">
        <Clock className="w-8 h-8 text-[#6366f1]/40 mx-auto mb-3" />
        <p className="text-sm dark:text-text-secondary-dark light:text-text-secondary-light">
          Check back during market hours (9:30 AM – 4:00 PM ET)
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border border-[#6366f1]/20 p-4 animate-pulse"
          >
            <div className="h-4 w-24 bg-bg-hover rounded mb-3" />
            <div className="h-3 w-48 bg-bg-hover rounded mb-2" />
            <div className="h-3 w-32 bg-bg-hover rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border border-[#6366f1]/20 p-6 text-center">
        <p className="text-sm dark:text-accent-danger-dark light:text-accent-danger-light">
          Unable to load recommendations
        </p>
        <button
          onClick={fetchRecommendations}
          className="mt-3 text-xs px-4 py-1.5 rounded-lg bg-[#6366f1] text-white hover:bg-[#6366f1]/80 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (recommendations.length === 0) {
    return (
      <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border border-[#6366f1]/20 p-6 text-center">
        <p className="text-sm dark:text-text-secondary-dark light:text-text-secondary-light">
          No recommendations yet. Check back after the morning scan runs.
        </p>
      </div>
    );
  }

  // Strategy badge colors
  const strategyColors: Record<string, string> = {
    'Quality Dip': 'bg-[#6366f1]/10 text-[#6366f1] border-[#6366f1]/20',
    'Momentum': 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20',
    'Value': 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20',
  };

  return (
    <div className="space-y-2">
      {recommendations.map((rec) => (
        <div
          key={rec.symbol}
          className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border border-[#6366f1]/20 hover:border-[#6366f1]/40 transition overflow-hidden"
        >
          <div className="px-4 py-3">
            {/* Top row: Symbol + Score + Strategy */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold dark:text-text-primary-dark light:text-text-primary-light">
                  {rec.symbol}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  strategyColors[rec.strategy] || strategyColors['Quality Dip']
                }`}>
                  {rec.strategy}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-[#6366f1] text-white text-[11px] font-bold">
                  {rec.score}/100
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20">
                  BUY
                </span>
              </div>
            </div>

            {/* Reason */}
            <p className="text-xs dark:text-text-secondary-dark light:text-text-secondary-light mb-2">
              {rec.reason}
            </p>

            {/* Bottom row: Entry range */}
            <div className="flex items-center gap-1 text-[11px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
              <TrendingUp className="w-3 h-3" />
              <span>Entry: <span className="font-mono font-semibold dark:text-text-primary-dark light:text-text-primary-light">{rec.entry_range}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
