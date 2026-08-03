import { describe, expect, it } from 'vitest';

import {
  AUTH,
  GOOD_PASSWORD,
  api,
  cookieAttributes,
  createOAuthOnlyUser,
  createUnverifiedUser,
  createUser,
  getUserByEmail,
  refreshCookieFrom,
} from './helpers.js';

describe('POST /auth/login', () => {
  it('returns an access token and sets the refresh cookie', async () => {
    const user = await createUser({ email: 'login@example.com' });
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.expiresIn).toBe(15 * 60);
    expect(res.body.user.email).toBe(user.email);
    expect(refreshCookieFrom(res)).toBeTruthy();
  });

  it('sets the refresh cookie HttpOnly, SameSite and path-scoped', async () => {
    const user = await createUser();
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    const attrs = cookieAttributes(res).map((a) => a.toLowerCase());
    expect(attrs).toContain('httponly');
    expect(attrs).toContain('samesite=lax');
    expect(attrs).toContain('path=/api/v1/auth');
  });

  it('records last_login_at', async () => {
    const user = await createUser();
    expect(user.lastLoginAt).toBeNull();

    await api().post(`${AUTH}/login`).send({ email: user.email, password: GOOD_PASSWORD });

    const after = await getUserByEmail(user.email);
    expect(after?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('rejects a wrong password', async () => {
    const user = await createUser();
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: 'wrong-password-entirely' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the same error for an unknown email as for a wrong password', async () => {
    const user = await createUser();
    const unknown = await api()
      .post(`${AUTH}/login`)
      .send({ email: 'nobody@example.com', password: GOOD_PASSWORD });
    const wrongPass = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: 'definitely-not-the-password' });

    expect(unknown.status).toBe(wrongPass.status);
    expect(unknown.body.error.code).toBe(wrongPass.body.error.code);
    expect(unknown.body.error.message).toBe(wrongPass.body.error.message);
  });

  it('blocks an unverified account with an actionable code', async () => {
    const user = await createUnverifiedUser({ email: 'unverified@example.com' });
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('does not leak verification state when the password is wrong', async () => {
    const user = await createUnverifiedUser();
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: 'wrong-password-entirely' });

    // Must look like any other bad login, not like "this account exists but is unverified".
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('tells an OAuth-only user which provider to use', async () => {
    const user = await createOAuthOnlyUser({ email: 'oauth-only@example.com' });
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PASSWORD_NOT_SET');
  });

  it('rejects a suspended account', async () => {
    const user = await createUser({ status: 'suspended' });
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('locks the account after the configured number of failures', async () => {
    const user = await createUser({ email: 'lockme@example.com' });

    for (let i = 0; i < 10; i++) {
      await api().post(`${AUTH}/login`).send({ email: user.email, password: `bad-guess-${i}` });
    }

    // Even the correct password is refused while locked.
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: user.email, password: GOOD_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('clears the failure counter on a successful login', async () => {
    const user = await createUser();
    await api().post(`${AUTH}/login`).send({ email: user.email, password: 'wrong-1' });
    await api().post(`${AUTH}/login`).send({ email: user.email, password: 'wrong-2' });
    await api().post(`${AUTH}/login`).send({ email: user.email, password: GOOD_PASSWORD });

    const after = await getUserByEmail(user.email);
    expect(after?.failedLoginCount).toBe(0);
  });

  it('is case-insensitive on the email', async () => {
    const user = await createUser({ email: 'case@example.com' });
    const res = await api()
      .post(`${AUTH}/login`)
      .send({ email: 'CASE@EXAMPLE.COM', password: GOOD_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});
