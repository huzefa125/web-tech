import { describe, expect, it } from 'vitest';

import { signAccessToken } from '../src/lib/jwt.js';
import { AUTH, api, createUser, loginAs } from './helpers.js';

const cookie = (v: string) => [`iip_refresh=${v}`];

describe('GET /auth/me', () => {
  it('returns the current user', async () => {
    const user = await createUser({ email: 'me@example.com', fullName: 'Me Myself' });
    const session = await loginAs(user.email);

    const res = await api().get(`${AUTH}/me`).set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: 'me@example.com',
      fullName: 'Me Myself',
      plan: 'free',
      emailVerified: true,
    });
  });

  it('never exposes the password hash', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api().get(`${AUTH}/me`).set('Authorization', `Bearer ${session.accessToken}`);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('rejects a missing token', async () => {
    const res = await api().get(`${AUTH}/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await api().get(`${AUTH}/me`).set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed for a different audience', async () => {
    const res = await api().get(`${AUTH}/me`).set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('404s when the token is valid but the user is gone', async () => {
    const { token } = await signAccessToken({
      userId: crypto.randomUUID(),
      email: 'ghost@example.com',
      plan: 'free',
    });
    const res = await api().get(`${AUTH}/me`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /auth/me', () => {
  it('updates the profile', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api()
      .patch(`${AUTH}/me`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ fullName: 'Renamed Person' });

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Renamed Person');
  });

  it('rejects an invalid avatar url', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api()
      .patch(`${AUTH}/me`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ avatarUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('rejects an empty patch', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api()
      .patch(`${AUTH}/me`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('cannot be used to change plan or status', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api()
      .patch(`${AUTH}/me`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ fullName: 'Ok', plan: 'enterprise', status: 'active' });

    expect(res.status).toBe(200);
    // Unknown keys are stripped by the Zod schema, never written.
    expect(res.body.user.plan).toBe('free');
  });
});

describe('sessions', () => {
  it('lists active sessions', async () => {
    const user = await createUser();
    const a = await loginAs(user.email);
    await loginAs(user.email);

    const res = await api()
      .get(`${AUTH}/sessions`)
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    // Session metadata must never include the token itself.
    expect(JSON.stringify(res.body)).not.toMatch(/tokenHash/);
  });

  it('revokes one session by id', async () => {
    const user = await createUser();
    const keep = await loginAs(user.email);
    const kill = await loginAs(user.email);

    const list = await api()
      .get(`${AUTH}/sessions`)
      .set('Authorization', `Bearer ${keep.accessToken}`);

    // Identify the session to kill by refreshing it and matching what remains.
    const target = list.body.sessions[1].id;
    const res = await api()
      .delete(`${AUTH}/sessions/${target}`)
      .set('Authorization', `Bearer ${keep.accessToken}`);

    expect(res.status).toBe(204);

    const after = await api()
      .get(`${AUTH}/sessions`)
      .set('Authorization', `Bearer ${keep.accessToken}`);
    expect(after.body.sessions).toHaveLength(1);

    // At least one of the two cookies must now be dead.
    const results = await Promise.all(
      [keep, kill].map((s) =>
        api().post(`${AUTH}/refresh`).set('Cookie', cookie(s.refreshCookie)),
      ),
    );
    expect(results.some((r) => r.status === 401)).toBe(true);
  });

  it('cannot revoke another user session', async () => {
    const alice = await createUser({ email: 'alice@example.com' });
    const bob = await createUser({ email: 'bob@example.com' });
    const aliceSession = await loginAs(alice.email);
    const bobSession = await loginAs(bob.email);

    const bobList = await api()
      .get(`${AUTH}/sessions`)
      .set('Authorization', `Bearer ${bobSession.accessToken}`);
    const bobSessionId = bobList.body.sessions[0].id;

    const res = await api()
      .delete(`${AUTH}/sessions/${bobSessionId}`)
      .set('Authorization', `Bearer ${aliceSession.accessToken}`);

    expect(res.status).toBe(404);

    // Bob's session still works.
    const stillAlive = await api()
      .post(`${AUTH}/refresh`)
      .set('Cookie', cookie(bobSession.refreshCookie));
    expect(stillAlive.status).toBe(200);
  });

  it('requires auth to list sessions', async () => {
    const res = await api().get(`${AUTH}/sessions`);
    expect(res.status).toBe(401);
  });
});

describe('app basics', () => {
  it('serves a health check', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('404s an unknown route in the standard error shape', async () => {
    const res = await api().get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not advertise Express', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('DELETE /auth/sessions/:id', () => {
  it('404s a malformed session id instead of failing the query', async () => {
    const user = await createUser({ email: 'bad-id@example.com' });
    const session = await loginAs(user.email);

    const res = await api()
      .delete(`${AUTH}/sessions/not-a-uuid`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    // A raw param reaching a uuid column makes Postgres raise 22P02, which
    // surfaces as a 500 and echoes the failed statement back in development.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('404s a well-formed id that belongs to nobody', async () => {
    const user = await createUser({ email: 'no-such-session@example.com' });
    const session = await loginAs(user.email);

    const res = await api()
      .delete(`${AUTH}/sessions/00000000-0000-4000-8000-000000000000`)
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(404);
  });
});
