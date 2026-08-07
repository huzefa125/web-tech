/**
 * Scan API — routes, quota, and ownership scoping.
 *
 * The queue is mocked: BullMQ needs a real Redis with Lua scripting, and the
 * rest of the suite runs against an in-memory stub. What matters here is that
 * a request produces a queued row and hands the right payload to the queue —
 * the worker's own behaviour is covered by scan-service's crawl path.
 */

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueScan = vi.fn(async (data: { scanId: string }) => data.scanId);
vi.mock('../src/queue/scan-queue.js', () => ({
  enqueueScan,
  SCAN_QUEUE_NAME: 'scans',
  getScanQueue: vi.fn(),
  closeScanQueue: vi.fn(),
}));

/**
 * Resolve every test hostname to one public address. Without this the suite
 * needs working DNS and real registrations for whatever names the fixtures
 * use — `a.com` resolving today and not tomorrow is not a signal about this
 * code. The public/private classification itself is still the real one, and
 * is covered directly in scan-target.test.ts.
 */
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host.endsWith('.invalid')) throw new Error('ENOTFOUND');
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

import { db } from '../src/db/index.js';
import { scans, websites } from '../src/db/schema/scans.js';
import { AUTH, api, createUser, loginAs } from './helpers.js';

const SCANS = '/api/v1/scans';

beforeEach(() => {
  enqueueScan.mockClear();
});

/** A signed-in user plus their bearer token. */
async function signedIn(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(overrides);
  const session = await loginAs(user.email);
  return { user, token: session.accessToken };
}

describe('POST /scans', () => {
  it('queues a scan and returns 202 without waiting for the crawl', async () => {
    const { user, token } = await signedIn();

    const res = await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'example.com' });

    expect(res.status).toBe(202);
    expect(res.body.scan).toMatchObject({ status: 'queued', host: 'example.com' });

    const row = await db.query.scans.findFirst({ where: eq(scans.id, res.body.scan.id) });
    expect(row?.requestedBy).toBe(user.id);
    expect(row?.status).toBe('queued');
  });

  it('hands the normalised URL to the queue', async () => {
    const { token } = await signedIn();

    await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: '  HTTP://Example.COM/Path  ' });

    expect(enqueueScan).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://example.com/Path' }),
    );
  });

  it('records the job id on the scan row', async () => {
    const { token } = await signedIn();
    const res = await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'example.com' });

    const row = await db.query.scans.findFirst({ where: eq(scans.id, res.body.scan.id) });
    expect(row?.jobId).toBe(res.body.scan.id);
  });

  it('reuses one website row across scans of the same host', async () => {
    const { token } = await signedIn();

    for (const url of ['example.com', 'https://example.com/other', 'EXAMPLE.com/']) {
      await api().post(SCANS).set('Authorization', `Bearer ${token}`).send({ url });
    }

    const rows = await db.select().from(websites).where(eq(websites.host, 'example.com'));
    expect(rows).toHaveLength(1);
  });

  it('requires authentication', async () => {
    const res = await api().post(SCANS).send({ url: 'example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects an address that resolves privately, without queueing anything', async () => {
    const { token } = await signedIn();

    const res = await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'http://169.254.169.254/latest/meta-data/' });

    expect(res.status).toBe(400);
    expect(enqueueScan).not.toHaveBeenCalled();
  });

  it('rejects an empty url', async () => {
    const { token } = await signedIn();
    const res = await api().post(SCANS).set('Authorization', `Bearer ${token}`).send({ url: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('free-plan quota', () => {
  it('allows exactly FREE_SCANS_PER_DAY scans and then 429s', async () => {
    const { token } = await signedIn({ plan: 'free' });

    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await api()
        .post(SCANS)
        .set('Authorization', `Bearer ${token}`)
        .send({ url: `example.com/${i}` });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('does not cap a paid plan', async () => {
    const { token } = await signedIn({ plan: 'pro' });

    for (let i = 0; i < 7; i++) {
      const res = await api()
        .post(SCANS)
        .set('Authorization', `Bearer ${token}`)
        .send({ url: `example.com/${i}` });
      expect(res.status).toBe(202);
    }
  });

  it('reports remaining quota', async () => {
    const { token } = await signedIn({ plan: 'free' });
    await api().post(SCANS).set('Authorization', `Bearer ${token}`).send({ url: 'example.com' });

    const res = await api().get(`${SCANS}/quota`).set('Authorization', `Bearer ${token}`);
    expect(res.body).toMatchObject({ plan: 'free', limit: 5, used: 1, remaining: 4 });
  });

  it('reports an uncapped plan as null rather than a number', async () => {
    const { token } = await signedIn({ plan: 'enterprise' });
    const res = await api().get(`${SCANS}/quota`).set('Authorization', `Bearer ${token}`);
    expect(res.body).toMatchObject({ limit: null, remaining: null });
  });

  it('counts failed scans against the quota', async () => {
    // Otherwise the limit is evaded by scanning addresses that always fail.
    const { user, token } = await signedIn({ plan: 'free' });
    const res = await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'example.com' });

    await db
      .update(scans)
      .set({ status: 'failed', errorCode: 'INTERNAL_ERROR' })
      .where(eq(scans.id, res.body.scan.id));

    const quota = await api().get(`${SCANS}/quota`).set('Authorization', `Bearer ${token}`);
    expect(quota.body.used).toBe(1);
    expect(quota.body.remaining).toBe(4);
    expect(user.plan).toBe('free');
  });
});

describe('GET /scans', () => {
  it('lists only the caller own scans', async () => {
    const alice = await signedIn({ email: 'alice-scan@example.com' });
    const bob = await signedIn({ email: 'bob-scan@example.com' });

    await api().post(SCANS).set('Authorization', `Bearer ${alice.token}`).send({ url: 'a.com' });
    await api().post(SCANS).set('Authorization', `Bearer ${bob.token}`).send({ url: 'b.com' });

    const res = await api().get(SCANS).set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(200);
    expect(res.body.scans).toHaveLength(1);
    expect(res.body.scans[0].host).toBe('a.com');
  });

  it('paginates', async () => {
    const { token } = await signedIn({ plan: 'pro' });
    for (let i = 0; i < 3; i++) {
      await api().post(SCANS).set('Authorization', `Bearer ${token}`).send({ url: `p${i}.com` });
    }

    const res = await api().get(`${SCANS}?limit=2&offset=0`).set('Authorization', `Bearer ${token}`);
    expect(res.body.scans).toHaveLength(2);
  });
});

describe('GET /scans/:id', () => {
  it('returns the scan detail', async () => {
    const { token } = await signedIn();
    const created = await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'example.com' });

    const res = await api()
      .get(`${SCANS}/${created.body.scan.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.scan).toMatchObject({ status: 'queued', host: 'example.com' });
    expect(res.body.assets).toEqual([]);
    expect(res.body.technologies).toEqual([]);
  });

  it('404s another user scan rather than 403ing it', async () => {
    const alice = await signedIn({ email: 'alice-detail@example.com' });
    const bob = await signedIn({ email: 'bob-detail@example.com' });

    const created = await api()
      .post(SCANS)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ url: 'private.com' });

    const res = await api()
      .get(`${SCANS}/${created.body.scan.id}`)
      .set('Authorization', `Bearer ${bob.token}`);

    // 404, not 403: a 403 would confirm the id belongs to a real scan.
    expect(res.status).toBe(404);
  });

  it('404s a malformed id instead of failing the query', async () => {
    const { token } = await signedIn();
    const res = await api().get(`${SCANS}/not-a-uuid`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

});

describe('auth surface is unchanged', () => {
  it('still serves the auth routes alongside the new ones', async () => {
    const res = await api().post(`${AUTH}/logout`);
    expect(res.status).toBe(204);
  });
});
