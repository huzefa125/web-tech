/**
 * Technology detection — module 2.
 *
 * Driven entirely against fixture inputs. The rules must be testable without a
 * browser or a live site: a test asserting "nike.com uses React" starts
 * failing the day nike.com redesigns, which says nothing about our code.
 */

import { describe, expect, it } from 'vitest';

import { detect, type DetectionInput } from '../src/services/detectors/index.js';

function input(over: Partial<DetectionInput> = {}): DetectionInput {
  return {
    html: '<!doctype html><html><head></head><body></body></html>',
    headers: {},
    assetUrls: [],
    requestUrls: [],
    globals: [],
    cookies: [],
    css: '',
    js: '',
    finalUrl: 'https://example.com/',
    ...over,
  };
}

const names = (input: DetectionInput): string[] => detect(input).map((d) => d.name);
const find = (i: DetectionInput, name: string) => detect(i).find((d) => d.name === name);

describe('framework detection', () => {
  it('detects Next.js from its data global', () => {
    const result = find(input({ globals: ['__NEXT_DATA__'] }), 'Next.js');
    expect(result?.confidence).toBe(98);
    expect(result?.evidence).toContain('window.__NEXT_DATA__ is present');
  });

  it('detects Next.js from its bundle path', () => {
    expect(names(input({ assetUrls: ['https://x.com/_next/static/chunks/main.js'] }))).toContain(
      'Next.js',
    );
  });

  it('infers React and Node.js from Next.js even with no direct evidence', () => {
    // A Next.js page can be unmistakable without ever mentioning React.
    const found = names(input({ globals: ['__NEXT_DATA__'] }));
    expect(found).toContain('React');
    expect(found).toContain('Node.js');

    const react = find(input({ globals: ['__NEXT_DATA__'] }), 'React');
    expect(react?.evidence).toContain('Implied by Next.js');
  });

  it('prefers direct evidence over inference', () => {
    const i = input({ globals: ['__NEXT_DATA__', 'React'] });
    const react = find(i, 'React');
    expect(react?.confidence).toBe(90); // the direct signal, not the implied 70
    expect(react?.evidence).toContain('window.React is defined');
  });

  it('extracts the Angular version from ng-version', () => {
    const result = find(input({ html: '<app-root ng-version="17.3.1"></app-root>' }), 'Angular');
    expect(result?.version).toBe('17.3.1');
    expect(result?.confidence).toBe(98);
  });

  it('detects Nuxt and infers Vue', () => {
    const found = names(input({ globals: ['__NUXT__'] }));
    expect(found).toEqual(expect.arrayContaining(['Nuxt', 'Vue.js']));
  });

  it('detects SvelteKit from its immutable asset path', () => {
    expect(names(input({ assetUrls: ['https://x.com/_app/immutable/entry/start.js'] }))).toContain(
      'Svelte',
    );
  });

  it('detects Astro from the generator meta tag with a version', () => {
    const result = find(
      input({ html: '<head><meta name="generator" content="Astro v4.5.2"></head>' }),
      'Astro',
    );
    expect(result?.version).toBe('4.5.2');
  });

  it('detects Astro from its build output path alone', () => {
    // A mostly-static Astro site ships no islands, no generator meta and no
    // scoped styles — the /_astro/ bundle path is the only thing left, and it
    // is exactly what antigravity.google serves.
    expect(
      names(
        input({
          assetUrls: [
            'https://antigravity.google/_astro/Header.astro_astro_type_script_index_0_lang.KVEvS_RS.js',
          ],
        }),
      ),
    ).toContain('Astro');
  });

  it('detects an Astro scoped class that is not first in the class list', () => {
    expect(names(input({ html: '<div class="wrapper flex astro-j7pv25f6">' }))).toContain('Astro');
  });

  it('detects Gatsby from its root element', () => {
    const found = names(input({ html: '<div id="___gatsby"></div>' }));
    expect(found).toEqual(expect.arrayContaining(['Gatsby', 'React']));
  });

  it('detects Hugo and Jekyll from the generator meta', () => {
    expect(names(input({ html: '<meta name="generator" content="Hugo 0.121.1">' }))).toContain('Hugo');
    expect(names(input({ html: '<meta name="generator" content="Jekyll v4.3.2">' }))).toContain(
      'Jekyll',
    );
  });
});

describe('CMS and ecommerce detection', () => {
  it('detects WordPress and its version from the generator meta', () => {
    const result = find(
      input({ html: '<head><meta name="generator" content="WordPress 6.4.3"></head>' }),
      'WordPress',
    );
    expect(result?.version).toBe('6.4.3');
    expect(result?.confidence).toBe(98);
  });

  it('infers PHP from WordPress', () => {
    expect(names(input({ assetUrls: ['https://x.com/wp-content/themes/x/style.css'] }))).toContain(
      'PHP',
    );
  });

  it('detects Shopify from the x-shopid header', () => {
    expect(names(input({ headers: { 'x-shopid': '12345' } }))).toContain('Shopify');
  });

  it('chains WooCommerce to WordPress to PHP', () => {
    const found = names(input({ assetUrls: ['https://x.com/plugins/woocommerce/assets/x.js'] }));
    expect(found).toEqual(expect.arrayContaining(['WooCommerce', 'WordPress', 'PHP']));
  });
});

describe('UI library detection', () => {
  it('detects Tailwind from its custom properties, not from class names alone', () => {
    const strong = find(input({ css: ':root{--tw-ring-offset-shadow:0 0 #0000}' }), 'Tailwind CSS');
    expect(strong?.confidence).toBe(95);

    // Utility-looking class names are a guess: plenty of hand-written CSS uses
    // the same words. Detected, but flagged as weak.
    const weak = find(
      input({ html: '<div class="flex items-center gap-4 justify-between">' }),
      'Tailwind CSS',
    );
    expect(weak?.confidence).toBe(55);
  });

  it('detects Material UI from generated class names', () => {
    expect(names(input({ html: '<button class="MuiButton-root MuiButton-text">' }))).toContain(
      'Material UI',
    );
  });

  it('detects styled-components', () => {
    expect(names(input({ html: '<style data-styled="active"></style>' }))).toContain(
      'styled-components',
    );
  });
});

describe('server, hosting and CDN detection', () => {
  it('detects nginx with a version from the server header', () => {
    const result = find(input({ headers: { server: 'nginx/1.24.0' } }), 'nginx');
    expect(result?.version).toBe('1.24.0');
  });

  it('detects Cloudflare from cf-ray', () => {
    const result = find(input({ headers: { 'cf-ray': '8a1b2c3d4e5f' } }), 'Cloudflare');
    expect(result?.category).toBe('cdn');
    expect(result?.confidence).toBe(98);
  });

  it('detects Vercel as hosting, separately from any CDN', () => {
    const result = find(input({ headers: { 'x-vercel-id': 'bom1::abc' } }), 'Vercel');
    expect(result?.category).toBe('hosting');
  });

  it('detects CloudFront from x-amz-cf-id', () => {
    expect(names(input({ headers: { 'x-amz-cf-id': 'abc123' } }))).toContain('Amazon CloudFront');
  });

  it('separates Express from the language it runs on', () => {
    const found = detect(input({ headers: { 'x-powered-by': 'Express' } }));
    expect(found.find((d) => d.name === 'Express')?.category).toBe('server');
    expect(found.find((d) => d.name === 'Node.js')?.category).toBe('language');
  });

  it('extracts a PHP version from x-powered-by', () => {
    const result = find(input({ headers: { 'x-powered-by': 'PHP/8.2.10' } }), 'PHP');
    expect(result?.version).toBe('8.2.10');
  });
});

describe('analytics and fonts', () => {
  it('detects Google Analytics from the gtag script', () => {
    expect(
      names(input({ assetUrls: ['https://www.googletagmanager.com/gtag/js?id=G-X'] })),
    ).toContain('Google Analytics');
  });

  it('detects Google Fonts', () => {
    expect(names(input({ assetUrls: ['https://fonts.googleapis.com/css2?family=Inter'] }))).toContain(
      'Google Fonts',
    );
  });

  it('detects Stripe', () => {
    expect(names(input({ assetUrls: ['https://js.stripe.com/v3/'] }))).toContain('Stripe');
  });
});

describe('animation and 3D detection', () => {
  it('detects GSAP from its global', () => {
    const result = find(input({ globals: ['gsap'] }), 'GSAP');
    expect(result?.category).toBe('animation');
    expect(result?.confidence).toBe(95);
  });

  it('detects GSAP from a bundle URL when no global survives', () => {
    expect(names(input({ assetUrls: ['https://cdn.x.com/gsap/3.12/ScrollTrigger.min.js'] }))).toContain(
      'GSAP',
    );
  });

  it('detects Framer Motion inside a bundled chunk', () => {
    // Nothing lands on window, so the only evidence is a string literal the
    // minifier cannot rename.
    expect(names(input({ js: 'const x=useMotionValue(0);AnimatePresence' }))).toContain(
      'Framer Motion',
    );
  });

  it('detects Three.js and infers it from Vanta', () => {
    expect(names(input({ globals: ['THREE'] }))).toContain('Three.js');

    const viaVanta = names(input({ globals: ['VANTA'] }));
    expect(viaVanta).toEqual(expect.arrayContaining(['Vanta.js', 'Three.js']));
  });

  it('detects Lottie from the player element', () => {
    expect(names(input({ html: '<lottie-player src="a.json"></lottie-player>' }))).toContain(
      'Lottie',
    );
  });

  it('detects AOS from its markup attributes', () => {
    expect(names(input({ html: '<div data-aos="fade-up">hi</div>' }))).toContain('AOS');
  });

  it('detects Swiper from its markup', () => {
    expect(names(input({ html: '<div class="swiper-container"><div class="swiper-slide">' }))).toContain(
      'Swiper',
    );
  });

  it('detects Locomotive Scroll and Lenis', () => {
    expect(names(input({ html: '<main data-scroll-container>' }))).toContain('Locomotive Scroll');
    expect(names(input({ globals: ['Lenis'] }))).toContain('Lenis');
  });

  it('detects Animate.css from its class prefix', () => {
    expect(names(input({ html: '<div class="animate__animated animate__fadeIn">' }))).toContain(
      'Animate.css',
    );
  });

  it('detects Spline from its viewer element', () => {
    expect(names(input({ html: '<spline-viewer url="x.splinecode">' }))).toContain('Spline');
  });

  it('pulls jQuery in behind a jQuery-only carousel', () => {
    const found = names(input({ html: '<div class="slick-slider"><div class="slick-track">' }));
    expect(found).toEqual(expect.arrayContaining(['Slick Carousel', 'jQuery']));
  });
});

describe('backend detection from cookies', () => {
  it('detects PHP from PHPSESSID even when the headers say nothing', () => {
    // A CDN in front of the origin strips x-powered-by, but the session cookie
    // still has to reach the browser.
    const result = find(input({ cookies: ['PHPSESSID'] }), 'PHP');
    expect(result?.confidence).toBe(92);
  });

  it('detects PHP from a .php URL', () => {
    expect(names(input({ finalUrl: 'https://x.com/index.php?id=2' }))).toContain('PHP');
  });

  it('detects Java from JSESSIONID', () => {
    const result = find(input({ cookies: ['JSESSIONID'] }), 'Java');
    expect(result?.category).toBe('language');
  });

  it('detects ASP.NET from its session cookie and from the URL', () => {
    expect(names(input({ cookies: ['ASP.NET_SessionId'] }))).toContain('ASP.NET');
    expect(names(input({ finalUrl: 'https://x.com/default.aspx' }))).toContain('ASP.NET');
  });

  it('detects Express from connect.sid', () => {
    const found = names(input({ cookies: ['connect.sid'] }));
    expect(found).toEqual(expect.arrayContaining(['Express', 'Node.js']));
  });

  it('detects Django and Laravel from their cookies', () => {
    expect(names(input({ cookies: ['csrftoken'] }))).toContain('Django');
    expect(names(input({ cookies: ['laravel_session'] }))).toEqual(
      expect.arrayContaining(['Laravel', 'PHP']),
    );
  });

  it('detects Rails from its session cookie pattern', () => {
    expect(names(input({ cookies: ['_myapp_session'] }))).toContain('Ruby on Rails');
  });

  it('matches cookie names whole, not as substrings', () => {
    // `_ga_session_id` must not read as a Rails session, and a cookie merely
    // containing "csrftoken" must not read as Django.
    expect(names(input({ cookies: ['_ga_session_id'] }))).not.toContain('Ruby on Rails');
    expect(names(input({ cookies: ['my_csrftoken_thing'] }))).not.toContain('Django');
  });

  it('detects Python application servers', () => {
    expect(names(input({ headers: { server: 'gunicorn/21.2.0' } }))).toEqual(
      expect.arrayContaining(['Gunicorn', 'Python']),
    );
    expect(names(input({ headers: { server: 'uvicorn' } }))).toContain('Uvicorn');
  });

  it('detects IIS and Tomcat', () => {
    const iis = find(input({ headers: { server: 'Microsoft-IIS/10.0' } }), 'Microsoft IIS');
    expect(iis?.version).toBe('10.0');
    expect(names(input({ headers: { server: 'Apache-Coyote/1.1 Tomcat/9.0.71' } }))).toEqual(
      expect.arrayContaining(['Apache Tomcat', 'Java']),
    );
  });

  it('detects headless CMS and BaaS from the endpoints a page calls', () => {
    expect(names(input({ requestUrls: ['https://cdn.sanity.io/images/x/y.jpg'] }))).toContain('Sanity');
    expect(names(input({ requestUrls: ['https://images.ctfassets.net/x/y.png'] }))).toContain(
      'Contentful',
    );
    expect(names(input({ requestUrls: ['https://abc.supabase.co/rest/v1/x'] }))).toContain('Supabase');
  });
});

describe('the second rule expansion', () => {
  it('detects the newer client frameworks from their own markers', () => {
    expect(names(input({ html: '<div q:container="paused" q:base="/build/">' }))).toContain('Qwik');
    expect(names(input({ html: '<body data-sveltekit-preload-data="hover">' }))).toEqual(
      expect.arrayContaining(['SvelteKit', 'Svelte']),
    );
    expect(names(input({ globals: ['__PREACT_DEVTOOLS__'] }))).toContain('Preact');
    expect(names(input({ globals: ['litElementVersions'] }))).toContain('Lit');
    expect(names(input({ globals: ['_$HY'] }))).toContain('SolidJS');
    expect(names(input({ assetUrls: ['https://x.com/_frsh/js/start.js'] }))).toEqual(
      expect.arrayContaining(['Fresh', 'Deno']),
    );
  });

  it('detects server frameworks from their session cookies', () => {
    expect(names(input({ cookies: ['ci_session'] }))).toEqual(
      expect.arrayContaining(['CodeIgniter', 'PHP']),
    );
    expect(names(input({ cookies: ['CAKEPHP'] }))).toContain('CakePHP');
    expect(names(input({ cookies: ['adonis-session'] }))).toEqual(
      expect.arrayContaining(['AdonisJS', 'Node.js']),
    );
    expect(names(input({ headers: { 'x-application-context': 'app:prod' } }))).toEqual(
      expect.arrayContaining(['Spring Boot', 'Java']),
    );
  });

  it('detects headless CMS from the asset domains they serve from', () => {
    expect(names(input({ requestUrls: ['https://media.graphassets.com/x'] }))).toContain('Hygraph');
    expect(names(input({ requestUrls: ['https://www.datocms-assets.com/x.png'] }))).toContain(
      'DatoCMS',
    );
    expect(names(input({ requestUrls: ['https://a.storyblok.com/f/1/x.jpg'] }))).toContain(
      'Storyblok',
    );
    expect(names(input({ cookies: ['CraftSessionId'] }))).toEqual(
      expect.arrayContaining(['Craft CMS', 'PHP']),
    );
  });

  it('detects the UI kits the screenshot showed', () => {
    // Radix leaves data attributes on every primitive it renders.
    expect(names(input({ html: '<div data-radix-popper-content-wrapper>' }))).toContain('Radix UI');
    // shadcn is copy-pasted source, so it is inferred from what it sits on.
    const shadcn = detect(input({ html: '<button data-slot="button">Go</button>' }));
    expect(shadcn.map((d) => d.name)).toEqual(
      expect.arrayContaining(['shadcn/ui', 'Radix UI', 'Tailwind CSS']),
    );
    expect(names(input({ html: '<div class="ant-btn ant-btn-primary">' }))).toContain('Ant Design');
    expect(names(input({ html: '<div class="mantine-Button-root">' }))).toContain('Mantine');
    expect(names(input({ html: '<div class="v-application">' }))).toEqual(
      expect.arrayContaining(['Vuetify', 'Vue.js']),
    );
  });

  it('detects auth providers', () => {
    expect(names(input({ globals: ['Clerk'] }))).toContain('Clerk');
    expect(names(input({ requestUrls: ['https://cdn.auth0.com/js/auth0.min.js'] }))).toContain(
      'Auth0',
    );
    expect(names(input({ requestUrls: ['https://x.com/auth/realms/master/x.js'] }))).toEqual(
      expect.arrayContaining(['Keycloak', 'Java']),
    );
  });

  it('detects payment providers', () => {
    expect(names(input({ globals: ['Razorpay'] }))).toContain('Razorpay');
    expect(names(input({ assetUrls: ['https://www.paypal.com/sdk/js?client-id=x'] }))).toContain(
      'PayPal',
    );
    expect(names(input({ globals: ['AdyenCheckout'] }))).toContain('Adyen');

    // Stripe moved out of "other" once payments became a category of its own.
    expect(find(input({ globals: ['Stripe'] }), 'Stripe')?.category).toBe('payment');
  });

  it('detects monitoring separately from analytics', () => {
    expect(find(input({ globals: ['LogRocket'] }), 'LogRocket')?.category).toBe('monitoring');
    expect(find(input({ globals: ['NREUM'] }), 'New Relic')?.category).toBe('monitoring');
    expect(find(input({ globals: ['DD_RUM'] }), 'Datadog')?.category).toBe('monitoring');
    // Sentry moved with them.
    expect(find(input({ globals: ['Sentry'] }), 'Sentry')?.category).toBe('monitoring');
    // …while product analytics stayed put.
    expect(find(input({ globals: ['posthog'] }), 'PostHog')?.category).toBe('analytics');
  });

  it('detects maps', () => {
    expect(names(input({ requestUrls: ['https://maps.googleapis.com/maps/api/js'] }))).toContain(
      'Google Maps',
    );
    expect(names(input({ html: '<div class="leaflet-container">' }))).toContain('Leaflet');
    expect(names(input({ globals: ['mapboxgl'] }))).toContain('Mapbox');
  });

  it('detects browser-side AI calls', () => {
    expect(names(input({ requestUrls: ['https://api.anthropic.com/v1/messages'] }))).toContain(
      'Anthropic',
    );
    expect(names(input({ requestUrls: ['https://api.openai.com/v1/chat'] }))).toContain('OpenAI');
  });

  it('puts build tools in their own category', () => {
    expect(find(input({ globals: ['__webpack_require__'] }), 'webpack')?.category).toBe('build');
    expect(find(input({ globals: ['parcelRequire'] }), 'Parcel')?.category).toBe('build');
  });

  it('detects hosting from platform request-id headers', () => {
    expect(names(input({ headers: { 'x-railway-request-id': 'abc' } }))).toContain('Railway');
    expect(names(input({ headers: { 'fly-request-id': 'abc' } }))).toContain('Fly.io');
  });

  it('detects the public package CDNs', () => {
    expect(names(input({ assetUrls: ['https://cdn.jsdelivr.net/npm/x@1/x.js'] }))).toContain(
      'jsDelivr',
    );
    expect(names(input({ assetUrls: ['https://unpkg.com/x@1/x.js'] }))).toContain('unpkg');
  });
});

describe('assetUrl and request are different channels', () => {
  // These two lists come from different places in the crawler. `assetUrls`
  // holds only the stylesheets and scripts whose bodies were stored;
  // `requestUrls` holds every URL the page touched. A service reached over
  // fetch appears only in the second, so a rule keyed on the first can never
  // fire in production — which is exactly what happened, silently, while the
  // fixtures put API hosts in `assetUrls` and the tests stayed green.

  it('finds a service integration in requestUrls, not in assetUrls', () => {
    const url = 'https://abc.supabase.co/rest/v1/posts';
    expect(names(input({ requestUrls: [url] }))).toContain('Supabase');
    expect(names(input({ assetUrls: [url] }))).not.toContain('Supabase');
  });

  it('keeps bundle-path rules on assetUrls', () => {
    // These really are stylesheets and scripts, and stay where they are.
    expect(names(input({ assetUrls: ['https://x.com/_next/static/a.js'] }))).toContain('Next.js');
    expect(names(input({ assetUrls: ['https://x.com/_astro/a.js'] }))).toContain('Astro');
  });

  it.each([
    ['https://api.openai.com/v1/chat', 'OpenAI'],
    ['https://api.anthropic.com/v1/messages', 'Anthropic'],
    ['https://maps.googleapis.com/maps/api/js', 'Google Maps'],
    ['https://api.mapbox.com/styles/v1', 'Mapbox'],
    ['https://identitytoolkit.googleapis.com/v1/accounts', 'Firebase Auth'],
    ['https://data.mongodb-api.com/app/x/endpoint', 'MongoDB Atlas'],
    ['https://cdn.sanity.io/images/x/y.jpg', 'Sanity'],
    ['https://x.auth0.com/authorize', 'Auth0'],
  ])('detects %s as %s from a request', (url, expected) => {
    expect(names(input({ requestUrls: [url] }))).toContain(expected);
  });
});

describe('signals that need the document pulled apart', () => {
  it('reads inline scripts separately from the surrounding markup', () => {
    // The vendor's own install snippet is pasted verbatim into thousands of
    // sites, which makes it an unusually stable signature.
    expect(
      names(input({ html: '<html><body><script>window.dataLayer=[];GTM-ABCD1234</script></body></html>' })),
    ).toContain('Google Tag Manager');

    expect(
      names(input({ html: '<script>window.intercomSettings={app_id:"x"}</script>' })),
    ).toContain('Intercom');
  });

  it('does not mistake page text for an inline script', () => {
    // The same characters sitting in visible copy must not fire the rule.
    expect(names(input({ html: '<body><p>window.intercomSettings</p></body>' }))).not.toContain(
      'Intercom',
    );
  });

  it('reads the body class list', () => {
    const found = names(input({ html: '<body class="home page elementor-page wp-singular">' }));
    expect(found).toEqual(expect.arrayContaining(['Elementor', 'WordPress', 'PHP']));
  });

  it('reads form targets', () => {
    expect(
      names(input({ html: '<form action="https://x.us1.list-manage.com/subscribe/post">' })),
    ).toContain('Mailchimp');
  });

  it('reads embedded frames', () => {
    expect(
      names(input({ html: '<iframe src="https://www.youtube.com/embed/abc"></iframe>' })),
    ).toContain('YouTube');
    expect(names(input({ html: '<iframe src="https://cal.com/x"></iframe>' }))).toContain('Cal.com');
  });

  it('reads meta tags beyond the generator', () => {
    expect(
      names(input({ html: '<meta property="og:title" content="Hi"><meta property="og:image" content="x">' })),
    ).toContain('Open Graph');
  });

  it('reads the manifest and the service worker', () => {
    expect(
      names(input({ manifest: '{"start_url":"/","display":"standalone"}' })),
    ).toContain('Progressive Web App');
    expect(names(input({ serviceWorkers: ['https://x.com/sw.js'] }))).toContain(
      'Progressive Web App',
    );
  });

  it('reads robots.txt', () => {
    const found = names(input({ robots: 'User-agent: *\nDisallow: /wp-admin/\n' }));
    expect(found).toEqual(expect.arrayContaining(['WordPress', 'PHP']));
  });

  it('reads DNS records when the headers give nothing away', () => {
    // A site behind a proxy strips the headers that would name its host, but
    // the CNAME still points straight at the platform.
    expect(names(input({ dns: ['CNAME cname.vercel-dns.com'] }))).toContain('Vercel');
    expect(names(input({ dns: ['NS kate.ns.cloudflare.com'] }))).toContain('Cloudflare');
    expect(names(input({ dns: ['MX aspmx.l.google.com'] }))).toContain('Google Workspace');
    expect(names(input({ dns: ['MX x-com.mail.protection.outlook.com'] }))).toContain(
      'Microsoft 365',
    );
  });

  it('treats the optional inputs as absent rather than empty', () => {
    // Old scans predate these fields entirely. A rule keyed on one must simply
    // not fire, never throw.
    expect(() => detect(input())).not.toThrow();
    expect(names(input())).toEqual([]);
  });
});

describe('rules merged across sections', () => {
  it('keeps every signal when a technology is defined more than once', () => {
    // WordPress is authored twice: once under CMS, once again where the
    // robots.txt and body-class inputs are introduced. Both sets must count.
    expect(names(input({ assetUrls: ['https://x.com/wp-content/x.css'] }))).toContain('WordPress');
    expect(names(input({ robots: 'Disallow: /wp-admin/' }))).toContain('WordPress');
    expect(names(input({ html: '<body class="wp-singular">' }))).toContain('WordPress');
  });

  it('does not repeat the same evidence sentence twice', () => {
    const wp = find(
      input({
        html: '<meta name="generator" content="WordPress 6.4.3"><body class="wp-singular">',
        assetUrls: ['https://x.com/wp-content/x.css'],
        robots: 'Disallow: /wp-admin/',
      }),
      'WordPress',
    );
    expect(wp?.evidence.length).toBe(new Set(wp?.evidence).size);
    expect(wp?.version).toBe('6.4.3');
  });
});

describe('engine behaviour', () => {
  it('finds nothing in an empty page', () => {
    expect(detect(input())).toEqual([]);
  });

  it('matches globals by exact name, never as substrings', () => {
    // `$` must not fire the jQuery rule via a substring match on some other
    // global, and an unrelated global must not fire anything at all.
    expect(names(input({ globals: ['myAppState'] }))).toEqual([]);
    expect(names(input({ globals: ['jQuery'] }))).toContain('jQuery');
  });

  it('sorts by confidence, strongest first', () => {
    const found = detect(
      input({
        globals: ['__NEXT_DATA__'],
        html: '<div class="flex items-center gap-4 justify-between">',
      }),
    );
    const confidences = found.map((d) => d.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    expect(found[0]?.name).toBe('Next.js');
  });

  it('collects every matching signal as evidence, not just the strongest', () => {
    const result = find(
      input({
        globals: ['__NEXT_DATA__'],
        assetUrls: ['https://x.com/_next/static/chunks/main.js'],
      }),
      'Next.js',
    );
    expect(result?.evidence.length).toBeGreaterThan(1);
  });

  it('reports one entry per technology however many signals hit', () => {
    const found = detect(
      input({
        globals: ['__NEXT_DATA__', 'React'],
        assetUrls: ['https://x.com/_next/static/chunks/main.js'],
        html: 'id="__next"',
      }),
    );
    expect(found.filter((d) => d.name === 'Next.js')).toHaveLength(1);
  });

  it('survives malformed HTML without throwing', () => {
    expect(() => detect(input({ html: '<html><head><meta name=generator content=<<<' }))).not.toThrow();
  });

  it('does not read a header rule against the wrong header', () => {
    // 'server: Vercel' is a Vercel signal; the same word in an unrelated
    // header must not count.
    expect(names(input({ headers: { 'x-custom': 'Vercel' } }))).not.toContain('Vercel');
  });
});
