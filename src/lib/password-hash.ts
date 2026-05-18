import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash the master password.
 * Only the hash is stored in Supabase — never the plaintext password.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a stored bcrypt hash.
 */
export async function verifyHash(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
