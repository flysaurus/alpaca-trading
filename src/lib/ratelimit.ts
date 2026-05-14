// Simple in-memory rate limiter: 100 requests per minute per IP
// Note: resets on cold starts. For production, use Redis/Vercel KV.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // New window
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: now + WINDOW_MS };
  }

  if (entry.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + WINDOW_MS,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetAt: entry.windowStart + WINDOW_MS,
  };
}

export function getClientIP(request: Request): string {
  // Try forwarded headers first (Vercel / proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;
  // Fallback (not available in all edge runtimes)
  return 'unknown';
}

export function rateLimitHeaders(result: {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(MAX_REQUESTS),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
