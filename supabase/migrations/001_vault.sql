-- Migration 001: Alpaca Key Vault
-- Run this in the Supabase SQL Editor (one-time setup)

-- 1. Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add encrypted key columns to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS alpaca_api_key bytea,
  ADD COLUMN IF NOT EXISTS alpaca_secret_key bytea,
  ADD COLUMN IF NOT EXISTS master_password_hash text;

-- 3. RPC: Store encrypted Alpaca keys
-- Called from server-side only — encryption key never leaves the server
CREATE OR REPLACE FUNCTION vault_store_keys(
  p_user_id uuid,
  p_api_key text,
  p_secret_key text,
  p_master_hash text,
  p_encryption_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE users SET
    alpaca_api_key = pgp_sym_encrypt(p_api_key, p_encryption_key),
    alpaca_secret_key = pgp_sym_encrypt(p_secret_key, p_encryption_key),
    master_password_hash = p_master_hash
  WHERE id = p_user_id;
END;
$$;

-- 4. RPC: Retrieve decrypted Alpaca keys
-- Only callable server-side with the correct encryption key
CREATE OR REPLACE FUNCTION vault_get_keys(
  p_user_id uuid,
  p_encryption_key text
)
RETURNS TABLE(api_key text, secret_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pgp_sym_decrypt(alpaca_api_key, p_encryption_key)::text,
    pgp_sym_decrypt(alpaca_secret_key, p_encryption_key)::text
  FROM users
  WHERE id = p_user_id
    AND alpaca_api_key IS NOT NULL;
END;
$$;

-- 5. RPC: Verify master password hash
-- Only returns the stored hash — comparison happens server-side
CREATE OR REPLACE FUNCTION vault_get_password_hash(
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT master_password_hash INTO v_hash
  FROM users WHERE id = p_user_id;
  RETURN v_hash;
END;
$$;

-- 6. RPC: Clear stored keys (for key rotation / sign-out)
CREATE OR REPLACE FUNCTION vault_clear_keys(
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE users SET
    alpaca_api_key = NULL,
    alpaca_secret_key = NULL
  WHERE id = p_user_id;
END;
$$;

-- 7. Row-Level Security: only allow the user themselves to access their keys
-- The RPC functions above use SECURITY DEFINER, so they bypass RLS.
-- This RLS policy ensures direct table access is blocked.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own keys" ON users;
CREATE POLICY "Users can read own keys" ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Note: No direct INSERT/UPDATE policies on encrypted columns.
-- All key operations MUST go through the vault_* RPC functions.
