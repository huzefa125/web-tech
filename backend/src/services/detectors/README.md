# Detection rules

How the platform works out what a website is built with. 102 rules, 217 signals, 13 categories.

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

### The nine signal kinds

| Kind | Looks at | Used by | Example |
|---|---|---|---|
| `asset URL` | URLs of every stylesheet and script the page loaded | 53 | `/_astro/` → Astro |
| `HTML` | The rendered HTML, after scripts ran | 48 | `data-aos=` → AOS |
| `global` | Names on `window` | 43 | `__NEXT_DATA__` → Next.js |
| `header` | One named response header | 41 | `cf-ray` → Cloudflare |
| `generator meta` | `<meta name="generator">` content | 11 | `WordPress 6.4.3` → WordPress + version |
| `cookie` | Cookie **names** the site set | 9 | `PHPSESSID` → PHP |
| `CSS` | Bodies of captured stylesheets | 5 | `--tw-ring-offset-shadow` → Tailwind |
| `JS` | Bodies of captured scripts | 4 | `AnimatePresence` → Framer Motion |
| `final URL` | The final URL after redirects | 3 | `/default.aspx` → ASP.NET |

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
```

Chains resolve too: WooCommerce → WordPress → PHP.

---

## The rules

Signals are listed strongest first. A **v** marks a signal that also extracts a version number.

### Frameworks & static site generators

17 rules.

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

#### Django

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | HTML | `name="csrfmiddlewaretoken"` | csrfmiddlewaretoken form field |
| 90 | cookie | `csrftoken` | Django csrftoken cookie |

#### Eleventy

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Eleventy ?v?([\d.]+)?/i` **v** | generator meta names Eleventy |

#### Flask — implies Python

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | header `server` | `/Werkzeug\/?([\d.]+)?/i` **v** | Werkzeug development server |

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

#### Jekyll

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Jekyll v?([\d.]+)?/i` **v** | generator meta names Jekyll |

#### Laravel — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | cookie | `laravel_session` | laravel_session cookie |
| 40 | HTML | `name="csrf-token"` | csrf-token meta tag |

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

#### Svelte

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | global | `__sveltekit` | SvelteKit global is present |
| 90 | asset URL | `/_app/immutable/` | Loads SvelteKit immutable assets |
| 85 | HTML | `/class="[^"]*\bsvelte-[0-9a-z]{6}/` | svelte-* scoped class names |

#### Vue.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Vue` | window.Vue is defined |
| 90 | HTML | `id="app" data-v-app` | Vue 3 app mount point |
| 85 | HTML | `/\sdata-v-[0-9a-f]{8}/` | Scoped-style data-v attributes |
| 80 | asset URL | `/vue[.@-][\d.]*(\.runtime)?(\.min)?\.js/i` | Loads a vue bundle |

### CMS & headless content

12 rules.

#### Contentful

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/ctfassets\.net\|contentful\.com/i` | Loads content from Contentful |

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
| 95 | asset URL | `/framerusercontent\.com/i` | Loads Framer user content |

#### Ghost — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Ghost ?([\d.]+)?/i` **v** | generator meta names Ghost |

#### Joomla — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | generator meta | `/Joomla/i` | generator meta names Joomla |
| 90 | global | `Joomla` | window.Joomla is defined |

#### Prismic

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/prismic\.io/i` | Loads content from Prismic |

#### Sanity

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/cdn\.sanity\.io\|apicdn\.sanity\.io/i` | Loads content from Sanity |

#### Squarespace

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | HTML | `Static.SQUARESPACE_CONTEXT` | Squarespace context object |
| 95 | asset URL | `static1.squarespace.com` | Loads Squarespace static assets |

#### Strapi — implies Node.js

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-powered-by` | `/Strapi/i` | x-powered-by: Strapi |

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
| 80 | HTML | `/wp-json/` | Links to the WP REST API |

### Ecommerce

3 rules.

#### Magento — implies PHP

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 85 | HTML | `Magento_` | Magento_* module references |
| 70 | asset URL | `/static/version` | Magento static-version asset path |

#### Shopify

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | global | `Shopify` | window.Shopify is defined |
| 98 | header `x-shopid` | `/.+/` | x-shopid header |
| 95 | asset URL | `cdn.shopify.com` | Loads assets from cdn.shopify.com |

#### WooCommerce — implies WordPress

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/plugins/woocommerce/` | Loads WooCommerce plugin assets |
| 85 | HTML | `/class="[^"]*\bwoocommerce\b/` | woocommerce body class |

### UI & styling

5 rules.

#### Bootstrap

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | asset URL | `/bootstrap[.@-]?([\d.]+)?(\.min)?\.(css\|js)/i` **v** | Loads a bootstrap bundle |
| 85 | CSS | `/\.col-md-\d+\|\.navbar-toggler/` | Bootstrap grid and component classes |

#### Chakra UI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | HTML | `/class="[^"]*\bchakra-/` | chakra-* class names |
| 85 | HTML | `data-theme="chakra-ui` | Chakra theme attribute |

#### Material UI

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | CSS | `/\.MuiButton-root/` | MUI component styles |
| 90 | HTML | `/class="[^"]*\bMui[A-Z]/` | Mui* class names |

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

### Animation & 3D

22 rules.

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

### Libraries & build tools

6 rules.

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

4 rules.

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

8 rules.

#### Amazon S3

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/AmazonS3/i` | server: AmazonS3 |

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

#### GitHub Pages

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `server` | `/GitHub\.com/i` | server: GitHub.com |

#### Netlify

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/Netlify/i` | server: Netlify |
| 98 | header `x-nf-request-id` | `/.+/` | x-nf-request-id header |

#### Render

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | header `x-render-origin-server` | `/.+/` | x-render-origin-server header |

#### Vercel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `server` | `/Vercel/i` | server: Vercel |
| 98 | header `x-vercel-id` | `/.+/` | x-vercel-id header |

### CDN

5 rules.

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

#### Fastly

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 98 | header `x-fastly-request-id` | `/.+/` | x-fastly-request-id header |
| 70 | header `x-served-by` | `/cache-/i` | Fastly cache node in x-served-by |

### Analytics & monitoring

6 rules.

#### Google Analytics

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `googletagmanager.com/gtag/js` | Loads gtag.js |
| 85 | global | `gtag` | window.gtag is defined |

#### Google Tag Manager

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `googletagmanager.com/gtm.js` | Loads gtm.js |
| 60 | global | `dataLayer` | window.dataLayer is defined |

#### Hotjar

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `static.hotjar.com` | Loads Hotjar |

#### Meta Pixel

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `fbq` | window.fbq is defined |
| 90 | asset URL | `connect.facebook.net` | Loads the Facebook SDK |

#### Plausible

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `plausible.io/js` | Loads Plausible |

#### Sentry

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 90 | global | `Sentry` | window.Sentry is defined |
| 85 | asset URL | `/browser\.sentry-cdn\.com\|\/sentry[.-]/i` | Loads a Sentry bundle |

### Fonts & icons

2 rules.

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

### Other

3 rules.

#### Firebase

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/firebaseio\.com\|firebaseapp\.com\|gstatic\.com\/firebasejs/i` | Loads or calls Firebase |

#### Stripe

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `js.stripe.com` | Loads Stripe.js |
| 90 | global | `Stripe` | window.Stripe is defined |

#### Supabase

| Conf. | Looks at | Matches | Reported as |
|---:|---|---|---|
| 95 | asset URL | `/supabase\.co\|supabase\.in/i` | Talks to Supabase |
| 95 | cookie | `/^sb-.*-auth-token$/` | Supabase auth cookie |

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
