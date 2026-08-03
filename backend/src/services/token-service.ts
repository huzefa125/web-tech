/**
 * Refresh-token lifecycle: issue, rotate, revoke.
 *
 * The rotation logic here implements §3.2 of the spec and is the single most
 * security-sensitive function in the codebase. Read the comments before
 * changing it.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { refreshTokens, type RefreshToken } from '../db/schema/auth.js';
import { generateToken, sha256 } from '../lib/crypto.js';
import { AppError, unauthorized } from '../lib/errors.js';
import { logAuthEvent, logger } from '../lib/logger.js';

export interface SessionContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
  familyId: string;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

/**
 * Issue a refresh token. Omit `familyId` to start a new family (fresh login);
 * pass one to continue an existing rotation lineage.
 */
export async function issueRefreshToken(
  userId: string,
  ctx: SessionContext = {},
  familyId?: string,
): Promise<IssuedRefreshToken> {
  const { raw, hash } = generateToken(32);
  const expiresAt = refreshExpiry();
  const family = familyId ?? randomUUID();

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hash,
    familyId: family,
    expiresAt,
    userAgent: ctx.userAgent?.slice(0, 512) ?? null,
    ip: ctx.ip?.slice(0, 45) ?? null,
  });

  return { raw, expiresAt, familyId: family };
}

/** Revoke every live token in a family. Called on reuse detection. */
export async function revokeFamily(familyId: string): Promise<number> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length;
}

/** Revoke every live token for a user — logout-all, password reset. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length;
}

/** Revoke a single token by its raw value. Used by logout. */
export async function revokeByRawToken(raw: string): Promise<boolean> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(refreshTokens.tokenHash, sha256(raw)), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length > 0;
}

/**
 * Owner of a refresh token, without consuming or validating it. Used by the
 * rate limiter, which has to key on the user before the handler runs. Revoked
 * and expired rows still resolve — someone replaying a dead token should be
 * rate-limited too.
 */
export async function findUserIdByRefreshToken(raw: string): Promise<string | null> {
  const row = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, sha256(raw)),
    columns: { userId: true },
  });
  return row?.userId ?? null;
}

export interface RotationResult {
  userId: string;
  next: IssuedRefreshToken;
}

/**
 * Consume a refresh token and issue its successor.
 *
 * Throws `TOKEN_REUSE_DETECTED` and kills the whole family if an
 * already-revoked token is presented — that means the token leaked and is
 * being replayed. Note this is strict: two genuinely concurrent refreshes
 * from the same client will trip it. The frontend MUST share a single
 * in-flight refresh promise (spec §7); failing closed is the right default.
 */
export async function rotateRefreshToken(
  raw: string,
  ctx: SessionContext = {},
): Promise<RotationResult> {
  const hash = sha256(raw);

  // Atomically claim the token. Doing the revoke as a conditional UPDATE
  // (rather than SELECT-then-UPDATE) means two concurrent requests cannot
  // both succeed — exactly one gets a row back.
  const claimed = await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
    .returning();

  const token: RefreshToken | undefined = claimed[0];

  if (!token) {
    // Either the token never existed, or it was already revoked. Only the
    // second case is a reuse attack, so look before deciding.
    const existing = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, hash),
    });

    if (existing) {
      const killed = await revokeFamily(existing.familyId);
      logAuthEvent('refresh_reuse_detected', {
        userId: existing.userId,
        familyId: existing.familyId,
        revokedCount: killed,
        ip: ctx.ip,
      });
      throw new AppError(
        401,
        'TOKEN_REUSE_DETECTED',
        'Session invalidated for security reasons. Please sign in again.',
      );
    }

    throw unauthorized('INVALID_TOKEN', 'Invalid refresh token');
  }

  if (token.expiresAt.getTime() <= Date.now()) {
    logAuthEvent('refresh_expired', { userId: token.userId });
    throw unauthorized('SESSION_EXPIRED', 'Session expired. Please sign in again.');
  }

  const next = await issueRefreshToken(token.userId, ctx, token.familyId);
  return { userId: token.userId, next };
}

/** Active (non-revoked, non-expired) sessions for the sessions UI. */
export async function listActiveSessions(userId: string) {
  return db
    .select({
      id: refreshTokens.id,
      userAgent: refreshTokens.userAgent,
      ip: refreshTokens.ip,
      createdAt: refreshTokens.createdAt,
      expiresAt: refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        sql`${refreshTokens.expiresAt} > now()`,
      ),
    );
}

/** Revoke one session by id, scoped to the owner so users cannot kill others'. */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(refreshTokens.id, sessionId),
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ),
    )
    .returning({ id: refreshTokens.id });
  return rows.length > 0;
}

/**
 * Delete expired rows. Without this the table grows without bound — see the
 * open question in spec §9. Wire to a BullMQ repeatable job.
 */
export async function pruneExpiredTokens(): Promise<number> {
  const rows = await db
    .delete(refreshTokens)
    .where(lt(refreshTokens.expiresAt, sql`now()`))
    .returning({ id: refreshTokens.id });
  if (rows.length) logger.info({ count: rows.length }, 'pruned expired refresh tokens');
  return rows.length;
}
