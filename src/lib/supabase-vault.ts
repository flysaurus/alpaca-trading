import { createClient } from '@supabase/supabase-js';
import { hashPassword, verifyHash } from './password-hash';

/**
 * Supabase Vault — Encrypted Alpaca Key Storage
 *
 * Architecture:
 * - Keys are encrypted with pgcrypto (AES-256) using a server-side
 *   encryption key stored in VAULT_ENCRYPTION_KEY env var.
 * - Encryption/decryption happens inside Postgres via RPC functions.
 * - The encryption key NEVER leaves the server and NEVER touches the client.
 * - Master password hash (bcrypt) is stored for verification only.
 */

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getEncryptionKey(): string {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'VAULT_ENCRYPTION_KEY environment variable is required for key encryption'
    );
  }
  return key;
}

/**
 * Encrypt and store Alpaca API keys in Supabase.
 * - apiKey and secretKey are encrypted with pgcrypto server-side.
 * - masterPassword is hashed with bcrypt — only the hash is stored.
 *
 * @returns null on success, or an Error message string
 */
export async function encryptAndStoreKeys(
  userId: string,
  apiKey: string,
  secretKey: string,
  masterPassword: string
): Promise<string | null> {
  const supabase = getSupabaseClient();
  const encryptionKey = getEncryptionKey();
  const masterHash = await hashPassword(masterPassword);

  const { error } = await supabase.rpc('vault_store_keys', {
    p_user_id: userId,
    p_api_key: apiKey,
    p_secret_key: secretKey,
    p_master_hash: masterHash,
    p_encryption_key: encryptionKey,
  });

  if (error) {
    console.error('[vault] Store keys failed:', error.message);
    return error.message;
  }

  return null;
}

/**
 * Verify that the provided master password matches the stored hash.
 */
export async function verifyMasterPassword(
  userId: string,
  masterPassword: string
): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc('vault_get_password_hash', {
    p_user_id: userId,
  });

  if (error || !data) {
    console.error('[vault] Password hash fetch failed:', error?.message);
    return false;
  }

  return verifyHash(masterPassword, data as string);
}

/**
 * Retrieve decrypted Alpaca keys from the vault.
 * Keys are decrypted inside Postgres via pgcrypto.
 * Returns null if no keys are stored or decryption fails.
 *
 * ⚠️  SECURITY: Never return these to the client.
 * Only call this from server-side code (API routes, cron, SSR).
 */
export async function decryptKeys(
  userId: string
): Promise<{ apiKey: string; secretKey: string } | null> {
  const supabase = getSupabaseClient();
  const encryptionKey = getEncryptionKey();

  const { data, error } = await supabase.rpc('vault_get_keys', {
    p_user_id: userId,
    p_encryption_key: encryptionKey,
  });

  if (error) {
    console.error('[vault] Decrypt keys failed:', error.message);
    return null;
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0] as { api_key: string; secret_key: string };
  if (!row.api_key || !row.secret_key) return null;

  return {
    apiKey: row.api_key,
    secretKey: row.secret_key,
  };
}

/**
 * Clear all stored keys for a user (key rotation / sign-out).
 */
export async function clearKeys(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.rpc('vault_clear_keys', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[vault] Clear keys failed:', error.message);
    return error.message;
  }

  return null;
}
