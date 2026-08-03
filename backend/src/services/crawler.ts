/**
 * Website Crawler — module 1 of requirement.md §7.
 *
 * Open the site, capture the HTML, the CSS and JS it pulls in, and a
 * screenshot. Nothing here interprets what it captured; module 2 (technology
 * detection) reads the stored artefacts afterwards. Keeping capture and
 * analysis apart means a detector can be re-run against an old scan without
 * re-crawling the site.
 *
 * One browser is shared process-wide and a fresh incognito context is created
 * per scan. Launching Chromium costs ~300ms and a lot of memory; contexts are
 * cheap and give each scan its own cookie jar and cache.
 */

import { chromium, type Browser, type BrowserContext, type Response } from 'playwright';

import { env } from '../config/env.js';
import type { AssetKind } from '../db/schema/scans.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { resolveTarget, type ScanTarget } from '../lib/scan-target.js';

export interface CapturedAsset {
  kind: AssetKind;
  url: string;
  body: Buffer;
  contentType: string | null;
  /** True when the resource was seen but exceeded CRAWLER_MAX_ASSET_BYTES. */
  truncated: boolean;
}

export interface CrawlResult {
  target: ScanTarget;
  finalUrl: string;
  httpStatus: number;
  responseHeaders: Record<string, string>;
  loadTimeMs: number;
  html: Buffer;
  assets: CapturedAsset[];
  screenshot: { body: Buffer; width: number; height: number };
  /** Non-fatal problems worth surfacing on the scan (e.g. assets skipped). */
  warnings: string[];
}

let browser: Browser | null = null;

/** Launch on first use; every later scan reuses it. */
export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  logger.info('launching chromium');
  browser = await chromium.launch({
    args: [
      // The worker may run in a container without a large /dev/shm, where
      // Chromium's default shared-memory use crashes the renderer.
      '--disable-dev-shm-usage',
    ],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

function assetKindFor(resourceType: string, contentType: string | null): AssetKind | null {
  if (resourceType === 'stylesheet') return 'css';
  if (resourceType === 'script') return 'js';
  // Some servers send CSS/JS as a generic type with the wrong resourceType;
  // fall back to the content type before giving up on the resource.
  if (contentType?.includes('text/css')) return 'css';
  if (contentType && /(javascript|ecmascript)/.test(contentType)) return 'js';
  return null;
}

/**
 * Crawl one site. Throws `AppError` for anything the user caused (bad address,
 * site unreachable); anything else is a genuine fault and propagates.
 */
export async function crawl(input: string): Promise<CrawlResult> {
  return crawlTarget(await resolveTarget(input));
}

/**
 * Crawl an already-resolved target.
 *
 * Split out from `crawl` so the capture logic can be exercised against a
 * fixture server on loopback — which `resolveTarget` refuses by design, and
 * should keep refusing. Callers handling user input must go through `crawl`;
 * this entry point trusts its argument.
 */
export async function crawlTarget(target: ScanTarget): Promise<CrawlResult> {
  const browser = await getBrowser();

  let context: BrowserContext | null = null;
  const assets: CapturedAsset[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  try {
    context = await browser.newContext({
      userAgent: env.CRAWLER_USER_AGENT,
      viewport: { width: env.CRAWLER_VIEWPORT_WIDTH, height: env.CRAWLER_VIEWPORT_HEIGHT },
      // A site that 301s http→https and serves a bad certificate is still a
      // site worth reporting on; module 6 grades the certificate separately.
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    });
    context.setDefaultTimeout(env.CRAWLER_ASSET_TIMEOUT_MS);

    const page = await context.newPage();

    // Collect asset bodies as responses arrive. Reading the body here rather
    // than re-fetching afterwards means we store exactly what the page got,
    // including anything behind a one-shot signed URL.
    page.on('response', (response: Response) => {
      void (async () => {
        try {
          const url = response.url();
          if (seen.has(url) || !url.startsWith('http')) return;

          const contentType = response.headers()['content-type'] ?? null;
          const kind = assetKindFor(response.request().resourceType(), contentType);
          if (!kind) return;

          seen.add(url);
          if (assets.length >= env.CRAWLER_MAX_ASSETS) return;

          const body = await response.body();
          if (body.byteLength > env.CRAWLER_MAX_ASSET_BYTES) {
            assets.push({ kind, url, body: Buffer.alloc(0), contentType, truncated: true });
            return;
          }
          assets.push({ kind, url, body, contentType, truncated: false });
        } catch {
          // Bodies of redirects, aborted requests and cached responses are not
          // always retrievable. Missing one asset must not fail the scan.
        }
      })();
    });

    const startedAt = Date.now();
    let response: Response | null;
    try {
      response = await page.goto(target.url, {
        waitUntil: 'networkidle',
        timeout: env.CRAWLER_NAV_TIMEOUT_MS,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A slow site is not a broken scanner — report it as the user's problem
      // to act on, with a stable code the frontend can branch on.
      if (/timeout/i.test(message)) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `${target.host} did not finish loading within ${Math.round(env.CRAWLER_NAV_TIMEOUT_MS / 1000)}s`,
        );
      }
      throw new AppError(400, 'VALIDATION_ERROR', `Could not load ${target.host}: ${message}`);
    }
    const loadTimeMs = Date.now() - startedAt;

    if (!response) {
      throw new AppError(400, 'VALIDATION_ERROR', `${target.host} returned no response`);
    }

    const html = Buffer.from(await page.content(), 'utf8');
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });

    if (seen.size > assets.length) {
      warnings.push(
        `${seen.size - assets.length} additional asset(s) were not stored (cap: ${env.CRAWLER_MAX_ASSETS})`,
      );
    }

    return {
      target,
      finalUrl: page.url(),
      httpStatus: response.status(),
      responseHeaders: response.headers(),
      loadTimeMs,
      html,
      assets,
      screenshot: {
        body: screenshot,
        width: env.CRAWLER_VIEWPORT_WIDTH,
        height: env.CRAWLER_VIEWPORT_HEIGHT,
      },
      warnings,
    };
  } finally {
    await context?.close();
  }
}
