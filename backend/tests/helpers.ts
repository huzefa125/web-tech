/** Shared test fixtures and small assertions helpers. */

import { eq } from 'drizzle-orm';
import type { Response } from 'supertest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { users, verificationTokens, type TokenPurpose } from '../src/db/schema/auth.js';
import { hashPassword } from '../src/lib/crypto.js';

export const app = createApp();
export const api = () => request(app);
export const AUTH = '/api/v1/auth';

export const GOOD_PASSWORD = 'correct-horse-battery-staple-42';

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const email = overrides.email ?? `user-${crypto.randomUUID()}@example.com`;
  const rows = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(GOOD_PASSWORD),
      emailVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

/** A user who has signed up but not clicked the verification link. */
export async function createUnverifiedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return createUser({ emailVerifiedAt: null, ...overrides });
}

/** An OAuth-only user: no password set. */
export async function createOAuthOnlyUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return createUser({ passwordHash: null, ...overrides });
}

/**
 * Tokens are emailed, never returned by the API, so tests read the row and
 * regenerate a matching raw value is impossible — instead we insert a known
 * token directly.
 */
export async function issueRawToken(
  userId: string,
  purpose: TokenPurpose,
  opts: { expiresAt?: Date; usedAt?: Date } = {},
): Promise<string> {
  const { generateToken } = await import('../src/lib/crypto.js');
  const { raw, hash } = generateToken(32);
  await db.insert(verificationTokens).values({
    userId,
    tokenHash: hash,
    purpose,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 3_600_000),
    usedAt: opts.usedAt ?? null,
  });
  return raw;
}

/** Pull the refresh cookie value out of a Set-Cookie header. */
export function refreshCookieFrom(res: Response): string | null {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((c) => c.startsWith('iip_refresh='));
  if (!match) return null;
  const value = match.split(';')[0]!.split('=').slice(1).join('=');
  return value.length > 0 ? value : null;
}

export function cookieAttributes(res: Response): string[] {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((c) => c.startsWith('iip_refresh='));
  return match ? match.split(';').map((s: string) => s.trim()) : [];
}

/** Log in and return both halves of the session. */
export async function loginAs(email: string, password = GOOD_PASSWORD) {
  const res = await api().post(`${AUTH}/login`).send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return {
    accessToken: res.body.accessToken as string,
    refreshCookie: refreshCookieFrom(res)!,
    user: res.body.user,
  };
}

export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}
