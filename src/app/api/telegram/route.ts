import { NextResponse } from 'next/server';
import { sendTelegramMessage, getTelegramUpdates, formatOrderAlert, formatNewsAlert } from '@/lib/telegram';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

// ── GET: Get chat IDs (for setup) ───────────────────────────────
export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const result = await getTelegramUpdates(20);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }

  return NextResponse.json(
    { chats: result.chats },
    { headers: rateLimitHeaders(limit) }
  );
}

// ── POST: Send test message ─────────────────────────────────────
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
    const { chatId, text, type } = body;

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId required' },
        { status: 400, headers: rateLimitHeaders(limit) }
      );
    }

    let messageText = text;
    if (type === 'order' && body.order) {
      messageText = formatOrderAlert(body.order);
    } else if (type === 'news' && body.news) {
      messageText = formatNewsAlert(body.news);
    }

    const result = await sendTelegramMessage({
      chatId,
      text: messageText || 'Test message from Alpaca Trading',
      parseMode: 'HTML',
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 500, headers: rateLimitHeaders(limit) }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500, headers: rateLimitHeaders(limit)}
    );
  }
}
