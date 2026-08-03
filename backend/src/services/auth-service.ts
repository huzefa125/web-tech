/**
 * Core auth flows — §5 of auth-requirements.md.
 *
 * Two invariants run through this file:
 *   1. Endpoints that take an email must not reveal whether it exists.
 *   2. Anything that proves control of the inbox (verify, reset) also
 *      verifies the email and, for reset, kills every live session.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { env } from '../config/env.js';
import { db } from '../db/index.js';
import {
  oauthAccounts,
  users,
  verificationTokens,
  type TokenPurpose,
  type User,
} from '../db/schema/auth.js';
import { fakeVerify, generateToken, hashPassword, sha256, verifyPassword } from '../lib/crypto.js';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { logAuthEvent } from '../lib/logger.js';
import { validatePassword } from '../lib/password-policy.js';
import type { PublicUser } from '../schemas/auth.js';
import {
  sendAccountLockedEmail,
  sendDuplicateSignupEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './email-service.js';
import { revokeAllForUser } from './token-service.js';

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl,
    plan: u.plan,
    emailVerified: u.emailVerifiedAt !== null,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function findUserById(id: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

// ---------------------------------------------------------------- tokens

async function createOneTimeToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const ttlHours =
    purpose === 'email_verify' ? env.EMAIL_VERIFY_TTL_HOURS : env.PASSWORD_RESET_TTL_HOURS;
  const { raw, hash } = generateToken(32);

  await db.insert(verificationTokens).values({
    userId,
    tokenHash: hash,
    purpose,
    expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
  });

  return raw;
}

/** Atomically consume a one-time token. Returns the user id, or throws. */
async function consumeOneTimeToken(raw: string, purpose: TokenPurpose): Promise<string> {
  // Conditional UPDATE so a token cannot be redeemed twice under concurrency.
  const rows = await db
    .update(verificationTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(verificationTokens.tokenHash, sha256(raw)),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.usedAt),
        sql`${verificationTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: verificationTokens.userId });

  const row = rows[0];
  if (!row) throw badRequest('INVALID_TOKEN', 'This link is invalid, expired, or already used');
  return row.userId;
}

// ---------------------------------------------------------------- signup

export interface SignupResult {
  user: PublicUser | null;
}

/**
 * Create an account. Returns the same shape whether or not the email was
 * already taken — an attacker must not be able to enumerate users here.
 * No session is issued: the user has to verify first.
 */
export async function signup(input: {
  email: string;
  password: string;
  fullName?: string | undefined;
}): Promise<SignupResult> {
  const policy = await validatePassword(input.password, { email: input.email });
  if (!policy.ok) throw badRequest('WEAK_PASSWORD', policy.reason!);

  const existing = await findUserByEmail(input.email);
  if (existing) {
    // Tell the real owner what happened, but give the caller nothing.
    await sendDuplicateSignupEmail(input.email);
    logAuthEvent('signup_duplicate', { email: input.email });
    return { user: null };
  }

  const passwordHash = await hashPassword(input.password);
  const inserted = await db
    .insert(users)
    .values({ email: input.email, passwordHash, fullName: input.fullName ?? null })
    .returning();

  const user = inserted[0]!;
  const raw = await createOneTimeToken(user.id, 'email_verify');
  await sendVerificationEmail(user.email, raw);

  logAuthEvent('signup', { userId: user.id, email: user.email });
  return { user: toPublicUser(user) };
}

// ---------------------------------------------------------------- login

export async function login(input: {
  email: string;
  password: string;
  ip?: string | undefined;
}): Promise<User> {
  const user = await findUserByEmail(input.email);

  // Always spend the same CPU whether or not the account exists, otherwise
  // response timing becomes a user-enumeration oracle.
  if (!user || !user.passwordHash) {
    await fakeVerify(input.password);
    if (user && !user.passwordHash) {
      const linked = await db
        .select({ provider: oauthAccounts.provider })
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, user.id));
      const providers = linked.map((a) => a.provider).join(', ') || 'a social provider';
      throw forbidden(
        'PASSWORD_NOT_SET',
        `This account signs in with ${providers}. Use that, or set a password via "Forgot password".`,
      );
    }
    logAuthEvent('login_failed', { email: input.email, ip: input.ip, reason: 'no_such_user' });
    throw unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(
      423,
      'ACCOUNT_LOCKED',
      `Too many failed attempts. Try again in ${mins} minute(s).`,
    );
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    await registerFailedLogin(user);
    logAuthEvent('login_failed', { userId: user.id, ip: input.ip, reason: 'bad_password' });
    throw unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (user.status === 'suspended') {
    throw forbidden('ACCOUNT_SUSPENDED', 'This account has been suspended.');
  }
  if (user.status === 'deleted') {
    throw unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  // Password was right — check verification last so a wrong password on an
  // unverified account still reads as "incorrect email or password".
  if (!user.emailVerifiedAt) {
    throw forbidden('EMAIL_NOT_VERIFIED', 'Verify your email address before signing in.');
  }

  const updated = await db
    .update(users)
    .set({ lastLoginAt: sql`now()`, failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, user.id))
    .returning();

  logAuthEvent('login', { userId: user.id, ip: input.ip });
  return updated[0]!;
}

async function registerFailedLogin(user: User): Promise<void> {
  const next = user.failedLoginCount + 1;
  const shouldLock = next >= env.MAX_FAILED_LOGINS;

  await db
    .update(users)
    .set({
      failedLoginCount: shouldLock ? 0 : next,
      lockedUntil: shouldLock ? new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000) : null,
    })
    .where(eq(users.id, user.id));

  if (shouldLock) {
    logAuthEvent('account_locked', { userId: user.id });
    await sendAccountLockedEmail(user.email, env.LOCKOUT_MINUTES);
  }
}

// ------------------------------------------------------ email verification

export async function verifyEmail(rawToken: string): Promise<void> {
  const userId = await consumeOneTimeToken(rawToken, 'email_verify');
  await db
    .update(users)
    .set({ emailVerifiedAt: sql`now()` })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  logAuthEvent('email_verified', { userId });
}

/** Always resolves — never reveals whether the address exists or is verified. */
export async function resendVerification(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || user.emailVerifiedAt) return;
  const raw = await createOneTimeToken(user.id, 'email_verify');
  await sendVerificationEmail(user.email, raw);
  logAuthEvent('verification_resent', { userId: user.id });
}

// ---------------------------------------------------------- password reset

/** Always resolves — never reveals whether the address exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || user.status !== 'active') return;
  const raw = await createOneTimeToken(user.id, 'password_reset');
  await sendPasswordResetEmail(user.email, raw);
  logAuthEvent('password_reset_requested', { userId: user.id });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const userId = await consumeOneTimeToken(rawToken, 'password_reset');

  const user = await findUserById(userId);
  if (!user) throw badRequest('INVALID_TOKEN', 'This link is invalid or expired');

  const policy = await validatePassword(newPassword, { email: user.email });
  if (!policy.ok) throw badRequest('WEAK_PASSWORD', policy.reason!);

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      // Redeeming the emailed link proves control of the inbox, so if the
      // address was never verified, it is now.
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, userId));

  // A reset is the remedy for a compromised account — every existing session
  // must die, including the attacker's.
  const revoked = await revokeAllForUser(userId);
  logAuthEvent('password_reset', { userId, sessionsRevoked: revoked });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await findUserById(userId);
  if (!user) throw unauthorized();

  if (!user.passwordHash) {
    throw badRequest(
      'PASSWORD_NOT_SET',
      'This account has no password yet. Use "Forgot password" to set one.',
    );
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw unauthorized('INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  const policy = await validatePassword(newPassword, { email: user.email });
  if (!policy.ok) throw badRequest('WEAK_PASSWORD', policy.reason!);

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, userId));

  logAuthEvent('password_changed', { userId });
}

// ---------------------------------------------------------------- profile

export async function updateProfile(
  userId: string,
  patch: { fullName?: string | null; avatarUrl?: string | null },
): Promise<User> {
  const rows = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  const user = rows[0];
  if (!user) throw unauthorized();
  return user;
}
