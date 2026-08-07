/**
 * The worker path: runScan → crawl → storage → Postgres.
 *
 * `crawl` is redirected to `crawlTarget` against a loopback fixture, because
 * the real `crawl` runs the SSRF guard and refuses loopback by design. The
 * capture is genuine — a real Chromium against a real HTTP server — so this
 * covers persistence without pretending the crawler works.
 */

import { eq } from 'drizzle-orm';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/index.js';
import { scanAssets, scans, websites } from '../src/db/schema/scans.js';
import { AppError } from '../src/lib/errors.js';
import { getStorage } from '../src/lib/storage.js';
import { createUser } from './helpers.js';

let origin = '';
let failNext = false;

vi.mock('../src/services/crawler.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/services/crawler.js')>(
      '../src/services/crawler.js',
    );
  return {
    ...actual,
    crawl: async (url: string) => {
      if (failNext) throw new AppError(400, 'VALIDATION_ERROR', 'site is down');
      return actual.crawlTarget({ host: '127.0.0.1', url, addresses: ['127.0.0.1'] });
    },
  };
});

const { closeBrowser } = await import('../src/services/crawler.js');
const { errorMessageFor, runScan } = await import('../src/services/scan-service.js');

const PAGE = `<!doctype html>
<html>
  <head><title>Run Fixture</title><link rel="stylesheet" href="/s.css"></head>
  <body><h1>persisted</h1><script src="/s.js"></script></body>
</html>`;

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/s.css') res.writeHead(200, { 'content-type': 'text/css' }).end('h1{color:red}');
    else if (req.url === '/s.js')
      res.writeHead(200, { 'content-type': 'application/javascript' }).end('var a=1;');
    else if (req.url === '/emoji') {
      // wordpress.org really does serve `x-olaf: ⛄`, and real pages carry text
      // in every script there is. Both land in Postgres verbatim.
      //
      // node:http rejects non-Latin-1 header values outright, so the raw UTF-8
      // bytes have to be handed over as Latin-1 characters — which is exactly
      // what goes on the wire when a real server emits a UTF-8 header.
      const wire = (s: string) => Buffer.from(s, 'utf8').toString('latin1');
      res
        .writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'x-olaf': wire('⛄'),
          'x-greeting': wire('नमस्ते'),
        })
        .end('<html><body><h1>日本語 · emoji 🎉</h1></body></html>');
    } else res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm('./.storage-test', { recursive: true, force: true });
});

/** A queued scan row ready for the worker to pick up. */
async function queuedScan() {
  const user = await createUser();
  const site = (await db.insert(websites).values({ host: '127.0.0.1', canonicalUrl: origin }).returning())[0]!;
  const scan = (
    await db.insert(scans).values({ websiteId: site.id, requestedBy: user.id, status: 'queued' }).returning()
  )[0]!;
  return { user, site, scan };
}

describe('runScan', () => {
  it('captures the page and marks the scan succeeded', async () => {
    failNext = false;
    const { scan, site } = await queuedScan();

    await runScan(scan.id, origin);

    const after = await db.query.scans.findFirst({ where: eq(scans.id, scan.id) });
    expect(after?.status).toBe('succeeded');
    expect(after?.httpStatus).toBe(200);
    expect(after?.startedAt).not.toBeNull();
    expect(after?.finishedAt).not.toBeNull();
    expect(after?.loadTimeMs).toBeGreaterThan(0);
    expect(after?.responseHeaders?.['content-type']).toContain('text/html');

    const site2 = await db.query.websites.findFirst({ where: eq(websites.id, site.id) });
    expect(site2?.lastScannedAt).not.toBeNull();
  });

  it('stores the HTML, the CSS and the JS as separate assets', async () => {
    failNext = false;
    const { scan } = await queuedScan();
    await runScan(scan.id, origin);

    const assets = await db.select().from(scanAssets).where(eq(scanAssets.scanId, scan.id));
    const kinds = assets.map((a) => a.kind).sort();
    expect(kinds).toEqual(['css', 'html', 'js']);

    for (const asset of assets) {
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.byteSize).toBeGreaterThan(0);
    }
  });

  it('writes asset bytes that can be read back from storage', async () => {
    failNext = false;
    const { scan } = await queuedScan();
    await runScan(scan.id, origin);

    const html = (
      await db.select().from(scanAssets).where(eq(scanAssets.scanId, scan.id))
    ).find((a) => a.kind === 'html')!;

    const body = await getStorage().get(html.storageKey);
    expect(body.toString('utf8')).toContain('persisted');
    expect(body.byteLength).toBe(html.byteSize);
  });

  it('records the failure on the row and rethrows so BullMQ can retry', async () => {
    failNext = true;
    const { scan } = await queuedScan();

    await expect(runScan(scan.id, origin)).rejects.toThrow(AppError);

    const after = await db.query.scans.findFirst({ where: eq(scans.id, scan.id) });
    expect(after?.status).toBe('failed');
    expect(after?.errorCode).toBe('VALIDATION_ERROR');
    expect(after?.errorMessage).toBe('site is down');
    expect(after?.finishedAt).not.toBeNull();
    failNext = false;
  });

  it('skips a scan that was cancelled before the worker reached it', async () => {
    failNext = false;
    const { scan } = await queuedScan();
    await db.update(scans).set({ status: 'cancelled' }).where(eq(scans.id, scan.id));

    await runScan(scan.id, origin);

    const after = await db.query.scans.findFirst({ where: eq(scans.id, scan.id) });
    expect(after?.status).toBe('cancelled');
    const assets = await db.select().from(scanAssets).where(eq(scanAssets.scanId, scan.id));
    expect(assets).toHaveLength(0);
  });

  it('stores non-Latin-1 headers and page content without failing the scan', async () => {
    // A WIN1252 database rejects every one of these outright, and the
    // rejection message quotes the offending character back — so the failure
    // path then fails too and the scan wedges in `running`. Both halves of
    // that are covered here.
    failNext = false;
    const { scan } = await queuedScan();

    await runScan(scan.id, `${origin}/emoji`);

    const after = await db.query.scans.findFirst({ where: eq(scans.id, scan.id) });
    expect(after?.status).toBe('succeeded');
    expect(after?.responseHeaders?.['x-olaf']).toBe('⛄');
    expect(after?.responseHeaders?.['x-greeting']).toBe('नमस्ते');

    const html = (
      await db.select().from(scanAssets).where(eq(scanAssets.scanId, scan.id))
    ).find((a) => a.kind === 'html')!;
    const body = await getStorage().get(html.storageKey);
    expect(body.toString('utf8')).toContain('日本語 · emoji 🎉');
  });

  it('truncates an enormous error message rather than storing it whole', () => {
    // Driver errors quote the entire failed statement, parameters included.
    const huge = new Error('x'.repeat(50_000));
    const stored = errorMessageFor(huge);
    expect(stored.length).toBeLessThan(2_100);
    expect(stored.endsWith('…')).toBe(true);
  });

  it('404s a scan id that does not exist', async () => {
    await expect(runScan('00000000-0000-4000-8000-000000000000', origin)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
