/**
 * Generate the technology icon map from simple-icons.
 *
 * simple-icons ships 3400+ brands. Importing it into the client bundle would
 * ship all of them, so this pulls out only the icons for technologies the
 * detector can actually name, and writes them to a plain TS module.
 *
 * Run after adding a detector rule:  npm run icons
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as simpleIcons from 'simple-icons';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'src', 'lib', 'tech-icons.ts');

/**
 * Detector rule name → simple-icons slug.
 *
 * Most names match their slug once lowercased and stripped of punctuation, so
 * only the exceptions are listed. `null` means simple-icons has no logo for it
 * and the UI should fall back to a lettered tile — recorded explicitly so a
 * missing icon reads as a decision rather than an oversight.
 */
const SLUG_OVERRIDES = {
  'Next.js': 'nextdotjs',
  'Nuxt': 'nuxt',
  'Vue.js': 'vuedotjs',
  'Three.js': 'threedotjs',
  'Anime.js': 'animedotjs',
  'Alpine.js': 'alpinedotjs',
  'Barba.js': 'barba',
  'Node.js': 'nodedotjs',
  'Socket.IO': 'socketdotio',
  'Backbone': 'backbonedotjs',
  'Ember': 'emberdotjs',
  'D3.js': 'd3dotjs',
  'Chart.js': 'chartdotjs',
  'Ruby on Rails': 'rubyonrails',
  'ASP.NET': 'dotnet',
  'Microsoft IIS': null,
  'Apache': 'apache',
  'Apache Tomcat': 'apachetomcat',
  // simple-icons removed the AWS marks over trademark policy.
  'Amazon CloudFront': null,
  'Amazon S3': null,
  'bunny.net': 'bunnydotnet',
  'Google Analytics': 'googleanalytics',
  'Google Tag Manager': 'googletagmanager',
  'Google Fonts': 'googlefonts',
  'Meta Pixel': 'meta',
  'Font Awesome': 'fontawesome',
  'Material UI': 'mui',
  'styled-components': 'styledcomponents',
  'Tailwind CSS': 'tailwindcss',
  'Animate.css': 'css',
  'GitHub Pages': 'github',
  'Firebase Hosting': 'firebase',
  'Cloudflare Pages': 'cloudflarepages',
  'Cloudflare Workers': 'cloudflareworkers',
  'Framer Motion': 'framer',
  'Motion One': 'framer',
  'WOW.js': null,
  'AOS': null,
  'Lenis': null,
  'Locomotive Scroll': null,
  'ScrollReveal': null,
  'ScrollMagic': null,
  'Slick Carousel': null,
  'Owl Carousel': null,
  'particles.js': null,
  'Vanta.js': null,
  'Splide': null,
  'Swiper': 'swiper',
  'Spline': null,
  'Rive': 'rive',
  'Lottie': 'lottiefiles',
  'GSAP': 'greensock',
  'Gatsby': 'gatsby',
  'Java': null, // simple-icons dropped the Oracle-owned Java mark
  'Python': 'python',
  'PHP': 'php',
  'Uvicorn': null,
  'Gunicorn': 'gunicorn',
  'Flask': 'flask',
  'Django': 'django',
  'Laravel': 'laravel',
  'Express': 'express',
  'Strapi': 'strapi',
  'Ghost': 'ghost',
  'Sanity': 'sanity',
  'Contentful': 'contentful',
  'Prismic': 'prismic',
  'Framer': 'framer',
  'Webflow': 'webflow',
  'Squarespace': 'squarespace',
  'Wix': 'wix',
  'WooCommerce': 'woocommerce',
  'Magento': null,
  'Shopify': 'shopify',
  'WordPress': 'wordpress',
  'Drupal': 'drupal',
  'Joomla': 'joomla',
  'jQuery': 'jquery',
  'htmx': 'htmx',
  'GraphQL': 'graphql',
  'webpack': 'webpack',
  'Vite': 'vite',
  'Supabase': 'supabase',
  'Firebase': 'firebase',
  'Stripe': 'stripe',
  'Sentry': 'sentry',
  'Hotjar': 'hotjar',
  'Plausible': 'plausibleanalytics',
  'Astro': 'astro',
  'Svelte': 'svelte',
  'Remix': 'remix',
  'Angular': 'angular',
  'React': 'react',
  'Bootstrap': 'bootstrap',
  'Chakra UI': 'chakraui',
  'Hugo': 'hugo',
  'Jekyll': 'jekyll',
  'Eleventy': 'eleventy',
  'nginx': 'nginx',
  'LiteSpeed': null,
  'Caddy': 'caddy',
  'Vercel': 'vercel',
  'Netlify': 'netlify',
  'Render': 'render',
  'Cloudflare': 'cloudflare',
  'Fastly': 'fastly',
  'Akamai': 'akamai',

  // Added with the second rule expansion.
  'SvelteKit': 'svelte',
  'Qwik': 'qwik',
  'SolidJS': 'solid',
  'Preact': 'preact',
  'Lit': 'lit',
  'Stimulus': 'stimulus',
  'Ember': 'emberdotjs',
  'Backbone': 'backbonedotjs',
  'Inferno': null,
  'Marko': 'marko',
  'Fresh': 'fresh',
  'AdonisJS': 'adonisjs',
  'Symfony': 'symfony',
  'CodeIgniter': 'codeigniter',
  'CakePHP': 'cakephp',
  'Spring Boot': 'springboot',
  'Phoenix': 'phoenixframework',
  'TYPO3': 'typo3',
  'Craft CMS': 'craftcms',
  'Payload CMS': 'payloadcms',
  'Directus': 'directus',
  'Hygraph': null,
  'DatoCMS': 'datocms',
  'Storyblok': 'storyblok',
  'ButterCMS': null,
  'BigCommerce': 'bigcommerce',
  'OpenCart': null,
  'PrestaShop': 'prestashop',
  'Ecwid': null,
  'Snipcart': null,
  'Saleor': null,
  'Ant Design': 'antdesign',
  'Mantine': 'mantine',
  'Radix UI': 'radixui',
  'shadcn/ui': 'shadcnui',
  'DaisyUI': 'daisyui',
  'Flowbite': null,
  'Semantic UI': 'semanticui',
  'Bulma': 'bulma',
  'Foundation': null,
  'Vuetify': 'vuetify',
  'PrimeReact': 'primereact',
  'PrimeVue': 'primevue',
  'Quasar': 'quasar',
  'Babylon.js': 'babylondotjs',
  'PixiJS': null,
  'Matter.js': 'matterdotjs',
  'Parcel': null,
  'Deno': 'deno',
  'Ruby': 'ruby',
  'Railway': 'railway',
  'Fly.io': 'flydotio',
  'AWS Amplify': null,
  'Azure Static Web Apps': null,
  'jsDelivr': 'jsdelivr',
  'unpkg': 'unpkg',
  'Fathom': 'fathom',
  'Mixpanel': 'mixpanel',
  'PostHog': 'posthog',
  'Amplitude': null,
  'Segment': null,
  'Heap': null,
  'LogRocket': null,
  'Bugsnag': null,
  'Datadog': 'datadog',
  'New Relic': 'newrelic',
  'Raygun': null,
  'Clerk': 'clerk',
  'Auth0': 'auth0',
  'Firebase Auth': 'firebase',
  'Supabase Auth': 'supabase',
  'Okta': 'okta',
  'Keycloak': 'keycloak',
  'Stytch': null,
  'Razorpay': 'razorpay',
  'PayPal': 'paypal',
  'Paddle': 'paddle',
  'Lemon Squeezy': 'lemonsqueezy',
  'Adyen': 'adyen',
  'Braintree': 'braintree',
  'Appwrite': 'appwrite',
  'MongoDB Atlas': 'mongodb',
  'Google Maps': 'googlemaps',
  'Leaflet': 'leaflet',
  'Mapbox': 'mapbox',
  'OpenLayers': 'openlayers',
  'OpenAI': null,
  'Anthropic': 'anthropic',
  'Vercel AI SDK': 'vercel',
  'Adobe Fonts': null,
  'Material Icons': 'materialdesign',
};

/** Fallback: derive a slug the way simple-icons does. */
function guessSlug(name) {
  return name
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/\./g, 'dot')
    .replace(/[^a-z0-9]/g, '');
}

const bySlug = new Map();
for (const icon of Object.values(simpleIcons)) {
  if (icon && typeof icon === 'object' && 'slug' in icon) bySlug.set(icon.slug, icon);
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('usage: generate-tech-icons.mjs <name> [<name> ...]');
  process.exit(1);
}

const entries = [];
const missing = [];

for (const name of [...new Set(names)].sort()) {
  const override = Object.prototype.hasOwnProperty.call(SLUG_OVERRIDES, name)
    ? SLUG_OVERRIDES[name]
    : undefined;

  if (override === null) {
    missing.push(`${name} (no logo in simple-icons)`);
    continue;
  }

  const icon = bySlug.get(override ?? guessSlug(name));
  if (!icon) {
    missing.push(`${name} (tried "${override ?? guessSlug(name)}")`);
    continue;
  }

  entries.push({ name, hex: icon.hex, path: icon.path });
}

const body = `/**
 * Brand marks for detected technologies.
 *
 * GENERATED — do not edit. Run \`npm run icons\` to rebuild.
 *
 * Only the icons the detector can actually name are included; importing
 * simple-icons directly would ship 3400+ unused paths to the browser. Anything
 * without a mark falls back to a lettered tile in <TechIcon>.
 */

export interface TechIcon {
  /** Brand colour, without the leading #. */
  hex: string;
  /** Single SVG path, drawn in a 24x24 viewBox. */
  path: string;
}

export const TECH_ICONS: Record<string, TechIcon> = {
${entries.map((e) => `  ${JSON.stringify(e.name)}: { hex: ${JSON.stringify(e.hex)}, path: ${JSON.stringify(e.path)} },`).join('\n')}
};
`;

writeFileSync(OUT, body);
console.log(`wrote ${entries.length} icons to src/lib/tech-icons.ts`);
if (missing.length) {
  console.log(`\n${missing.length} without a mark (lettered tile instead):`);
  for (const m of missing) console.log(`  ${m}`);
}
