/**
 * Refresh rotation and reuse detection — acceptance criterion #6 in the spec.
 * If anything in this file starts failing, treat it as a security incident,
 * not a flaky test.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../src/db/index.js';
import { refreshTokens } from '../src/db/schema/auth.js';
import { AUTH, api, createUser, loginAs, refreshCookieFrom } from './helpers.js';

const cookie = (value: string) => [`iip_refresh=${value}`];

describe('POST /auth/refresh', () => {
  it('exchanges a valid refresh token for a new access token', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.id).toBe(user.id);
  });

  it('rotates the token — the new cookie differs from the old', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));
    const next = refreshCookieFrom(res);

    expect(next).toBeTruthy();
    expect(next).not.toBe(session.refreshCookie);
  });

  it('keeps the rotated token in the same family', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);
    await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));

    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
  });

  it('revokes the presented token once consumed', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);
    await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));

    const live = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));

    expect(live).toHaveLength(1);
  });

  it('survives a chain of rotations', async () => {
    const user = await createUser();
    let current = (await loginAs(user.email)).refreshCookie;

    for (let i = 0; i < 5; i++) {
      const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(current));
      expect(res.status).toBe(200);
      current = refreshCookieFrom(res)!;
    }

    const live = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    expect(live).toHaveLength(1);
  });

  it('rejects a request with no cookie', async () => {
    const res = await api().post(`${AUTH}/refresh`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token that was never issued', async () => {
    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie('totally-made-up-token'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  // ---- the important one -------------------------------------------------

  it('detects replay of a rotated token and kills the whole family', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);
    const stolen = session.refreshCookie;

    // Legitimate rotation — `stolen` is now revoked but the family lives on.
    const rotated = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(stolen));
    expect(rotated.status).toBe(200);
    const liveToken = refreshCookieFrom(rotated)!;

    // Attacker replays the old token.
    const replay = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(stolen));
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // The victim's still-current token must now be dead too.
    const victim = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(liveToken));
    expect(victim.status).toBe(401);

    const live = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    expect(live).toHaveLength(0);
  });

  it('clears the cookie when rotation fails', async () => {
    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie('bogus'));
    const setCookie = res.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(header).toMatch(/iip_refresh=/);
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it('reuse detection does not touch other users', async () => {
    const victim = await createUser({ email: 'victim@example.com' });
    const bystander = await createUser({ email: 'bystander@example.com' });

    const victimSession = await loginAs(victim.email);
    const bystanderSession = await loginAs(bystander.email);

    await api().post(`${AUTH}/refresh`).set('Cookie', cookie(victimSession.refreshCookie));
    await api().post(`${AUTH}/refresh`).set('Cookie', cookie(victimSession.refreshCookie));

    const stillWorks = await api()
      .post(`${AUTH}/refresh`)
      .set('Cookie', cookie(bystanderSession.refreshCookie));
    expect(stillWorks.status).toBe(200);
  });

  it('rejects a refresh for a suspended account', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const { users } = await import('../src/db/schema/auth.js');
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, user.id));

    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));
    expect(res.status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.userId, user.id));

    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('logout', () => {
  it('revokes the presented refresh token', async () => {
    const user = await createUser();
    const session = await loginAs(user.email);

    const out = await api().post(`${AUTH}/logout`).set('Cookie', cookie(session.refreshCookie));
    expect(out.status).toBe(204);

    const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));
    expect(res.status).toBe(401);
  });

  it('logout-all revokes every session for the user', async () => {
    const user = await createUser();
    const a = await loginAs(user.email);
    const b = await loginAs(user.email);

    const out = await api()
      .post(`${AUTH}/logout-all`)
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(out.status).toBe(204);

    for (const session of [a, b]) {
      const res = await api().post(`${AUTH}/refresh`).set('Cookie', cookie(session.refreshCookie));
      expect(res.status).toBe(401);
    }
  });

  it('logout without a cookie is still a no-op success', async () => {
    const res = await api().post(`${AUTH}/logout`);
    expect(res.status).toBe(204);
  });
});
