# Technology Detection Engine

A comprehensive technology detection engine inspired by Wappalyzer and BuiltWith, designed for high-confidence website technology fingerprinting.

---

# Goals

Detect technologies used by any website using only the captured crawl data.

No API calls.

No external databases.

No browser automation during detection.

Pure deterministic rule engine.

---

# Detection Categories

## Frameworks

- Next.js
- React
- Vue.js
- Nuxt
- Angular
- Astro
- Remix
- Svelte
- SvelteKit
- Gatsby
- Qwik
- SolidJS
- Ember
- Backbone
- Preact
- Inferno
- Lit
- Alpine.js
- Stimulus
- Marko
- Fresh

---

## CMS

- WordPress
- Drupal
- Joomla
- Ghost
- TYPO3
- CraftCMS
- Payload CMS
- Strapi
- Directus
- Sanity
- Contentful
- Hygraph
- Prismic
- DatoCMS
- Storyblok
- ButterCMS
- Webflow
- Wix
- Squarespace
- Framer

---

## Ecommerce

- Shopify
- WooCommerce
- Magento
- BigCommerce
- OpenCart
- Prestashop
- Saleor
- CommerceTools
- Ecwid
- Snipcart

---

## Backend Frameworks

- Express
- NestJS
- Fastify
- Koa
- Hono
- AdonisJS
- Laravel
- Symfony
- CodeIgniter
- CakePHP
- Django
- Flask
- FastAPI
- Spring Boot
- ASP.NET
- Ruby on Rails
- Phoenix
- Fiber
- Gin
- Echo

---

## UI Libraries

- Tailwind CSS
- Bootstrap
- Material UI
- Ant Design
- Chakra UI
- Mantine
- Radix UI
- shadcn/ui
- DaisyUI
- Flowbite
- Semantic UI
- Bulma
- Foundation
- Vuetify
- PrimeReact
- PrimeVue
- Quasar

---

## Animation

- GSAP
- Framer Motion
- AOS
- AnimeJS
- Lottie
- Three.js
- Babylon.js
- PixiJS
- Matter.js
- Lenis
- Locomotive Scroll

---

## Build Tools

- Vite
- Webpack
- Turbopack
- Parcel
- Rollup
- Rspack
- SWC
- esbuild

---

## Programming Languages

- PHP
- JavaScript
- TypeScript
- Node.js
- Python
- Java
- Go
- Rust
- Ruby
- Bun
- Deno
- ASP.NET

---

## Hosting

- Vercel
- Netlify
- Cloudflare Pages
- Railway
- Render
- Fly.io
- Firebase Hosting
- GitHub Pages
- AWS Amplify
- Azure Static Web Apps

---

## CDN

- Cloudflare
- CloudFront
- Fastly
- Akamai
- Bunny CDN
- jsDelivr
- UNPKG

---

## Analytics

- Google Analytics
- Google Tag Manager
- Plausible
- Fathom
- Mixpanel
- PostHog
- Amplitude
- Segment
- Heap

---

## Monitoring

- Sentry
- LogRocket
- Bugsnag
- Datadog
- New Relic
- Raygun

---

## Authentication

- Clerk
- Auth0
- Firebase Auth
- Supabase Auth
- Okta
- Keycloak
- Stytch

---

## Payment

- Stripe
- Razorpay
- PayPal
- Paddle
- LemonSqueezy
- Adyen
- Braintree

---

## Database Services

- Firebase
- Supabase
- Appwrite
- MongoDB Atlas
- PlanetScale
- Neon
- Railway PostgreSQL

---

## Maps

- Google Maps
- Leaflet
- Mapbox
- OpenLayers

---

## Fonts & Icons

- Google Fonts
- Adobe Fonts
- Font Awesome
- Heroicons
- Lucide
- Material Icons

---

## AI

- OpenAI
- Anthropic
- Vercel AI SDK
- LangChain
- LlamaIndex
- Ollama

---

# Detection Signals

Each technology may be detected using one or more signal types.

| Signal | Description |
|---------|-------------|
| global | window globals |
| html | HTML markup |
| css | CSS source |
| js | JavaScript source |
| assetUrl | CSS/JS asset URLs |
| scriptSrc | External script URLs |
| inlineScript | Inline JavaScript |
| inlineStyle | Inline CSS |
| cookie | Cookie names |
| header | HTTP headers |
| meta | Meta tags |
| metaGenerator | Generator meta tag |
| bodyClass | HTML body classes |
| formAction | Form action URLs |
| apiEndpoint | API endpoints |
| url | Final page URL |
| iframe | Embedded iframe |
| manifest | Web App Manifest |
| serviceWorker | Registered Service Worker |
| robots | robots.txt |
| sitemap | sitemap.xml |
| dns | DNS records |

---

# Confidence Levels

| Score | Meaning |
|---------|----------|
| 100 | Official proof |
| 95 | Official marker |
| 90 | Strong evidence |
| 80 | Asset signature |
| 70 | Header/Cookie |
| 60 | CSS evidence |
| 50 | Weak evidence |
| 30 | Guess |

---

# Version Detection

Whenever possible extract version numbers.

Examples

```
WordPress 6.8.1
Next.js 15.4
Bootstrap 5.3
Angular 19
Laravel 12
Vue 3.5
Tailwind CSS 4.0
```

---

# Technology Implications

Automatically infer related technologies.

```
Next.js
 ├── React
 └── Node.js

Nuxt
 └── Vue

WooCommerce
 ├── WordPress
 └── PHP

Laravel
 └── PHP

FastAPI
 └── Python

NestJS
 ├── Node.js
 └── Express

Remix
 └── React

Shopify
 └── Liquid

Astro
 └── Vite
```

---

# Project Structure

```
rules/

frameworks.json
cms.json
ecommerce.json
backend.json
ui.json
animation.json
analytics.json
hosting.json
cdn.json
payment.json
monitoring.json
fonts.json
maps.json
languages.json
database.json
authentication.json
ai.json
build-tools.json
```

---

# Rule Format

```json
{
  "name": "Next.js",
  "category": "framework",

  "signals": [

    {
      "type": "global",
      "match": "__NEXT_DATA__",
      "confidence": 100
    },

    {
      "type": "assetUrl",
      "match": "/_next/",
      "confidence": 90
    }

  ],

  "implies": [
    "React",
    "Node.js"
  ]
}
```

---

# Detection Pipeline

```
Website

↓

Crawler

↓

HTML

↓

CSS

↓

JavaScript

↓

Headers

↓

Cookies

↓

Assets

↓

Rule Engine

↓

Technology Detection

↓

Version Extraction

↓

Implication Engine

↓

Confidence Ranking

↓

Final Report
```

---

# Future Improvements

- 1000+ technology rules
- Version extraction engine
- Rule validation tests
- False-positive detection
- AI-assisted confidence scoring
- Performance scoring
- Security headers detection
- SEO analyzer
- Lighthouse-style insights
- JavaScript framework hydration detection
- SSR vs CSR detection
- API framework detection
- Database inference
- Hosting inference
- CDN inference
- Reverse proxy detection
- Container platform detection
- Edge runtime detection
- Technology timeline
- Change detection across crawls

---

# Final Goal

Build the most accurate open-source website technology detection engine capable of identifying modern web stacks with transparent evidence, confidence scores, version extraction, and implied technologies.