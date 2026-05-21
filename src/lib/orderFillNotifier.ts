// ── Order Fill Notifier ─────────────────────────────────────────
// Lightweight client-side poller that detects order fills
// and sends Telegram notifications for fill events.

import { fetchApi } from '@/lib/api-helper';

const NOTIFIED_KEY = 'alpaca-trading-notified-orders';

function getNotifiedIds(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function markNotified(id: string) {
  try {
    if (typeof window === 'undefined') return;
    const ids = [...getNotifiedIds(), id].slice(-200);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(ids));
  } catch { /*ignore*/ }
}

function shouldNotify(order: any): boolean {
  if (order.status !== 'filled') return false;
  const filledQty = Number(order.filledQty || order.filled_qty || 0);
  if (filledQty <= 0) return false;
  const notified = getNotifiedIds();
  return !notified.includes(order.id);
}

export async function pollForFills() {
  console.log('Fill poller tick — checking orders');
  try {
    const res = await fetchApi('/api/orders?status=all&limit=20');
    if (!res.ok) return;
    const { orders } = await res.json();
    let notifiedCount = 0;

    for (const order of orders) {
      // Log every filled order seen by the poller
      if (order.status === 'filled') {
        console.log(`[OrderFillNotifier] Filled order seen: ${order.symbol} ${order.side} qty=${order.filledQty || order.filled_qty} price=${order.filledAvgPrice || order.filled_avg_price}`);
      }

      if (shouldNotify(order)) {
        markNotified(order.id);
        notifiedCount++;

        // Fire-and-forget Telegram notification via internal API
        fetchApi('/api/alerts/telegram-fill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order }),
        }).catch(err => console.error('Fill notifier Telegram error:', err));

        // Fire-and-forget trade save to Supabase
        (async () => {
          try {
            const accountRes = await fetchApi('/api/account');
            const account = await accountRes.json();
            const alpacaAccountId = account?.account?.id;
            if (!alpacaAccountId) {
              console.warn('[OrderFillNotifier] No alpaca account id');
              return;
            }

            const { ensureUserByAlpacaId, insertTrade } = await import('@/lib/supabase');
            const userId = await ensureUserByAlpacaId(alpacaAccountId);

            const filledPrice = Number(order.filledAvgPrice || order.filled_avg_price || 0);
            const qty = Number(order.filledQty || order.filled_qty || order.qty || 0);
            const filledAt = order.updatedAt || order.createdAt || order.filled_at || new Date().toISOString();

            console.log(`[OrderFillNotifier] Calling insertTrade: ${order.symbol} ${order.side} qty=${qty} price=${filledPrice}`);

            await insertTrade({
              user_id: userId,
              alpaca_order_id: order.id,
              symbol: order.symbol,
              side: order.side,
              qty,
              filled_price: filledPrice,
              filled_at: filledAt,
              strategy_id: null,
            });

            console.log(`[OrderFillNotifier] Trade saved: ${order.symbol} ${order.side} ${qty} at ${filledPrice}`);
          } catch (err: any) {
            console.warn('[OrderFillNotifier] Trade save failed:', err.message);
          }
        })();
      }
    }

    return notifiedCount;
  } catch (err: any) {
    console.warn('[OrderFillNotifier] pollForFills error:', err.message);
    return 0;
  }
}

export function startFillPoller(intervalMs: number = 15000) {
  if (typeof window === 'undefined') return () => {};

  // Poll immediately
  pollForFills();

  const id = setInterval(() => {
    pollForFills();
  }, intervalMs);

  return () => clearInterval(id);
}
