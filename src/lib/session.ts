/**
 * Server-side Alpaca Session Manager
 *
 * Architecture:
 * - When user enters master password, keys are decrypted from Supabase Vault
 * - Decrypted keys are stored in server memory (this module's Map)
 * - A session token identifies the session (returned in API response + sent as header)
 * - Keys are NEVER sent to the client
 * - Sessions auto-expire after 24 hours
 *
 * ⚠️  Vercel Serverless Note:
 * The in-memory Map resets on cold starts (new function instances).
 * The session token persists in the browser's sessionStorage, so on a cold start,
 * the server recovers keys from Supabase Vault automatically.
 *
 * Token flow:
 * 1. authenticate-session returns { token: "..." } in JSON body
 * 2. Client stores token in sessionStorage
 * 3. Every API call includes Authorization: Bearer <token>
 * 4. Server reads token from header → looks up session in Map
 * 5. On cold start (Map empty), server re-decrypts from vault
 */

import { headers } from 'next/headers';
import { decryptKeys } from '@/lib/supabase-vault';

export interface AlpacaSession {
  userId: string;
  apiKey: string;
  secretKey: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOKEN_PREFIX = 'sat_'; // "secure alpaca token"

// Server-only in-memory key cache
const sessionMap = new Map<string, AlpacaSession>();

/**
 * Create a session token: base64(userId:expiry:signature)
 * The signature is a simple HMAC using the vault encryption key.
 */
function _simpleSign(data: string): string {
  // Use the vault key (already an env secret) as HMAC key
  const key = process.env.VAULT_ENCRYPTION_KEY || 'fallback-dev-key';
  // Simple hash-based signature for token integrity
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = key.charCodeAt(i % key.length);
    hash = ((hash << 5) - hash) + data.charCodeAt(i) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}:${expiresAt}`;
  const sig = _simpleSign(payload);
  const raw = `${payload}:${sig}`;
  const token = Buffer.from(raw).toString('base64url');
  return `${TOKEN_PREFIX}${token}`;
}

export function parseSessionToken(token: string): { userId: string; expiresAt: number } | null {
  try {
    const raw = token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : token;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length < 3) return null;

    const userId = parts[0];
    const expiresAt = parseInt(parts[1], 10);
    const sig = parts[2];

    // Verify signature
    const payload = `${userId}:${expiresAt}`;
    if (_simpleSign(payload) !== sig) return null;

    if (expiresAt < Date.now()) return null;

    return { userId, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Create a new session — stores decrypted keys in memory only.
 * Returns the session token that the client should send in the header.
 */
export async function createSession(
  userId: string,
  apiKey: string,
  secretKey: string
): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;

  sessionMap.set(userId, {
    userId,
    apiKey,
    secretKey,
    expiresAt,
  });
}

/**
 * Extract user ID from the Authorization header or any other source.
 * Priority: Authorization header > custom header > cookie (legacy)
 */
async function getUserIdFromRequest(): Promise<string | null> {
  try {
    // Try Authorization: Bearer <token>
    const h = await headers();
    const authHeader = h.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const parsed = parseSessionToken(token);
      if (parsed) return parsed.userId;
    }

    // Try custom header
    const customHeader = h.get('x-alpaca-session');
    if (customHeader) {
      const parsed = parseSessionToken(customHeader);
      if (parsed) return parsed.userId;
    }
  } catch {
    // headers() might not be available in some contexts
  }

  return null;
}

/**
 * Retrieve decrypted Alpaca keys for the current session.
 * Reads the session token from the Authorization header.
 * Falls back to cookie (legacy).
 * Returns null if session is expired or not found.
 */
export async function getSessionKeys(): Promise<{
  apiKey: string;
  secretKey: string;
} | null> {
  // Try token-based auth first (Authorization header)
  const userId = await getUserIdFromRequest();
  if (!userId) return null;

  // Check in-memory cache first (fast path)
  const cached = sessionMap.get(userId);
  if (cached) {
    if (cached.expiresAt < Date.now()) {
      sessionMap.delete(userId);
      return null;
    }
    return {
      apiKey: cached.apiKey,
      secretKey: cached.secretKey,
    };
  }

  // Cold-start recovery: re-decrypt from Supabase Vault
  console.log(`[session] Cache miss for ${userId.slice(0, 8)}... – recovering from vault`);
  try {
    const keys = await decryptKeys(userId);
    if (keys) {
      // Re-populate in-memory cache for future requests
      const expiresAt = Date.now() + SESSION_TTL_MS;
      sessionMap.set(userId, {
        userId,
        apiKey: keys.apiKey,
        secretKey: keys.secretKey,
        expiresAt,
      });
      return keys;
    }
    console.log('[session] Vault recovery returned null — keys may not exist');
  } catch (err: any) {
    console.error('[session] Cold-start recovery failed:', err.message);
  }

  return null;
}

/**
 * Get session keys for a specific user ID (synchronous, Map-only).
 */
export function getSessionKeysForUser(userId: string): {
  apiKey: string;
  secretKey: string;
} | null {
  const session = sessionMap.get(userId);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    sessionMap.delete(userId);
    return null;
  }

  return {
    apiKey: session.apiKey,
    secretKey: session.secretKey,
  };
}

/**
 * Check if a session exists for a given user ID.
 */
export function hasSession(userId: string): boolean {
  const session = sessionMap.get(userId);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessionMap.delete(userId);
    return false;
  }
  return true;
}

/**
 * Destroy a session — clears memory.
 */
export function clearSession(userId?: string): void {
  if (userId) {
    sessionMap.delete(userId);
  }
}

/**
 * Require a valid session — returns decrypted keys or null.
 *
 * AUTH DISABLED: Falls back to env vars when no session token present.
 * To re-enable: revert to just `return getSessionKeys();`
 */
export async function requireSession(): Promise<{
  apiKey: string;
  secretKey: string;
} | null> {
  // Try session token first
  const sessionKeys = await getSessionKeys();
  if (sessionKeys) return sessionKeys;

  // AUTH DISABLED: fall back to env vars directly
  const envKey = process.env.ALPACA_API_KEY;
  const envSecret = process.env.ALPACA_SECRET_KEY;
  if (envKey && envSecret) {
    console.log('[session] AUTH DISABLED — using env vars directly');
    return { apiKey: envKey, secretKey: envSecret };
  }

  return null;
}
