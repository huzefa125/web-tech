/**
 * Scan lifecycle: request → queue → run → persist.
 *
 * The HTTP layer only ever calls `requestScan`, which returns as soon as the
 * row exists. Crawling happens on the worker, because a Playwright run takes
 * seconds to tens of seconds and holding a request open for it would tie up a
 * connection and time out behind most proxies.
 */

import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';

import { env } from '../config/env.js';
import { db } from '../db/index.js';
import type { Plan } from '../db/schema/auth.js';
import {
  scanAssets,
  scans,
  technologies,
  websites,
  type Scan,
  type ScanStatus,
  type Technology,
  type Website,
} from '../db/schema/scans.js';
import { AppError, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { lookupDnsRecords, resolveTarget } from '../lib/scan-target.js';
import { getStorage, scanKey } from '../lib/storage.js';
import { crawl, type CapturedAsset } from './crawler.js';
import { detect } from './detectors/index.js';

// ------------------------------------------------------------------ quota

/** Free tier is 5 scans/day (§6). Paid plans are uncapped for now. */
export function dailyScanLimit(plan: Plan): number | null {
  return plan === 'free' ? env.FREE_SCANS_PER_DAY : null;
}

export async function scansToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await db
    .select({ n: count() })
    .from(scans)
    .where(and(eq(scans.requestedBy, userId), gte(scans.queuedAt, since)));
  return rows[0]?.n ?? 0;
}

/**
 * Throws 429 when the caller is out of scans. Counts every scan requested in
 * the last 24h, including failed ones — a failed crawl still cost us a browser
 * and a page load, and not counting them makes the limit trivially evadable by
 * scanning addresses that 500.
 */
export async function assertScanQuota(userId: string, plan: Plan): Promise<void> {
  const limit = dailyScanLimit(plan);
  if (limit === null) return;

  const used = await scansToday(userId);
  if (used >= limit) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `You have used all ${limit} scans on the free plan today. Upgrade for unlimited scans.`,
      { limit, used },
    );
  }
}

// ---------------------------------------------------------------- request

/** Find the website row for a host, creating it on first sight. */
export async function upsertWebsite(host: string, canonicalUrl: string): Promise<Website> {
  const inserted = await db
    .insert(websites)
    .values({ host, canonicalUrl })
    .onConflictDoNothing({ target: websites.host })
    .returning();

  if (inserted[0]) return inserted[0];

  // Lost the insert race, or the site was already known.
  const existing = await db.query.websites.findFirst({ where: eq(websites.host, host) });
  if (!existing) throw new Error(`website row for ${host} vanished mid-upsert`);
  return existing;
}

export interface RequestScanResult {
  scan: Scan;
  website: Website;
}

/**
 * Validate the address, record the scan as queued, and hand it to the worker.
 * Resolution happens here rather than on the worker so a typo comes back to
 * the user as an immediate 400 instead of a job that fails 20 seconds later.
 */
export async function requestScan(input: {
  url: string;
  userId: string;
  plan: Plan;
}): Promise<RequestScanResult> {
  await assertScanQuota(input.userId, input.plan);

  const target = await resolveTarget(input.url);
  const website = await upsertWebsite(target.host, target.url);

  const inserted = await db
    .insert(scans)
    .values({ websiteId: website.id, requestedBy: input.userId, status: 'queued' })
    .returning();

  const scan = inserted[0]!;

  // Imported lazily: the queue opens a Redis connection on import, and the
  // route layer must stay importable in tests that never enqueue anything.
  const { enqueueScan } = await import('../queue/scan-queue.js');
  const jobId = await enqueueScan({ scanId: scan.id, url: target.url });

  const withJob = await db
    .update(scans)
    .set({ jobId })
    .where(eq(scans.id, scan.id))
    .returning();

  logger.info({ scanId: scan.id, host: target.host, jobId }, 'scan queued');
  return { scan: withJob[0]!, website };
}

// -------------------------------------------------------------------- run

async function markStatus(
  scanId: string,
  status: ScanStatus,
  // The update-set type rather than the insert type: callers pass `sql`now()``
  // for timestamps, which the insert type declares as Date.
  patch: PgUpdateSetSource<typeof scans> = {},
): Promise<void> {
  await db.update(scans).set({ status, ...patch }).where(eq(scans.id, scanId));
}

/** Longest error message we will store. Driver errors quote the whole failed
 *  statement, parameters included, which for a scan means the entire header
 *  blob — megabytes, none of it useful to a user. */
const MAX_ERROR_MESSAGE = 2_000;

export function errorMessageFor(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > MAX_ERROR_MESSAGE ? `${raw.slice(0, MAX_ERROR_MESSAGE)}…` : raw;
}

/**
 * Record a failure. Deliberately defensive, because the obvious version has a
 * trap in it: the error message often *contains* whatever broke the previous
 * write, so writing it back can fail for the identical reason and leave the
 * scan stuck in `running` forever, with no error and no way to retry.
 *
 * Seen for real — wordpress.org serves an `x-olaf: ⛄` header, the database
 * rejected the character, and the rejection message quoted the character back.
 *
 * So: truncate, and if the write still fails, fall back to a message built
 * from nothing but our own constants.
 */
async function markFailed(scanId: string, err: unknown): Promise<void> {
  const errorCode = err instanceof AppError ? err.code : 'INTERNAL_ERROR';

  try {
    await markStatus(scanId, 'failed', {
      finishedAt: sql`now()`,
      errorCode,
      errorMessage: errorMessageFor(err),
    });
    return;
  } catch (writeErr) {
    logger.error({ writeErr, scanId }, 'could not store the scan error; falling back');
  }

  try {
    await markStatus(scanId, 'failed', {
      finishedAt: sql`now()`,
      errorCode,
      errorMessage: 'The scan failed, and the reason could not be stored.',
    });
  } catch (fallbackErr) {
    // Nothing left to try — the row keeps whatever status it had. Logged at
    // error because a scan wedged in `running` is an operational problem.
    logger.error({ fallbackErr, scanId }, 'could not mark the scan failed at all');
  }
}

/** Persist one captured asset. Truncated assets are recorded, not stored. */
async function storeAsset(scanId: string, index: number, asset: CapturedAsset): Promise<void> {
  const storage = getStorage();
  const key = scanKey(scanId, asset.kind, `${index}.${asset.kind}`);

  const put = asset.truncated
    ? { storageKey: '', byteSize: 0, sha256: '' }
    : await storage.put(key, asset.body, asset.contentType ?? undefined);

  await db.insert(scanAssets).values({
    scanId,
    kind: asset.kind,
    url: asset.url,
    storageKey: put.storageKey,
    byteSize: put.byteSize,
    sha256: put.sha256,
    contentType: asset.contentType,
  });
}

/**
 * Execute a queued scan. Called by the worker; never by a request handler.
 *
 * Failures are recorded on the row and rethrown, so BullMQ can retry while the
 * API still has something truthful to show in the meantime.
 */
export async function runScan(scanId: string, url: string): Promise<void> {
  const existing = await db.query.scans.findFirst({ where: eq(scans.id, scanId) });
  if (!existing) throw notFound('Scan not found');
  if (existing.status === 'cancelled') {
    logger.info({ scanId }, 'skipping cancelled scan');
    return;
  }

  await markStatus(scanId, 'running', { startedAt: sql`now()` });

  try {
    const result = await crawl(url);
    const storage = getStorage();

    const htmlPut = await storage.put(scanKey(scanId, 'index.html'), result.html, 'text/html');
    await db.insert(scanAssets).values({
      scanId,
      kind: 'html',
      url: result.finalUrl,
      storageKey: htmlPut.storageKey,
      byteSize: htmlPut.byteSize,
      sha256: htmlPut.sha256,
      contentType: 'text/html',
    });

    // Sequential on purpose: a page can return dozens of assets and firing
    // every write at the pool at once starves the rest of the process.
    for (const [i, asset] of result.assets.entries()) {
      await storeAsset(scanId, i, asset);
    }

    // Detection runs on what was just captured, in memory. The same inputs are
    // all persisted, so a future rule can be replayed against an old scan
    // without re-crawling the site.
    // DNS is looked up here rather than in the crawler: it is not part of
    // rendering the page, and a failure must not cost us the crawl we already
    // paid for.
    const dns = await lookupDnsRecords(result.target.host).catch(() => []);

    const detections = detect({
      html: result.html.toString('utf8'),
      // Header names arrive lowercased from Playwright, which the rules assume.
      headers: result.responseHeaders,
      assetUrls: result.assets.map((a) => a.url),
      requestUrls: result.requestUrls,
      globals: result.globals,
      cookies: result.cookies,
      css: result.assets
        .filter((a) => a.kind === 'css')
        .map((a) => a.body.toString('utf8'))
        .join('\n'),
      js: result.assets
        .filter((a) => a.kind === 'js')
        .map((a) => a.body.toString('utf8'))
        .join('\n'),
      finalUrl: result.finalUrl,
      manifest: result.manifest ?? undefined,
      serviceWorkers: result.serviceWorkers,
      robots: result.robots ?? undefined,
      dns,
    });

    if (detections.length > 0) {
      await db.insert(technologies).values(
        detections.map((d) => ({
          scanId,
          name: d.name,
          category: d.category,
          version: d.version ?? null,
          confidence: d.confidence,
          evidence: d.evidence,
        })),
      );
    }

    await markStatus(scanId, 'succeeded', {
      finalUrl: result.finalUrl,
      httpStatus: result.httpStatus,
      responseHeaders: result.responseHeaders,
      loadTimeMs: result.loadTimeMs,
      finishedAt: sql`now()`,
      errorCode: null,
      errorMessage: null,
    });

    await db
      .update(websites)
      .set({ lastScannedAt: sql`now()` })
      .where(eq(websites.id, existing.websiteId));

    logger.info(
      { scanId, assets: result.assets.length, loadTimeMs: result.loadTimeMs },
      'scan succeeded',
    );
  } catch (err) {
    await markFailed(scanId, err);
    logger.warn({ err, scanId }, 'scan failed');
    throw err;
  }
}

// ------------------------------------------------------------------ reads

export interface ScanDetail {
  scan: Scan;
  website: Website;
  assets: { id: string; kind: string; url: string; byteSize: number; contentType: string | null }[];
  technologies: Technology[];
}

export async function getScanDetail(scanId: string): Promise<ScanDetail | null> {
  const scan = await db.query.scans.findFirst({ where: eq(scans.id, scanId) });
  if (!scan) return null;

  const website = await db.query.websites.findFirst({ where: eq(websites.id, scan.websiteId) });
  if (!website) return null;

  const assets = await db
    .select({
      id: scanAssets.id,
      kind: scanAssets.kind,
      url: scanAssets.url,
      byteSize: scanAssets.byteSize,
      contentType: scanAssets.contentType,
    })
    .from(scanAssets)
    .where(eq(scanAssets.scanId, scanId));

  const techs = await db
    .select()
    .from(technologies)
    .where(eq(technologies.scanId, scanId))
    .orderBy(desc(technologies.confidence), technologies.name);

  return { scan, website, assets, technologies: techs };
}

/** A user's own scans, newest first. */
export async function listScansForUser(userId: string, limit = 20, offset = 0) {
  return db
    .select({
      id: scans.id,
      status: scans.status,
      host: websites.host,
      finalUrl: scans.finalUrl,
      httpStatus: scans.httpStatus,
      loadTimeMs: scans.loadTimeMs,
      errorCode: scans.errorCode,
      queuedAt: scans.queuedAt,
      finishedAt: scans.finishedAt,
    })
    .from(scans)
    .innerJoin(websites, eq(websites.id, scans.websiteId))
    .where(eq(scans.requestedBy, userId))
    .orderBy(desc(scans.queuedAt))
    .limit(limit)
    .offset(offset);
}

/** The history timeline for one website (§23 reads this). */
export async function listScansForWebsite(websiteId: string, limit = 50) {
  return db
    .select({
      id: scans.id,
      status: scans.status,
      httpStatus: scans.httpStatus,
      loadTimeMs: scans.loadTimeMs,
      queuedAt: scans.queuedAt,
      finishedAt: scans.finishedAt,
    })
    .from(scans)
    .where(eq(scans.websiteId, websiteId))
    .orderBy(desc(scans.queuedAt))
    .limit(limit);
}
