// ── Types ───────────────────────────────────────────────────────
export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
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
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });

  return `${emoji} <b>ORDER ${params.status.toUpperCase()}</b>
📅 ${dateStr} | 🕐 ${timeStr} ET

Symbol: <code>${params.symbol}</code>
Side: ${params.side.toUpperCase()}
Qty: ${params.qty}
Price: $${params.price.toFixed(2)}
${params.filledQty !== undefined ? `Fill: ${fillPct}% (${params.filledQty}/${params.qty})` : ''}`;
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
