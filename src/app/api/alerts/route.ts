import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { addNotification, AlertRule, checkAlerts } from '@/lib/notifications';

// In-memory store for alerts (resets on deploy — for production use Redis/Vercel KV)
interface Alert {
  id: string;
  symbol: string;
  keywords: string[];
  sentiment: 'any' | 'bullish' | 'bearish';
  createdAt: string;
  active: boolean;
}

let alerts: Alert[] = [];

// Load alerts from localStorage on server start (simulated)
if (typeof process !== 'undefined' && process.env && process.env.ALERTS_DATA) {
  try {
    const stored = JSON.parse(process.env.ALERTS_DATA);
    if (Array.isArray(stored)) alerts = stored;
  } catch {
    // Ignore
  }
}

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');

  let result = alerts;
  if (symbol) {
    result = alerts.filter(a => a.symbol === symbol.toUpperCase());
  }

  return NextResponse.json(
    { alerts: result.filter(a => a.active), count: result.length },
    { headers: rateLimitHeaders(limit) }
  );
}

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
    const { symbol, keywords, sentiment = 'any' } = body;

    if (!symbol || !Array.isArray(keywords)) {
      return NextResponse.json(
        { error: 'symbol and keywords array required' },
        { status: 400, headers: rateLimitHeaders(limit) }
      );
    }

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      symbol: symbol.toUpperCase(),
      keywords: keywords.map((k: string) => k.toLowerCase().trim()).filter(Boolean),
      sentiment,
      createdAt: new Date().toISOString(),
      active: true,
    };

    alerts.push(alert);
    
    // Save to env for persistence (Vercel KV would be better for production)
    process.env.ALERTS_DATA = JSON.stringify(alerts);

    return NextResponse.json(
      { success: true, alert },
      { status: 201, headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create alert' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}

export async function DELETE(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Alert id required' },
      { status: 400, headers: rateLimitHeaders(limit) }
    );
  }

  alerts = alerts.filter(a => a.id !== id);

  return NextResponse.json(
    { success: true },
    { headers: rateLimitHeaders(limit) }
  );
}
