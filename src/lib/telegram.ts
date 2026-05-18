// ── Types ───────────────────────────────────────────────────────
export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
  /** Idempotency: skip if this order+type was already sent */
  idempotencyKey?: { orderId: string; messageType: string };
}

// ── Telegram Bot API ────────────────────────────────────────────
const TELEGRAM_BASE = 'https://api.telegram.org';

function getToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegramMessage(msg: TelegramMessage): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    const url = `${TELEGRAM_BASE}/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.chatId,
        text: msg.text,
        parse_mode: msg.parseMode || 'HTML',
        disable_notification: msg.disableNotification || false,
      }),
    });

    const json = await res.json();
    if (!json.ok) {
      return { ok: false, error: json.description || `Telegram API error ${res.status}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to send Telegram message' };
  }
}

/**
 * Get updates from Telegram to find chat IDs
 * Call this once to discover your chat ID after messaging the bot
 */
export async function getTelegramUpdates(limit = 10): Promise<{ ok: boolean; chats?: Array<{ id: string; username?: string; firstName?: string }>; error?: string }> {
  const token = getToken();
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    const res = await fetch(`${TELEGRAM_BASE}/bot${token}/getUpdates?limit=${limit}`);
    const json = await res.json();

    if (!json.ok) {
      return { ok: false, error: json.description };
    }

    const chats = new Map<string, { id: string; username?: string; firstName?: string }>();
    for (const update of json.result || []) {
      const msg = update.message || update.callback_query?.message;
      if (msg?.chat?.id) {
        const id = String(msg.chat.id);
        chats.set(id, {
          id,
          username: msg.chat.username,
          firstName: msg.chat.first_name,
        });
      }
    }

    return { ok: true, chats: Array.from(chats.values()) };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Message Builders ────────────────────────────────────────────
export function formatOrderAlert(params: {
  symbol: string;
  side: string;
  qty: number;
  price: number;
  status: string;
  filledQty?: number;
}): string {
  const emoji = params.side === 'buy' ? '🟢' : '🔴';
  const fillPct = params.filledQty ? Math.round((params.filledQty / params.qty) * 100) : 0;
  const total = params.qty * params.price;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  const statusLabel = params.status.toUpperCase();
  const lines: string[] = [
    `${emoji} <b>Order Status: ${statusLabel}</b>`,
    ``,
    `<b>Symbol:</b> ${params.symbol}`,
    `<b>Side:</b> ${params.side.toUpperCase()}`,
    `<b>Qty:</b> ${params.qty}`,
    `<b>Price:</b> $${params.price.toFixed(2)}`,
    `<b>Total:</b> $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
  ];

  if (params.filledQty !== undefined && params.status.toLowerCase() === 'filled') {
    lines.push(`<b>Filled:</b> ${fillPct}% (${params.filledQty}/${params.qty})`);
  }

  lines.push(
    `<b>Date &amp; Time:</b> ${dateStr}, ${timeStr} ET`
  );

  return lines.join('\n');
}

export function formatNewsAlert(params: {
  symbol: string;
  headline: string;
  sentiment: string;
  source: string;
  url?: string;
}): string {
  const emoji = params.sentiment === 'bullish' ? '🟢' : params.sentiment === 'bearish' ? '🔴' : '⚪';

  return `${emoji} <b>NEWS ALERT: ${params.symbol}</b>

${params.headline}

Sentiment: ${params.sentiment.toUpperCase()}
Source: ${params.source}
${params.url ? `<a href="${params.url}">Read more</a>` : ''}`;
}

export function formatPriceTargetAlert(params: {
  symbol: string;
  target: number;
  current: number;
  direction: 'above' | 'below';
}): string {
  const emoji = params.direction === 'above' ? '📈' : '📉';

  return `${emoji} <b>PRICE TARGET HIT: ${params.symbol}</b>

Target: $${params.target.toFixed(2)}
Current: $${params.current.toFixed(2)}

${params.direction === 'above' ? 'Price broke above target!' : 'Price dropped below target!'}`;
}

export function formatMacroAlert(event: {
  title: string;
  date: string;
  impact: string;
  description?: string;
}): string {
  const emoji = event.impact === 'high' ? '🔴' : event.impact === 'medium' ? '🟡' : '⚪';

  return `${emoji} <b>MACRO EVENT: ${event.title}</b>

Date: ${event.date}
Impact: ${event.impact.toUpperCase()}
${event.description ? `\n${event.description}` : ''}`;
}

// ── Idempotency: Prevent duplicate Telegram notifications ──────

export type NotificationMessageType = 'placed' | 'accepted' | 'filled' | 'cancelled';

/**
 * Check if a notification for this order+type was already sent.
 * Prevents Vercel redeploys from replaying old trade notifications.
 */
export async function wasNotificationSent(
  userId: string,
  orderId: string,
  messageType: NotificationMessageType
): Promise<boolean> {
  try {
    const { getClient } = await import('@/lib/supabase');
    const supabase = getClient();
    const result = await supabase
      .from('recent_notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('order_id', orderId)
      .eq('message_type', messageType)
      .single();

    return !!result.data;
  } catch (err: any) {
    // .single() throws PGRST116 when no row found — that means not sent yet
    if (err?.code === 'PGRST116' || err?.message?.includes('JSON object requested')) {
      return false;
    }
    console.warn('[Telegram] Idempotency check error:', err.message);
    return false; // On error, allow sending (better to duplicate than miss)
  }
}

/**
 * Record that a notification was sent for this order+type.
 */
export async function recordNotificationSent(
  userId: string,
  orderId: string,
  messageType: string
): Promise<void> {
  try {
    const { getClient } = await import('@/lib/supabase');
    const supabase = getClient();
    await supabase
      .from('recent_notifications')
      .insert({
        user_id: userId,
        order_id: orderId,
        message_type: messageType,
      });
  } catch (err: any) {
    console.warn('[Telegram] recordNotificationSent error:', err.message);
  }
}

/**
 * Delete notifications older than N days (default 7).
 * Should be called from a daily cron job.
 */
export async function cleanupOldNotifications(daysOld = 7): Promise<{ deleted: number; error?: string }> {
  try {
    const { getClient } = await import('@/lib/supabase');
    const supabase = getClient();
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const { error, count } = await supabase
      .from('recent_notifications')
      .delete({ count: 'exact' })
      .lt('sent_at', cutoff);

    if (error) {
      console.error('[Telegram] Cleanup error:', error.message);
      return { deleted: 0, error: error.message };
    }

    console.log(`[Telegram] Cleaned up ${count || 0} old notifications (>${daysOld}d)`);
    return { deleted: count || 0 };
  } catch (err: any) {
    return { deleted: 0, error: err.message };
  }
}
