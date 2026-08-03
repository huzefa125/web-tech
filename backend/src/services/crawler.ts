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
  /** Globals present on `window` — the strongest signals module 2 has. */
  globals: string[];
  /**
   * Cookie names the site set. Often the only surviving evidence of what runs
   * on the server: a CDN strips `x-powered-by`, but `PHPSESSID` or
   * `JSESSIONID` still has to reach the browser for the app to work.
   */
  cookies: string[];
  /** Non-fatal problems worth surfacing on the scan (e.g. assets skipped). */
  warnings: string[];
}

/**
 * Globals worth asking about. A whitelist rather than an enumeration of
 * `window`: every page has hundreds of properties, almost all irrelevant, and
 * serialising them back across the CDP boundary is slow and occasionally
 * throws on exotic getters.
 */
const PROBE_GLOBALS = [
  '__NEXT_DATA__',
  '__NUXT__',
  '__remixContext',
  '__sveltekit',
  '__NEXT_LOADED_PAGES__',
  '_astro',
  'React',
  'ReactDOM',
  'Vue',
  'ng',
  'getAllAngularRootElements',
  'angular',
  'jQuery',
  '$',
  'Shopify',
  'wp',
  'Drupal',
  'Joomla',
  'Alpine',
  'htmx',
  'gtag',
  'dataLayer',
  'ga',
  'fbq',
  'analytics',
  'Sentry',
  'Stripe',
  'webpackChunk',
  '__webpack_require__',
  '__vite__',
  '__APOLLO_CLIENT__',

  // Animation and 3D. These almost always leave a global even when the rest of
  // the page is bundled, which makes them the cheapest reliable signal for a
  // category that is otherwise buried in minified chunks.
  'gsap',
  'TweenMax',
  'TweenLite',
  'ScrollTrigger',
  'Motion',
  'THREE',
  'lottie',
  'bodymovin',
  'AOS',
  'anime',
  'Swiper',
  'LocomotiveScroll',
  'Lenis',
  'ScrollReveal',
  'ScrollMagic',
  'WOW',
  'Splide',
  'rive',
  'particlesJS',
  'tsParticles',
  'VANTA',
  'barba',
] as const;

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

    // Probing runs in the page, so a global defined by a bundle we could not
    // read is still visible. A page that throws on property access must not
    // fail the scan, hence the per-key try.
    let globals: string[] = [];
    try {
      globals = await page.evaluate((names: readonly string[]) => {
        const found: string[] = [];
        // globalThis, not window: this closure is typed against the backend's
        // tsconfig, which has no DOM lib. At runtime it is the page's window.
        const scope = globalThis as unknown as Record<string, unknown>;
        for (const name of names) {
          try {
            if (scope[name] !== undefined && scope[name] !== null) found.push(name);
          } catch {
            // Cross-origin or throwing getter — treat as absent.
          }
        }
        return found;
      }, PROBE_GLOBALS);
    } catch (err) {
      warnings.push('Could not read page globals');
      logger.debug({ err }, 'global probe failed');
    }

    // Read from the context rather than parsing Set-Cookie: this also catches
    // cookies written by JavaScript, and the header is frequently absent on a
    // cached response even though the cookie is very much in play.
    let cookies: string[] = [];
    try {
      cookies = [...new Set((await context.cookies()).map((c) => c.name))];
    } catch (err) {
      warnings.push('Could not read cookies');
      logger.debug({ err }, 'cookie read failed');
    }

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
      globals,
      cookies,
      warnings,
    };
  } finally {
    await context?.close();
  }
}
