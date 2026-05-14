import { NextResponse } from 'next/server';
import { getOrders, placeOrder, AlpacaError } from '@/lib/alpaca';
import { validateOrder } from '@/lib/safety';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { checkRiskLimits, DEFAULT_RISK } from '@/lib/risk';
import { sendTelegramMessage } from '@/lib/telegram';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York'
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short'
  });
}

// ── GET /api/orders ─────────────────────────────────────────────
export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') as 'open' | 'closed' | 'all') || 'open';
    const count = parseInt(url.searchParams.get('limit') || '50', 10);

    const orders = await getOrders({ status, limit: count });

    return NextResponse.json(
      {
        orders: orders.map((o: any) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          qty: Number(o.qty),
          type: o.type,
          status: o.status,
          filledQty: Number(o.filled_qty || 0),
          filledAvgPrice: o.filled_avg_price ? Number(o.filled_avg_price) : null,
          createdAt: o.created_at,
          updatedAt: o.updated_at,
          limitPrice: o.limit_price ? Number(o.limit_price) : null,
          stopPrice: o.stop_price ? Number(o.stop_price) : null,
        })),
        count: orders.length,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch orders' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}

// ── POST /api/orders ────────────────────────────────────────────
export async function POST(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const body = await request.json();
    const { symbol, qty, side, type, limitPrice, stopPrice, timeInForce, trailPrice, trailPercent } = body;

    // ── Safety validation ──
    const safety = validateOrder({ symbol, qty, side, estimatedPrice: limitPrice || body.estimatedPrice });
    if (!safety.valid) {
      return NextResponse.json(
        { error: safety.error },
        { status: 400, headers: rateLimitHeaders(limit) }
      );
    }

    // ── Risk checks ──
    const { getAccount, getPositions } = await import('@/lib/alpaca');
    const [account, positions] = await Promise.all([
      getAccount(),
      getPositions(),
    ]);

    const portfolioValue = Number(account.portfolio_value);
    const estimatedPrice = limitPrice || body.estimatedPrice || 100;
    const notional = qty * estimatedPrice;

    const riskCheck = checkRiskLimits(
      portfolioValue,
      positions,
      { symbol, side, notional, qty: Number(qty) },
      DEFAULT_RISK
    );

    if (!riskCheck.allowed) {
      return NextResponse.json(
        { error: `Risk check: ${riskCheck.reason}` },
        { status: 403, headers: rateLimitHeaders(limit) }
      );
    }

    // ── Place order ──
    const order = await placeOrder({
      symbol: symbol.toUpperCase(),
      qty: Number(qty),
      side,
      type: type || 'market',
      time_in_force: timeInForce || 'day',
      ...(limitPrice ? { limit_price: Number(limitPrice) } : {}),
      ...(stopPrice ? { stop_price: Number(stopPrice) } : {}),
      ...(trailPrice ? { trail_price: Number(trailPrice) } : {}),
      ...(trailPercent ? { trail_percent: Number(trailPercent) } : {}),
    });

    // ── Telegram notification ──
    let telegramResult: { ok: boolean; error?: string } | null = null;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    console.log('[API /orders] Telegram config:', { hasToken: !!botToken, hasChatId: !!chatId, tokenPrefix: botToken?.slice(0, 10) });

    if (chatId && botToken) {
      const filledPrice = order.filled_avg_price
        ? Number(order.filled_avg_price)
        : (limitPrice || body.estimatedPrice || 0);

      let text: string;

      if (order.status === 'filled') {
        text = `
✅ <b>ORDER FILLED</b>
──────────────────
📅 <b>Date:</b> ${formatDate(order.filled_at || order.created_at)}
⏰ <b>Time:</b> ${formatTime(order.filled_at || order.created_at)}

📊 <b>Symbol:</b> ${order.symbol}
${order.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${order.side.toUpperCase()}
📋 <b>Type:</b> ${(order.type || 'market').toUpperCase()}
🔢 <b>Qty:</b> ${order.filled_qty || order.qty} shares
💵 <b>Filled Price:</b> $${Number(filledPrice).toFixed(2)}
${order.side === 'buy' ? '💸 <b>Debited:</b>' : '💰 <b>Credited:</b>'} $${(Number(order.filled_qty || order.qty) * Number(filledPrice)).toFixed(2)}
──────────────────
✅ <b>Status:</b> FILLED
`;
      } else if (order.status === 'canceled' || order.status === 'pending_cancel') {
        text = `
❌ <b>ORDER CANCELLED</b>
──────────────────
📅 <b>Date:</b> ${formatDate(order.canceled_at || order.updated_at || order.created_at)}
⏰ <b>Time:</b> ${formatTime(order.canceled_at || order.updated_at || order.created_at)}

📊 <b>Symbol:</b> ${order.symbol}
${order.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${order.side.toUpperCase()}
📋 <b>Type:</b> ${(order.type || 'market').toUpperCase()}
🔢 <b>Qty:</b> ${order.qty} shares
──────────────────
❌ <b>Status:</b> CANCELLED
`;
      } else if (order.status === 'accepted' || order.status === 'accepted_for_bidding') {
        text = `
📨 <b>ORDER ACCEPTED</b>
──────────────────
📅 <b>Date:</b> ${formatDate(order.updated_at || order.created_at)}
⏰ <b>Time:</b> ${formatTime(order.updated_at || order.created_at)}

📊 <b>Symbol:</b> ${order.symbol}
${order.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${order.side.toUpperCase()}
📋 <b>Type:</b> ${(order.type || 'market').toUpperCase()}
🔢 <b>Qty:</b> ${order.qty} shares
💰 <b>Limit Price:</b> ${order.limit_price ? '$' + order.limit_price : 'Market'}
──────────────────
📨 <b>Status:</b> ACCEPTED
`;
      } else {
        text = `
🔔 <b>ORDER PLACED</b>
──────────────────
📅 <b>Date:</b> ${formatDate(order.created_at)}
⏰ <b>Time:</b> ${formatTime(order.created_at)}

📊 <b>Symbol:</b> ${order.symbol}
${order.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${order.side.toUpperCase()}
📋 <b>Type:</b> ${(order.type || 'market').toUpperCase()}
🔢 <b>Qty:</b> ${order.qty} shares
💰 <b>Limit Price:</b> ${order.limit_price ? '$' + order.limit_price : 'Market'}
──────────────────
⏳ <b>Status:</b> PENDING
`;
      }

      console.log('[API /orders] Sending Telegram notification:', { chatId, status: order.status, symbol: order.symbol });

      telegramResult = await sendTelegramMessage({
        chatId,
        text: text.trim(),
        parseMode: 'HTML',
      });

      console.log('[API /orders] Telegram result:', JSON.stringify(telegramResult));
    } else {
      console.warn('[API /orders] Telegram not configured — skipping notification');
    }

    return NextResponse.json(
      {
        success: true,
        order: {
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          qty: Number(order.qty),
          type: order.type,
          status: order.status,
          filledQty: Number(order.filled_qty || 0),
          filledAvgPrice: order.filled_avg_price ? Number(order.filled_avg_price) : null,
          createdAt: order.created_at,
        },
        telegram: telegramResult,
      },
      { status: 201, headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Order failed' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
