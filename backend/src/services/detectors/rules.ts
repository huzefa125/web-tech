/**
 * Signature rules — module 2 of requirement.md §7.
 *
 * Each rule names one technology and lists the signals that imply it. A rule
 * fires when any signal matches; confidence is the highest-scoring signal that
 * did, so a page carrying both `__NEXT_DATA__` and a `/_next/` URL is reported
 * with the certainty of the former rather than the average of the two.
 *
 * Ordering does not matter — every rule is evaluated, and the engine resolves
 * conflicts afterwards (see `implies` in index.ts).
 */

import type { TechCategory } from '../../db/schema/scans.js';
import type { DetectionInput } from './types.js';

export interface Signal {
  /**
   * Where to look. `cookie` matches a cookie *name*; `url` matches the final
   * URL, which still gives away a stack whenever the extension survives
   * (`/index.php`, `/default.aspx`).
   */
  in:
    | 'html'
    | 'assetUrl'
    | 'global'
    | 'header'
    | 'css'
    | 'js'
    | 'metaGenerator'
    | 'cookie'
    | 'url';
  /** What to look for. Strings are substring matches; regexes are tested. */
  match: string | RegExp;
  /** Only for `in: 'header'` — the header name, lowercased. */
  header?: string;
  confidence: number;
  /** How to describe this match to a user. */
  evidence: string;
  /** Capture group 1 of `match`, when it yields a version. */
  versionFrom?: boolean;
}

export interface Rule {
  name: string;
  category: TechCategory;
  signals: Signal[];
  /** Technologies this one necessarily brings with it. */
  implies?: string[];
}

const g = (name: string, confidence: number, evidence: string): Signal => ({
  in: 'global',
  match: name,
  confidence,
  evidence,
});

export const RULES: Rule[] = [
  // ------------------------------------------------------------ frameworks
  {
    name: 'Next.js',
    category: 'framework',
    implies: ['React', 'Node.js'],
    signals: [
      g('__NEXT_DATA__', 98, 'window.__NEXT_DATA__ is present'),
      { in: 'assetUrl', match: '/_next/static/', confidence: 95, evidence: 'Loads /_next/static/ bundles' },
      { in: 'html', match: 'id="__next"', confidence: 90, evidence: 'Root element id="__next"' },
      { in: 'header', header: 'x-powered-by', match: 'Next.js', confidence: 95, evidence: 'x-powered-by: Next.js' },
      { in: 'html', match: /<meta name="next-head-count"/i, confidence: 85, evidence: 'next-head-count meta tag' },
    ],
  },
  {
    name: 'React',
    category: 'framework',
    signals: [
      g('React', 90, 'window.React is defined'),
      { in: 'html', match: 'data-reactroot', confidence: 90, evidence: 'data-reactroot attribute' },
      { in: 'html', match: /<!--\$-->|<!--\/\$-->/, confidence: 80, evidence: 'React server-component comment markers' },
      { in: 'assetUrl', match: /react(-dom)?[.@-][\d.]*(\.production|\.min)?\.js/i, confidence: 85, evidence: 'Loads a react bundle' },
    ],
  },
  {
    name: 'Nuxt',
    category: 'framework',
    implies: ['Vue.js'],
    signals: [
      g('__NUXT__', 98, 'window.__NUXT__ is present'),
      { in: 'assetUrl', match: '/_nuxt/', confidence: 95, evidence: 'Loads /_nuxt/ bundles' },
      { in: 'html', match: 'id="__nuxt"', confidence: 90, evidence: 'Root element id="__nuxt"' },
    ],
  },
  {
    name: 'Vue.js',
    category: 'framework',
    signals: [
      g('Vue', 90, 'window.Vue is defined'),
      { in: 'html', match: /\sdata-v-[0-9a-f]{8}/, confidence: 85, evidence: 'Scoped-style data-v attributes' },
      { in: 'html', match: 'id="app" data-v-app', confidence: 90, evidence: 'Vue 3 app mount point' },
      { in: 'assetUrl', match: /vue[.@-][\d.]*(\.runtime)?(\.min)?\.js/i, confidence: 80, evidence: 'Loads a vue bundle' },
    ],
  },
  {
    name: 'Angular',
    category: 'framework',
    signals: [
      g('getAllAngularRootElements', 95, 'Angular debug hook is present'),
      { in: 'html', match: /\sng-version="([\d.]+)"/, confidence: 98, evidence: 'ng-version attribute', versionFrom: true },
      { in: 'html', match: '<app-root', confidence: 80, evidence: '<app-root> element' },
      { in: 'assetUrl', match: /(polyfills|main)[.-][0-9a-z]{8,}\.js/i, confidence: 40, evidence: 'Angular-style bundle filenames' },
    ],
  },
  {
    name: 'Svelte',
    category: 'framework',
    signals: [
      g('__sveltekit', 95, 'SvelteKit global is present'),
      { in: 'html', match: /class="[^"]*\bsvelte-[0-9a-z]{6}/, confidence: 85, evidence: 'svelte-* scoped class names' },
      { in: 'assetUrl', match: '/_app/immutable/', confidence: 90, evidence: 'Loads SvelteKit immutable assets' },
    ],
  },
  {
    name: 'Remix',
    category: 'framework',
    implies: ['React'],
    signals: [
      g('__remixContext', 98, 'window.__remixContext is present'),
      { in: 'html', match: 'window.__remixManifest', confidence: 90, evidence: 'Remix manifest inlined' },
    ],
  },
  {
    name: 'Astro',
    category: 'framework',
    signals: [
      // The build output path, and the strongest signal by far: it survives a
      // page with no islands, no generator meta and no scoped styles, which is
      // exactly what a mostly-static Astro site looks like.
      { in: 'assetUrl', match: '/_astro/', confidence: 95, evidence: 'Loads /_astro/ bundles' },
      { in: 'html', match: /<astro-island/i, confidence: 95, evidence: '<astro-island> element' },
      // `[^"]*` matters — the scoped class is rarely the first one in the list.
      { in: 'html', match: /class="[^"]*\bastro-[0-9a-z]{6,}/i, confidence: 85, evidence: 'astro-* scoped class names' },
      { in: 'html', match: '/_astro/', confidence: 85, evidence: 'References /_astro/ assets' },
      { in: 'metaGenerator', match: /Astro v?([\d.]+)/i, confidence: 95, evidence: 'generator meta names Astro', versionFrom: true },
    ],
  },

  {
    name: 'Gatsby',
    category: 'framework',
    implies: ['React'],
    signals: [
      g('___gatsby', 95, 'window.___gatsby is present'),
      { in: 'html', match: 'id="___gatsby"', confidence: 95, evidence: 'Root element id="___gatsby"' },
      { in: 'assetUrl', match: '/page-data/', confidence: 90, evidence: 'Loads Gatsby page-data' },
      { in: 'metaGenerator', match: /Gatsby ?([\d.]+)?/i, confidence: 95, evidence: 'generator meta names Gatsby', versionFrom: true },
    ],
  },
  {
    name: 'Hugo',
    category: 'framework',
    signals: [
      { in: 'metaGenerator', match: /Hugo ?([\d.]+)?/i, confidence: 95, evidence: 'generator meta names Hugo', versionFrom: true },
    ],
  },
  {
    name: 'Jekyll',
    category: 'framework',
    signals: [
      { in: 'metaGenerator', match: /Jekyll v?([\d.]+)?/i, confidence: 95, evidence: 'generator meta names Jekyll', versionFrom: true },
    ],
  },
  {
    name: 'Eleventy',
    category: 'framework',
    signals: [
      { in: 'metaGenerator', match: /Eleventy ?v?([\d.]+)?/i, confidence: 95, evidence: 'generator meta names Eleventy', versionFrom: true },
    ],
  },

  // ------------------------------------------------------------------- CMS
  {
    name: 'WordPress',
    category: 'cms',
    implies: ['PHP'],
    signals: [
      { in: 'metaGenerator', match: /WordPress ([\d.]+)/i, confidence: 98, evidence: 'generator meta names WordPress', versionFrom: true },
      { in: 'assetUrl', match: '/wp-content/', confidence: 95, evidence: 'Loads assets from /wp-content/' },
      { in: 'assetUrl', match: '/wp-includes/', confidence: 95, evidence: 'Loads assets from /wp-includes/' },
      { in: 'html', match: '/wp-json/', confidence: 80, evidence: 'Links to the WP REST API' },
      { in: 'cookie', match: /^wordpress_/, confidence: 90, evidence: 'wordpress_* cookie' },
    ],
  },
  { name: 'Drupal', category: 'cms', implies: ['PHP'], signals: [
    g('Drupal', 95, 'window.Drupal is defined'),
    { in: 'metaGenerator', match: /Drupal ([\d.]+)/i, confidence: 98, evidence: 'generator meta names Drupal', versionFrom: true },
    { in: 'header', header: 'x-generator', match: 'Drupal', confidence: 95, evidence: 'x-generator: Drupal' },
  ] },
  { name: 'Joomla', category: 'cms', implies: ['PHP'], signals: [
    g('Joomla', 90, 'window.Joomla is defined'),
    { in: 'metaGenerator', match: /Joomla/i, confidence: 95, evidence: 'generator meta names Joomla' },
  ] },
  { name: 'Webflow', category: 'cms', signals: [
    { in: 'metaGenerator', match: /Webflow/i, confidence: 98, evidence: 'generator meta names Webflow' },
    { in: 'html', match: 'data-wf-page', confidence: 95, evidence: 'data-wf-page attribute' },
  ] },

  // ------------------------------------------------------------- ecommerce
  {
    name: 'Shopify',
    category: 'ecommerce',
    signals: [
      g('Shopify', 98, 'window.Shopify is defined'),
      { in: 'assetUrl', match: 'cdn.shopify.com', confidence: 95, evidence: 'Loads assets from cdn.shopify.com' },
      { in: 'header', header: 'x-shopid', match: /.+/, confidence: 98, evidence: 'x-shopid header' },
    ],
  },
  { name: 'WooCommerce', category: 'ecommerce', implies: ['WordPress'], signals: [
    { in: 'assetUrl', match: '/plugins/woocommerce/', confidence: 95, evidence: 'Loads WooCommerce plugin assets' },
    { in: 'html', match: /class="[^"]*\bwoocommerce\b/, confidence: 85, evidence: 'woocommerce body class' },
  ] },
  { name: 'Magento', category: 'ecommerce', implies: ['PHP'], signals: [
    { in: 'assetUrl', match: '/static/version', confidence: 70, evidence: 'Magento static-version asset path' },
    { in: 'html', match: 'Magento_', confidence: 85, evidence: 'Magento_* module references' },
  ] },
  { name: 'Squarespace', category: 'cms', signals: [
    { in: 'assetUrl', match: 'static1.squarespace.com', confidence: 95, evidence: 'Loads Squarespace static assets' },
    { in: 'html', match: 'Static.SQUARESPACE_CONTEXT', confidence: 98, evidence: 'Squarespace context object' },
  ] },
  { name: 'Wix', category: 'cms', signals: [
    { in: 'header', header: 'x-wix-request-id', match: /.+/, confidence: 98, evidence: 'x-wix-request-id header' },
    { in: 'assetUrl', match: 'static.parastorage.com', confidence: 90, evidence: 'Loads Wix static assets' },
  ] },

  // -------------------------------------------------------------------- UI
  {
    name: 'Tailwind CSS',
    category: 'ui',
    signals: [
      { in: 'css', match: /--tw-(ring-offset-shadow|border-spacing|translate-x)/, confidence: 95, evidence: 'Tailwind CSS custom properties' },
      { in: 'css', match: /\.sr-only\{position:absolute;width:1px;height:1px/, confidence: 90, evidence: "Tailwind's .sr-only rule" },
      { in: 'html', match: /class="[^"]*\b(flex|grid)\b[^"]*\b(items-center|justify-between|gap-\d)/, confidence: 55, evidence: 'Tailwind-style utility classes' },
    ],
  },
  { name: 'Bootstrap', category: 'ui', signals: [
    { in: 'assetUrl', match: /bootstrap[.@-]?([\d.]+)?(\.min)?\.(css|js)/i, confidence: 90, evidence: 'Loads a bootstrap bundle', versionFrom: true },
    { in: 'css', match: /\.col-md-\d+|\.navbar-toggler/, confidence: 85, evidence: 'Bootstrap grid and component classes' },
  ] },
  { name: 'Material UI', category: 'ui', signals: [
    { in: 'html', match: /class="[^"]*\bMui[A-Z]/, confidence: 90, evidence: 'Mui* class names' },
    { in: 'css', match: /\.MuiButton-root/, confidence: 95, evidence: 'MUI component styles' },
  ] },
  { name: 'Chakra UI', category: 'ui', signals: [
    { in: 'html', match: /class="[^"]*\bchakra-/, confidence: 90, evidence: 'chakra-* class names' },
    { in: 'html', match: 'data-theme="chakra-ui', confidence: 85, evidence: 'Chakra theme attribute' },
  ] },
  { name: 'styled-components', category: 'ui', signals: [
    { in: 'html', match: 'data-styled', confidence: 90, evidence: 'data-styled attribute' },
    { in: 'html', match: /class="[^"]*\bsc-[0-9a-zA-Z]{6}/, confidence: 80, evidence: 'sc-* generated class names' },
  ] },

  // -------------------------------------------------------------- libraries
  { name: 'jQuery', category: 'library', signals: [
    g('jQuery', 95, 'window.jQuery is defined'),
    { in: 'assetUrl', match: /jquery[.-]?([\d.]+)?(\.min)?\.js/i, confidence: 90, evidence: 'Loads a jQuery bundle', versionFrom: true },
  ] },
  { name: 'Alpine.js', category: 'library', signals: [
    g('Alpine', 95, 'window.Alpine is defined'),
    { in: 'html', match: /\sx-data=/, confidence: 80, evidence: 'x-data attributes' },
  ] },
  { name: 'htmx', category: 'library', signals: [
    g('htmx', 95, 'window.htmx is defined'),
    { in: 'html', match: /\shx-(get|post|target)=/, confidence: 85, evidence: 'hx-* attributes' },
  ] },
  { name: 'GraphQL', category: 'library', signals: [
    g('__APOLLO_CLIENT__', 90, 'Apollo Client global is present'),
    { in: 'js', match: /\/graphql["'`]/, confidence: 60, evidence: 'References a /graphql endpoint' },
  ] },
  { name: 'webpack', category: 'library', signals: [
    g('webpackChunk', 85, 'webpack chunk global is present'),
    g('__webpack_require__', 90, 'webpack runtime is present'),
  ] },
  { name: 'Vite', category: 'library', signals: [
    { in: 'assetUrl', match: '/@vite/client', confidence: 95, evidence: 'Loads the Vite dev client' },
    { in: 'html', match: 'type="module" crossorigin src="/assets/', confidence: 60, evidence: 'Vite-style module entry' },
  ] },

  // -------------------------------------------------------------- languages
  { name: 'PHP', category: 'language', signals: [
    { in: 'header', header: 'x-powered-by', match: /PHP\/?([\d.]+)?/i, confidence: 95, evidence: 'x-powered-by names PHP', versionFrom: true },
    { in: 'cookie', match: 'PHPSESSID', confidence: 92, evidence: 'PHPSESSID cookie' },
    { in: 'url', match: /\.php(\?|$)/, confidence: 90, evidence: 'URL ends in .php' },
  ] },
  { name: 'Node.js', category: 'language', signals: [
    { in: 'header', header: 'x-powered-by', match: /Express/i, confidence: 85, evidence: 'x-powered-by names Express' },
  ] },
  { name: 'Ruby on Rails', category: 'framework', signals: [
    { in: 'header', header: 'x-powered-by', match: /Phusion Passenger/i, confidence: 80, evidence: 'Passenger app server' },
    { in: 'html', match: /<meta name="csrf-param" content="authenticity_token"/, confidence: 95, evidence: 'Rails authenticity_token meta' },
    { in: 'cookie', match: /^_.*_session$/, confidence: 80, evidence: 'Rails-style session cookie' },
  ] },
  { name: 'Django', category: 'framework', signals: [
    { in: 'cookie', match: 'csrftoken', confidence: 90, evidence: 'Django csrftoken cookie' },
    { in: 'html', match: 'name="csrfmiddlewaretoken"', confidence: 95, evidence: 'csrfmiddlewaretoken form field' },
  ] },
  { name: 'Laravel', category: 'framework', implies: ['PHP'], signals: [
    { in: 'cookie', match: 'laravel_session', confidence: 95, evidence: 'laravel_session cookie' },
    { in: 'html', match: 'name="csrf-token"', confidence: 40, evidence: 'csrf-token meta tag' },
  ] },
  { name: 'ASP.NET', category: 'framework', signals: [
    { in: 'header', header: 'x-aspnet-version', match: /([\d.]+)/, confidence: 98, evidence: 'x-aspnet-version header', versionFrom: true },
    { in: 'header', header: 'x-powered-by', match: /ASP\.NET/i, confidence: 90, evidence: 'x-powered-by names ASP.NET' },
    { in: 'html', match: '__VIEWSTATE', confidence: 90, evidence: '__VIEWSTATE form field' },
    { in: 'cookie', match: 'ASP.NET_SessionId', confidence: 95, evidence: 'ASP.NET_SessionId cookie' },
    { in: 'url', match: /\.(aspx|ashx|asmx)(\?|$)/, confidence: 90, evidence: 'ASP.NET URL extension' },
  ] },
  { name: 'Express', category: 'server', implies: ['Node.js'], signals: [
    { in: 'header', header: 'x-powered-by', match: /^Express/i, confidence: 90, evidence: 'x-powered-by: Express' },
    { in: 'cookie', match: 'connect.sid', confidence: 90, evidence: 'connect.sid session cookie' },
  ] },

  // ----------------------------------------------------------------- server
  { name: 'nginx', category: 'server', signals: [
    { in: 'header', header: 'server', match: /nginx\/?([\d.]+)?/i, confidence: 95, evidence: 'server header names nginx', versionFrom: true },
  ] },
  { name: 'Apache', category: 'server', signals: [
    { in: 'header', header: 'server', match: /Apache\/?([\d.]+)?/i, confidence: 95, evidence: 'server header names Apache', versionFrom: true },
  ] },
  { name: 'LiteSpeed', category: 'server', signals: [
    { in: 'header', header: 'server', match: /LiteSpeed/i, confidence: 95, evidence: 'server header names LiteSpeed' },
  ] },

  // ---------------------------------------------------- hosting (module 3)
  { name: 'Vercel', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /Vercel/i, confidence: 98, evidence: 'server: Vercel' },
    { in: 'header', header: 'x-vercel-id', match: /.+/, confidence: 98, evidence: 'x-vercel-id header' },
  ] },
  { name: 'Netlify', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /Netlify/i, confidence: 98, evidence: 'server: Netlify' },
    { in: 'header', header: 'x-nf-request-id', match: /.+/, confidence: 98, evidence: 'x-nf-request-id header' },
  ] },
  { name: 'GitHub Pages', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /GitHub\.com/i, confidence: 95, evidence: 'server: GitHub.com' },
  ] },
  { name: 'Amazon S3', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /AmazonS3/i, confidence: 95, evidence: 'server: AmazonS3' },
  ] },
  { name: 'Firebase Hosting', category: 'hosting', signals: [
    { in: 'header', header: 'x-served-by', match: /Firebase/i, confidence: 90, evidence: 'Served by Firebase' },
  ] },
  { name: 'Render', category: 'hosting', signals: [
    { in: 'header', header: 'x-render-origin-server', match: /.+/, confidence: 95, evidence: 'x-render-origin-server header' },
  ] },
  { name: 'Cloudflare Pages', category: 'hosting', signals: [
    { in: 'header', header: 'cf-worker', match: /.+/, confidence: 80, evidence: 'cf-worker header' },
  ] },

  // -------------------------------------------------------- CDN (module 4)
  { name: 'Cloudflare', category: 'cdn', signals: [
    { in: 'header', header: 'cf-ray', match: /.+/, confidence: 98, evidence: 'cf-ray header' },
    { in: 'header', header: 'server', match: /cloudflare/i, confidence: 95, evidence: 'server: cloudflare' },
  ] },
  { name: 'Amazon CloudFront', category: 'cdn', signals: [
    { in: 'header', header: 'x-amz-cf-id', match: /.+/, confidence: 98, evidence: 'x-amz-cf-id header' },
    { in: 'header', header: 'via', match: /CloudFront/i, confidence: 90, evidence: 'via names CloudFront' },
  ] },
  { name: 'Fastly', category: 'cdn', signals: [
    { in: 'header', header: 'x-served-by', match: /cache-/i, confidence: 70, evidence: 'Fastly cache node in x-served-by' },
    { in: 'header', header: 'x-fastly-request-id', match: /.+/, confidence: 98, evidence: 'x-fastly-request-id header' },
  ] },
  { name: 'Akamai', category: 'cdn', signals: [
    { in: 'header', header: 'x-akamai-transformed', match: /.+/, confidence: 95, evidence: 'x-akamai-transformed header' },
    { in: 'header', header: 'server', match: /AkamaiGHost/i, confidence: 98, evidence: 'server: AkamaiGHost' },
  ] },
  { name: 'bunny.net', category: 'cdn', signals: [
    { in: 'header', header: 'server', match: /BunnyCDN/i, confidence: 98, evidence: 'server: BunnyCDN' },
  ] },

  // ------------------------------------------------------------- analytics
  { name: 'Google Analytics', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'googletagmanager.com/gtag/js', confidence: 95, evidence: 'Loads gtag.js' },
    g('gtag', 85, 'window.gtag is defined'),
  ] },
  { name: 'Google Tag Manager', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'googletagmanager.com/gtm.js', confidence: 95, evidence: 'Loads gtm.js' },
    g('dataLayer', 60, 'window.dataLayer is defined'),
  ] },
  { name: 'Meta Pixel', category: 'analytics', signals: [
    g('fbq', 90, 'window.fbq is defined'),
    { in: 'assetUrl', match: 'connect.facebook.net', confidence: 90, evidence: 'Loads the Facebook SDK' },
  ] },
  { name: 'Sentry', category: 'analytics', signals: [
    g('Sentry', 90, 'window.Sentry is defined'),
    { in: 'assetUrl', match: /browser\.sentry-cdn\.com|\/sentry[.-]/i, confidence: 85, evidence: 'Loads a Sentry bundle' },
  ] },
  { name: 'Hotjar', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'static.hotjar.com', confidence: 95, evidence: 'Loads Hotjar' },
  ] },
  { name: 'Plausible', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'plausible.io/js', confidence: 95, evidence: 'Loads Plausible' },
  ] },

  // ----------------------------------------------------------------- fonts
  { name: 'Google Fonts', category: 'fonts', signals: [
    { in: 'assetUrl', match: 'fonts.googleapis.com', confidence: 95, evidence: 'Loads fonts.googleapis.com' },
    { in: 'html', match: 'fonts.gstatic.com', confidence: 80, evidence: 'Preconnects to fonts.gstatic.com' },
  ] },
  { name: 'Font Awesome', category: 'fonts', signals: [
    { in: 'assetUrl', match: /font-?awesome/i, confidence: 95, evidence: 'Loads Font Awesome' },
    { in: 'html', match: /class="[^"]*\bfa[srlbd]?\s+fa-/, confidence: 80, evidence: 'fa-* icon classes' },
  ] },

  // ------------------------------------------------------------- animation
  //
  // Most of these ship as their own file or leave a global behind, so asset
  // URLs and globals carry the detection. The bundled-into-one-chunk case
  // (Framer Motion in a Next.js build) is why some rules also look inside the
  // captured JS for a signature the minifier cannot rename.
  {
    name: 'GSAP',
    category: 'animation',
    signals: [
      g('gsap', 95, 'window.gsap is defined'),
      g('TweenMax', 90, 'window.TweenMax is defined'),
      g('ScrollTrigger', 85, 'window.ScrollTrigger is defined'),
      { in: 'assetUrl', match: /gsap|TweenMax|ScrollTrigger/i, confidence: 90, evidence: 'Loads a GSAP bundle' },
      { in: 'js', match: /gsap\.registerPlugin|_gsapVersion/, confidence: 85, evidence: 'GSAP calls in the bundle' },
    ],
  },
  {
    name: 'Framer Motion',
    category: 'animation',
    signals: [
      { in: 'assetUrl', match: /framer-motion|framer_motion/i, confidence: 90, evidence: 'Loads a Framer Motion bundle' },
      // Survives minification: these are string literals in the library.
      { in: 'js', match: /framer-motion|useMotionValue|AnimatePresence/, confidence: 80, evidence: 'Framer Motion identifiers in the bundle' },
      { in: 'html', match: /style="[^"]*transform:\s*none[^"]*"[^>]*data-projection-id/, confidence: 85, evidence: 'Framer Motion projection attributes' },
    ],
  },
  {
    name: 'Motion One',
    category: 'animation',
    signals: [
      g('Motion', 80, 'window.Motion is defined'),
      { in: 'assetUrl', match: /motion(-one)?[.@-][\d.]*(\.min)?\.js/i, confidence: 75, evidence: 'Loads a Motion One bundle' },
    ],
  },
  {
    name: 'Three.js',
    category: 'animation',
    signals: [
      g('THREE', 98, 'window.THREE is defined'),
      { in: 'assetUrl', match: /three(\.module)?(\.min)?\.js/i, confidence: 90, evidence: 'Loads a three.js bundle' },
      { in: 'js', match: /THREE\.WebGLRenderer|WebGLRenderer\b/, confidence: 75, evidence: 'three.js renderer in the bundle' },
    ],
  },
  {
    name: 'Lottie',
    category: 'animation',
    signals: [
      g('lottie', 95, 'window.lottie is defined'),
      g('bodymovin', 95, 'window.bodymovin is defined'),
      { in: 'assetUrl', match: /lottie|bodymovin/i, confidence: 90, evidence: 'Loads a Lottie player' },
      { in: 'html', match: /<lottie-player|<dotlottie-player/i, confidence: 95, evidence: '<lottie-player> element' },
    ],
  },
  {
    name: 'AOS',
    category: 'animation',
    signals: [
      g('AOS', 95, 'window.AOS is defined'),
      { in: 'html', match: /\sdata-aos=/, confidence: 90, evidence: 'data-aos attributes' },
      { in: 'assetUrl', match: /\baos(\.min)?\.(js|css)/i, confidence: 85, evidence: 'Loads the AOS library' },
    ],
  },
  {
    name: 'Anime.js',
    category: 'animation',
    signals: [
      g('anime', 90, 'window.anime is defined'),
      { in: 'assetUrl', match: /anime(\.min)?\.js/i, confidence: 85, evidence: 'Loads an Anime.js bundle' },
    ],
  },
  {
    name: 'Swiper',
    category: 'animation',
    signals: [
      g('Swiper', 95, 'window.Swiper is defined'),
      { in: 'html', match: /class="[^"]*\bswiper(-container|-wrapper|-slide)?\b/, confidence: 85, evidence: 'swiper-* markup' },
      { in: 'assetUrl', match: /swiper[.@-]/i, confidence: 90, evidence: 'Loads a Swiper bundle' },
    ],
  },
  {
    name: 'Locomotive Scroll',
    category: 'animation',
    signals: [
      g('LocomotiveScroll', 95, 'window.LocomotiveScroll is defined'),
      { in: 'html', match: /\sdata-scroll-container/, confidence: 90, evidence: 'data-scroll-container attribute' },
      { in: 'assetUrl', match: /locomotive-scroll/i, confidence: 95, evidence: 'Loads Locomotive Scroll' },
    ],
  },
  {
    name: 'Lenis',
    category: 'animation',
    signals: [
      g('Lenis', 90, 'window.Lenis is defined'),
      { in: 'assetUrl', match: /\blenis[.@-]/i, confidence: 90, evidence: 'Loads a Lenis bundle' },
      { in: 'html', match: /class="[^"]*\blenis\b/, confidence: 70, evidence: 'lenis root class' },
    ],
  },
  {
    name: 'ScrollReveal',
    category: 'animation',
    signals: [
      g('ScrollReveal', 95, 'window.ScrollReveal is defined'),
      { in: 'assetUrl', match: /scrollreveal/i, confidence: 90, evidence: 'Loads ScrollReveal' },
    ],
  },
  {
    name: 'ScrollMagic',
    category: 'animation',
    signals: [
      g('ScrollMagic', 95, 'window.ScrollMagic is defined'),
      { in: 'assetUrl', match: /scrollmagic/i, confidence: 90, evidence: 'Loads ScrollMagic' },
    ],
  },
  {
    name: 'WOW.js',
    category: 'animation',
    signals: [
      g('WOW', 90, 'window.WOW is defined'),
      { in: 'html', match: /class="[^"]*\bwow\b/, confidence: 70, evidence: 'wow animation classes' },
      { in: 'assetUrl', match: /wow(\.min)?\.js/i, confidence: 85, evidence: 'Loads WOW.js' },
    ],
  },
  {
    name: 'Animate.css',
    category: 'animation',
    signals: [
      { in: 'assetUrl', match: /animate(\.min)?\.css/i, confidence: 85, evidence: 'Loads Animate.css' },
      { in: 'css', match: /@keyframes\s+(fadeInUp|bounceIn|zoomIn)\b/, confidence: 80, evidence: 'Animate.css keyframes' },
      { in: 'html', match: /class="[^"]*\banimate__animated\b/, confidence: 95, evidence: 'animate__animated classes' },
    ],
  },
  {
    name: 'Slick Carousel',
    category: 'animation',
    implies: ['jQuery'],
    signals: [
      { in: 'html', match: /class="[^"]*\bslick-(slider|track|slide)\b/, confidence: 90, evidence: 'slick-* markup' },
      { in: 'assetUrl', match: /slick(\.min)?\.(js|css)/i, confidence: 90, evidence: 'Loads Slick Carousel' },
    ],
  },
  {
    name: 'Owl Carousel',
    category: 'animation',
    implies: ['jQuery'],
    signals: [
      { in: 'html', match: /class="[^"]*\bowl-(carousel|stage)\b/, confidence: 90, evidence: 'owl-* markup' },
      { in: 'assetUrl', match: /owl\.carousel/i, confidence: 95, evidence: 'Loads Owl Carousel' },
    ],
  },
  {
    name: 'Splide',
    category: 'animation',
    signals: [
      g('Splide', 95, 'window.Splide is defined'),
      { in: 'html', match: /class="[^"]*\bsplide\b/, confidence: 85, evidence: 'splide markup' },
    ],
  },
  {
    name: 'Rive',
    category: 'animation',
    signals: [
      g('rive', 90, 'window.rive is defined'),
      { in: 'assetUrl', match: /rive[.@-]|\.riv\b/i, confidence: 90, evidence: 'Loads a Rive runtime or file' },
    ],
  },
  {
    name: 'Spline',
    category: 'animation',
    signals: [
      { in: 'html', match: /<spline-viewer/i, confidence: 98, evidence: '<spline-viewer> element' },
      { in: 'assetUrl', match: /spline(tool)?\.(design|com)|@splinetool/i, confidence: 90, evidence: 'Loads a Spline runtime' },
    ],
  },
  {
    name: 'particles.js',
    category: 'animation',
    signals: [
      g('particlesJS', 95, 'window.particlesJS is defined'),
      g('tsParticles', 95, 'window.tsParticles is defined'),
      { in: 'assetUrl', match: /particles(\.min)?\.js|tsparticles/i, confidence: 90, evidence: 'Loads a particles library' },
    ],
  },
  {
    name: 'Vanta.js',
    category: 'animation',
    implies: ['Three.js'],
    signals: [
      g('VANTA', 95, 'window.VANTA is defined'),
      { in: 'assetUrl', match: /vanta/i, confidence: 90, evidence: 'Loads a Vanta effect' },
    ],
  },
  {
    name: 'Barba.js',
    category: 'animation',
    signals: [
      g('barba', 95, 'window.barba is defined'),
      { in: 'html', match: /\sdata-barba=/, confidence: 90, evidence: 'data-barba attributes' },
    ],
  },

  // -------------------------------------------- backend, BaaS, headless CMS
  //
  // Cookie names do most of the work here. A CDN in front of the origin strips
  // `Server` and `X-Powered-By` routinely, but a session cookie has to reach
  // the browser or the application cannot function.
  { name: 'Java', category: 'language', signals: [
    { in: 'cookie', match: 'JSESSIONID', confidence: 95, evidence: 'JSESSIONID cookie' },
    { in: 'url', match: /\.(jsp|do|action)(\?|$)/, confidence: 85, evidence: 'JSP/Struts URL extension' },
  ] },
  { name: 'Apache Tomcat', category: 'server', implies: ['Java'], signals: [
    { in: 'header', header: 'server', match: /Tomcat\/?([\d.]+)?/i, confidence: 95, evidence: 'server header names Tomcat', versionFrom: true },
  ] },
  { name: 'Python', category: 'language', signals: [
    { in: 'header', header: 'server', match: /(gunicorn|uvicorn|Werkzeug|WSGIServer)/i, confidence: 90, evidence: 'Python application server in the server header' },
  ] },
  { name: 'Gunicorn', category: 'server', implies: ['Python'], signals: [
    { in: 'header', header: 'server', match: /gunicorn\/?([\d.]+)?/i, confidence: 95, evidence: 'server: gunicorn', versionFrom: true },
  ] },
  { name: 'Uvicorn', category: 'server', implies: ['Python'], signals: [
    { in: 'header', header: 'server', match: /uvicorn/i, confidence: 95, evidence: 'server: uvicorn' },
  ] },
  { name: 'Flask', category: 'framework', implies: ['Python'], signals: [
    { in: 'header', header: 'server', match: /Werkzeug\/?([\d.]+)?/i, confidence: 90, evidence: 'Werkzeug development server', versionFrom: true },
  ] },
  { name: 'Microsoft IIS', category: 'server', signals: [
    { in: 'header', header: 'server', match: /Microsoft-IIS\/?([\d.]+)?/i, confidence: 98, evidence: 'server header names IIS', versionFrom: true },
  ] },
  { name: 'Caddy', category: 'server', signals: [
    { in: 'header', header: 'server', match: /Caddy/i, confidence: 95, evidence: 'server: Caddy' },
  ] },
  { name: 'Cloudflare Workers', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /cloudflare/i, confidence: 30, evidence: 'Served through Cloudflare' },
    { in: 'header', header: 'cf-worker', match: /.+/, confidence: 90, evidence: 'cf-worker header' },
  ] },

  // Cookie-only reinforcements for stacks already declared above. Rules are
  // keyed by name, so these merge into the same entry rather than duplicating.
  { name: 'Supabase', category: 'other', signals: [
    { in: 'assetUrl', match: /supabase\.co|supabase\.in/i, confidence: 95, evidence: 'Talks to Supabase' },
    { in: 'cookie', match: /^sb-.*-auth-token$/, confidence: 95, evidence: 'Supabase auth cookie' },
  ] },
  { name: 'Firebase', category: 'other', signals: [
    { in: 'assetUrl', match: /firebaseio\.com|firebaseapp\.com|gstatic\.com\/firebasejs/i, confidence: 95, evidence: 'Loads or calls Firebase' },
  ] },
  { name: 'Strapi', category: 'cms', implies: ['Node.js'], signals: [
    { in: 'header', header: 'x-powered-by', match: /Strapi/i, confidence: 98, evidence: 'x-powered-by: Strapi' },
  ] },
  { name: 'Ghost', category: 'cms', implies: ['Node.js'], signals: [
    { in: 'metaGenerator', match: /Ghost ?([\d.]+)?/i, confidence: 95, evidence: 'generator meta names Ghost', versionFrom: true },
  ] },
  { name: 'Sanity', category: 'cms', signals: [
    { in: 'assetUrl', match: /cdn\.sanity\.io|apicdn\.sanity\.io/i, confidence: 95, evidence: 'Loads content from Sanity' },
  ] },
  { name: 'Contentful', category: 'cms', signals: [
    { in: 'assetUrl', match: /ctfassets\.net|contentful\.com/i, confidence: 95, evidence: 'Loads content from Contentful' },
  ] },
  { name: 'Prismic', category: 'cms', signals: [
    { in: 'assetUrl', match: /prismic\.io/i, confidence: 95, evidence: 'Loads content from Prismic' },
  ] },
  { name: 'Framer', category: 'cms', signals: [
    { in: 'metaGenerator', match: /Framer/i, confidence: 95, evidence: 'generator meta names Framer' },
    { in: 'assetUrl', match: /framerusercontent\.com/i, confidence: 95, evidence: 'Loads Framer user content' },
  ] },

  // ----------------------------------------------------------------- other
  { name: 'Stripe', category: 'other', signals: [
    g('Stripe', 90, 'window.Stripe is defined'),
    { in: 'assetUrl', match: 'js.stripe.com', confidence: 95, evidence: 'Loads Stripe.js' },
  ] },
];
