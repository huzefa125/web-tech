/**
 * The contract every detector works against.
 *
 * Deliberately plain data, not a Playwright page: detection runs on what a
 * scan captured, so a rule can be re-run against an old scan without
 * re-crawling the site. That is what makes §23's "when did this change?"
 * answerable retroactively when a new rule is added.
 */

import type { TechCategory } from '../../db/schema/scans.js';

export interface DetectionInput {
  /** Rendered HTML, after scripts ran. */
  html: string;
  /** Response headers of the main document, lowercased keys. */
  headers: Record<string, string>;
  /** Absolute URLs of every stylesheet and script the page loaded. */
  assetUrls: string[];
  /**
   * Every URL the page requested, of any kind. Distinct from `assetUrls`
   * because the services a site talks to — an auth provider, a headless CMS, a
   * model API — are reached over fetch, and so never appear among its
   * stylesheets and scripts.
   */
  requestUrls: string[];
  /** Names of globals found on the page's window. */
  globals: string[];
  /** Names of cookies the site set — the most reliable backend signal left
   *  once a CDN has stripped the server headers. */
  cookies: string[];
  /** Bodies of captured CSS files, concatenated. May be empty. */
  css: string;
  /** Bodies of captured JS files, concatenated. May be empty. */
  js: string;
  finalUrl: string;

  // ---- Optional extras. Older scans predate these, so every one is optional
  // and a rule keyed on a missing input simply does not fire.

  /** Body of the Web App Manifest, if the page declared one. */
  manifest?: string | undefined;
  /** Script URLs of any registered service workers. */
  serviceWorkers?: string[] | undefined;
  /** Body of /robots.txt, if it was fetched. */
  robots?: string | undefined;
  /**
   * DNS answers for the host, as `TYPE value` lines — `CNAME x.vercel-dns.com`,
   * `NS ns1.cloudflare.com`. Hosting and CDN often show here and nowhere else,
   * because the origin sits behind a proxy that strips its own headers.
   */
  dns?: string[] | undefined;
}

export interface Detection {
  name: string;
  category: TechCategory;
  version?: string | undefined;
  /**
   * 0–100. Roughly: 95+ means the site told us outright (a framework's own
   * global or data blob), 80 means a signature only that technology produces,
   * 60 means a strong hint, below that is a guess worth showing but not
   * relying on.
   */
  confidence: number;
  /** Human-readable reasons, shown in the UI so a wrong call is explicable. */
  evidence: string[];
}

export type Detector = (input: DetectionInput) => Detection[];
