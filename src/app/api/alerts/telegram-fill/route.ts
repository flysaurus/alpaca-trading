import { NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function POST(req: Request) {
  try {
    const { order } = await req.json();
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return NextResponse.json({ error: 'Telegram not configured' }, { status: 500 });
    }

    const totalValue = Number(order.filledAvgPrice || 0) * Number(order.filledQty || 0);

    const text = [
      `🎯 *ORDER FILLED*`,
      ``,
      `*Symbol:* \`${order.symbol}\``,
      `*Side:* ${order.side === 'buy' ? '🟢 BUY' : '🔴 SELL'}`,
      `*Status:* ✅ FILLED`,
      `*Filled Qty:* ${order.filledQty}`,
      `*Avg Fill Price:* $${Number(order.filledAvgPrice || 0).toFixed(2)}`,
      totalValue > 0 ? `*Total Value:* $${totalValue.toFixed(2)}` : '',
      `*Filled At:* ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET`,
    ].filter(Boolean).join('\n');

    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!tgRes.ok) throw new Error((await tgRes.text()).slice(0, 200));
    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error('Telegram fill alert error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
