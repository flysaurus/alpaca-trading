import { NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Telegram fill route hit:', JSON.stringify(body));

    const { order } = body;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('Telegram not configured — token:', !!TELEGRAM_BOT_TOKEN, 'chatId:', !!TELEGRAM_CHAT_ID);
      return NextResponse.json({ error: 'Telegram not configured' }, { status: 500 });
    }

    const filledQty = Number(order.filledQty || order.filled_qty || order.qty || 0);
    const filledPrice = Number(order.filledAvgPrice || order.filled_avg_price || 0);
    const totalValue = filledQty * filledPrice;

    const text = `
✅ <b>ORDER FILLED</b>
──────────────────
📅 <b>Date:</b> ${formatDate(order.filledAt || order.filled_at || order.updatedAt || order.updated_at || order.createdAt || order.created_at)}
⏰ <b>Time:</b> ${formatTime(order.filledAt || order.filled_at || order.updatedAt || order.updated_at || order.createdAt || order.created_at)}

📊 <b>Symbol:</b> ${order.symbol}
${order.side === 'buy' ? '🟢' : '🔴'} <b>Side:</b> ${order.side.toUpperCase()}
📋 <b>Type:</b> ${(order.type || 'market').toUpperCase()}
🔢 <b>Qty:</b> ${filledQty} shares
💵 <b>Filled Price:</b> $${filledPrice.toFixed(2)}
${order.side === 'buy' ? '💸 <b>Debited:</b>' : '💰 <b>Credited:</b>'} $${totalValue.toFixed(2)}
──────────────────
✅ <b>Status:</b> FILLED
`;

    console.log('Sending to Telegram:', {
      token_exists: !!TELEGRAM_BOT_TOKEN,
      token_prefix: TELEGRAM_BOT_TOKEN?.slice(0, 10),
      chat_id: TELEGRAM_CHAT_ID,
      text_preview: text?.slice(0, 50),
    });

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text.trim(),
        parse_mode: 'HTML',
      }),
    });

    const tgJson = await tgRes.json();
    console.log('Telegram API response:', JSON.stringify(tgJson));

    if (!tgJson.ok) throw new Error(tgJson.description || `Telegram API error ${tgRes.status}`);
    return NextResponse.json({ sent: true, telegram: tgJson });
  } catch (err: any) {
    console.error('Telegram fill alert error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
