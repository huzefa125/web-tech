/**
 * Rate limiting — acceptance criterion #7.
 *
 * Rate limiting is disabled for the rest of the suite (it would make every
 * other test order-dependent), so this file re-enables it and rebuilds the
 * app with a fresh module registry.
 */

import type { Express } from 'express';
import type { Response as SupertestResponse } from 'supertest';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GOOD_PASSWORD, createUser } from './helpers.js';

const AUTH = '/api/v1/auth';

let request: typeof supertest;
let app: Express;

beforeAll(async () => {
  vi.stubEnv('RATE_LIMIT_ENABLED', 'true');
  // env.ts and the limiter modules read config at import time, so the whole
  // graph has to be re-imported after the stub is in place.
  vi.resetModules();
  request = (await import('supertest')).default;
  app = (await import('../src/app.js')).createApp();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('rate limiting', () => {
  it('429s after too many failed logins for one email', async () => {
    const user = await createUser({ email: 'rl-login@example.com' });

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(app)
        .post(`${AUTH}/login`)
        .send({ email: user.email, password: `wrong-${i}` });
      statuses.push(res.status);
    }

    // 5 attempts allowed per email per 15 min.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
  });

  it('sends Retry-After on a limited response', async () => {
    const user = await createUser({ email: 'rl-retry@example.com' });

    let limited: SupertestResponse | null = null;
    for (let i = 0; i < 8; i++) {
      const res = await request(app)
        .post(`${AUTH}/login`)
        .send({ email: user.email, password: `nope-${i}` });
      if (res.status === 429) {
        limited = res;
        break;
      }
    }

    expect(limited).not.toBeNull();
    expect(limited!.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited!.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits signups by IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post(`${AUTH}/signup`)
        .send({ email: `rl-signup-${i}@example.com`, password: GOOD_PASSWORD });
      statuses.push(res.status);
    }

    // 3 signups per IP per hour.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it('limits password-reset requests per email', async () => {
    const email = 'rl-forgot@example.com';
    await createUser({ email });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post(`${AUTH}/password/forgot`).send({ email });
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it('keys login limits per email, not globally', async () => {
    const a = await createUser({ email: 'rl-a@example.com' });
    const b = await createUser({ email: 'rl-b@example.com' });

    for (let i = 0; i < 6; i++) {
      await request(app).post(`${AUTH}/login`).send({ email: a.email, password: `bad-${i}` });
    }

    // b's per-email budget is untouched; the shared per-IP budget is 20.
    const res = await request(app)
      .post(`${AUTH}/login`)
      .send({ email: b.email, password: GOOD_PASSWORD });

    expect(res.status).not.toBe(429);
  });
});

describe('refresh rate limiting', () => {
  const cookieValue = (res: SupertestResponse): string => {
    const raw = res.headers['set-cookie'];
    const all = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const match = all.find((c: string) => c.startsWith('iip_refresh='));
    return match!.split(';')[0]!.slice('iip_refresh='.length);
  };

  const loginCookie = async (email: string): Promise<string> => {
    const res = await request(app).post(`${AUTH}/login`).send({ email, password: GOOD_PASSWORD });
    expect(res.status).toBe(200);
    return cookieValue(res);
  };

  it('keys the refresh budget per user, not per IP', async () => {
    const a = await createUser({ email: 'rl-refresh-a@example.com' });
    const b = await createUser({ email: 'rl-refresh-b@example.com' });

    let cookieA = await loginCookie(a.email);
    const cookieB = await loginCookie(b.email);

    // Spend a's entire 60/hour budget. Every request here comes from the same
    // test client, so under IP keying this would drain b's budget too.
    let limited = false;
    for (let i = 0; i < 62; i++) {
      const res = await request(app)
        .post(`${AUTH}/refresh`)
        .set('Cookie', [`iip_refresh=${cookieA}`]);
      if (res.status === 429) {
        limited = true;
        break;
      }
      expect(res.status).toBe(200);
      cookieA = cookieValue(res);
    }
    expect(limited).toBe(true);

    const other = await request(app)
      .post(`${AUTH}/refresh`)
      .set('Cookie', [`iip_refresh=${cookieB}`]);
    expect(other.status).toBe(200);
  });
});
