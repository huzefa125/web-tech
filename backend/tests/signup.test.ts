import { describe, expect, it } from 'vitest';

import {
  AUTH,
  GOOD_PASSWORD,
  api,
  createUser,
  getUserByEmail,
} from './helpers.js';

describe('POST /auth/signup', () => {
  it('creates an unverified user and issues no session', async () => {
    const email = 'new-user@example.com';
    const res = await api().post(`${AUTH}/signup`).send({ email, password: GOOD_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, emailVerified: false });

    // No session until the address is verified (spec §5.1 step 5).
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();

    const user = await getUserByEmail(email);
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toBe(GOOD_PASSWORD);
    expect(user?.plan).toBe('free');
  });

  it('stores the email lowercased and treats case as the same account', async () => {
    await api().post(`${AUTH}/signup`).send({ email: 'MiXeD@Example.COM', password: GOOD_PASSWORD });
    expect(await getUserByEmail('mixed@example.com')).toBeDefined();
  });

  it('does not reveal that an email is already registered', async () => {
    const email = 'taken@example.com';
    await createUser({ email });

    const res = await api().post(`${AUTH}/signup`).send({ email, password: GOOD_PASSWORD });

    // Same status and message as a fresh signup — no enumeration oracle.
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/check your email/i);
  });

  it('does not create a second row for a duplicate email', async () => {
    const email = 'dupe@example.com';
    const first = await createUser({ email });
    await api().post(`${AUTH}/signup`).send({ email, password: GOOD_PASSWORD });

    const user = await getUserByEmail(email);
    expect(user?.id).toBe(first.id);
  });

  it('rejects a password below the minimum length', async () => {
    const res = await api()
      .post(`${AUTH}/signup`)
      .send({ email: 'short@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a password containing the email local-part', async () => {
    const res = await api()
      .post(`${AUTH}/signup`)
      .send({ email: 'jonathan@example.com', password: 'jonathan-password-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEAK_PASSWORD');
  });

  it('rejects a malformed email', async () => {
    const res = await api()
      .post(`${AUTH}/signup`)
      .send({ email: 'not-an-email', password: GOOD_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts an optional full name', async () => {
    const res = await api()
      .post(`${AUTH}/signup`)
      .send({ email: 'named@example.com', password: GOOD_PASSWORD, fullName: 'Ada Lovelace' });

    expect(res.status).toBe(201);
    expect(res.body.user.fullName).toBe('Ada Lovelace');
  });

  it('never returns the password hash', async () => {
    const res = await api()
      .post(`${AUTH}/signup`)
      .send({ email: 'leak@example.com', password: GOOD_PASSWORD });

    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$argon2/);
  });
});
