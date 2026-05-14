// ── AI Advisor Chat API ─────────────────────────────────────────
// POST { message, portfolioContext, conversation_history } → streamed LLM response
// Primary: OpenAI gpt-4o-mini
// Fallback: OpenRouter google/gemini-2.0-flash-exp

import { NextRequest } from 'next/server';
import { calculateRiskScore } from '@/lib/riskScore';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ALPACA_DATA_URL = 'https://data.alpaca.markets/v2';
const ALPACA_NEWS_URL = 'https://data.alpaca.markets/v1beta1/news';

async function fetchNewsDirect(): Promise<any[]> {
  const keyId = process.env.ALPACA_API_KEY || '';
  const secretKey = process.env.ALPACA_SECRET_KEY || '';
  if (!keyId || !secretKey) {
    console.warn('[Advisor API] Alpaca creds missing, skipping news fetch');
    return [];
  }

  try {
    const newsRes = await fetch(
      'https://data.alpaca.markets/v1beta1/news?limit=5&sort=desc&include_content=false',
      {
        headers: {
          'APCA-API-KEY-ID': keyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
        cache: 'no-store',
      }
    );

    if (!newsRes.ok) {
      console.warn(`[Advisor API] News fetch failed: HTTP ${newsRes.status}`);
      return [];
    }

    const newsData = await newsRes.json();
    const news = newsData.news?.map((n: any) => ({
      title: n.headline,
      source: n.source,
      created_at: n.created_at,
    })) || [];

    if (news.length > 0) {
      console.log('[Advisor API] News headline:', news[0].title);
      console.log('[Advisor API] News created_at:', news[0].created_at);
    }

    return news;
  } catch (err: any) {
    console.warn('[Advisor API] News fetch error:', err.message);
    return [];
  }
}

function getAlpacaCreds() {
  const keyId = process.env.ALPACA_API_KEY || '';
  const secretKey = process.env.ALPACA_SECRET_KEY || '';
  return { keyId, secretKey };
}

async function fetchSpyQqqChange(): Promise<{ spy_change_pct: number; qqq_change_pct: number }> {
  const keyId = process.env.ALPACA_API_KEY || '';
  const secretKey = process.env.ALPACA_SECRET_KEY || '';
  if (!keyId || !secretKey) {
    console.warn('[Advisor] Alpaca creds missing, skipping SPY/QQQ fetch');
    return { spy_change_pct: 0, qqq_change_pct: 0 };
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 5);

    const url = 'https://data.alpaca.markets/v2/stocks/bars'
      + '?symbols=SPY,QQQ'
      + '&timeframe=1Day'
      + `&start=${twoDaysAgo.toISOString().split('T')[0]}`
      + `&end=${new Date().toISOString().split('T')[0]}`
      + '&limit=5'
      + '&feed=iex'
      + '&adjustment=raw';

    const res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn(`[Advisor] Bars fetch failed: HTTP ${res.status}`);
      return { spy_change_pct: 0, qqq_change_pct: 0 };
    }

    const data = await res.json();
    const spyBars = data.bars?.SPY || [];
    const qqqBars = data.bars?.QQQ || [];

    console.log('SPY bars count:', spyBars.length);
    console.log('SPY last two closes:', spyBars.slice(-2).map((b: any) => ({ t: b.t, c: b.c })));

    const calcChange = (bars: any[]): number | null => {
      if (bars.length < 2) return null;
      const prev = bars[bars.length - 2].c;
      const curr = bars[bars.length - 1].c;
      return Number(((curr - prev) / prev * 100).toFixed(2));
    };

    const spy_change_pct = calcChange(spyBars) ?? 0;
    const qqq_change_pct = calcChange(qqqBars) ?? 0;

    console.log(`[Advisor] SPY: ${spy_change_pct}%, QQQ: ${qqq_change_pct}%`);
    return { spy_change_pct, qqq_change_pct };
  } catch (err: any) {
    console.warn('[Advisor] Bars fetch error:', err.message);
    return { spy_change_pct: 0, qqq_change_pct: 0 };
  }
}

async function fetchVix(): Promise<number | null> {
  const { keyId, secretKey } = getAlpacaCreds();
  if (!keyId || !secretKey) {
    console.warn('[Advisor] Alpaca creds missing, skipping VIX fetch');
    return null;
  }

  try {
    const res = await fetch(
      `${ALPACA_DATA_URL}/stocks/bars?symbols=VIXY&timeframe=1Day&limit=1`,
      {
        headers: {
          'APCA-API-KEY-ID': keyId,
          'APCA-API-SECRET-KEY': secretKey,
          'Accept': 'application/json',
        },
      }
    );

    if (!res.ok) {
      console.warn(`[Advisor] VIXY fetch failed: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const bars = data.bars?.VIXY || [];

    if (bars.length === 0) {
      console.warn('[Advisor] VIXY no bars returned');
      return null;
    }

    const vix = Number(Number(bars[0].c).toFixed(2));
    console.log(`[Advisor] VIXY proxy: ${vix}`);
    return vix;
  } catch (err: any) {
    console.warn('[Advisor] VIXY fetch error:', err.message);
    return null;
  }
}

function sanitizeAccount(account: any): Record<string, string> {
  const equity = parseFloat(account?.equity || account?.total_equity || 0);
  const cash = parseFloat(account?.cash || 0);
  const positions_value = equity - cash;
  const day_pnl = parseFloat(account?.day_pnl || 0);
  const buying_power = parseFloat(account?.buying_power || 0);

  return {
    equity: equity.toFixed(2),
    cash: cash.toFixed(2),
    positions_value: positions_value.toFixed(2),
    day_pnl: day_pnl.toFixed(2),
    buying_power: buying_power.toFixed(2),
  };
}

function cleanKey(key: string): string {
  return key.replace(/^API\s*Key\s*/i, '').trim();
}

function getOpenAIKey(): string {
  return cleanKey(process.env.OPENAI_API_KEY || '');
}

function getOpenRouterKey(): string {
  return cleanKey(process.env.OPENROUTER_API_KEY || '');
}

/*───────────────────────────────────────────────────────────
  System prompt for the AI Advisor persona
───────────────────────────────────────────────────────────*/
function buildSystemPrompt(portfolioContext: Record<string, any>): string {
  const positions = portfolioContext.positions || [];
  const account = portfolioContext.account || {};
  const market = portfolioContext.market || {};

  const posSummary = positions.length > 0
    ? positions.map((p: any) => `- ${p.symbol}: ${p.qty} shares, $${Number(p.market_value || 0).toFixed(2)} (${Number(p.unrealized_plpc || 0).toFixed(2)}%)`).join('\n')
    : 'No open positions.';

  return `---
## App context
You are the AI Advisor embedded in alpaca-dashboard — a personal paper trading terminal built on Alpaca Markets. The app has six tabs: Dashboard, Positions, Advisor, Orders, News, Settings.

The Advisor tab is a single unified screen. The top half is your AI chat. The bottom half shows four strategy cards — Dollar Cost Averaging, Portfolio Rebalancing, Momentum, and Mean Reversion.

This is a paper trading environment. No real money is at risk. Treat analysis seriously — the goal is to build real trading skills — but never frame losses as catastrophic.

## Your role
You are a professional AI financial analyst. You analyze the user's live portfolio data, explain what is happening, evaluate their strategies, and give clear actionable guidance. You do not trade for the user. Every final decision belongs to them.

## What you receive on every message
A JSON block labeled PORTFOLIO_CONTEXT containing:
- account: total_equity, positions_value, cash, day_pnl, buying_power
- positions: array with symbol, qty, market_value, unrealized_pl, unrealized_plpc, current_price
- positions_count: exact number of holdings
- active_strategies: saved strategies from Supabase
- market: spy_change_pct, qqq_change_pct, vix, market_status
- news: top 5 market headlines with title, summary, source

Always use this data. Never say you lack access to the portfolio. Always report numbers exactly as provided — never calculate or infer totals.
total_equity is the full portfolio value.
positions_value is total_equity minus cash.
cash is uninvested cash.
positions_count is the exact number of holdings.

## Current Portfolio Snapshot
- Total Equity: $${account.equity || '0.00'}
- Positions Value: $${account.positions_value || '0.00'}
- Cash: $${account.cash || '0.00'}
- Buying Power: $${account.buying_power || '0.00'}
- Day P&L: $${account.day_pnl || '0.00'}
- Positions Count: ${portfolioContext.positions_count || 0}

## Market Snapshot
- SPY Change: ${market.spy_change_pct?.toFixed(2) ?? 'N/A'}%
- QQQ Change: ${market.qqq_change_pct?.toFixed(2) ?? 'N/A'}%
- VIX: ${market.vix ?? 'N/A'}
- Market Status: ${market.market_status ?? 'N/A'}

## Positions
${posSummary}

## Morning briefing format
When the user asks for a morning briefing, respond in exactly this structure — no more, no less:

MARKET OPEN
• SPY: [change%] | QQQ: [change%] | VIX: [value]
• Market mood: [1 sentence on overall market tone]

YOUR PORTFOLIO
• Equity: $[total_equity] | Invested: $[positions_value] | Cash: $[cash]
• Day P&L: $[day_pnl]
• [1 sentence on biggest mover in their portfolio today]

TOP MARKET NEWS
• [headline 1 — one line]
• [headline 2 — one line]
• [headline 3 — one line]

STRATEGY PULSE
• [1 sentence on whether any active strategy has a trigger condition met today]

ACTION FOR TODAY
• [1 clear actionable suggestion based on portfolio + market]

## Your persona
Professional, precise, direct. Lead with data, follow with a clear conclusion. Translate technical concepts into plain language without dumbing them down. The user is a casual investor who understands stocks but not technical analysis.

## Response format
- Maximum 4 sentences for simple questions
- Lead with a number or fact, never filler
- Use bullet points only when comparing 3 or more items
- Never repeat the user's question
- Never open with "Great question", "Certainly" or any filler
- Do not mention you are an AI unless directly asked
- For strategy questions connect the answer to the user's actual saved strategies and current positions

## Risk flags — once per session only
- Concentrated position: any single holding above 20% of equity
- Low liquidity: cash below 5% of equity
- Strategy conflict: two active strategies taking opposite actions on the same ticker

## Hard limits
- Never predict a specific price target
- Never guarantee any return
- Never suggest ignoring risk
- Never recommend a share count — use $ amount or % of portfolio
- Never give advice outside portfolio and strategy analysis
---`;
}

interface LLMRequest {
  url: string;
  model: string;
  apiKey: string;
  isOpenRouter: boolean;
}

/*───────────────────────────────────────────────────────────
  Attempt a single LLM request, return the response
───────────────────────────────────────────────────────────*/
async function tryLLM(
  req: LLMRequest,
  message: string,
  portfolioContext: Record<string, any>,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<Response> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: buildSystemPrompt(portfolioContext || {}) },
    ...conversationHistory.filter((m) => m.content?.trim()),
    { role: 'user', content: `${message}\n\nIMPORTANT: Respond in valid markdown only. Use ## for headings, - for bullets, **bold** for numbers.` },
  ];

  const body = {
    model: req.model,
    messages,
    max_tokens: 400,
    temperature: 0.3,
    stream: true,
  };

  console.log(`[Advisor] Sending to ${req.model} with ${messages.length} messages`);
  console.log(`[Advisor] Portfolio context:`, JSON.stringify(portfolioContext, null, 2));

  return fetch(req.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey}`,
      ...(req.isOpenRouter
        ? {
            'HTTP-Referer': 'https://alpaca-dashboard-red.vercel.app',
            'X-Title': 'Alpaca Trading Advisor',
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

/*───────────────────────────────────────────────────────────
  Format LLM response into clean markdown
───────────────────────────────────────────────────────────*/
function formatResponse(text: string): string {
  let out = text
    // Convert bullet • to markdown -
    .replace(/^[\s]*•\s*/gm, '- ')
    // Convert ALL CAPS section headers (with or without ##) to Title Case ## headings
    .replace(/\bMARKET\s+OPEN\b/gi, '## Market Open')
    .replace(/\bMARKET\s+CLOSED\b/gi, '## Market Closed')
    .replace(/\bLAST\s+SESSION\b/gi, '## Last Session')
    .replace(/\bYOUR\s+PORTFOLIO\b/gi, '## Your Portfolio')
    .replace(/\bPORTFOLIO\s+OVERVIEW\b/gi, '## Portfolio Overview')
    .replace(/\bTOP\s+MARKET\s+NEWS\b/gi, '## Top Market News')
    .replace(/\bSTRATEGY\s+PULSE\b/gi, '## Strategy Pulse')
    .replace(/\bACTION\s+FOR\s+TODAY\b/gi, '## Action For Today')
    .replace(/\bACTION\s+TODAY\b/gi, '## Action Today')
    .replace(/\bTOP\s+HOLDINGS\b/gi, '## Top Holdings')
    .replace(/\bKEY\s+METRICS\b/gi, '## Key Metrics')
    .replace(/\bRISK\s+ANALYSIS\b/gi, '## Risk Analysis')
    .replace(/\bRECOMMENDATIONS\b/gi, '## Recommendations')
    // Clean up duplicate ## markers
    .replace(/##\s*##/g, '##')
    // Add --- between sections
    .replace(/\n## /g, '\n---\n## ')
    .trim();

  return out;
}

/*───────────────────────────────────────────────────────────
  Position enrichment (technical data for LLM context)
───────────────────────────────────────────────────────────*/

const _positionCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedPosition(symbol: string): any | null {
  const entry = _positionCache.get(symbol);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _positionCache.delete(symbol);
    return null;
  }
  return entry.data;
}

function setCachedPosition(symbol: string, data: any) {
  _positionCache.set(symbol, { data, ts: Date.now() });
}

// RSI calculation (copied from src/lib/scanner.ts)
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function enrichPosition(position: any): Promise<any> {
  const symbol = position.symbol;
  const cached = getCachedPosition(symbol);
  if (cached) {
    console.log(`[Advisor] Using cached enrichment for ${symbol}`);
    return { ...position, ...cached };
  }

  const enriched: any = {};

  // 1. 52-week high/low from Yahoo Finance
  try {
    const { fetchYahoo52Week } = await import('@/lib/yahoo');
    const range = await fetchYahoo52Week(symbol);
    if (range && range.high > 0 && range.low > 0) {
      const current = Number(position.current_price || 0);
      enriched.week52_high = Number(range.high.toFixed(2));
      enriched.week52_low = Number(range.low.toFixed(2));
      enriched.pct_from_52w_high = current > 0
        ? Number((((current - range.high) / range.high) * 100).toFixed(1))
        : 0;
      enriched.pct_from_52w_low = current > 0
        ? Number((((current - range.low) / range.low) * 100).toFixed(1))
        : 0;
    }
  } catch (err: any) {
    console.warn(`[Advisor] Yahoo 52w fetch failed for ${symbol}:`, err.message || err);
  }

  // 2. RSI from Alpaca bars
  try {
    const { getBars } = await import('@/lib/alpaca');
    const bars = await getBars({ symbol, timeframe: '1D', limit: 25 });
    const closes = bars.map((b: any) => Number(b.close || b.c || 0)).filter((c: number) => c > 0);
    
    if (closes.length >= 15) {
      const rsi = calculateRSI(closes, 14);
      enriched.rsi = Number(rsi.toFixed(1));
      enriched.rsi_signal = rsi < 35 ? 'oversold' : rsi > 65 ? 'overbought' : 'neutral';
    }
  } catch (err: any) {
    console.warn(`[Advisor] RSI calc failed for ${symbol}:`, err.message || err);
  }

  // 3. Cost basis from Alpaca position data
  const qty = Number(position.qty || 0);
  const marketValue = Number(position.market_value || 0);
  const unrealizedPL = Number(position.unrealized_pl || 0);
  const unrealizedPLPC = Number(position.unrealized_plpc || 0);

  if (qty > 0) {
    enriched.cost_basis = Number((marketValue - unrealizedPL).toFixed(2));
    enriched.avg_entry_price = Number((enriched.cost_basis / qty).toFixed(2));
  } else {
    enriched.cost_basis = 0;
    enriched.avg_entry_price = 0;
  }
  enriched.pnl_pct = Number((unrealizedPLPC * 100).toFixed(2));

  setCachedPosition(symbol, enriched);
  console.log(`[Advisor] Enriched ${symbol}:`, JSON.stringify(enriched));
  return { ...position, ...enriched };
}

/*───────────────────────────────────────────────────────────
  POST handler — tries OpenAI first, falls back to OpenRouter
───────────────────────────────────────────────────────────*/
export async function POST(req: NextRequest) {
  try {
    const { message, portfolioContext, conversation_history } = (await req.json()) as {
      message: string;
      portfolioContext: Record<string, any>;
      conversation_history?: Array<{ role: string; content: string }>;
    };

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openAIKey = getOpenAIKey();
    const openRouterKey = getOpenRouterKey();

    if (!openAIKey && !openRouterKey) {
      return new Response(
        JSON.stringify({ error: 'No AI provider configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Build provider chain: OpenAI primary, OpenRouter fallback ──
    const providers: LLMRequest[] = [];

    if (openAIKey) {
      providers.push({
        url: OPENAI_URL,
        model: 'gpt-4o-mini',
        apiKey: openAIKey,
        isOpenRouter: false,
      });
    }

    if (openRouterKey) {
      providers.push({
        url: OPENROUTER_URL,
        model: 'google/gemini-2.0-flash-001',
        apiKey: openRouterKey,
        isOpenRouter: true,
      });
    }

    const history = (conversation_history || []).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.content,
    }));

    // ── Fetch fresh news directly from Alpaca (server-side, 60s cache) ──
    const freshNews = await fetchNewsDirect();

    // ── Fetch real SPY/QQQ change% and VIX from Alpaca bars ──
    const [{ spy_change_pct, qqq_change_pct }, vix] = await Promise.all([
      fetchSpyQqqChange(),
      fetchVix(),
    ]);

    const sanitizedAccount = sanitizeAccount(portfolioContext?.account || {});
    console.log('[Advisor API] Sanitized account:', JSON.stringify(sanitizedAccount));

    // ── Enrich top 10 positions with technical data ──
    const rawAlpacaPositions = portfolioContext?.positions || [];
    console.log('Raw Alpaca position sample:', JSON.stringify(rawAlpacaPositions[0], null, 2));
    
    let enrichedPositions = [...rawAlpacaPositions];
    if (enrichedPositions.length > 0) {
      const topPositions = [...enrichedPositions]
        .sort((a: any, b: any) => Number(b.market_value || 0) - Number(a.market_value || 0))
        .slice(0, 10);

      const enrichedTop = await Promise.all(topPositions.map((p: any) => enrichPosition(p)));
      const enrichedMap = new Map(enrichedTop.map((p: any) => [p.symbol, p]));
      enrichedPositions = enrichedPositions.map((p: any) => enrichedMap.get(p.symbol) || p);
    }
    
    console.log('Enriched position sample:', JSON.stringify(enrichedPositions[0], null, 2));

    // ── Calculate portfolio risk score ──
    const riskScore = calculateRiskScore(enrichedPositions, sanitizedAccount, vix);
    console.log('[Advisor API] Risk score:', JSON.stringify(riskScore));

    const enrichedContext = {
      ...portfolioContext,
      account: sanitizedAccount,
      positions: enrichedPositions,
      risk_score: riskScore,
      market: {
        ...(portfolioContext?.market || {}),
        spy_change_pct,
        qqq_change_pct,
        vix,
      },
      news: freshNews.length > 0 ? freshNews : (portfolioContext?.news || []),
    };

    console.log('[Advisor API] Full enrichedContext:', JSON.stringify(enrichedContext, null, 2));

    // Try each provider in order
    let lastError = '';
    for (const provider of providers) {
      try {
        console.log(`[Advisor] Trying ${provider.model}...`);
        const upstream = await tryLLM(provider, message, enrichedContext, history);

        if (upstream.ok) {
          console.log(`[Advisor] ✓ ${provider.model} responded`);

          // ── Buffer upstream, format, then stream ──
          const reader = upstream.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
          }

          // Parse SSE to extract full text
          let rawText = '';
          for (const line of buffer.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) rawText += delta;
              } catch {
                // Ignore malformed lines
              }
            }
          }

          const formatted = formatResponse(rawText);
          console.log(`[Advisor] Formatted response (${formatted.length} chars)`);

          // Stream formatted text as SSE
          const encoder = new TextEncoder();
          const ssePayload = `data: ${JSON.stringify({ choices: [{ delta: { content: formatted } }] })}\n\n`;

          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(ssePayload));
              controller.close();
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          });
        } else {
          const errText = await upstream.text();
          lastError = `${provider.model}: HTTP ${upstream.status} ${errText.slice(0, 200)}`;
          console.warn(`[Advisor] ✗ ${lastError}`);
        }
      } catch (err: any) {
        lastError = `${provider.model}: ${err.message}`;
        console.warn(`[Advisor] ✗ ${lastError}`);
      }
    }

    // All providers failed
    return new Response(
      JSON.stringify({ error: `All providers failed. Last: ${lastError}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
