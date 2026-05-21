/**
 * Server-side Alpaca Session Manager
 *
 * Architecture:
 * - When user enters master password, keys are decrypted from Supabase Vault
 * - Decrypted keys are stored in server memory (this module's Map)
 * - An HTTP-only cookie identifies the session (session_user_id)
 * - Keys are NEVER sent to the client
 * - Sessions auto-expire after 24 hours
 *
 * ⚠️  Vercel Serverless Note:
 * The in-memory Map resets on cold starts (new function instances).
 * The session cookie persists, so on a cold start, the user simply
 * re-enters their master password to re-populate the key cache.
 * In practice, warm instances handle most requests.
 *
 * ⚠️  Cookie responsibility:
 * this module does NOT set the session cookie. Route handlers
 * (authenticate-session, update-keys) set the cookie on their
 * NextResponse objects. This avoids conflicts between cookies()
 * and NextResponse.cookies.set().
 */

import { cookies } from 'next/headers';
import { decryptKeys } from '@/lib/supabase-vault';

export interface AlpacaSession {
  userId: string;
  apiKey: string;
  secretKey: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const COOKIE_NAME = 'alpaca_session_id';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
  path: '/',
};

// Server-only in-memory key cache
// Keys are decrypted once per session and held here
const sessionMap = new Map<string, AlpacaSession>();

/**
 * Create a new session — stores decrypted keys in memory only.
 * The calling route handler MUST set the cookie via response.cookies.set().
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
 * Retrieve decrypted Alpaca keys for the current session.
 * Returns null if session is expired or not found.
 *
 * ⚠️  Cold-start resilience:
 * On Vercel serverless, the in-memory Map is wiped between Lambda
 * invocations. When a cookie exists but the Map is empty, this
 * function recovers by re-decrypting keys from Supabase Vault.
 */
export async function getSessionKeys(): Promise<{
  apiKey: string;
  secretKey: string;
} | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(COOKIE_NAME)?.value;

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
 * Get session keys for a specific user ID (used by middleware).
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
 * Destroy the current session — clears memory and cookie.
 */
export function clearSession(userId?: string): void {
  if (userId) {
    sessionMap.delete(userId);
  }
  // Cookie clearing happens in the response (API route)
}

/**
 * Get the user ID from the session cookie without checking the key cache.
 */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

/**
 * Alias for getSessionUserId — used by API routes to identify the user.
 */
export const getUserId = getSessionUserId;

/**
 * Require a valid session — returns decrypted keys or null.
 * API routes call this at the top to gate access.
 */
export async function requireSession(): Promise<{
  apiKey: string;
  secretKey: string;
} | null> {
  return getSessionKeys();
}
