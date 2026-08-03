/** Unit tests for the crypto/JWT/policy primitives — no database needed. */

import { describe, expect, it, vi } from 'vitest';

import {
  fakeVerify,
  generateToken,
  hashPassword,
  safeEqual,
  sha256,
  verifyPassword,
} from '../src/lib/crypto.js';
import { signAccessToken, verifyAccessToken } from '../src/lib/jwt.js';
import { checkPasswordStrength, isPasswordBreached } from '../src/lib/password-policy.js';

describe('password hashing', () => {
  it('produces an argon2id hash, not the plaintext', async () => {
    const hash = await hashPassword('my-secret-password');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('my-secret-password');
  });

  it('salts — the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-input'), hashPassword('same-input')]);
    expect(a).not.toBe(b);
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('the-right-one');
    expect(await verifyPassword(hash, 'the-right-one')).toBe(true);
    expect(await verifyPassword(hash, 'the-wrong-one')).toBe(false);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });

  it('does not truncate long passwords the way bcrypt does', async () => {
    const base = 'x'.repeat(72);
    const hash = await hashPassword(`${base}AAAA`);
    expect(await verifyPassword(hash, `${base}BBBB`)).toBe(false);
  });

  it('fakeVerify always resolves false', async () => {
    expect(await fakeVerify('anything')).toBe(false);
  });
});

describe('opaque tokens', () => {
  it('returns a raw value and its sha256', () => {
    const { raw, hash } = generateToken(32);
    expect(hash).toBe(sha256(raw));
    expect(hash).toHaveLength(64);
  });

  it('is unpredictable across calls', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateToken(32).raw));
    expect(seen.size).toBe(200);
  });

  it('safeEqual compares correctly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('access tokens', () => {
  const claims = { userId: crypto.randomUUID(), email: 'jwt@example.com', plan: 'pro' as const };

  it('round-trips the claims', async () => {
    const { token } = await signAccessToken(claims);
    const decoded = await verifyAccessToken(token);

    expect(decoded?.sub).toBe(claims.userId);
    expect(decoded?.email).toBe(claims.email);
    expect(decoded?.plan).toBe('pro');
    expect(decoded?.jti).toBeTypeOf('string');
  });

  it('reports the configured lifetime', async () => {
    const { expiresIn } = await signAccessToken(claims);
    expect(expiresIn).toBe(15 * 60);
  });

  it('rejects a tampered payload', async () => {
    const { token } = await signAccessToken(claims);
    const [header, payload, sig] = token.split('.');
    const forged = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    forged.plan = 'enterprise';
    const tampered = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;

    expect(await verifyAccessToken(tampered)).toBeNull();
  });

  it('rejects an alg=none token', async () => {
    // Classic algorithm-confusion attack; jose is pinned to HS256.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    expect(await verifyAccessToken(`${header}.${payload}.`)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifyAccessToken('not.a.jwt')).toBeNull();
    expect(await verifyAccessToken('')).toBeNull();
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    try {
      const { token } = await signAccessToken(claims);
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(await verifyAccessToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('password policy', () => {
  it('enforces the minimum length', () => {
    expect(checkPasswordStrength('short').ok).toBe(false);
    expect(checkPasswordStrength('a-long-enough-password').ok).toBe(true);
  });

  it('caps the maximum length', () => {
    expect(checkPasswordStrength('x'.repeat(257)).ok).toBe(false);
  });

  it('rejects a password containing the email local-part', () => {
    const res = checkPasswordStrength('jonathan-secret-pw', { email: 'jonathan@example.com' });
    expect(res.ok).toBe(false);
  });

  it('imposes no composition rules', () => {
    // NIST SP 800-63B: length, not character-class gymnastics.
    expect(checkPasswordStrength('all lowercase words here').ok).toBe(true);
  });

  it('fails open when the breach API is unreachable', async () => {
    vi.stubEnv('HIBP_ENABLED', 'true');
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    try {
      // A third-party outage must not block signups.
      expect(await isPasswordBreached('some-password')).toBe(false);
    } finally {
      spy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('is a no-op when the breach check is disabled', async () => {
    // HIBP_ENABLED is 'false' for this suite — must not touch the network.
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await isPasswordBreached('password')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
