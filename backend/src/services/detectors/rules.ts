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
    | 'request'
    | 'scriptSrc'
    | 'inlineScript'
    | 'inlineStyle'
    | 'global'
    | 'header'
    | 'css'
    | 'js'
    | 'meta'
    | 'metaGenerator'
    | 'bodyClass'
    | 'formAction'
    | 'iframe'
    | 'cookie'
    | 'manifest'
    | 'serviceWorker'
    | 'robots'
    | 'dns'
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

const RAW_RULES: Rule[] = [
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
  { name: 'webpack', category: 'build', signals: [
    g('webpackChunk', 85, 'webpack chunk global is present'),
    g('__webpack_require__', 90, 'webpack runtime is present'),
  ] },
  { name: 'Vite', category: 'build', signals: [
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
  { name: 'Sentry', category: 'monitoring', signals: [
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
  { name: 'Supabase', category: 'database', signals: [
    { in: 'request', match: /supabase\.co|supabase\.in/i, confidence: 95, evidence: 'Talks to Supabase' },
    { in: 'cookie', match: /^sb-.*-auth-token$/, confidence: 95, evidence: 'Supabase auth cookie' },
  ] },
  { name: 'Firebase', category: 'database', signals: [
    { in: 'request', match: /firebaseio\.com|firebaseapp\.com|gstatic\.com\/firebasejs/i, confidence: 95, evidence: 'Loads or calls Firebase' },
  ] },
  { name: 'Strapi', category: 'cms', implies: ['Node.js'], signals: [
    { in: 'header', header: 'x-powered-by', match: /Strapi/i, confidence: 98, evidence: 'x-powered-by: Strapi' },
  ] },
  { name: 'Ghost', category: 'cms', implies: ['Node.js'], signals: [
    { in: 'metaGenerator', match: /Ghost ?([\d.]+)?/i, confidence: 95, evidence: 'generator meta names Ghost', versionFrom: true },
  ] },
  { name: 'Sanity', category: 'cms', signals: [
    { in: 'request', match: /cdn\.sanity\.io|apicdn\.sanity\.io/i, confidence: 95, evidence: 'Loads content from Sanity' },
  ] },
  { name: 'Contentful', category: 'cms', signals: [
    { in: 'request', match: /ctfassets\.net|contentful\.com/i, confidence: 95, evidence: 'Loads content from Contentful' },
  ] },
  { name: 'Prismic', category: 'cms', signals: [
    { in: 'request', match: /prismic\.io/i, confidence: 95, evidence: 'Loads content from Prismic' },
  ] },
  { name: 'Framer', category: 'cms', signals: [
    { in: 'metaGenerator', match: /Framer/i, confidence: 95, evidence: 'generator meta names Framer' },
    { in: 'request', match: /framerusercontent\.com/i, confidence: 95, evidence: 'Loads Framer user content' },
  ] },

  // ------------------------------------------------ more client frameworks
  { name: 'SvelteKit', category: 'framework', implies: ['Svelte'], signals: [
    { in: 'html', match: /\sdata-sveltekit-/, confidence: 95, evidence: 'data-sveltekit-* attributes' },
    { in: 'assetUrl', match: '/_app/immutable/', confidence: 90, evidence: 'Loads SvelteKit immutable assets' },
  ] },
  { name: 'Qwik', category: 'framework', signals: [
    { in: 'html', match: /\sq:container=/, confidence: 98, evidence: 'q:container attribute' },
    { in: 'html', match: /\sq:base=/, confidence: 95, evidence: 'q:base attribute' },
    { in: 'assetUrl', match: /\/build\/q-[0-9a-z]+\.js/i, confidence: 85, evidence: 'Qwik q-* build chunks' },
  ] },
  { name: 'SolidJS', category: 'framework', signals: [
    g('_$HY', 90, 'Solid hydration global is present'),
    { in: 'js', match: /solid-js\/web|createSignal\(/, confidence: 60, evidence: 'Solid identifiers in the bundle' },
  ] },
  { name: 'Preact', category: 'framework', signals: [
    g('__PREACT_DEVTOOLS__', 95, 'Preact devtools hook is present'),
    { in: 'assetUrl', match: /preact[.@-]/i, confidence: 85, evidence: 'Loads a Preact bundle' },
  ] },
  { name: 'Lit', category: 'framework', signals: [
    g('litElementVersions', 95, 'window.litElementVersions is present'),
    g('litHtmlVersions', 95, 'window.litHtmlVersions is present'),
    { in: 'assetUrl', match: /lit-(html|element)|\/lit[.@-]/i, confidence: 80, evidence: 'Loads a Lit bundle' },
  ] },
  { name: 'Stimulus', category: 'framework', signals: [
    g('Stimulus', 95, 'window.Stimulus is defined'),
    { in: 'html', match: /\sdata-controller="/, confidence: 80, evidence: 'data-controller attributes' },
  ] },
  { name: 'Ember', category: 'framework', signals: [
    g('Ember', 95, 'window.Ember is defined'),
    { in: 'html', match: /class="[^"]*\bember-application\b/, confidence: 90, evidence: 'ember-application class' },
  ] },
  { name: 'Backbone', category: 'framework', implies: ['jQuery'], signals: [
    g('Backbone', 95, 'window.Backbone is defined'),
  ] },
  { name: 'Inferno', category: 'framework', signals: [
    g('Inferno', 95, 'window.Inferno is defined'),
  ] },
  { name: 'Marko', category: 'framework', signals: [
    g('$MARKO', 90, 'Marko runtime global is present'),
  ] },
  { name: 'Fresh', category: 'framework', implies: ['Deno'], signals: [
    { in: 'assetUrl', match: '/_frsh/', confidence: 95, evidence: 'Loads /_frsh/ assets' },
  ] },

  // ------------------------------------------------ more server frameworks
  { name: 'AdonisJS', category: 'framework', implies: ['Node.js'], signals: [
    { in: 'cookie', match: 'adonis-session', confidence: 95, evidence: 'adonis-session cookie' },
  ] },
  { name: 'Symfony', category: 'framework', implies: ['PHP'], signals: [
    { in: 'header', header: 'x-debug-token', match: /.+/, confidence: 85, evidence: 'Symfony profiler debug token' },
    { in: 'cookie', match: 'sf_redirect', confidence: 80, evidence: 'Symfony redirect cookie' },
  ] },
  { name: 'CodeIgniter', category: 'framework', implies: ['PHP'], signals: [
    { in: 'cookie', match: 'ci_session', confidence: 95, evidence: 'ci_session cookie' },
  ] },
  { name: 'CakePHP', category: 'framework', implies: ['PHP'], signals: [
    { in: 'cookie', match: 'CAKEPHP', confidence: 95, evidence: 'CAKEPHP cookie' },
  ] },
  { name: 'Spring Boot', category: 'framework', implies: ['Java'], signals: [
    { in: 'header', header: 'x-application-context', match: /.+/, confidence: 90, evidence: 'x-application-context header' },
  ] },
  { name: 'Phoenix', category: 'framework', signals: [
    g('Phoenix', 90, 'window.Phoenix is defined'),
    { in: 'assetUrl', match: /phoenix[.@_-]/i, confidence: 75, evidence: 'Loads a Phoenix bundle' },
  ] },

  // ---------------------------------------------------------- more CMS
  { name: 'TYPO3', category: 'cms', implies: ['PHP'], signals: [
    { in: 'metaGenerator', match: /TYPO3/i, confidence: 95, evidence: 'generator meta names TYPO3' },
  ] },
  { name: 'Craft CMS', category: 'cms', implies: ['PHP'], signals: [
    { in: 'cookie', match: 'CraftSessionId', confidence: 95, evidence: 'CraftSessionId cookie' },
    { in: 'header', header: 'x-powered-by', match: /Craft ?CMS/i, confidence: 95, evidence: 'x-powered-by names Craft CMS' },
  ] },
  { name: 'Payload CMS', category: 'cms', implies: ['Node.js'], signals: [
    { in: 'cookie', match: 'payload-token', confidence: 95, evidence: 'payload-token cookie' },
  ] },
  { name: 'Directus', category: 'cms', implies: ['Node.js'], signals: [
    { in: 'cookie', match: 'directus_session_token', confidence: 95, evidence: 'directus session cookie' },
    { in: 'assetUrl', match: /directus/i, confidence: 70, evidence: 'Loads Directus assets' },
  ] },
  { name: 'Hygraph', category: 'cms', signals: [
    { in: 'request', match: /graphassets\.com|graphcms\.com/i, confidence: 95, evidence: 'Loads media from Hygraph' },
  ] },
  { name: 'DatoCMS', category: 'cms', signals: [
    { in: 'request', match: /datocms-assets\.com/i, confidence: 95, evidence: 'Loads media from DatoCMS' },
  ] },
  { name: 'Storyblok', category: 'cms', signals: [
    { in: 'request', match: /a\.storyblok\.com|storyblok\.com/i, confidence: 95, evidence: 'Loads content from Storyblok' },
  ] },
  { name: 'ButterCMS', category: 'cms', signals: [
    { in: 'request', match: /cdn\.buttercms\.com/i, confidence: 95, evidence: 'Loads media from ButterCMS' },
  ] },

  // ---------------------------------------------------- more ecommerce
  { name: 'BigCommerce', category: 'ecommerce', signals: [
    { in: 'request', match: /cdn\d*\.bigcommerce\.com/i, confidence: 95, evidence: 'Loads BigCommerce assets' },
    { in: 'header', header: 'x-bc-storefront', match: /.+/, confidence: 95, evidence: 'BigCommerce storefront header' },
  ] },
  { name: 'OpenCart', category: 'ecommerce', implies: ['PHP'], signals: [
    { in: 'cookie', match: 'OCSESSID', confidence: 95, evidence: 'OCSESSID cookie' },
    { in: 'url', match: /route=common\/home/, confidence: 90, evidence: 'OpenCart route parameter' },
  ] },
  { name: 'PrestaShop', category: 'ecommerce', implies: ['PHP'], signals: [
    { in: 'metaGenerator', match: /PrestaShop/i, confidence: 95, evidence: 'generator meta names PrestaShop' },
    { in: 'cookie', match: /^PrestaShop-/, confidence: 95, evidence: 'PrestaShop-* cookie' },
  ] },
  { name: 'Ecwid', category: 'ecommerce', signals: [
    g('Ecwid', 95, 'window.Ecwid is defined'),
    { in: 'request', match: /app\.ecwid\.com/i, confidence: 90, evidence: 'Loads the Ecwid storefront' },
  ] },
  { name: 'Snipcart', category: 'ecommerce', signals: [
    g('Snipcart', 95, 'window.Snipcart is defined'),
    { in: 'assetUrl', match: /cdn\.snipcart\.com/i, confidence: 95, evidence: 'Loads Snipcart' },
  ] },
  { name: 'Saleor', category: 'ecommerce', implies: ['Python'], signals: [
    { in: 'request', match: /saleor\.cloud|\/graphql\/.*saleor/i, confidence: 80, evidence: 'Talks to a Saleor API' },
  ] },

  // ------------------------------------------------------- more UI kits
  { name: 'Ant Design', category: 'ui', signals: [
    { in: 'html', match: /class="[^"]*\bant-[a-z]/, confidence: 90, evidence: 'ant-* class names' },
    { in: 'css', match: /\.ant-btn\b/, confidence: 95, evidence: 'Ant Design component styles' },
  ] },
  { name: 'Mantine', category: 'ui', signals: [
    { in: 'html', match: /class="[^"]*\bmantine-/, confidence: 90, evidence: 'mantine-* class names' },
    { in: 'html', match: /\sdata-mantine-color-scheme=/, confidence: 95, evidence: 'Mantine colour-scheme attribute' },
  ] },
  { name: 'Radix UI', category: 'ui', signals: [
    { in: 'html', match: /\sdata-radix-/, confidence: 95, evidence: 'data-radix-* attributes' },
    { in: 'html', match: /\bradix-[:a-z0-9]+\b/i, confidence: 80, evidence: 'Radix generated ids' },
  ] },
  { name: 'shadcn/ui', category: 'ui', implies: ['Radix UI', 'Tailwind CSS'], signals: [
    // shadcn is copy-pasted into a project, so there is no bundle to spot. Its
    // components do stamp data-slot, and they sit on Radix + Tailwind.
    { in: 'html', match: /\sdata-slot="[a-z-]+"/, confidence: 70, evidence: 'data-slot attributes on components' },
  ] },
  { name: 'DaisyUI', category: 'ui', implies: ['Tailwind CSS'], signals: [
    { in: 'css', match: /--fallback-p|\.btn-primary\{/, confidence: 85, evidence: 'DaisyUI theme variables' },
    { in: 'html', match: /class="[^"]*\bbtn\b[^"]*\bbtn-(primary|secondary|ghost)\b/, confidence: 60, evidence: 'DaisyUI button classes' },
  ] },
  { name: 'Flowbite', category: 'ui', implies: ['Tailwind CSS'], signals: [
    { in: 'assetUrl', match: /flowbite/i, confidence: 95, evidence: 'Loads Flowbite' },
  ] },
  { name: 'Semantic UI', category: 'ui', signals: [
    { in: 'assetUrl', match: /semantic(\.min)?\.(css|js)/i, confidence: 90, evidence: 'Loads Semantic UI' },
    { in: 'css', match: /\.ui\.button\b/, confidence: 85, evidence: 'Semantic UI component styles' },
  ] },
  { name: 'Bulma', category: 'ui', signals: [
    { in: 'assetUrl', match: /bulma(\.min)?\.css/i, confidence: 95, evidence: 'Loads Bulma' },
    { in: 'css', match: /\.column\.is-\d/, confidence: 80, evidence: 'Bulma grid classes' },
  ] },
  { name: 'Foundation', category: 'ui', signals: [
    { in: 'assetUrl', match: /foundation(\.min)?\.(css|js)/i, confidence: 90, evidence: 'Loads Foundation' },
  ] },
  { name: 'Vuetify', category: 'ui', implies: ['Vue.js'], signals: [
    { in: 'html', match: /class="[^"]*\bv-application\b/, confidence: 95, evidence: 'v-application root class' },
    { in: 'assetUrl', match: /vuetify/i, confidence: 90, evidence: 'Loads Vuetify' },
  ] },
  { name: 'PrimeReact', category: 'ui', implies: ['React'], signals: [
    { in: 'assetUrl', match: /primereact/i, confidence: 95, evidence: 'Loads PrimeReact' },
  ] },
  { name: 'PrimeVue', category: 'ui', implies: ['Vue.js'], signals: [
    { in: 'assetUrl', match: /primevue/i, confidence: 95, evidence: 'Loads PrimeVue' },
  ] },
  { name: 'Quasar', category: 'ui', implies: ['Vue.js'], signals: [
    { in: 'html', match: /class="[^"]*\bq-(app|layout|page)\b/, confidence: 95, evidence: 'Quasar layout classes' },
  ] },

  // ------------------------------------------------------- more 3D / canvas
  { name: 'Babylon.js', category: 'animation', signals: [
    g('BABYLON', 98, 'window.BABYLON is defined'),
    { in: 'assetUrl', match: /babylon(\.min)?\.js/i, confidence: 90, evidence: 'Loads a Babylon.js bundle' },
  ] },
  { name: 'PixiJS', category: 'animation', signals: [
    g('PIXI', 98, 'window.PIXI is defined'),
    { in: 'assetUrl', match: /pixi(\.min)?\.js/i, confidence: 90, evidence: 'Loads a PixiJS bundle' },
  ] },
  { name: 'Matter.js', category: 'animation', signals: [
    g('Matter', 90, 'window.Matter is defined'),
    { in: 'assetUrl', match: /matter(\.min)?\.js/i, confidence: 85, evidence: 'Loads a Matter.js bundle' },
  ] },

  // ------------------------------------------------------------ build tools
  { name: 'Parcel', category: 'build', signals: [
    g('parcelRequire', 95, 'window.parcelRequire is defined'),
  ] },

  // -------------------------------------------------------- more languages
  { name: 'Deno', category: 'language', signals: [
    { in: 'header', header: 'server', match: /deno\/?([\d.]+)?/i, confidence: 90, evidence: 'server header names Deno', versionFrom: true },
  ] },
  { name: 'Ruby', category: 'language', signals: [
    { in: 'header', header: 'server', match: /(Puma|WEBrick|Unicorn)\/?([\d.]+)?/i, confidence: 85, evidence: 'Ruby application server in the server header' },
  ] },

  // ---------------------------------------------------------- more hosting
  { name: 'Railway', category: 'hosting', signals: [
    { in: 'header', header: 'x-railway-request-id', match: /.+/, confidence: 98, evidence: 'x-railway-request-id header' },
  ] },
  { name: 'Fly.io', category: 'hosting', signals: [
    { in: 'header', header: 'fly-request-id', match: /.+/, confidence: 98, evidence: 'fly-request-id header' },
  ] },
  { name: 'AWS Amplify', category: 'hosting', signals: [
    { in: 'url', match: /amplifyapp\.com/i, confidence: 90, evidence: 'Served from an amplifyapp.com domain' },
  ] },
  { name: 'Azure Static Web Apps', category: 'hosting', signals: [
    { in: 'header', header: 'x-azure-ref', match: /.+/, confidence: 90, evidence: 'x-azure-ref header' },
    { in: 'url', match: /azurestaticapps\.net/i, confidence: 95, evidence: 'Served from azurestaticapps.net' },
  ] },

  // -------------------------------------------------------------- more CDN
  { name: 'jsDelivr', category: 'cdn', signals: [
    { in: 'assetUrl', match: 'cdn.jsdelivr.net', confidence: 95, evidence: 'Loads assets from jsDelivr' },
  ] },
  { name: 'unpkg', category: 'cdn', signals: [
    { in: 'assetUrl', match: 'unpkg.com', confidence: 95, evidence: 'Loads assets from unpkg' },
  ] },

  // -------------------------------------------------------- more analytics
  { name: 'Fathom', category: 'analytics', signals: [
    { in: 'assetUrl', match: /cdn\.usefathom\.com/i, confidence: 95, evidence: 'Loads Fathom' },
  ] },
  { name: 'Mixpanel', category: 'analytics', signals: [
    g('mixpanel', 90, 'window.mixpanel is defined'),
    { in: 'assetUrl', match: /cdn\.mxpnl\.com|mixpanel/i, confidence: 95, evidence: 'Loads Mixpanel' },
  ] },
  { name: 'PostHog', category: 'analytics', signals: [
    g('posthog', 90, 'window.posthog is defined'),
    { in: 'assetUrl', match: /posthog/i, confidence: 95, evidence: 'Loads PostHog' },
  ] },
  { name: 'Amplitude', category: 'analytics', signals: [
    g('amplitude', 90, 'window.amplitude is defined'),
    { in: 'assetUrl', match: /amplitude/i, confidence: 90, evidence: 'Loads Amplitude' },
  ] },
  { name: 'Segment', category: 'analytics', signals: [
    { in: 'assetUrl', match: /cdn\.segment\.(com|io)/i, confidence: 95, evidence: 'Loads Segment' },
  ] },
  { name: 'Heap', category: 'analytics', signals: [
    g('heap', 90, 'window.heap is defined'),
    { in: 'assetUrl', match: /cdn\d*\.heapanalytics\.com/i, confidence: 95, evidence: 'Loads Heap' },
  ] },

  // ------------------------------------------------------------- monitoring
  { name: 'LogRocket', category: 'monitoring', signals: [
    g('LogRocket', 95, 'window.LogRocket is defined'),
    { in: 'assetUrl', match: /cdn\.lr-|logrocket/i, confidence: 95, evidence: 'Loads LogRocket' },
  ] },
  { name: 'Bugsnag', category: 'monitoring', signals: [
    g('Bugsnag', 95, 'window.Bugsnag is defined'),
    { in: 'assetUrl', match: /bugsnag/i, confidence: 95, evidence: 'Loads Bugsnag' },
  ] },
  { name: 'Datadog', category: 'monitoring', signals: [
    g('DD_RUM', 95, 'window.DD_RUM is defined'),
    g('DD_LOGS', 95, 'window.DD_LOGS is defined'),
    { in: 'assetUrl', match: /datadoghq|datadog-rum/i, confidence: 95, evidence: 'Loads Datadog RUM' },
  ] },
  { name: 'New Relic', category: 'monitoring', signals: [
    g('NREUM', 95, 'window.NREUM is defined'),
    { in: 'assetUrl', match: /js-agent\.newrelic\.com/i, confidence: 95, evidence: 'Loads the New Relic browser agent' },
  ] },
  { name: 'Raygun', category: 'monitoring', signals: [
    g('rg4js', 95, 'window.rg4js is defined'),
    { in: 'assetUrl', match: /raygun/i, confidence: 90, evidence: 'Loads Raygun' },
  ] },

  // --------------------------------------------------------- authentication
  { name: 'Clerk', category: 'auth', signals: [
    g('Clerk', 95, 'window.Clerk is defined'),
    { in: 'request', match: /clerk\.(com|dev|accounts\.dev)|\.clerk\./i, confidence: 95, evidence: 'Loads the Clerk SDK' },
    { in: 'cookie', match: '__clerk_db_jwt', confidence: 95, evidence: 'Clerk session cookie' },
  ] },
  { name: 'Auth0', category: 'auth', signals: [
    { in: 'request', match: /cdn\.auth0\.com|\.auth0\.com/i, confidence: 95, evidence: 'Loads or calls Auth0' },
  ] },
  { name: 'Firebase Auth', category: 'auth', implies: ['Firebase'], signals: [
    { in: 'request', match: /identitytoolkit\.googleapis\.com|firebase-auth/i, confidence: 95, evidence: 'Calls the Firebase identity toolkit' },
  ] },
  { name: 'Supabase Auth', category: 'auth', implies: ['Supabase'], signals: [
    { in: 'cookie', match: /^sb-.*-auth-token$/, confidence: 95, evidence: 'Supabase auth cookie' },
  ] },
  { name: 'Okta', category: 'auth', signals: [
    g('OktaSignIn', 95, 'window.OktaSignIn is defined'),
    { in: 'request', match: /\.okta(preview)?\.com|okta-signin/i, confidence: 95, evidence: 'Loads or calls Okta' },
  ] },
  { name: 'Keycloak', category: 'auth', implies: ['Java'], signals: [
    { in: 'request', match: /\/auth\/realms\/|keycloak/i, confidence: 90, evidence: 'Talks to a Keycloak realm' },
  ] },
  { name: 'Stytch', category: 'auth', signals: [
    { in: 'request', match: /stytch\.com/i, confidence: 95, evidence: 'Loads the Stytch SDK' },
  ] },

  // ---------------------------------------------------------------- payment
  { name: 'Stripe', category: 'payment', signals: [
    g('Stripe', 90, 'window.Stripe is defined'),
    { in: 'assetUrl', match: 'js.stripe.com', confidence: 95, evidence: 'Loads Stripe.js' },
  ] },
  { name: 'Razorpay', category: 'payment', signals: [
    g('Razorpay', 95, 'window.Razorpay is defined'),
    { in: 'assetUrl', match: /checkout\.razorpay\.com/i, confidence: 95, evidence: 'Loads Razorpay Checkout' },
  ] },
  { name: 'PayPal', category: 'payment', signals: [
    g('paypal', 90, 'window.paypal is defined'),
    { in: 'assetUrl', match: /paypal\.com\/sdk\/js|paypalobjects\.com/i, confidence: 95, evidence: 'Loads the PayPal SDK' },
  ] },
  { name: 'Paddle', category: 'payment', signals: [
    g('Paddle', 95, 'window.Paddle is defined'),
    { in: 'assetUrl', match: /cdn\.paddle\.com|paddle\.js/i, confidence: 95, evidence: 'Loads Paddle' },
  ] },
  { name: 'Lemon Squeezy', category: 'payment', signals: [
    { in: 'assetUrl', match: /lemonsqueezy\.com/i, confidence: 95, evidence: 'Loads Lemon Squeezy' },
  ] },
  { name: 'Adyen', category: 'payment', signals: [
    g('AdyenCheckout', 95, 'window.AdyenCheckout is defined'),
    { in: 'assetUrl', match: /checkoutshopper-(live|test)\.adyen\.com/i, confidence: 95, evidence: 'Loads Adyen Checkout' },
  ] },
  { name: 'Braintree', category: 'payment', signals: [
    g('braintree', 90, 'window.braintree is defined'),
    { in: 'assetUrl', match: /js\.braintreegateway\.com/i, confidence: 95, evidence: 'Loads the Braintree SDK' },
  ] },

  // ------------------------------------------------------- database / BaaS
  { name: 'Appwrite', category: 'database', signals: [
    { in: 'request', match: /cloud\.appwrite\.io|appwrite/i, confidence: 90, evidence: 'Talks to Appwrite' },
  ] },
  { name: 'MongoDB Atlas', category: 'database', signals: [
    { in: 'request', match: /data\.mongodb-api\.com|realm\.mongodb\.com/i, confidence: 90, evidence: 'Calls a MongoDB Atlas endpoint' },
  ] },

  // ------------------------------------------------------------------- maps
  { name: 'Google Maps', category: 'maps', signals: [
    { in: 'request', match: /maps\.googleapis\.com|maps\.gstatic\.com/i, confidence: 95, evidence: 'Loads the Google Maps API' },
  ] },
  { name: 'Leaflet', category: 'maps', signals: [
    { in: 'assetUrl', match: /leaflet(\.min)?\.(js|css)/i, confidence: 95, evidence: 'Loads Leaflet' },
    { in: 'html', match: /class="[^"]*\bleaflet-container\b/, confidence: 95, evidence: 'leaflet-container element' },
  ] },
  { name: 'Mapbox', category: 'maps', signals: [
    g('mapboxgl', 95, 'window.mapboxgl is defined'),
    { in: 'request', match: /api\.mapbox\.com|mapbox-gl/i, confidence: 95, evidence: 'Loads Mapbox GL' },
  ] },
  { name: 'OpenLayers', category: 'maps', signals: [
    { in: 'assetUrl', match: /openlayers|\bol(\.min)?\.(js|css)/i, confidence: 90, evidence: 'Loads OpenLayers' },
    { in: 'html', match: /class="[^"]*\bol-viewport\b/, confidence: 95, evidence: 'ol-viewport element' },
  ] },

  // --------------------------------------------------------------------- AI
  { name: 'OpenAI', category: 'ai', signals: [
    { in: 'request', match: /api\.openai\.com/i, confidence: 95, evidence: 'Calls the OpenAI API from the browser' },
  ] },
  { name: 'Anthropic', category: 'ai', signals: [
    { in: 'request', match: /api\.anthropic\.com/i, confidence: 95, evidence: 'Calls the Anthropic API from the browser' },
  ] },
  { name: 'Vercel AI SDK', category: 'ai', signals: [
    { in: 'js', match: /useChat\(|useCompletion\(|ai\/react/, confidence: 65, evidence: 'Vercel AI SDK hooks in the bundle' },
  ] },

  // ------------------------------------------------------- more fonts/icons
  { name: 'Adobe Fonts', category: 'fonts', signals: [
    { in: 'assetUrl', match: /use\.typekit\.net|use\.edgefonts\.net/i, confidence: 95, evidence: 'Loads Adobe Fonts' },
  ] },
  { name: 'Lucide', category: 'fonts', signals: [
    { in: 'assetUrl', match: /lucide/i, confidence: 90, evidence: 'Loads Lucide icons' },
    { in: 'html', match: /class="[^"]*\blucide\b/, confidence: 85, evidence: 'lucide icon classes' },
  ] },
  { name: 'Material Icons', category: 'fonts', signals: [
    { in: 'assetUrl', match: /icon\?family=Material\+Icons|material-icons|material-symbols/i, confidence: 95, evidence: 'Loads Material Icons' },
    { in: 'html', match: /class="[^"]*\bmaterial-(icons|symbols)/, confidence: 90, evidence: 'material-icons classes' },
  ] },

  // ------------------------------------------- signals only the new inputs see
  //
  // Everything below needs something the crawler did not used to collect:
  // inline scripts, the body class list, form targets, embedded frames, the
  // web app manifest, a registered service worker, robots.txt, or DNS.

  { name: 'Progressive Web App', category: 'other', signals: [
    { in: 'manifest', match: /"(start_url|display)"/, confidence: 95, evidence: 'Serves a Web App Manifest' },
    { in: 'serviceWorker', match: /.+/, confidence: 90, evidence: 'Registers a service worker' },
  ] },
  { name: 'Workbox', category: 'library', signals: [
    { in: 'serviceWorker', match: /workbox|sw\.js/i, confidence: 70, evidence: 'Service worker looks like Workbox' },
    { in: 'inlineScript', match: /workbox\.(precaching|routing)/, confidence: 90, evidence: 'Workbox calls in an inline script' },
  ] },

  // Inline snippets. These are pasted into the page verbatim by the vendor's
  // own install instructions, which makes them unusually stable signatures.
  { name: 'Google Tag Manager', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'googletagmanager.com/gtm.js', confidence: 95, evidence: 'Loads gtm.js' },
    { in: 'inlineScript', match: /GTM-[A-Z0-9]{4,}/, confidence: 90, evidence: 'GTM container id in an inline script' },
    g('dataLayer', 60, 'window.dataLayer is defined'),
  ] },
  { name: 'Google Analytics', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'googletagmanager.com/gtag/js', confidence: 95, evidence: 'Loads gtag.js' },
    { in: 'inlineScript', match: /G-[A-Z0-9]{8,}|UA-\d{4,}-\d+/, confidence: 90, evidence: 'Measurement id in an inline script' },
    g('gtag', 85, 'window.gtag is defined'),
  ] },
  { name: 'Hotjar', category: 'analytics', signals: [
    { in: 'assetUrl', match: 'static.hotjar.com', confidence: 95, evidence: 'Loads Hotjar' },
    { in: 'inlineScript', match: /hjid\s*:\s*\d+/, confidence: 90, evidence: 'Hotjar site id in an inline script' },
  ] },
  { name: 'Intercom', category: 'other', signals: [
    { in: 'inlineScript', match: /window\.intercomSettings/, confidence: 95, evidence: 'Intercom settings in an inline script' },
    { in: 'request', match: /widget\.intercom\.io|api-iam\.intercom\.io/i, confidence: 95, evidence: 'Talks to Intercom' },
  ] },
  { name: 'Crisp', category: 'other', signals: [
    { in: 'inlineScript', match: /\$crisp|CRISP_WEBSITE_ID/, confidence: 95, evidence: 'Crisp configuration in an inline script' },
  ] },
  { name: 'Cal.com', category: 'other', signals: [
    { in: 'iframe', match: /cal\.com/i, confidence: 95, evidence: 'Embeds a Cal.com booking frame' },
    { in: 'inlineScript', match: /Cal\(["']init/, confidence: 90, evidence: 'Cal.com embed script' },
  ] },
  { name: 'Calendly', category: 'other', signals: [
    { in: 'iframe', match: /calendly\.com/i, confidence: 95, evidence: 'Embeds a Calendly frame' },
    { in: 'request', match: /assets\.calendly\.com/i, confidence: 90, evidence: 'Loads the Calendly widget' },
  ] },
  { name: 'YouTube', category: 'other', signals: [
    { in: 'iframe', match: /youtube(-nocookie)?\.com\/embed/i, confidence: 95, evidence: 'Embeds a YouTube player' },
  ] },
  { name: 'Vimeo', category: 'other', signals: [
    { in: 'iframe', match: /player\.vimeo\.com/i, confidence: 95, evidence: 'Embeds a Vimeo player' },
  ] },
  { name: 'Typeform', category: 'other', signals: [
    { in: 'iframe', match: /form\.typeform\.com/i, confidence: 95, evidence: 'Embeds a Typeform' },
  ] },
  { name: 'Mailchimp', category: 'other', signals: [
    { in: 'formAction', match: /list-manage\.com/i, confidence: 95, evidence: 'Signup form posts to Mailchimp' },
  ] },
  { name: 'HubSpot', category: 'other', signals: [
    { in: 'request', match: /js\.hs-scripts\.com|hsforms\.(net|com)/i, confidence: 95, evidence: 'Loads HubSpot' },
    { in: 'formAction', match: /hsforms\.com/i, confidence: 90, evidence: 'Form posts to HubSpot' },
  ] },
  { name: 'Klaviyo', category: 'other', signals: [
    { in: 'request', match: /static\.klaviyo\.com|a\.klaviyo\.com/i, confidence: 95, evidence: 'Loads Klaviyo' },
  ] },

  // Body classes. WordPress and its ecosystem stamp the page with what is
  // running, which survives even when the generator meta has been stripped.
  { name: 'WordPress', category: 'cms', implies: ['PHP'], signals: [
    { in: 'metaGenerator', match: /WordPress ([\d.]+)/i, confidence: 98, evidence: 'generator meta names WordPress', versionFrom: true },
    { in: 'assetUrl', match: '/wp-content/', confidence: 95, evidence: 'Loads assets from /wp-content/' },
    { in: 'assetUrl', match: '/wp-includes/', confidence: 95, evidence: 'Loads assets from /wp-includes/' },
    { in: 'bodyClass', match: /\bwp-(theme|singular|embed-responsive)\b/, confidence: 90, evidence: 'wp-* body classes' },
    { in: 'cookie', match: /^wordpress_/, confidence: 90, evidence: 'wordpress_* cookie' },
    { in: 'html', match: '/wp-json/', confidence: 80, evidence: 'Links to the WP REST API' },
    { in: 'robots', match: /\/wp-admin\/?/, confidence: 85, evidence: 'robots.txt names /wp-admin/' },
  ] },
  { name: 'Elementor', category: 'ui', implies: ['WordPress'], signals: [
    { in: 'bodyClass', match: /\belementor-page\b/, confidence: 95, evidence: 'elementor-page body class' },
    { in: 'assetUrl', match: /\/plugins\/elementor\//i, confidence: 95, evidence: 'Loads Elementor assets' },
  ] },
  { name: 'Divi', category: 'ui', implies: ['WordPress'], signals: [
    { in: 'bodyClass', match: /\bet_pb_/, confidence: 90, evidence: 'Divi builder body classes' },
    { in: 'assetUrl', match: /\/themes\/Divi\//i, confidence: 95, evidence: 'Loads the Divi theme' },
  ] },
  { name: 'Yoast SEO', category: 'other', implies: ['WordPress'], signals: [
    { in: 'html', match: /<!-- This site is optimized with the Yoast SEO plugin/i, confidence: 98, evidence: 'Yoast SEO comment block' },
  ] },

  // Meta tags beyond the generator.
  { name: 'Open Graph', category: 'other', signals: [
    { in: 'meta', match: /^og:(title|image|type)=/m, confidence: 90, evidence: 'Open Graph meta tags' },
  ] },
  { name: 'Vercel Analytics', category: 'analytics', implies: ['Vercel'], signals: [
    { in: 'request', match: /\/_vercel\/insights|vitals\.vercel-insights\.com/i, confidence: 95, evidence: 'Reports to Vercel Analytics' },
  ] },

  // DNS. The last resort, and sometimes the only one: a site behind a proxy
  // strips every header that would name its host, but the CNAME still points
  // straight at the platform.
  { name: 'Vercel', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /Vercel/i, confidence: 98, evidence: 'server: Vercel' },
    { in: 'header', header: 'x-vercel-id', match: /.+/, confidence: 98, evidence: 'x-vercel-id header' },
    { in: 'dns', match: /vercel-dns\.com|vercel-dns-\d/i, confidence: 95, evidence: 'DNS points at Vercel' },
  ] },
  { name: 'Netlify', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /Netlify/i, confidence: 98, evidence: 'server: Netlify' },
    { in: 'header', header: 'x-nf-request-id', match: /.+/, confidence: 98, evidence: 'x-nf-request-id header' },
    { in: 'dns', match: /netlify\.(com|app)/i, confidence: 95, evidence: 'DNS points at Netlify' },
  ] },
  { name: 'Cloudflare', category: 'cdn', signals: [
    { in: 'header', header: 'cf-ray', match: /.+/, confidence: 98, evidence: 'cf-ray header' },
    { in: 'header', header: 'server', match: /cloudflare/i, confidence: 95, evidence: 'server: cloudflare' },
    { in: 'dns', match: /NS .*\.ns\.cloudflare\.com/i, confidence: 90, evidence: 'Cloudflare nameservers' },
  ] },
  { name: 'GitHub Pages', category: 'hosting', signals: [
    { in: 'header', header: 'server', match: /GitHub\.com/i, confidence: 95, evidence: 'server: GitHub.com' },
    { in: 'dns', match: /github\.io/i, confidence: 90, evidence: 'DNS points at github.io' },
  ] },
  { name: 'Shopify', category: 'ecommerce', signals: [
    g('Shopify', 98, 'window.Shopify is defined'),
    { in: 'assetUrl', match: 'cdn.shopify.com', confidence: 95, evidence: 'Loads assets from cdn.shopify.com' },
    { in: 'header', header: 'x-shopid', match: /.+/, confidence: 98, evidence: 'x-shopid header' },
    { in: 'dns', match: /shops\.myshopify\.com|shopify\.com/i, confidence: 90, evidence: 'DNS points at Shopify' },
  ] },
  { name: 'Google Workspace', category: 'other', signals: [
    { in: 'dns', match: /MX .*(aspmx\.l\.google\.com|googlemail\.com)/i, confidence: 90, evidence: 'Google Workspace mail records' },
  ] },
  { name: 'Microsoft 365', category: 'other', signals: [
    { in: 'dns', match: /MX .*mail\.protection\.outlook\.com/i, confidence: 90, evidence: 'Microsoft 365 mail records' },
  ] },
];

/**
 * Rules are authored in category sections, and a technology can legitimately
 * appear in more than one — a later section adding signals the earlier one had
 * no input for, like WordPress gaining a `robots.txt` and a body-class signal
 * once the crawler started collecting them.
 *
 * Merging rather than letting the last definition win matters: `detect` keys
 * results by name, so without this the second WordPress entry would silently
 * replace the first and throw away every signal it held.
 */
function mergeByName(rules: Rule[]): Rule[] {
  const merged = new Map<string, Rule>();

  for (const rule of rules) {
    const existing = merged.get(rule.name);
    if (!existing) {
      merged.set(rule.name, { ...rule, signals: [...rule.signals], implies: rule.implies ?? [] });
      continue;
    }

    // Identical signals across sections are harmless but would show the user
    // the same sentence twice, so drop the repeats.
    const seen = new Set(existing.signals.map(signalKey));
    for (const signal of rule.signals) {
      if (!seen.has(signalKey(signal))) {
        existing.signals.push(signal);
        seen.add(signalKey(signal));
      }
    }
    existing.implies = [...new Set([...(existing.implies ?? []), ...(rule.implies ?? [])])];
  }

  return [...merged.values()];
}

function signalKey(s: Signal): string {
  return `${s.in}|${s.header ?? ''}|${String(s.match)}|${s.confidence}`;
}

export const RULES: Rule[] = mergeByName(RAW_RULES);
