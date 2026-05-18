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
 */

import { cookies } from 'next/headers';

export interface AlpacaSession {
  userId: string;
  apiKey: string;
  secretKey: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOKIE_NAME = 'alpaca_session_id';

// Server-only in-memory key cache
// Keys are decrypted once per session and held here
const sessionMap = new Map<string, AlpacaSession>();

/**
 * Create a new session — stores decrypted keys in memory
 * and sets an HTTP-only cookie for identification.
 */
export async function createSession(
  userId: string,
  apiKey: string,
  secretKey: string
): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;

  // Store keys in server memory (never sent to client)
  sessionMap.set(userId, {
    userId,
    apiKey,
    secretKey,
    expiresAt,
  });

  // Set HTTP-only cookie for session identification
  // The cookie contains ONLY the user ID — keys stay in memory
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: '/',
  });
}

/**
 * Retrieve decrypted Alpaca keys for the current session.
 * Returns null if session is expired or not found.
 */
export async function getSessionKeys(): Promise<{
  apiKey: string;
  secretKey: string;
} | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(COOKIE_NAME)?.value;

  if (!userId) return null;

  const session = sessionMap.get(userId);
  if (!session) return null;

  // Check expiry
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
