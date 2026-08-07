# Detection rules

How the platform works out what a website is built with. 213 rules, 398 signals, 20 categories.

This file is generated from [`rules.ts`](rules.ts) — the source of truth is the code.

---

## How a technology is identified

Every rule names one technology and lists the **signals** that imply it. A rule fires when
**any** one of its signals matches. The reported confidence is the highest-scoring signal that
matched — not an average — so a page carrying both a `__NEXT_DATA__` global and a `/_next/`
bundle path is reported with the certainty of the former.

Detection is a pure function over what the crawler captured: no database, no network, no
browser. That is what makes the rule set testable against fixtures instead of against live
sites that redesign under the test.

### Signal kinds

| Kind | Looks at | Used by | Example |
|---|---|---|---|
| `asset URL` | URLs of the stylesheets and scripts whose bodies were stored | 91 | `/_astro/` → Astro |
| `global` | Names on `window` | 77 | `__NEXT_DATA__` → Next.js |
| `HTML` | The rendered HTML, after scripts ran | 67 | `data-aos=` → AOS |
| `header` | One named response header | 50 | `cf-ray` → Cloudflare |
| `request URL` | **Every** URL the page touched, including fetch and XHR | 30 | `api.openai.com` → OpenAI |
| `cookie` | Cookie **names** the site set | 20 | `PHPSESSID` → PHP |
| `generator meta` | `<meta name="generator">` content | 13 | `WordPress 6.4.3` → WordPress + version |
| `CSS` | Bodies of captured stylesheets | 9 | `--tw-ring-offset-shadow` → Tailwind |
| `DNS record` | CNAME, NS, MX and TXT answers | 7 | `cname.vercel-dns.com` → Vercel |
| `inline script` | Contents of the inline scripts | 7 | `GTM-ABCD1234` → Tag Manager |
| `JS` | Bodies of captured scripts | 6 | `AnimatePresence` → Framer Motion |
| `final URL` | The final URL after redirects | 6 | `/default.aspx` → ASP.NET |
| `iframe src` | `src` of each embedded frame | 5 | `youtube.com/embed` → YouTube |
| `body class` | The `<body>` class list | 3 | `elementor-page` → Elementor |
| `service worker` | Script URLs of registered workers | 2 | `sw.js` → PWA |
| `form action` | Where each form posts | 2 | `list-manage.com` → Mailchimp |
| `robots.txt` | Body of /robots.txt | 1 | `/wp-admin/` → WordPress |
| `web app manifest` | Body of the Web App Manifest | 1 | `start_url` → PWA |
| `meta tag` | Every meta tag as `name=content` | 1 | `og:title=` → Open Graph |

`global` and `cookie` are matched **whole**, never as substrings — testing `$` as a substring
would fire half the library rules on every page. Everything else is a substring or regex test.

### Why cookies carry the backend

A CDN routinely strips `Server` and `X-Powered-By`, which is why header-only backend detection
finds nothing on most production sites. But a session cookie has to reach the browser or the
application cannot function — so `PHPSESSID`, `JSESSIONID`, `connect.sid` and
`laravel_session` are often the last surviving evidence of what runs on the server.

### Confidence

| Band | Score | Means |
|---|---|---|
| **Confirmed** | 90–100 | The site said so outright — a framework's own global or data blob |
| **Likely** | 70–89 | A signature only that technology produces |
| **Possible** | below 70 | A hint worth showing but not relying on |

The gap is real, and the UI shows which is which. `window.__NEXT_DATA__` is proof. A class list
that *looks* like Tailwind utilities is a guess — plenty of hand-written CSS uses the same
words. Both are reported; only one is trusted.

### Implication

A page can be unmistakably Next.js without ever naming React. Rules declare what they
necessarily bring with them, and the engine fills those in at confidence 70 — unless direct
evidence already found them, in which case the direct evidence always wins and the entry just
gains an extra `Implied by …` line.

```
Next.js → React, Node.js
Nuxt → Vue.js
Remix → React
Gatsby → React
WordPress → PHP
Drupal → PHP
Joomla → PHP
WooCommerce → WordPress
Magento → PHP
Laravel → PHP
Express → Node.js
Slick Carousel → jQuery
Owl Carousel → jQuery
Vanta.js → Three.js
Apache Tomcat → Java
Gunicorn → Python
Uvicorn → Python
Flask → Python
Strapi → Node.js
Ghost → Node.js
SvelteKit → Svelte
Backbone → jQuery
Fresh → Deno
AdonisJS → Node.js
Symfony → PHP
CodeIgniter → PHP
CakePHP → PHP
Spring Boot → Java
TYPO3 → PHP
Craft CMS → PHP
Payload CMS → Node.js
Directus → Node.js
OpenCart → PHP
PrestaShop → PHP
Saleor → Python
shadcn/ui → Radix UI, Tailwind CSS
DaisyUI → Tailwind CSS
Flowbite → Tailwind CSS
Vuetify → Vue.js
PrimeReact → React
PrimeVue → Vue.js
Quasar → Vue.js
Firebase Auth → Firebase
Supabase Auth → Supabase
Keycloak → Java
Elementor → WordPress
Divi → WordPress
Yoast SEO → WordPress
Vercel Analytics → Vercel
```

Chains resolve too: WooCommerce → WordPress → PHP.

---

## The rules

Signals are listed strongest first. A **v** marks a signal that also extracts a version number.

### Frameworks & static site generators

34 rules.

#### AdonisJS — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `adonis-session` | adonis-session cookie |

#### Angular

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | HTML | `/\sng-version="([\d.]+)"/` **v** | ng-version attribute |
| 95 | global | `getAllAngularRootElements` | Angular debug hook is present |
| 80 | HTML | `<app-root` | &lt;app-root&gt; element |
| 40 | asset URL | `/(polyfills\|main)[.-][0-9a-z]{8,}\.js/i` | Angular-style bundle filenames |

#### ASP.NET

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-aspnet-version` | `/([\d.]+)/` **v** | x-aspnet-version header |
| 95 | cookie | `ASP.NET_SessionId` | ASP.NET_SessionId cookie |
| 90 | header `x-powered-by` | `/ASP\.NET/i` | x-powered-by names ASP.NET |
| 90 | HTML | `__VIEWSTATE` | __VIEWSTATE form field |
| 90 | final URL | `/\.(aspx\|ashx\|asmx)(\?\|$)/` | ASP.NET URL extension |

#### Astro

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/_astro/` | Loads /_astro/ bundles |
| 95 | HTML | `/<astro-island/i` | &lt;astro-island&gt; element |
| 95 | generator meta | `/Astro v?([\d.]+)/i` **v** | generator meta names Astro |
| 85 | HTML | `/class="[^"]*\bastro-[0-9a-z]{6,}/i` | astro-* scoped class names |
| 85 | HTML | `/_astro/` | References /_astro/ assets |

#### Backbone — implies jQuery

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Backbone` | window.Backbone is defined |

#### CakePHP — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `CAKEPHP` | CAKEPHP cookie |

#### CodeIgniter — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `ci_session` | ci_session cookie |

#### Django

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `name="csrfmiddlewaretoken"` | csrfmiddlewaretoken form field |
| 90 | cookie | `csrftoken` | Django csrftoken cookie |

#### Eleventy

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Eleventy ?v?([\d.]+)?/i` **v** | generator meta names Eleventy |

#### Ember

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Ember` | window.Ember is defined |
| 90 | HTML | `/class="[^"]*\bember-application\b/` | ember-application class |

#### Flask — implies Python

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `server` | `/Werkzeug\/?([\d.]+)?/i` **v** | Werkzeug development server |

#### Fresh — implies Deno

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/_frsh/` | Loads /_frsh/ assets |

#### Gatsby — implies React

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `___gatsby` | window.___gatsby is present |
| 95 | HTML | `id="___gatsby"` | Root element id="___gatsby" |
| 95 | generator meta | `/Gatsby ?([\d.]+)?/i` **v** | generator meta names Gatsby |
| 90 | asset URL | `/page-data/` | Loads Gatsby page-data |

#### Hugo

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Hugo ?([\d.]+)?/i` **v** | generator meta names Hugo |

#### Inferno

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Inferno` | window.Inferno is defined |

#### Jekyll

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Jekyll v?([\d.]+)?/i` **v** | generator meta names Jekyll |

#### Laravel — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `laravel_session` | laravel_session cookie |
| 40 | HTML | `name="csrf-token"` | csrf-token meta tag |

#### Lit

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `litElementVersions` | window.litElementVersions is present |
| 95 | global | `litHtmlVersions` | window.litHtmlVersions is present |
| 80 | asset URL | `/lit-(html\|element)\|\/lit[.@-]/i` | Loads a Lit bundle |

#### Marko

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `$MARKO` | Marko runtime global is present |

#### Next.js — implies React, Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `__NEXT_DATA__` | window.__NEXT_DATA__ is present |
| 95 | asset URL | `/_next/static/` | Loads /_next/static/ bundles |
| 95 | header `x-powered-by` | `Next.js` | x-powered-by: Next.js |
| 90 | HTML | `id="__next"` | Root element id="__next" |
| 85 | HTML | `/<meta name="next-head-count"/i` | next-head-count meta tag |

#### Nuxt — implies Vue.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `__NUXT__` | window.__NUXT__ is present |
| 95 | asset URL | `/_nuxt/` | Loads /_nuxt/ bundles |
| 90 | HTML | `id="__nuxt"` | Root element id="__nuxt" |

#### Phoenix

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Phoenix` | window.Phoenix is defined |
| 75 | asset URL | `/phoenix[.@_-]/i` | Loads a Phoenix bundle |

#### Preact

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `__PREACT_DEVTOOLS__` | Preact devtools hook is present |
| 85 | asset URL | `/preact[.@-]/i` | Loads a Preact bundle |

#### Qwik

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | HTML | `/\sq:container=/` | q:container attribute |
| 95 | HTML | `/\sq:base=/` | q:base attribute |
| 85 | asset URL | `/\/build\/q-[0-9a-z]+\.js/i` | Qwik q-* build chunks |

#### React

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `React` | window.React is defined |
| 90 | HTML | `data-reactroot` | data-reactroot attribute |
| 85 | asset URL | `/react(-dom)?[.@-][\d.]*(\.production\|\.min)?\.js/i` | Loads a react bundle |
| 80 | HTML | `/<!--\$-->\|<!--\/\$-->/` | React server-component comment markers |

#### Remix — implies React

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `__remixContext` | window.__remixContext is present |
| 90 | HTML | `window.__remixManifest` | Remix manifest inlined |

#### Ruby on Rails

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/<meta name="csrf-param" content="authenticity_token"/` | Rails authenticity_token meta |
| 80 | header `x-powered-by` | `/Phusion Passenger/i` | Passenger app server |
| 80 | cookie | `/^_.*_session$/` | Rails-style session cookie |

#### SolidJS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `_$HY` | Solid hydration global is present |
| 60 | JS | `/solid-js\/web\|createSignal\(/` | Solid identifiers in the bundle |

#### Spring Boot — implies Java

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `x-application-context` | `/.+/` | x-application-context header |

#### Stimulus

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Stimulus` | window.Stimulus is defined |
| 80 | HTML | `/\sdata-controller="/` | data-controller attributes |

#### Svelte

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `__sveltekit` | SvelteKit global is present |
| 90 | asset URL | `/_app/immutable/` | Loads SvelteKit immutable assets |
| 85 | HTML | `/class="[^"]*\bsvelte-[0-9a-z]{6}/` | svelte-* scoped class names |

#### SvelteKit — implies Svelte

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/\sdata-sveltekit-/` | data-sveltekit-* attributes |
| 90 | asset URL | `/_app/immutable/` | Loads SvelteKit immutable assets |

#### Symfony — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 85 | header `x-debug-token` | `/.+/` | Symfony profiler debug token |
| 80 | cookie | `sf_redirect` | Symfony redirect cookie |

#### Vue.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Vue` | window.Vue is defined |
| 90 | HTML | `id="app" data-v-app` | Vue 3 app mount point |
| 85 | HTML | `/\sdata-v-[0-9a-f]{8}/` | Scoped-style data-v attributes |
| 80 | asset URL | `/vue[.@-][\d.]*(\.runtime)?(\.min)?\.js/i` | Loads a vue bundle |

### CMS & headless content

20 rules.

#### ButterCMS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/cdn\.buttercms\.com/i` | Loads media from ButterCMS |

#### Contentful

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/ctfassets\.net\|contentful\.com/i` | Loads content from Contentful |

#### Craft CMS — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `CraftSessionId` | CraftSessionId cookie |
| 95 | header `x-powered-by` | `/Craft ?CMS/i` | x-powered-by names Craft CMS |

#### DatoCMS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/datocms-assets\.com/i` | Loads media from DatoCMS |

#### Directus — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `directus_session_token` | directus session cookie |
| 70 | asset URL | `/directus/i` | Loads Directus assets |

#### Drupal — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | generator meta | `/Drupal ([\d.]+)/i` **v** | generator meta names Drupal |
| 95 | global | `Drupal` | window.Drupal is defined |
| 95 | header `x-generator` | `Drupal` | x-generator: Drupal |

#### Framer

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Framer/i` | generator meta names Framer |
| 95 | request URL | `/framerusercontent\.com/i` | Loads Framer user content |

#### Ghost — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Ghost ?([\d.]+)?/i` **v** | generator meta names Ghost |

#### Hygraph

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/graphassets\.com\|graphcms\.com/i` | Loads media from Hygraph |

#### Joomla — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Joomla/i` | generator meta names Joomla |
| 90 | global | `Joomla` | window.Joomla is defined |

#### Payload CMS — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `payload-token` | payload-token cookie |

#### Prismic

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/prismic\.io/i` | Loads content from Prismic |

#### Sanity

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/cdn\.sanity\.io\|apicdn\.sanity\.io/i` | Loads content from Sanity |

#### Squarespace

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | HTML | `Static.SQUARESPACE_CONTEXT` | Squarespace context object |
| 95 | asset URL | `static1.squarespace.com` | Loads Squarespace static assets |

#### Storyblok

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/a\.storyblok\.com\|storyblok\.com/i` | Loads content from Storyblok |

#### Strapi — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-powered-by` | `/Strapi/i` | x-powered-by: Strapi |

#### TYPO3 — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/TYPO3/i` | generator meta names TYPO3 |

#### Webflow

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | generator meta | `/Webflow/i` | generator meta names Webflow |
| 95 | HTML | `data-wf-page` | data-wf-page attribute |

#### Wix

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-wix-request-id` | `/.+/` | x-wix-request-id header |
| 90 | asset URL | `static.parastorage.com` | Loads Wix static assets |

#### WordPress — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | generator meta | `/WordPress ([\d.]+)/i` **v** | generator meta names WordPress |
| 95 | asset URL | `/wp-content/` | Loads assets from /wp-content/ |
| 95 | asset URL | `/wp-includes/` | Loads assets from /wp-includes/ |
| 90 | cookie | `/^wordpress_/` | wordpress_* cookie |
| 90 | body class | `/\bwp-(theme\|singular\|embed-responsive)\b/` | wp-* body classes |
| 85 | robots.txt | `/\/wp-admin\/?/` | robots.txt names /wp-admin/ |
| 80 | HTML | `/wp-json/` | Links to the WP REST API |

### Ecommerce

9 rules.

#### BigCommerce

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/cdn\d*\.bigcommerce\.com/i` | Loads BigCommerce assets |
| 95 | header `x-bc-storefront` | `/.+/` | BigCommerce storefront header |

#### Ecwid

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Ecwid` | window.Ecwid is defined |
| 90 | request URL | `/app\.ecwid\.com/i` | Loads the Ecwid storefront |

#### Magento — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 85 | HTML | `Magento_` | Magento_* module references |
| 70 | asset URL | `/static/version` | Magento static-version asset path |

#### OpenCart — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `OCSESSID` | OCSESSID cookie |
| 90 | final URL | `/route=common\/home/` | OpenCart route parameter |

#### PrestaShop — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/PrestaShop/i` | generator meta names PrestaShop |
| 95 | cookie | `/^PrestaShop-/` | PrestaShop-* cookie |

#### Saleor — implies Python

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 80 | request URL | `/saleor\.cloud\|\/graphql\/.*saleor/i` | Talks to a Saleor API |

#### Shopify

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `Shopify` | window.Shopify is defined |
| 98 | header `x-shopid` | `/.+/` | x-shopid header |
| 95 | asset URL | `cdn.shopify.com` | Loads assets from cdn.shopify.com |
| 90 | DNS record | `/shops\.myshopify\.com\|shopify\.com/i` | DNS points at Shopify |

#### Snipcart

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Snipcart` | window.Snipcart is defined |
| 95 | asset URL | `/cdn\.snipcart\.com/i` | Loads Snipcart |

#### WooCommerce — implies WordPress

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/plugins/woocommerce/` | Loads WooCommerce plugin assets |
| 85 | HTML | `/class="[^"]*\bwoocommerce\b/` | woocommerce body class |

### UI & styling

20 rules.

#### Ant Design

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | CSS | `/\.ant-btn\b/` | Ant Design component styles |
| 90 | HTML | `/class="[^"]*\bant-[a-z]/` | ant-* class names |

#### Bootstrap

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | asset URL | `/bootstrap[.@-]?([\d.]+)?(\.min)?\.(css\|js)/i` **v** | Loads a bootstrap bundle |
| 85 | CSS | `/\.col-md-\d+\|\.navbar-toggler/` | Bootstrap grid and component classes |

#### Bulma

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/bulma(\.min)?\.css/i` | Loads Bulma |
| 80 | CSS | `/\.column\.is-\d/` | Bulma grid classes |

#### Chakra UI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | HTML | `/class="[^"]*\bchakra-/` | chakra-* class names |
| 85 | HTML | `data-theme="chakra-ui` | Chakra theme attribute |

#### DaisyUI — implies Tailwind CSS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 85 | CSS | `/--fallback-p\|\.btn-primary\{/` | DaisyUI theme variables |
| 60 | HTML | `/class="[^"]*\bbtn\b[^"]*\bbtn-(primary\|secondary\|ghost)\b/` | DaisyUI button classes |

#### Divi — implies WordPress

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/\/themes\/Divi\//i` | Loads the Divi theme |
| 90 | body class | `/\bet_pb_/` | Divi builder body classes |

#### Elementor — implies WordPress

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | body class | `/\belementor-page\b/` | elementor-page body class |
| 95 | asset URL | `/\/plugins\/elementor\//i` | Loads Elementor assets |

#### Flowbite — implies Tailwind CSS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/flowbite/i` | Loads Flowbite |

#### Foundation

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | asset URL | `/foundation(\.min)?\.(css\|js)/i` | Loads Foundation |

#### Mantine

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/\sdata-mantine-color-scheme=/` | Mantine colour-scheme attribute |
| 90 | HTML | `/class="[^"]*\bmantine-/` | mantine-* class names |

#### Material UI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | CSS | `/\.MuiButton-root/` | MUI component styles |
| 90 | HTML | `/class="[^"]*\bMui[A-Z]/` | Mui* class names |

#### PrimeReact — implies React

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/primereact/i` | Loads PrimeReact |

#### PrimeVue — implies Vue.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/primevue/i` | Loads PrimeVue |

#### Quasar — implies Vue.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/class="[^"]*\bq-(app\|layout\|page)\b/` | Quasar layout classes |

#### Radix UI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/\sdata-radix-/` | data-radix-* attributes |
| 80 | HTML | `/\bradix-[:a-z0-9]+\b/i` | Radix generated ids |

#### Semantic UI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | asset URL | `/semantic(\.min)?\.(css\|js)/i` | Loads Semantic UI |
| 85 | CSS | `/\.ui\.button\b/` | Semantic UI component styles |

#### shadcn/ui — implies Radix UI, Tailwind CSS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 70 | HTML | `/\sdata-slot="[a-z-]+"/` | data-slot attributes on components |

#### styled-components

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | HTML | `data-styled` | data-styled attribute |
| 80 | HTML | `/class="[^"]*\bsc-[0-9a-zA-Z]{6}/` | sc-* generated class names |

#### Tailwind CSS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | CSS | `/--tw-(ring-offset-shadow\|border-spacing\|translate-x)/` | Tailwind CSS custom properties |
| 90 | CSS | `/\.sr-only\{position:absolute;width:1px;height:1px/` | Tailwind's .sr-only rule |
| 55 | HTML | `/class="[^"]*\b(flex\|grid)\b[^"]*\b(items-center\|justify-between\|gap-\d)/` | Tailwind-style utility classes |

#### Vuetify — implies Vue.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/class="[^"]*\bv-application\b/` | v-application root class |
| 90 | asset URL | `/vuetify/i` | Loads Vuetify |

### Animation & 3D

25 rules.

#### Animate.css

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/class="[^"]*\banimate__animated\b/` | animate__animated classes |
| 85 | asset URL | `/animate(\.min)?\.css/i` | Loads Animate.css |
| 80 | CSS | `/@keyframes\s+(fadeInUp\|bounceIn\|zoomIn)\b/` | Animate.css keyframes |

#### Anime.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `anime` | window.anime is defined |
| 85 | asset URL | `/anime(\.min)?\.js/i` | Loads an Anime.js bundle |

#### AOS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `AOS` | window.AOS is defined |
| 90 | HTML | `/\sdata-aos=/` | data-aos attributes |
| 85 | asset URL | `/\baos(\.min)?\.(js\|css)/i` | Loads the AOS library |

#### Babylon.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `BABYLON` | window.BABYLON is defined |
| 90 | asset URL | `/babylon(\.min)?\.js/i` | Loads a Babylon.js bundle |

#### Barba.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `barba` | window.barba is defined |
| 90 | HTML | `/\sdata-barba=/` | data-barba attributes |

#### Framer Motion

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | asset URL | `/framer-motion\|framer_motion/i` | Loads a Framer Motion bundle |
| 85 | HTML | `/style="[^"]*transform:\s*none[^"]*"[^>]*data-projection-id/` | Framer Motion projection attributes |
| 80 | JS | `/framer-motion\|useMotionValue\|AnimatePresence/` | Framer Motion identifiers in the bundle |

#### GSAP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `gsap` | window.gsap is defined |
| 90 | global | `TweenMax` | window.TweenMax is defined |
| 90 | asset URL | `/gsap\|TweenMax\|ScrollTrigger/i` | Loads a GSAP bundle |
| 85 | global | `ScrollTrigger` | window.ScrollTrigger is defined |
| 85 | JS | `/gsap\.registerPlugin\|_gsapVersion/` | GSAP calls in the bundle |

#### Lenis

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Lenis` | window.Lenis is defined |
| 90 | asset URL | `/\blenis[.@-]/i` | Loads a Lenis bundle |
| 70 | HTML | `/class="[^"]*\blenis\b/` | lenis root class |

#### Locomotive Scroll

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `LocomotiveScroll` | window.LocomotiveScroll is defined |
| 95 | asset URL | `/locomotive-scroll/i` | Loads Locomotive Scroll |
| 90 | HTML | `/\sdata-scroll-container/` | data-scroll-container attribute |

#### Lottie

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `lottie` | window.lottie is defined |
| 95 | global | `bodymovin` | window.bodymovin is defined |
| 95 | HTML | `/<lottie-player\|<dotlottie-player/i` | &lt;lottie-player&gt; element |
| 90 | asset URL | `/lottie\|bodymovin/i` | Loads a Lottie player |

#### Matter.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Matter` | window.Matter is defined |
| 85 | asset URL | `/matter(\.min)?\.js/i` | Loads a Matter.js bundle |

#### Motion One

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 80 | global | `Motion` | window.Motion is defined |
| 75 | asset URL | `/motion(-one)?[.@-][\d.]*(\.min)?\.js/i` | Loads a Motion One bundle |

#### Owl Carousel — implies jQuery

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/owl\.carousel/i` | Loads Owl Carousel |
| 90 | HTML | `/class="[^"]*\bowl-(carousel\|stage)\b/` | owl-* markup |

#### particles.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `particlesJS` | window.particlesJS is defined |
| 95 | global | `tsParticles` | window.tsParticles is defined |
| 90 | asset URL | `/particles(\.min)?\.js\|tsparticles/i` | Loads a particles library |

#### PixiJS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `PIXI` | window.PIXI is defined |
| 90 | asset URL | `/pixi(\.min)?\.js/i` | Loads a PixiJS bundle |

#### Rive

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `rive` | window.rive is defined |
| 90 | asset URL | `/rive[.@-]\|\.riv\b/i` | Loads a Rive runtime or file |

#### ScrollMagic

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `ScrollMagic` | window.ScrollMagic is defined |
| 90 | asset URL | `/scrollmagic/i` | Loads ScrollMagic |

#### ScrollReveal

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `ScrollReveal` | window.ScrollReveal is defined |
| 90 | asset URL | `/scrollreveal/i` | Loads ScrollReveal |

#### Slick Carousel — implies jQuery

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | HTML | `/class="[^"]*\bslick-(slider\|track\|slide)\b/` | slick-* markup |
| 90 | asset URL | `/slick(\.min)?\.(js\|css)/i` | Loads Slick Carousel |

#### Splide

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Splide` | window.Splide is defined |
| 85 | HTML | `/class="[^"]*\bsplide\b/` | splide markup |

#### Spline

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | HTML | `/<spline-viewer/i` | &lt;spline-viewer&gt; element |
| 90 | asset URL | `/spline(tool)?\.(design\|com)\|@splinetool/i` | Loads a Spline runtime |

#### Swiper

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Swiper` | window.Swiper is defined |
| 90 | asset URL | `/swiper[.@-]/i` | Loads a Swiper bundle |
| 85 | HTML | `/class="[^"]*\bswiper(-container\|-wrapper\|-slide)?\b/` | swiper-* markup |

#### Three.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `THREE` | window.THREE is defined |
| 90 | asset URL | `/three(\.module)?(\.min)?\.js/i` | Loads a three.js bundle |
| 75 | JS | `/THREE\.WebGLRenderer\|WebGLRenderer\b/` | three.js renderer in the bundle |

#### Vanta.js — implies Three.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `VANTA` | window.VANTA is defined |
| 90 | asset URL | `/vanta/i` | Loads a Vanta effect |

#### WOW.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `WOW` | window.WOW is defined |
| 85 | asset URL | `/wow(\.min)?\.js/i` | Loads WOW.js |
| 70 | HTML | `/class="[^"]*\bwow\b/` | wow animation classes |

### Libraries

5 rules.

#### Alpine.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Alpine` | window.Alpine is defined |
| 80 | HTML | `/\sx-data=/` | x-data attributes |

#### GraphQL

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `__APOLLO_CLIENT__` | Apollo Client global is present |
| 60 | JS | `/\/graphql["'ˋ]/` | References a /graphql endpoint |

#### htmx

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `htmx` | window.htmx is defined |
| 85 | HTML | `/\shx-(get\|post\|target)=/` | hx-* attributes |

#### jQuery

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `jQuery` | window.jQuery is defined |
| 90 | asset URL | `/jquery[.-]?([\d.]+)?(\.min)?\.js/i` **v** | Loads a jQuery bundle |

#### Workbox

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | inline script | `/workbox\.(precaching\|routing)/` | Workbox calls in an inline script |
| 70 | service worker | `/workbox\|sw\.js/i` | Service worker looks like Workbox |

### Build tools

3 rules.

#### Parcel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `parcelRequire` | window.parcelRequire is defined |

#### Vite

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/@vite/client` | Loads the Vite dev client |
| 60 | HTML | `type="module" crossorigin src="/assets/` | Vite-style module entry |

#### webpack

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `__webpack_require__` | webpack runtime is present |
| 85 | global | `webpackChunk` | webpack chunk global is present |

### Languages & runtimes

6 rules.

#### Deno

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `server` | `/deno\/?([\d.]+)?/i` **v** | server header names Deno |

#### Java

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `JSESSIONID` | JSESSIONID cookie |
| 85 | final URL | `/\.(jsp\|do\|action)(\?\|$)/` | JSP/Struts URL extension |

#### Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 85 | header `x-powered-by` | `/Express/i` | x-powered-by names Express |

#### PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `x-powered-by` | `/PHP\/?([\d.]+)?/i` **v** | x-powered-by names PHP |
| 92 | cookie | `PHPSESSID` | PHPSESSID cookie |
| 90 | final URL | `/\.php(\?\|$)/` | URL ends in .php |

#### Python

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `server` | `/(gunicorn\|uvicorn\|Werkzeug\|WSGIServer)/i` | Python application server in the server header |

#### Ruby

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 85 | header `server` | `/(Puma\|WEBrick\|Unicorn)\/?([\d.]+)?/i` | Ruby application server in the server header |

### Web & application servers

9 rules.

#### Apache

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/Apache\/?([\d.]+)?/i` **v** | server header names Apache |

#### Apache Tomcat — implies Java

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/Tomcat\/?([\d.]+)?/i` **v** | server header names Tomcat |

#### Caddy

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/Caddy/i` | server: Caddy |

#### Express — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `x-powered-by` | `/^Express/i` | x-powered-by: Express |
| 90 | cookie | `connect.sid` | connect.sid session cookie |

#### Gunicorn — implies Python

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/gunicorn\/?([\d.]+)?/i` **v** | server: gunicorn |

#### LiteSpeed

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/LiteSpeed/i` | server header names LiteSpeed |

#### Microsoft IIS

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/Microsoft-IIS\/?([\d.]+)?/i` **v** | server header names IIS |

#### nginx

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/nginx\/?([\d.]+)?/i` **v** | server header names nginx |

#### Uvicorn — implies Python

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/uvicorn/i` | server: uvicorn |

### Hosting

12 rules.

#### Amazon S3

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/AmazonS3/i` | server: AmazonS3 |

#### AWS Amplify

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | final URL | `/amplifyapp\.com/i` | Served from an amplifyapp.com domain |

#### Azure Static Web Apps

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | final URL | `/azurestaticapps\.net/i` | Served from azurestaticapps.net |
| 90 | header `x-azure-ref` | `/.+/` | x-azure-ref header |

#### Cloudflare Pages

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 80 | header `cf-worker` | `/.+/` | cf-worker header |

#### Cloudflare Workers

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `cf-worker` | `/.+/` | cf-worker header |
| 30 | header `server` | `/cloudflare/i` | Served through Cloudflare |

#### Firebase Hosting

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `x-served-by` | `/Firebase/i` | Served by Firebase |

#### Fly.io

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `fly-request-id` | `/.+/` | fly-request-id header |

#### GitHub Pages

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/GitHub\.com/i` | server: GitHub.com |
| 90 | DNS record | `/github\.io/i` | DNS points at github.io |

#### Netlify

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/Netlify/i` | server: Netlify |
| 98 | header `x-nf-request-id` | `/.+/` | x-nf-request-id header |
| 95 | DNS record | `/netlify\.(com\|app)/i` | DNS points at Netlify |

#### Railway

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-railway-request-id` | `/.+/` | x-railway-request-id header |

#### Render

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `x-render-origin-server` | `/.+/` | x-render-origin-server header |

#### Vercel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/Vercel/i` | server: Vercel |
| 98 | header `x-vercel-id` | `/.+/` | x-vercel-id header |
| 95 | DNS record | `/vercel-dns\.com\|vercel-dns-\d/i` | DNS points at Vercel |

### CDN

7 rules.

#### Akamai

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/AkamaiGHost/i` | server: AkamaiGHost |
| 95 | header `x-akamai-transformed` | `/.+/` | x-akamai-transformed header |

#### Amazon CloudFront

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-amz-cf-id` | `/.+/` | x-amz-cf-id header |
| 90 | header `via` | `/CloudFront/i` | via names CloudFront |

#### bunny.net

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/BunnyCDN/i` | server: BunnyCDN |

#### Cloudflare

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `cf-ray` | `/.+/` | cf-ray header |
| 95 | header `server` | `/cloudflare/i` | server: cloudflare |
| 90 | DNS record | `/NS .*\.ns\.cloudflare\.com/i` | Cloudflare nameservers |

#### Fastly

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-fastly-request-id` | `/.+/` | x-fastly-request-id header |
| 70 | header `x-served-by` | `/cache-/i` | Fastly cache node in x-served-by |

#### jsDelivr

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `cdn.jsdelivr.net` | Loads assets from jsDelivr |

#### unpkg

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `unpkg.com` | Loads assets from unpkg |

### Database & backend services

4 rules.

#### Appwrite

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | request URL | `/cloud\.appwrite\.io\|appwrite/i` | Talks to Appwrite |

#### Firebase

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/firebaseio\.com\|firebaseapp\.com\|gstatic\.com\/firebasejs/i` | Loads or calls Firebase |

#### MongoDB Atlas

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | request URL | `/data\.mongodb-api\.com\|realm\.mongodb\.com/i` | Calls a MongoDB Atlas endpoint |

#### Supabase

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/supabase\.co\|supabase\.in/i` | Talks to Supabase |
| 95 | cookie | `/^sb-.*-auth-token$/` | Supabase auth cookie |

### Authentication

7 rules.

#### Auth0

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/cdn\.auth0\.com\|\.auth0\.com/i` | Loads or calls Auth0 |

#### Clerk

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Clerk` | window.Clerk is defined |
| 95 | request URL | `/clerk\.(com\|dev\|accounts\.dev)\|\.clerk\./i` | Loads the Clerk SDK |
| 95 | cookie | `__clerk_db_jwt` | Clerk session cookie |

#### Firebase Auth — implies Firebase

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/identitytoolkit\.googleapis\.com\|firebase-auth/i` | Calls the Firebase identity toolkit |

#### Keycloak — implies Java

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | request URL | `/\/auth\/realms\/\|keycloak/i` | Talks to a Keycloak realm |

#### Okta

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `OktaSignIn` | window.OktaSignIn is defined |
| 95 | request URL | `/\.okta(preview)?\.com\|okta-signin/i` | Loads or calls Okta |

#### Stytch

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/stytch\.com/i` | Loads the Stytch SDK |

#### Supabase Auth — implies Supabase

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `/^sb-.*-auth-token$/` | Supabase auth cookie |

### Payments

7 rules.

#### Adyen

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `AdyenCheckout` | window.AdyenCheckout is defined |
| 95 | asset URL | `/checkoutshopper-(live\|test)\.adyen\.com/i` | Loads Adyen Checkout |

#### Braintree

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/js\.braintreegateway\.com/i` | Loads the Braintree SDK |
| 90 | global | `braintree` | window.braintree is defined |

#### Lemon Squeezy

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/lemonsqueezy\.com/i` | Loads Lemon Squeezy |

#### Paddle

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Paddle` | window.Paddle is defined |
| 95 | asset URL | `/cdn\.paddle\.com\|paddle\.js/i` | Loads Paddle |

#### PayPal

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/paypal\.com\/sdk\/js\|paypalobjects\.com/i` | Loads the PayPal SDK |
| 90 | global | `paypal` | window.paypal is defined |

#### Razorpay

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Razorpay` | window.Razorpay is defined |
| 95 | asset URL | `/checkout\.razorpay\.com/i` | Loads Razorpay Checkout |

#### Stripe

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `js.stripe.com` | Loads Stripe.js |
| 90 | global | `Stripe` | window.Stripe is defined |

### Product analytics

12 rules.

#### Amplitude

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `amplitude` | window.amplitude is defined |
| 90 | asset URL | `/amplitude/i` | Loads Amplitude |

#### Fathom

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/cdn\.usefathom\.com/i` | Loads Fathom |

#### Google Analytics

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `googletagmanager.com/gtag/js` | Loads gtag.js |
| 90 | inline script | `/G-[A-Z0-9]{8,}\|UA-\d{4,}-\d+/` | Measurement id in an inline script |
| 85 | global | `gtag` | window.gtag is defined |

#### Google Tag Manager

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `googletagmanager.com/gtm.js` | Loads gtm.js |
| 90 | inline script | `/GTM-[A-Z0-9]{4,}/` | GTM container id in an inline script |
| 60 | global | `dataLayer` | window.dataLayer is defined |

#### Heap

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/cdn\d*\.heapanalytics\.com/i` | Loads Heap |
| 90 | global | `heap` | window.heap is defined |

#### Hotjar

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `static.hotjar.com` | Loads Hotjar |
| 90 | inline script | `/hjid\s*:\s*\d+/` | Hotjar site id in an inline script |

#### Meta Pixel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `fbq` | window.fbq is defined |
| 90 | asset URL | `connect.facebook.net` | Loads the Facebook SDK |

#### Mixpanel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/cdn\.mxpnl\.com\|mixpanel/i` | Loads Mixpanel |
| 90 | global | `mixpanel` | window.mixpanel is defined |

#### Plausible

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `plausible.io/js` | Loads Plausible |

#### PostHog

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/posthog/i` | Loads PostHog |
| 90 | global | `posthog` | window.posthog is defined |

#### Segment

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/cdn\.segment\.(com\|io)/i` | Loads Segment |

#### Vercel Analytics — implies Vercel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/\/_vercel\/insights\|vitals\.vercel-insights\.com/i` | Reports to Vercel Analytics |

### Monitoring & error tracking

6 rules.

#### Bugsnag

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `Bugsnag` | window.Bugsnag is defined |
| 95 | asset URL | `/bugsnag/i` | Loads Bugsnag |

#### Datadog

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `DD_RUM` | window.DD_RUM is defined |
| 95 | global | `DD_LOGS` | window.DD_LOGS is defined |
| 95 | asset URL | `/datadoghq\|datadog-rum/i` | Loads Datadog RUM |

#### LogRocket

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `LogRocket` | window.LogRocket is defined |
| 95 | asset URL | `/cdn\.lr-\|logrocket/i` | Loads LogRocket |

#### New Relic

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `NREUM` | window.NREUM is defined |
| 95 | asset URL | `/js-agent\.newrelic\.com/i` | Loads the New Relic browser agent |

#### Raygun

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `rg4js` | window.rg4js is defined |
| 90 | asset URL | `/raygun/i` | Loads Raygun |

#### Sentry

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Sentry` | window.Sentry is defined |
| 85 | asset URL | `/browser\.sentry-cdn\.com\|\/sentry[.-]/i` | Loads a Sentry bundle |

### Maps

4 rules.

#### Google Maps

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/maps\.googleapis\.com\|maps\.gstatic\.com/i` | Loads the Google Maps API |

#### Leaflet

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/leaflet(\.min)?\.(js\|css)/i` | Loads Leaflet |
| 95 | HTML | `/class="[^"]*\bleaflet-container\b/` | leaflet-container element |

#### Mapbox

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `mapboxgl` | window.mapboxgl is defined |
| 95 | request URL | `/api\.mapbox\.com\|mapbox-gl/i` | Loads Mapbox GL |

#### OpenLayers

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `/class="[^"]*\bol-viewport\b/` | ol-viewport element |
| 90 | asset URL | `/openlayers\|\bol(\.min)?\.(js\|css)/i` | Loads OpenLayers |

### AI

3 rules.

#### Anthropic

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/api\.anthropic\.com/i` | Calls the Anthropic API from the browser |

#### OpenAI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/api\.openai\.com/i` | Calls the OpenAI API from the browser |

#### Vercel AI SDK

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 65 | JS | `/useChat\(\|useCompletion\(\|ai\/react/` | Vercel AI SDK hooks in the bundle |

### Fonts & icons

5 rules.

#### Adobe Fonts

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/use\.typekit\.net\|use\.edgefonts\.net/i` | Loads Adobe Fonts |

#### Font Awesome

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/font-?awesome/i` | Loads Font Awesome |
| 80 | HTML | `/class="[^"]*\bfa[srlbd]?\s+fa-/` | fa-* icon classes |

#### Google Fonts

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `fonts.googleapis.com` | Loads fonts.googleapis.com |
| 80 | HTML | `fonts.gstatic.com` | Preconnects to fonts.gstatic.com |

#### Lucide

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | asset URL | `/lucide/i` | Loads Lucide icons |
| 85 | HTML | `/class="[^"]*\blucide\b/` | lucide icon classes |

#### Material Icons

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/icon\?family=Material\+Icons\|material-icons\|material-symbols/i` | Loads Material Icons |
| 90 | HTML | `/class="[^"]*\bmaterial-(icons\|symbols)/` | material-icons classes |

### Other

15 rules.

#### Cal.com

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | iframe src | `/cal\.com/i` | Embeds a Cal.com booking frame |
| 90 | inline script | `/Cal\(["']init/` | Cal.com embed script |

#### Calendly

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | iframe src | `/calendly\.com/i` | Embeds a Calendly frame |
| 90 | request URL | `/assets\.calendly\.com/i` | Loads the Calendly widget |

#### Crisp

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | inline script | `/\$crisp\|CRISP_WEBSITE_ID/` | Crisp configuration in an inline script |

#### Google Workspace

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | DNS record | `/MX .*(aspmx\.l\.google\.com\|googlemail\.com)/i` | Google Workspace mail records |

#### HubSpot

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/js\.hs-scripts\.com\|hsforms\.(net\|com)/i` | Loads HubSpot |
| 90 | form action | `/hsforms\.com/i` | Form posts to HubSpot |

#### Intercom

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | inline script | `/window\.intercomSettings/` | Intercom settings in an inline script |
| 95 | request URL | `/widget\.intercom\.io\|api-iam\.intercom\.io/i` | Talks to Intercom |

#### Klaviyo

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | request URL | `/static\.klaviyo\.com\|a\.klaviyo\.com/i` | Loads Klaviyo |

#### Mailchimp

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | form action | `/list-manage\.com/i` | Signup form posts to Mailchimp |

#### Microsoft 365

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | DNS record | `/MX .*mail\.protection\.outlook\.com/i` | Microsoft 365 mail records |

#### Open Graph

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | meta tag | `/^og:(title\|image\|type)=/m` | Open Graph meta tags |

#### Progressive Web App

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | web app manifest | `/"(start_url\|display)"/` | Serves a Web App Manifest |
| 90 | service worker | `/.+/` | Registers a service worker |

#### Typeform

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | iframe src | `/form\.typeform\.com/i` | Embeds a Typeform |

#### Vimeo

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | iframe src | `/player\.vimeo\.com/i` | Embeds a Vimeo player |

#### Yoast SEO — implies WordPress

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | HTML | `/<!-- This site is optimized with the Yoast SEO plugin/i` | Yoast SEO comment block |

#### YouTube

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | iframe src | `/youtube(-nocookie)?\.com\/embed/i` | Embeds a YouTube player |

---

## What cannot be detected this way

Some technologies leave no trace in what a browser receives, so there is no honest rule to
write for them. They are listed here so their absence reads as a decision rather than an
oversight:

| Technology | Why not |
|---|---|
| TypeScript | Compiles to JavaScript. Nothing of it survives to the browser. |
| Rollup, esbuild, SWC, Rspack, Turbopack | Leave no runtime marker, unlike webpack and Parcel which register a global. |
| PlanetScale, Neon, Railway Postgres | Reached only from the server. A browser never sees them. |
| NestJS, Fastify, Koa, Hono | Send no distinguishing header by default. NestJS on Express is indistinguishable from Express. |
| Gin, Echo, Fiber | Same — Go frameworks that set no default header. |
| FastAPI | Only its server (uvicorn) is visible, which does not imply FastAPI. |
| Heroicons | Inlined as raw SVG at build time, with nothing to key on. |
| LangChain, LlamaIndex, Ollama | Server-side only. |

Detecting these would need a signal the crawler does not have today — a build manifest, a
source map, or an error page. Adding a rule that guesses would be worse than the gap: the UI
presents detections as findings, and a finding nobody can verify is noise.

---

## Adding a rule

Append to `RULES` in [`rules.ts`](rules.ts) and add a case to
[`../../../tests/detectors.test.ts`](../../../tests/detectors.test.ts). Two things to get right:

- **Score honestly.** A signal only that technology emits earns 90+. A signal that merely
  correlates earns less. Inflated confidence is worse than no rule, because the UI presents it
  as fact.
- **Write the evidence for a stranger.** It is shown verbatim in the product, and it is what
  makes a wrong answer explicable instead of mysterious.

If the signal is a page global, add its name to `PROBE_GLOBALS` in
[`../crawler.ts`](../crawler.ts) as well — the crawler only reports globals it was told to look
for, because enumerating `window` is slow and throws on exotic getters.
