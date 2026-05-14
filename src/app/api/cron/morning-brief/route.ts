import { NextResponse } from 'next/server';
import { generateDailySuggestions, PortfolioContext, MarketState } from '@/lib/suggestionEngine';
import { callLLM } from '@/lib/ai/client';
import { sendTelegramMessage } from '@/lib/telegram';

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
