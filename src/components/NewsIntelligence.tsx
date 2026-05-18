'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Newspaper,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  ExternalLink,
  ChevronDown,
  Bell,
  Activity,
  BarChart3,
  Binary,
} from 'lucide-react';
import SymbolSearch from './SymbolSearch';
import { addNotification, getUnreadCount, markAllAsRead } from '@/lib/notifications';

interface OpenRouterAnalysis {
  model: string;
  tradingImplications: string;
  keyTakeaways: string[];
  confidence: number;
}

interface ScoredNews {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  symbols: string[];
  author: string;
  createdAt: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number;
  relevanceScore: number;
  openRouterAnalysis?: OpenRouterAnalysis;
}

interface MacroEvent {
  id: string;
  date: string;
  time?: string;
  title: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  description?: string;
  source: string;
}

interface InsiderTx {
  id: string;
  symbol: string;
  companyName: string;
  insiderName: string;
  insiderTitle: string;
  transactionType: string;
  transactionDate: string;
  totalValue: number;
  form4Url?: string;
}

interface AlertRule {
  id: string;
  symbol: string;
  keywords: string[];
  sentiment: 'any' | 'bullish' | 'bearish';
  active: boolean;
}

interface PolyMarket {
  id: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  endDate?: string;
}

interface PolyEvent {
  id: string;
  title: string;
  slug: string;
  category: string;
  markets: PolyMarket[];
  volume: number;
}

function TelegramSetup() {
  const [chatId, setChatId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('alpaca-telegram-chat-id');
    if (saved) setChatId(saved);
  }, []);

  const testMessage = async () => {
    if (!chatId) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          text: '🦊 Alpaca Trading is connected!',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('success');
        setMessage('Test sent');
        localStorage.setItem('alpaca-telegram-chat-id', chatId);
      } else {
        setStatus('error');
        setMessage(json.error || 'Failed');
      }
    } catch {
      setStatus('error');
      setMessage('Network error');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Chat ID"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          className="flex-1 dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg px-3 py-2 text-xs dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light font-[family-name:var(--font-mono)]"
        />
        <button onClick={testMessage} disabled={!chatId || status === 'loading'}
          className="px-3 py-2 bg-[var(--hover-bg)] dark:text-text-primary-dark light:text-text-primary-light text-xs rounded-lg transition disabled:opacity-40">
          {status === 'loading' ? '...' : 'Test'}
        </button>
      </div>
      {message && (
        <p className={`text-[10px] ${status === 'success' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

export default function NewsIntelligence({ embedded = false }: { embedded?: boolean }) {
  const [news, setNews] = useState<ScoredNews[]>([]);
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [insider, setInsider] = useState<{ purchases: number; sales: number; transactions: InsiderTx[] } | null>(null);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [polyEvents, setPolyEvents] = useState<PolyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState('');
  const [alertKeywords, setAlertKeywords] = useState('');
  const [alertSentiment, setAlertSentiment] = useState<'any' | 'bullish' | 'bearish'>('any');

  const fetchData = useCallback(async () => {
    try {
      const [newsRes, macroRes, insiderRes, alertsRes, polyRes] = await Promise.all([
        fetch('/api/news?limit=30'),
        fetch('/api/macro?days=21'),
        fetch('/api/insider?days=7'),
        fetch('/api/alerts'),
        fetch('/api/polymarket'),
      ]);

      const newsJson = await newsRes.json();
      const macroJson = await macroRes.json();
      const insiderJson = await insiderRes.json();
      const alertsJson = await alertsRes.json();
      const polyJson = await polyRes.json();

      if (newsJson.news) setNews(newsJson.news);
      if (macroJson.events) setEvents(macroJson.events);
      if (insiderJson.transactions) setInsider(insiderJson);
      if (alertsJson.alerts) setAlerts(alertsJson.alerts);
      if (polyJson.events) setPolyEvents(polyJson.events);
    } catch (err) {
      console.error('News intel error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, [fetchData]);

  // Debug: log news items when data is set
  useEffect(() => {
    if (news.length > 0) {
      console.log('[NewsIntelligence] News items:', news.slice(0, 5).map(n => ({
        id: n.id,
        headline: n.headline.substring(0, 40) + '...',
        sentiment: n.sentiment,
        sentimentScore: n.sentimentScore,
        hasOpenRouter: !!n.openRouterAnalysis,
      })));
    }
  }, [news]);

  // Update notification badge when data is fetched
  useEffect(() => {
    // Add a notification for each new alert match
    // In production, this would compare against previous news and add only new ones
    const newAlertCount = news.length > 5 ? 1 : 0; // Simulated
    if (newAlertCount > 0) {
      addNotification({
        type: 'alert',
        title: 'New Alerts',
        message: 'Check your alert rules for new matches',
        priority: 'medium',
      });
    }
  }, [news.length]);

  const createAlert = async () => {
    if (!alertSymbol || !alertKeywords) return;
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: alertSymbol,
          keywords: alertKeywords.split(',').map(k => k.trim()),
          sentiment: alertSentiment,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setAlerts(prev => [...prev, json.alert]);
        setShowAlertModal(false);
        setAlertSymbol('');
        setAlertKeywords('');
      }
    } catch (err) {
      console.error('Create alert error:', err);
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Delete alert error:', err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const impactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-[var(--red)]/20 text-[var(--red)] border-[var(--red)]/30';
      case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-[var(--hover-bg)] text-[var(--text-muted)] border-[var(--hover-bg)]';
    }
  };

  const sentimentBadge = (s: string) => {
    switch (s) {
      case 'bullish': return 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-soft)]';
      case 'bearish': return 'bg-[var(--red-soft)] text-[var(--red)] border-[var(--red-soft)]';
      default: return 'bg-[var(--hover-bg)] text-[var(--text-muted)] border-[var(--hover-bg)]';
    }
  };

  const sentimentIcon = (s: string) => {
    if (s === 'bullish') return <TrendingUp className="w-3 h-3" />;
    if (s === 'bearish') return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  // Market mood summary
  const bullishCount = news.filter(n => n.sentiment === 'bullish').length;
  const bearishCount = news.filter(n => n.sentiment === 'bearish').length;
  const totalScored = bullishCount + bearishCount;
  const marketMood = totalScored > 0
    ? (bullishCount / totalScored > 0.6 ? 'Bullish' : bullishCount / totalScored < 0.4 ? 'Bearish' : 'Mixed')
    : 'Neutral';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="w-8 h-8 text-amber-400 animate-pulse mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">Loading intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold tracking-wider">NEWS INTELLIGENCE</h2>
        </div>
        <button onClick={() => setShowAlertModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 hover:bg-amber-500/20 transition">
          <Bell className="w-3 h-3" /> Alert
        </button>
      </div>

      {/* Sentiment Summary */}
      <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold tracking-wider dark:text-text-primary-dark light:text-text-primary-light">MARKET SENTIMENT</h3>
          </div>
          <span className={`text-xs font-bold ${
            marketMood === 'Bullish' ? 'text-[var(--green)]' :
            marketMood === 'Bearish' ? 'text-[var(--red)]' : 'text-amber-400'
          }`}>{marketMood}</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden">
          <div className="bg-[var(--green)]" style={{ width: `${news.length > 0 ? (bullishCount / news.length) * 100 : 0}%` }} />
          <div className="bg-[var(--text-muted)]" style={{ width: `${news.length > 0 ? (news.filter(n => n.sentiment === 'neutral').length / news.length) * 100 : 0}%` }} />
          <div className="bg-[var(--red)]" style={{ width: `${news.length > 0 ? (bearishCount / news.length) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-[var(--green)] font-bold">{bullishCount} Bullish</span>
          <span className="text-[var(--text-muted)]">{news.filter(n => n.sentiment === 'neutral').length} Neutral</span>
          <span className="text-[var(--red)] font-bold">{bearishCount} Bearish</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Headlines */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Newspaper className="w-4 h-4 text-[var(--green)]" />
            <h3 className="text-xs font-bold tracking-wider dark:text-text-primary-dark light:text-text-primary-light">HEADLINES</h3>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{news.length}</span>
          </div>

          <div className="space-y-2">
            {news.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id}>
                  {/* Headline row */}
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className={`bg-[var(--card-bg)] rounded-xl border p-3 cursor-pointer transition hover:border-[var(--border-light)] ${
                      isExpanded ? 'border-amber-500/50' : 'dark:border-[#334155]/70 light:border-[#e2e8f0]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${sentimentBadge(item.sentiment)}`}>
                        {sentimentIcon(item.sentiment)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium leading-snug">{item.headline}</p>
                          <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-[var(--text-muted)]">{item.source}</span>
                          <span className="text-[10px] text-[var(--text-subtle)]">·</span>
                          <span className="text-[10px] text-[var(--text-muted)]">{timeAgo(item.createdAt)}</span>
                        </div>
                        {item.symbols.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {item.symbols.slice(0, 4).map(s => (
                              <span key={s} className="px-1.5 py-0.5 dark:bg-bg-input-dark light:bg-bg-input-light rounded text-[10px] dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)]">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="bg-[var(--card-bg)] border-x border-b dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-b-xl -mt-2 pt-4 pb-3 px-3">
                      <p className="text-xs dark:text-text-primary-dark light:text-text-primary-light leading-relaxed mb-3">{item.summary}</p>
                      
                      {/* FinBERT Analysis (AI-powered) */}
                      {item.openRouterAnalysis && item.openRouterAnalysis.tradingImplications && (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Activity className="w-3 h-3 text-[#8b5cf6]" />
                            <span className="text-[10px] font-bold text-[#8b5cf6]">AI Analysis</span>
                          </div>
                          <div className="bg-[#8b5cfug]/5 border border-[#8b5cfug]/20 rounded-lg p-2">
                            <p className="text-[10px] dark:text-text-primary-dark light:text-text-primary-light font-medium mb-1.5">Trading Implications:</p>
                            <p className="text-[10px] dark:text-text-primary-dark light:text-text-primary-light leading-relaxed">{item.openRouterAnalysis.tradingImplications}</p>
                            {item.openRouterAnalysis.keyTakeaways.length > 0 && (
                              <div className="mt-2">
                                <span className="text-[10px] dark:text-text-primary-dark light:text-text-primary-light font-medium">Key Takeaways:</span>
                                <ul className="list-disc list-inside mt-1">
                                  {item.openRouterAnalysis.keyTakeaways.map((kt, i) => (
                                    <li key={i} className="text-[10px] dark:text-text-primary-dark light:text-text-primary-light">{kt}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
                            <span>Model: {item.openRouterAnalysis.model.split('/').pop() || item.openRouterAnalysis.model}</span>
                            <span>•</span>
                            <span>Confidence: {(item.openRouterAnalysis.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1 flex-wrap">
                          {item.symbols.map(s => (
                            <span key={s} className="px-1.5 py-0.5 dark:bg-bg-input-dark light:bg-bg-input-light rounded text-[10px] dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)]">
                              {s}
                            </span>
                          ))}
                        </div>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition">
                          Read <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span>Score: {item.sentimentScore > 0 ? '+' : ''}{(item.sentimentScore * 100).toFixed(0)}%</span>
                        <span>Relevance: {(item.relevanceScore * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Macro Calendar */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-[#3b82f6]" />
            <h3 className="text-xs font-bold tracking-wider dark:text-text-primary-dark light:text-text-primary-light">MACRO CALENDAR</h3>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{events.length} events</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {events.map((event) => (
              <div key={event.id} className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-3">
                <div className="flex items-start gap-2">
                  <div className={`w-1 h-full min-h-[40px] rounded-full flex-shrink-0 ${
                    event.impact === 'high' ? 'bg-[var(--red)]' :
                    event.impact === 'medium' ? 'bg-amber-400' : 'bg-[var(--text-muted)]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${impactColor(event.impact)}`}>
                        {event.impact.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] capitalize">{event.category}</span>
                    </div>
                    <p className="text-xs font-medium">{event.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[10px] dark:text-text-primary-dark light:text-text-primary-light">{event.date} {event.time || ''}</span>
                    </div>
                    {event.description && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 line-clamp-2">{event.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center py-8">
                <Calendar className="w-8 h-8 text-[var(--hover-bg)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-muted)]">No macro events</p>
              </div>
            )}
          </div>
        </div>

        {/* Polymarket + Insider */}
        <div className="space-y-3">
          {/* Insider */}
          {insider && insider.transactions.length > 0 && (
            <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-3.5 h-3.5 text-[#8b5cf6]" />
                <h3 className="text-[10px] font-bold tracking-wider dark:text-text-primary-dark light:text-text-primary-light">INSIDER ACTIVITY (7D)</h3>
              </div>
              <div className="flex gap-3 mb-2 text-center">
                <div className="flex-1">
                  <p className="text-sm font-bold text-[var(--green)] font-[family-name:var(--font-mono)]">{insider.purchases}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Buys</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[var(--red)] font-[family-name:var(--font-mono)]">{insider.sales}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Sells</p>
                </div>
              </div>
            </div>
          )}

          {/* Polymarket */}
          <div className="flex items-center gap-2 mb-1">
            <Binary className="w-4 h-4 text-[#a855f7]" />
            <h3 className="text-xs font-bold tracking-wider dark:text-text-primary-dark light:text-text-primary-light">PREDICTION MARKETS</h3>
          </div>
          <div className="space-y-2">
            {polyEvents.slice(0, 4).map((event) => {
              const mainMarket = event.markets[0];
              if (!mainMarket) return null;
              const yesPrice = mainMarket.outcomePrices[0] || 0;
              const yesPct = Math.round(yesPrice * 100);
              return (
                <div key={event.id} className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] p-3">
                  <p className="text-xs font-medium mb-2 line-clamp-2">{event.title}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--green)] w-8">YES</span>
                      <div className="flex-1 h-2 dark:bg-bg-input-dark light:bg-bg-input-light rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--green)] rounded-full" style={{ width: `${yesPct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-[var(--green)] w-8 text-right font-[family-name:var(--font-mono)]">{yesPct}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--red)] w-8">NO</span>
                      <div className="flex-1 h-2 dark:bg-bg-input-dark light:bg-bg-input-light rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--red)] rounded-full" style={{ width: `${100 - yesPct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-[var(--red)] w-8 text-right font-[family-name:var(--font-mono)]">{100 - yesPct}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                    <span className="text-[9px] text-[var(--text-muted)]">Vol: ${(event.volume / 1e6).toFixed(1)}M</span>
                    <a href={`https://polymarket.com/event/${event.slug}`} target="_blank" rel="noopener noreferrer"
                      className="text-[9px] text-[#a855f7] hover:text-[#c084fc] transition">Trade →</a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] w-full max-w-md p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold dark:text-text-primary-dark light:text-text-primary-light">Create News Alert</h3>
              <button onClick={() => setShowAlertModal(false)} className="text-[var(--text-muted)] hover:dark:text-text-primary-dark light:text-text-primary-light">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <SymbolSearch value={alertSymbol} onChange={(s) => setAlertSymbol(s)} placeholder="AAPL" />
              <input type="text" placeholder="earnings, guidance, upgrade" value={alertKeywords} onChange={(e) => setAlertKeywords(e.target.value)}
                className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg px-3 py-2 text-sm dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light" />
              <select value={alertSentiment} onChange={(e) => setAlertSentiment(e.target.value as 'any' | 'bullish' | 'bearish')}
                className="w-full dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg px-3 py-2 text-sm dark:text-text-primary-dark light:text-text-primary-light focus:outline-none focus:ring-2 dark:ring-accent-primary-dark light:ring-accent-primary-light">
                <option value="any">Any sentiment</option>
                <option value="bullish">Bullish only</option>
                <option value="bearish">Bearish only</option>
              </select>
              <button onClick={createAlert} disabled={!alertSymbol || !alertKeywords}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs tracking-wider rounded-lg transition disabled:opacity-40">
                CREATE ALERT
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <h4 className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Telegram Alerts</h4>
              <TelegramSetup />
            </div>

            {alerts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <h4 className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Active Alerts</h4>
                <div className="space-y-1.5">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between dark:bg-bg-input-dark light:bg-bg-input-light rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs font-bold dark:text-text-primary-dark light:text-text-primary-light font-[family-name:var(--font-mono)]">{alert.symbol}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-2">{alert.keywords.join(', ')}</span>
                      </div>
                      <button onClick={() => deleteAlert(alert.id)} className="text-[var(--text-muted)] hover:text-[var(--red)] transition">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
