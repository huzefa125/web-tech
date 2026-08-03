/**
 * Password policy — NIST SP 800-63B shape: length over composition rules,
 * plus a breach-corpus check.
 */

import { createHash } from 'node:crypto';

import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Check a password against the Have I Been Pwned range API using
 * k-anonymity: only the first 5 characters of the SHA-1 leave this process,
 * so the password itself is never transmitted.
 *
 * Fails OPEN. A third-party outage must not block signups — availability of
 * our own service does not depend on theirs.
 */
export async function isPasswordBreached(plain: string): Promise<boolean> {
  if (!env.HIBP_ENABLED) return false;

  const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'iip-backend' },
      signal: AbortSignal.timeout(env.HIBP_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'HIBP check returned non-OK; failing open');
      return false;
    }
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, countRaw] = line.trim().split(':');
      if (hashSuffix === suffix) {
        // With Add-Padding the API injects zero-count filler rows.
        return Number(countRaw ?? 0) > 0;
      }
    }
    return false;
  } catch (err) {
    logger.warn({ err }, 'HIBP check failed; failing open');
    return false;
  }
}

/** Synchronous structural checks. Does not hit the network. */
export function checkPasswordStrength(plain: string, context: { email?: string } = {}): PasswordCheck {
  if (plain.length < env.PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters` };
  }
  if (plain.length > 256) {
    // Upper bound purely to cap Argon2 work — not a complexity rule.
    return { ok: false, reason: 'Password must be at most 256 characters' };
  }
  if (context.email) {
    const local = context.email.split('@')[0]?.toLowerCase();
    if (local && local.length >= 3 && plain.toLowerCase().includes(local)) {
      return { ok: false, reason: 'Password must not contain your email address' };
    }
  }
  return { ok: true };
}

/** Full policy: structural checks then the breach-corpus lookup. */
export async function validatePassword(
  plain: string,
  context: { email?: string } = {},
): Promise<PasswordCheck> {
  const structural = checkPasswordStrength(plain, context);
  if (!structural.ok) return structural;

  if (await isPasswordBreached(plain)) {
    return {
      ok: false,
      reason: 'This password has appeared in a known data breach. Please choose a different one.',
    };
  }
  return { ok: true };
}
