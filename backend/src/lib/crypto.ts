/**
 * Password hashing and opaque-token primitives.
 */

import { hash as argon2Hash, verify as argon2Verify, Algorithm } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Argon2id parameters. OWASP's 2024 baseline recommendation is
 * m=19MiB, t=2, p=1; we use 64MiB which is comfortably above it and still
 * fast enough (~50ms) for an interactive login on modest hardware.
 */
const ARGON2_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, plain, ARGON2_OPTS);
  } catch {
    // Malformed hash in the database — treat as a failed login, never a 500.
    return false;
  }
}

/**
 * A precomputed Argon2id hash of a random string, used to burn the same CPU
 * time on a login attempt for an email that does not exist. Without this the
 * response time tells an attacker whether an account exists.
 */
let dummyHashPromise: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHashPromise;
}

/** Burn equivalent CPU time when there is no user to verify against. */
export async function fakeVerify(plain: string): Promise<false> {
  await verifyPassword(await getDummyHash(), plain);
  return false;
}

/**
 * Generate an opaque token. Returns the raw value (sent to the user exactly
 * once) and its SHA-256, which is what we store.
 *
 * SHA-256 rather than Argon2 is correct here: these are 256-bit random values,
 * not low-entropy passwords, so there is nothing to brute-force and we need
 * the lookup to be an indexed equality match.
 */
export function generateToken(bytes = 32): { raw: string; hash: string } {
  const raw = randomBytes(bytes).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison for equal-length hex/base64 digests. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
