// ── Order Fill Notifier ─────────────────────────────────────────
// Lightweight client-side poller that detects order fills
// and sends Telegram notifications for fill events.

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
  if (order.filledQty <= 0) return false;
  const notified = getNotifiedIds();
  return !notified.includes(order.id);
}

export async function pollForFills() {
  try {
    const res = await fetch('/api/orders?status=all&limit=20');
    if (!res.ok) return;
    const { orders } = await res.json();
    let notifiedCount = 0;

    for (const order of orders) {
      if (shouldNotify(order)) {
        markNotified(order.id);
        notifiedCount++;
        // Fire-and-forget Telegram notification via internal API
        fetch('/api/alerts/telegram-fill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order }),
        }).catch(() => { /*ignore*/ });
      }
    }

    return notifiedCount;
  } catch { return 0; }
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
