import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../src/db/index.js';
import { users, verificationTokens } from '../src/db/schema/auth.js';
import { verifyPassword } from '../src/lib/crypto.js';
import {
  AUTH,
  GOOD_PASSWORD,
  api,
  createUnverifiedUser,
  createUser,
  getUserByEmail,
  issueRawToken,
  loginAs,
} from './helpers.js';

const cookie = (v: string) => [`iip_refresh=${v}`];
const NEW_PASSWORD = 'an-entirely-different-passphrase-99';

describe('email verification', () => {
  it('verifies with a valid token and then allows login', async () => {
    const user = await createUnverifiedUser({ email: 'verify-me@example.com' });
    const token = await issueRawToken(user.id, 'email_verify');

    const res = await api().post(`${AUTH}/verify-email`).send({ token });
    expect(res.status).toBe(204);

    const after = await getUserByEmail(user.email);
    expect(after?.emailVerifiedAt).toBeInstanceOf(Date);

    const login = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('refuses a token that was already used', async () => {
    const user = await createUnverifiedUser();
    const token = await issueRawToken(user.id, 'email_verify');

    await api().post(`${AUTH}/verify-email`).send({ token });
    const second = await api().post(`${AUTH}/verify-email`).send({ token });

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TOKEN');
  });

  it('refuses an expired token', async () => {
    const user = await createUnverifiedUser();
    const token = await issueRawToken(user.id, 'email_verify', {
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await api().post(`${AUTH}/verify-email`).send({ token });
    expect(res.status).toBe(400);
  });

  it('refuses a password_reset token on the verify endpoint', async () => {
    const user = await createUnverifiedUser();
    const token = await issueRawToken(user.id, 'password_reset');

    // Purpose is part of the lookup — tokens are not interchangeable.
    const res = await api().post(`${AUTH}/verify-email`).send({ token });
    expect(res.status).toBe(400);
  });

  it('resend always returns 202, even for an unknown address', async () => {
    const unknown = await api()
      .post(`${AUTH}/verify-email/resend`)
      .send({ email: 'ghost@example.com' });
    const known = await api()
      .post(`${AUTH}/verify-email/resend`)
      .send({ email: (await createUnverifiedUser()).email });

    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body.message).toBe(known.body.message);
  });

  it('resend issues a new token for an unverified user', async () => {
    const user = await createUnverifiedUser();
    await api().post(`${AUTH}/verify-email/resend`).send({ email: user.email });

    const tokens = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, user.id));
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]!.purpose).toBe('email_verify');
  });
});

describe('password reset', () => {
  it('always returns 202 from forgot, existing or not', async () => {
    const unknown = await api()
      .post(`${AUTH}/password/forgot`)
      .send({ email: 'nobody-here@example.com' });
    const known = await api()
      .post(`${AUTH}/password/forgot`)
      .send({ email: (await createUser()).email });

    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body.message).toBe(known.body.message);
  });

  it('resets the password and lets the user log in with the new one', async () => {
    const user = await createUser({ email: 'reset@example.com' });
    const token = await issueRawToken(user.id, 'password_reset');

    const res = await api()
      .post(`${AUTH}/password/reset`)
      .send({ token, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);

    const after = await getUserByEmail(user.email);
    expect(await verifyPassword(after!.passwordHash!, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(after!.passwordHash!, GOOD_PASSWORD)).toBe(false);
  });

  it('revokes every existing session', async () => {
    const user = await createUser();
    const a = await loginAs(user.email);
    const b = await loginAs(user.email);

    const token = await issueRawToken(user.id, 'password_reset');
    await api().post(`${AUTH}/password/reset`).send({ token, newPassword: NEW_PASSWORD });

    for (const s of [a, b]) {
      const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(s.refreshCookie));
      expect(res.status).toBe(401);
    }
  });

  it('verifies a previously unverified email', async () => {
    // Redeeming the emailed link proves inbox control (spec §5.4 step 2).
    const user = await createUnverifiedUser();
    const token = await issueRawToken(user.id, 'password_reset');

    await api().post(`${AUTH}/password/reset`).send({ token, newPassword: NEW_PASSWORD });

    const after = await getUserByEmail(user.email);
    expect(after?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('clears an account lock', async () => {
    const user = await createUser({
      failedLoginCount: 9,
      lockedUntil: new Date(Date.now() + 900_000),
    });
    const token = await issueRawToken(user.id, 'password_reset');

    await api().post(`${AUTH}/password/reset`).send({ token, newPassword: NEW_PASSWORD });

    const after = await getUserByEmail(user.email);
    expect(after?.lockedUntil).toBeNull();
    expect(after?.failedLoginCount).toBe(0);
  });

  it('refuses a reused reset token', async () => {
    const user = await createUser();
    const token = await issueRawToken(user.id, 'password_reset');

    await api().post(`${AUTH}/password/reset`).send({ token, newPassword: NEW_PASSWORD });
    const second = await api()
      .post(`${AUTH}/password/reset`)
      .send({ token, newPassword: 'yet-another-password-77' });

    expect(second.status).toBe(400);
  });

  it('rejects a weak new password', async () => {
    const user = await createUser();
    const token = await issueRawToken(user.id, 'password_reset');

    const res = await api().post(`${AUTH}/password/reset`).send({ token, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('lets an OAuth-only user set a first password', async () => {
    const user = await createUser({ email: 'oauth@example.com', passwordHash: null });
    const token = await issueRawToken(user.id, 'password_reset');

    await api().post(`${AUTH}/password/reset`).send({ token, newPassword: NEW_PASSWORD });

    const login = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });
});

describe('password change', () => {
  it('changes the password when the current one is correct', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api()
      .post(`${AUTH}/password/change`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);
    const after = await getUserByEmail(user.email);
    expect(await verifyPassword(after!.passwordHash!, NEW_PASSWORD)).toBe(true);
  });

  it('rejects a wrong current password', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api()
      .post(`${AUTH}/password/change`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'not-my-password', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires authentication', async () => {
    const res = await api()
      .post(`${AUTH}/password/change`)
      .send({ currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('revokes other sessions but keeps the caller signed in', async () => {
    const user = await createUser();
    const other = await loginAs(user.email);
    const current = await loginAs(user.email);

    const res = await api()
      .post(`${AUTH}/password/change`)
      .set('Authorization', `Bearer ${current.accessToken}`)
      .set('Cookie', cookie(current.refreshCookie))
      .send({ currentPassword: GOOD_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);

    // The other device is signed out.
    const otherRes = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(other.refreshCookie));
    expect(otherRes.status).toBe(401);

    // The caller got a fresh cookie in the same response.
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });
});

describe('user status transitions', () => {
  it('a deleted account cannot log in', async () => {
    const user = await createUser({ status: 'deleted' });
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('deleting a user cascades to their tokens', async () => {
    const user = await createUser();
    await loginAs(user.email);

    await db.delete(users).where(eq(users.id, user.id));

    const { refreshTokens } = await import('../src/db/schema/auth.js');
    const left = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
    expect(left).toHaveLength(0);
  });
});
