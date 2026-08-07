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

import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';

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
  /**
   * Every URL the page requested, of any kind — XHR, fetch, images, fonts,
   * iframes, beacons. `assets` covers only the stylesheets and scripts whose
   * bodies were stored; a page talking to `api.openai.com` or `*.supabase.co`
   * does so over fetch, and that never appears in `assets`.
   */
  requestUrls: string[];
  /** Body of the Web App Manifest, if the page declared one. */
  manifest: string | null;
  /** Script URLs of any service workers the page registered. */
  serviceWorkers: string[];
  /** Body of /robots.txt, truncated. Names crawlers, admin paths and sitemaps. */
  robots: string | null;
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
  'BABYLON',
  'PIXI',
  'Matter',

  // Frameworks that only announce themselves on window.
  '_$HY',
  '__PREACT_DEVTOOLS__',
  'litElementVersions',
  'litHtmlVersions',
  'Stimulus',
  'Ember',
  'Backbone',
  'Inferno',
  '$MARKO',
  'Phoenix',
  'parcelRequire',

  // Storefronts, auth, payments, maps and monitoring SDKs. All of these attach
  // a global on load, which is usually cheaper and more certain than matching
  // their CDN URL — a site may self-host the same bundle.
  'Ecwid',
  'Snipcart',
  'Clerk',
  'OktaSignIn',
  'Razorpay',
  'paypal',
  'Paddle',
  'AdyenCheckout',
  'braintree',
  'mapboxgl',
  'LogRocket',
  'Bugsnag',
  'DD_RUM',
  'DD_LOGS',
  'NREUM',
  'rg4js',
  'mixpanel',
  'posthog',
  'amplitude',
  'heap',
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

/** `<link rel="manifest" href="...">`, without paying for a full parse. */
function manifestHref(html: string): string | null {
  const m = /<link[^>]+rel=["']?manifest["']?[^>]*>/i.exec(html);
  if (!m) return null;
  const href = /href=["']([^"']+)["']/i.exec(m[0]);
  return href?.[1] ?? null;
}

/** Longest supporting document we will keep. Manifests and robots.txt are
 *  small; anything larger is a misconfigured route, not a manifest. */
const MAX_SUPPORTING_BYTES = 64 * 1024;

/**
 * Fetch a same-origin supporting file from inside the page.
 *
 * Deliberately goes through `page.evaluate` rather than undici: the request
 * then carries the page's own origin and cookies, so a site that varies its
 * robots.txt by session sees one visitor, not two. Best-effort throughout —
 * a missing manifest is the normal case, not an error.
 */
async function fetchText(page: Page, path: string | null, base: string): Promise<string | null> {
  if (!path) return null;

  try {
    const url = new URL(path, base).toString();
    const text = await page.evaluate(async (target: string) => {
      const res = await fetch(target, { credentials: 'same-origin' });
      if (!res.ok) return null;
      return res.text();
    }, url);

    if (typeof text !== 'string') return null;
    return text.length > MAX_SUPPORTING_BYTES ? text.slice(0, MAX_SUPPORTING_BYTES) : text;
  } catch {
    return null;
  }
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
  const requested = new Set<string>();

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
          if (!url.startsWith('http')) return;

          // Record the URL before deciding whether to store a body. An API call
          // has no body worth keeping, but the fact that it happened is often
          // the only evidence a backend service is in play at all.
          if (requested.size < env.CRAWLER_MAX_REQUEST_URLS) requested.add(url);

          if (seen.has(url)) return;

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
      // `domcontentloaded`, not `networkidle`. A site with analytics polling, a
      // websocket, or a chat widget never reaches network idle at all — the
      // whole 30s budget burns and a perfectly scannable page is reported as
      // "did not finish loading". Playwright's own docs advise against it.
      response = await page.goto(target.url, {
        waitUntil: 'domcontentloaded',
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
    if (!response) {
      throw new AppError(400, 'VALIDATION_ERROR', `${target.host} returned no response`);
    }

    // Give the page a bounded window to finish fetching its stylesheets, run
    // its framework, and render. Best-effort on purpose: whichever of these
    // resolves first is enough, and neither timing out is a failure — we scan
    // whatever the page managed in the time it had.
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: env.CRAWLER_SETTLE_MS }),
      page.waitForLoadState('load', { timeout: env.CRAWLER_SETTLE_MS }),
    ]).catch(() => {
      warnings.push('Page was still loading when it was captured');
    });

    const loadTimeMs = Date.now() - startedAt;

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

    // Service workers are registered by script, so the page has to be asked —
    // there is no response to observe. A page with none returns an empty list.
    let serviceWorkers: string[] = [];
    try {
      serviceWorkers = await page.evaluate(async () => {
        const nav = (globalThis as { navigator?: { serviceWorker?: unknown } }).navigator;
        const sw = nav?.serviceWorker as
          | { getRegistrations?: () => Promise<{ active?: { scriptURL?: string } }[]> }
          | undefined;
        if (!sw?.getRegistrations) return [];
        const regs = await sw.getRegistrations();
        return regs.map((r) => r.active?.scriptURL ?? '').filter(Boolean);
      });
    } catch {
      // Insecure origin, or the page navigated away. Not worth a warning.
    }

    // The manifest and robots.txt are fetched through the page's own context,
    // so they inherit its cookies and origin rather than being a second,
    // unauthenticated visitor to the site.
    const manifest = await fetchText(page, manifestHref(await page.content()), target.url);
    const robots = await fetchText(page, '/robots.txt', target.url);

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
      requestUrls: [...requested],
      manifest,
      serviceWorkers,
      robots,
      globals,
      cookies,
      warnings,
    };
  } finally {
    await context?.close();
  }
}
