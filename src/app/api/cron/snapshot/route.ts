import { NextResponse } from 'next/server';

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

export async function GET() {
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
