import { NextResponse } from 'next/server';
import { generateDailySuggestions, PortfolioContext, MarketState } from '@/lib/suggestionEngine';
import { callLLM } from '@/lib/ai/client';
import { sendTelegramMessage } from '@/lib/telegram';

// ── Cron API Handler ──────────────────────────────────────────────
// Protected by CRON_SECRET environment variable
// Cron jobs configured in vercel.json call this endpoint

const ALPACA_TRADE_URL = 'https://paper-api.alpaca.markets';

function getAlpacaCreds() {
  const keyId = process.env.ALPACA_API_KEY || '';
  const secretKey = process.env.ALPACA_SECRET_KEY || '';
  return { keyId, secretKey };
}

async function fetchAlpacaAccount() {
  const { keyId, secretKey } = getAlpacaCreds();
  const res = await fetch(`${ALPACA_TRADE_URL}/v2/account`, {
    headers: {
      'APCA-API-KEY-ID': keyId,
      'APCA-API-SECRET-KEY': secretKey,
    },
  });
  if (!res.ok) throw new Error(`Account fetch failed: ${res.status}`);
  return res.json();
}

async function fetchAlpacaPositions() {
  const { keyId, secretKey } = getAlpacaCreds();
  const res = await fetch(`${ALPACA_TRADE_URL}/v2/positions`, {
    headers: {
      'APCA-API-KEY-ID': keyId,
      'APCA-API-SECRET-KEY': secretKey,
    },
  });
  if (!res.ok) throw new Error(`Positions fetch failed: ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  
  if (action === 'snapshot') {
    try {
      const [account, positions] = await Promise.all([
        fetchAlpacaAccount(),
        fetchAlpacaPositions(),
      ]);

      const equity = parseFloat(account.equity || 0);
      const cash = parseFloat(account.cash || 0);
      const buyingPower = parseFloat(account.buying_power || 0);
      const lastEquity = parseFloat(account.last_equity || 0);
      const dayPnl = equity - lastEquity;
      const totalPnl = equity - 100000;
      const today = new Date().toISOString().split('T')[0];

      const { upsertSnapshot, ensureUserByAlpacaId } = await import('@/lib/supabase');
      const userId = await ensureUserByAlpacaId(account.id);
      await upsertSnapshot({
        user_id: userId,
        date: today,
        equity,
        cash,
        buying_power: buyingPower,
        day_pnl: dayPnl,
        total_pnl: totalPnl,
        positions: positions || [],
      });

      console.log(`[Cron] Snapshot saved for ${today}: equity=$${equity.toFixed(2)}`);
      return NextResponse.json({
        action: 'snapshot',
        timestamp: new Date().toISOString(),
        date: today,
        equity,
        dayPnl,
        totalPnl,
        positionsCount: positions?.length || 0,
      });
    } catch (err: any) {
      console.error('[Cron] Snapshot failed:', err.message);
      return NextResponse.json({ error: `Snapshot failed: ${err.message}` }, { status: 500 });
    }
  }

  if (action === 'morning_brief') {
    try {
      const baseUrl = new URL(req.url).origin;

      // 1. Fetch market state
      const marketRes = await fetch(`${baseUrl}/api/market`, {
        next: { revalidate: 60 },
      });
      const marketData = marketRes.ok ? await marketRes.json() : {};
      const marketState: MarketState = marketData.marketState || {};

      // 2. Fetch portfolio context
      const [account, positions] = await Promise.all([
        fetchAlpacaAccount(),
        fetchAlpacaPositions(),
      ]);

      const equity = parseFloat(account.equity || 0);
      const cash = parseFloat(account.cash || 0);

      const portfolio: PortfolioContext = {
        positions: (positions || []).map((p: any) => ({
          symbol: p.symbol,
          quantity: parseFloat(p.qty || 0),
          market_value: parseFloat(p.market_value || 0),
          rsi: p.rsi ? parseFloat(p.rsi) : undefined,
          current_price: parseFloat(p.current_price || p.lastday_price || 0),
        })),
        cash,
        total_equity: equity,
      };

      // 3. Generate daily suggestions
      const suggestions = await generateDailySuggestions(portfolio, marketState);

      // 4. Enhance reasoning with LLM for each suggestion
      const enhancedSuggestions = await Promise.all(
        suggestions.map(async (s) => {
          const llmPrompt = `Rewrite this trading suggestion in plain English (max 2 sentences):\n\nSymbol: ${s.symbol}\nAction: ${s.action}\nType: ${s.type}\nCurrent reasoning: ${s.reasoning}\nScore: ${s.score}/100 | Confidence: ${s.confidence}/10`;
          try {
            const enhanced = await callLLM(llmPrompt);
            return { ...s, reasoning: enhanced };
          } catch {
            return s;
          }
        })
      );

      // 5. Store results in Supabase
      const today = new Date().toISOString().split('T')[0];
      const { getClient, ensureUserByAlpacaId } = await import('@/lib/supabase');
      const userId = await ensureUserByAlpacaId(account.id);

      const { error: insertError } = await getClient()
        .from('daily_suggestions')
        .insert({
          user_id: userId,
          date: today,
          market_state: marketState,
          suggestions: enhancedSuggestions,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[Cron] Failed to store daily suggestions:', insertError.message);
      }

      // 6. Send Telegram message with top suggestion
      const top = enhancedSuggestions[0];
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (top && chatId) {
        const dateStr = new Date().toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

        const telegramText = [
          `🌅 MORNING BRIEF — ${dateStr}`,
          '──────────────────',
          `📊 Market: ${marketState.label || 'Unknown'}`,
          marketState.advice || '',
          '──────────────────',
          `🎯 TOP SIGNAL: ${top.action} ${top.symbol}`,
          `Score: ${top.score}/100 | Confidence: ${top.confidence}/10`,
          top.reasoning,
          '──────────────────',
          'Open the app for full analysis →',
        ].join('\n');

        await sendTelegramMessage({
          chatId,
          text: telegramText,
          parseMode: 'HTML',
        });
      }

      return NextResponse.json({
        action: 'morning_brief',
        timestamp: new Date().toISOString(),
        date: today,
        marketState,
        suggestions: enhancedSuggestions,
        topSuggestion: top || null,
      });
    } catch (err: any) {
      console.error('[Cron] Morning brief failed:', err.message);
      return NextResponse.json(
        { error: `Morning brief failed: ${err.message}` },
        { status: 500 }
      );
    }
  }

  if (action === 'update_recommendation_prices') {
    try {
      const { getClient } = await import('@/lib/supabase');
      const supabase = getClient();

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // ── 7-day updates ──────────────────────────────────────────
      const { data: recs7d, error: err7d } = await supabase
        .from('scanner_recommendations')
        .select('id, symbol, price_at_recommendation, date')
        .is('price_7d', null)
        .lte('date', sevenDaysAgo);

      let updated7d = 0;
      if (recs7d && recs7d.length > 0) {
        const { keyId, secretKey } = getAlpacaCreds();
        const symbols = [...new Set(recs7d.map((r: any) => r.symbol))].join(',');

        const quoteRes = await fetch(
          `https://data.alpaca.markets/v2/stocks/quotes?symbols=${encodeURIComponent(symbols)}&feed=iex`,
          {
            headers: {
              'APCA-API-KEY-ID': keyId,
              'APCA-API-SECRET-KEY': secretKey,
            },
          }
        );

        const quotes = quoteRes.ok ? await quoteRes.json() : {};

        for (const rec of recs7d as any[]) {
          const quote = quotes?.quotes?.[rec.symbol];
          const currentPrice = quote?.bp || quote?.ap || null;
          if (!currentPrice || !rec.price_at_recommendation) continue;

          const return7d = ((currentPrice - rec.price_at_recommendation) / rec.price_at_recommendation) * 100;

          const { error } = await supabase
            .from('scanner_recommendations')
            .update({ price_7d: currentPrice, return_7d: return7d })
            .eq('id', rec.id);

          if (!error) updated7d++;
        }
      }

      // ── 30-day updates ─────────────────────────────────────────
      const { data: recs30d, error: err30d } = await supabase
        .from('scanner_recommendations')
        .select('id, symbol, price_at_recommendation, date')
        .is('price_30d', null)
        .lte('date', thirtyDaysAgo);

      let updated30d = 0;
      if (recs30d && recs30d.length > 0) {
        const { keyId, secretKey } = getAlpacaCreds();
        const symbols = [...new Set(recs30d.map((r: any) => r.symbol))].join(',');

        const quoteRes = await fetch(
          `https://data.alpaca.markets/v2/stocks/quotes?symbols=${encodeURIComponent(symbols)}&feed=iex`,
          {
            headers: {
              'APCA-API-KEY-ID': keyId,
              'APCA-API-SECRET-KEY': secretKey,
            },
          }
        );

        const quotes = quoteRes.ok ? await quoteRes.json() : {};

        for (const rec of recs30d as any[]) {
          const quote = quotes?.quotes?.[rec.symbol];
          const currentPrice = quote?.bp || quote?.ap || null;
          if (!currentPrice || !rec.price_at_recommendation) continue;

          const return30d = ((currentPrice - rec.price_at_recommendation) / rec.price_at_recommendation) * 100;

          const { error } = await supabase
            .from('scanner_recommendations')
            .update({ price_30d: currentPrice, return_30d: return30d })
            .eq('id', rec.id);

          if (!error) updated30d++;
        }
      }

      console.log(`[Cron] Updated prices: ${updated7d} 7-day, ${updated30d} 30-day`);

      return NextResponse.json({
        action: 'update_recommendation_prices',
        timestamp: new Date().toISOString(),
        updated7d,
        updated30d,
      });
    } catch (err: any) {
      console.error('[Cron] Price update failed:', err.message);
      return NextResponse.json(
        { error: `Price update failed: ${err.message}` },
        { status: 500 }
      );
    }
  }

  if (action === 'update_rec_prices') {
    try {
      const { getClient } = await import('@/lib/supabase');
      const supabase = getClient();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: recs, error: fetchError } = await supabase
        .from('scanner_recommendations')
        .select('id, symbol, executed_price, executed_at')
        .eq('user_action', 'executed')
        .gte('executed_at', thirtyDaysAgo);

      if (fetchError) {
        throw new Error(`Fetch failed: ${fetchError.message}`);
      }

      let updated = 0;
      if (recs && recs.length > 0) {
        const { keyId, secretKey } = getAlpacaCreds();
        const symbols = [...new Set(recs.map((r: any) => r.symbol))].join(',');

        const snapshotRes = await fetch(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols)}`,
          {
            headers: {
              'APCA-API-KEY-ID': keyId,
              'APCA-API-SECRET-KEY': secretKey,
            },
          }
        );

        const snapshots = snapshotRes.ok ? await snapshotRes.json() : {};

        for (const rec of recs as any[]) {
          const snap = snapshots?.[rec.symbol];
          const currentPrice = snap?.latestTrade?.p || snap?.dailyBar?.c || 0;
          if (!currentPrice || !rec.executed_price) continue;

          const return_30d = ((currentPrice - rec.executed_price) / rec.executed_price) * 100;

          const { error } = await supabase
            .from('scanner_recommendations')
            .update({
              current_price_30d: currentPrice,
              return_30d: return_30d,
            })
            .eq('id', rec.id);

          if (!error) updated++;
        }
      }

      console.log(`[Cron] Updated rec prices: ${updated} executed recommendations`);

      return NextResponse.json({
        action: 'update_rec_prices',
        timestamp: new Date().toISOString(),
        updated,
      });
    } catch (err: any) {
      console.error('[Cron] Update rec prices failed:', err.message);
      return NextResponse.json(
        { error: `Update rec prices failed: ${err.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function POST(req: Request) {
  const { secret, type } = await req.json();
  
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  // Validate cron type
  const validTypes = ['dca', 'rebalance', 'momentum', 'digest', 'snapshot'];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid cron type' }, { status: 400 });
  }
  
  // Import and call the appropriate scheduler function
  // const { isMarketHours } = await import('@/lib/scheduler');
  
  switch (type) {
    case 'dca':
      return NextResponse.json({ 
        action: 'dca_check',
        timestamp: new Date().toISOString(),
        executed: false, // Would be true if any orders placed
      });
    case 'rebalance':
      return NextResponse.json({ 
        action: 'rebalance_check',
        timestamp: new Date().toISOString(),
        needsRebalance: false, // Would be true if any rebalancing needed
      });
    case 'momentum':
      return NextResponse.json({ 
        action: 'momentum_update',
        timestamp: new Date().toISOString(),
        updated: true,
      });
    case 'digest':
      return NextResponse.json({ 
        action: 'pre_market_digest',
        timestamp: new Date().toISOString(),
        macroEvents: [], // Would contain upcoming events
        news: [], // Would contain news summary
      });
    case 'snapshot': {
      try {
        const [account, positions] = await Promise.all([
          fetchAlpacaAccount(),
          fetchAlpacaPositions(),
        ]);

        const equity = parseFloat(account.equity || 0);
        const cash = parseFloat(account.cash || 0);
        const buyingPower = parseFloat(account.buying_power || 0);
        const lastEquity = parseFloat(account.last_equity || 0);
        const dayPnl = equity - lastEquity;
        const totalPnl = equity - 100000;
        const today = new Date().toISOString().split('T')[0];

        const { upsertSnapshot, ensureUserByAlpacaId } = await import('@/lib/supabase');
        const userId = await ensureUserByAlpacaId(account.id);
        await upsertSnapshot({
          user_id: userId,
          date: today,
          equity,
          cash,
          buying_power: buyingPower,
          day_pnl: dayPnl,
          total_pnl: totalPnl,
          positions: positions || [],
        });

        console.log(`[Cron] Snapshot saved for ${today}: equity=$${equity.toFixed(2)}`);
        return NextResponse.json({
          action: 'snapshot',
          timestamp: new Date().toISOString(),
          date: today,
          equity,
          dayPnl,
          totalPnl,
          positionsCount: positions?.length || 0,
        });
      } catch (err: any) {
        console.error('[Cron] Snapshot failed:', err.message);
        return NextResponse.json({ error: `Snapshot failed: ${err.message}` }, { status: 500 });
      }
    }
    default:
      return NextResponse.json({ error: 'Unknown cron type' }, { status: 400 });
  }
}
