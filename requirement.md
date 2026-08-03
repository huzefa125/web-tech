# Internet Intelligence Platform — Requirements Document

All-in-one website intelligence platform: tech stack detection, DNS/SSL, security headers,
performance, SEO, analytics, API discovery, competitor comparison, and AI-generated insights —
in a single dashboard.

Existing point solutions: BuiltWith, Wappalyzer, Similarweb, SecurityTrails, Shodan, Semrush.
**Differentiator:** no single product combines all of this *with AI insights* in one dashboard,
and none of them offer strong **historical intelligence** (see below).

---

## 1. Core Differentiator: Historical Intelligence

Today's tools only show current state. This product's biggest value-add is answering:

- "Pichhle 6 mahino me is website ne kaun-kaun si technologies change ki?"
- "SEO score kab improve hua?"
- "Kab Cloudflare se Fastly par migrate kiya?"
- "Kab SSL certificate rotate hua?"
- "Kab naye API endpoints add hue?"

Continuous, time-series intelligence (not a one-off snapshot) is what makes companies, agencies,
and security teams pay for a subscription instead of running a free scanner once.

---

## 2. Architecture

```
                    User
                      │
               Enter website
                      │
                 Backend API
                      │
     ┌──────────────┬──────────────┬──────────────┐
     │              │              │
 Website Scanner  API Scanner   DNS Scanner
     │              │              │
     └──────────────┴──────────────┘
                      │
           Data Aggregation Layer
                      │
             AI Analysis Engine
                      │
             PostgreSQL + Redis
                      │
               Frontend Dashboard
```

## 3. Tech Stack

> Authoritative stack lives in [techstack.md](techstack.md). This section is a summary.

**Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts / Apache ECharts

**Backend:** Node.js 24, Express 5, TypeScript, Zod, PostgreSQL 17, Drizzle ORM, Redis, BullMQ

**Crawling:** Playwright, Cheerio, undici, Node `dns/promises`

**Queue:** BullMQ + Redis

**Storage:** PostgreSQL, Cloudflare R2 (screenshots)

## 4. Database Tables (initial set)

`websites`, `scans`, `dns_records`, `technologies`, `security`, `performance`, `seo`, `headers`,
`ssl`, `screenshots`, `api_endpoints`, `analytics`, `recommendations`

## 5. Dashboard Sections

Overview · Technology · Performance · SEO · Security · DNS · SSL · Headers · Analytics · API ·
AI Summary · History

## 6. Monetization

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 5 scans/day |
| Pro | $19/month | Unlimited scans, AI insights, history, exports |
| Team | $99/month | Competitor monitoring, alerts, API access |
| Enterprise | Custom | SSO, custom integrations, scheduled reports |

---

## 7. Functional Modules (detailed)

### 1. Website Crawler
- **Input:** a domain, e.g. `nike.com`
- **Steps:** open website → download HTML → collect CSS → collect JS → take screenshot → save
- **Tooling:** Playwright

### 2. Technology Detector
- **Detects:** React, Next.js, Angular, Vue, Nuxt, Astro, Remix, Svelte, WordPress, Shopify,
  Magento, Laravel, Express, Django, Rails, ASP.NET, PHP, Java, Python, Node.js, Tailwind,
  Bootstrap, Material UI, Chakra UI, Styled Components, jQuery, GraphQL, REST, Redis,
  PostgreSQL, MongoDB, MySQL, Google Fonts
- **Detection methods:** HTML signatures, script URLs, meta tags, CSS classes, HTTP headers,
  JavaScript globals (e.g. `<script src="/_next/static/">` → Next.js)

### 3. Hosting Detector
- Vercel, Netlify, AWS, Azure, GCP, DigitalOcean, Render, Railway, Cloudflare Pages, Firebase Hosting

### 4. CDN Detector
- **Detects (via headers):** `cf-ray` → Cloudflare, CloudFront, Akamai, Fastly, Bunny, KeyCDN, StackPath
- **Shows:** POP, region, response time, cache status

### 5. DNS Scanner
- **Tooling:** Node `dns/promises`
- **Collects:** A, AAAA, MX, TXT, SPF, DKIM, DMARC, NS, SOA, CNAME, CAA, PTR
- **Displays:** mail/DNS provider (Cloudflare, Google Workspace, Microsoft 365, Zoho Mail)

### 6. SSL Scanner
- **Tooling:** Node TLS
- **Collects:** issuer, expiry, TLS version, cipher suite, certificate chain, OCSP, HSTS
- **Dashboard:** "Expires in 12 Days ⚠ Warning" style alerts

### 7. HTTP Header Scanner
- **Request:** `GET /`
- **Checks:** Server, X-Powered-By, Strict-Transport-Security, CSP, X-XSS-Protection,
  Permissions-Policy, Referrer-Policy, missing/weak/deprecated headers
- **AI:** flags e.g. "Missing CSP → Risk: High"

### 8. Security Scanner
- HTTPS enforcement, cookie flags (Secure/HttpOnly/SameSite), mixed content, directory listing,
  exposed `.git`, exposed `.env`, exposed backup files, exposed admin panels, robots.txt exposure

### 9. Performance Scanner
- **Tooling:** Lighthouse (desktop + mobile)
- **Metrics:** Performance, Accessibility, SEO, Best Practices scores; FCP, LCP, CLS, TBT, TTI,
  Speed Index, INP; improvement suggestions

### 10. SEO Scanner
- Title, meta description, canonical, robots, sitemap, OG tags, Twitter cards, JSON-LD/Schema,
  breadcrumbs, H1/H2/H3, image ALT text, broken links, redirects, internal/external links,
  indexability

### 11. Accessibility Scanner
- Contrast, form labels, keyboard navigation, ARIA, missing alt text, focus order, screen-reader issues

### 12. API Discovery
- **Probes:** `/api`, `/graphql`, `/openapi.json`, `/swagger`, `/v1`, `/v2`
- **JS inspection:** `fetch()`, `axios()`, XHR, WebSocket, SSE, hidden APIs

### 13. Analytics & Marketing Stack Detector
- **Analytics:** GA4, GTM, Mixpanel, Segment, Amplitude, Hotjar, Microsoft Clarity, Heap,
  Facebook Pixel, LinkedIn Pixel (detected via `gtag()`, `clarity()`, `mixpanel.init()`, etc.)
- **Marketing/support stack:** HubSpot, Intercom, Drift, Crisp, Zendesk, Tawk.to, Mailchimp,
  Klaviyo, Brevo

### 14. JavaScript & CSS Analysis
- Libraries used, bundle size, lazy loading, tree shaking, duplicate packages, dead code,
  unused CSS, large CSS, font loading, critical CSS

### 15. Images & Fonts
- Formats (WebP/AVIF), lazy loading, compression, responsive images; Google/Adobe/local fonts
  and load time

### 16. Cookies & Storage
- Every cookie (expiry, Secure, HttpOnly, SameSite), LocalStorage, SessionStorage, IndexedDB,
  Cache API

### 17. Network Waterfall
- Every request, size, latency, compression, caching, priority

### 18. Screenshot Engine
- **Tooling:** Playwright — desktop, tablet, mobile viewports
- **Storage:** S3/R2

### 19. WHOIS
- Registrar, registration date, expiry, nameservers

### 20. Company Intelligence
- Company name, industry, employee count, estimated revenue, HQ, funding, founders, LinkedIn,
  GitHub, careers page, open tech roles, hiring status

### 21. AI Analysis Engine
- Executive summary in plain language, e.g.:
  > "This website uses Next.js with Cloudflare CDN. Security score is 82%. Performance is low
  > because JavaScript payload exceeds 3MB. SEO issues: missing H2, no canonical, missing schema."
- Recommendations, e.g. enable Brotli, compress images, lazy loading
- Risk scoring across security/performance/SEO

### 22. AI Chat
- Conversational Q&A over a scan, e.g. "Why is this website slow?" → AI explains (large JS
  bundle, render-blocking CSS, no caching) → suggests fixes with code examples

### 23. Historical Tracking & Timeline
- Scheduled re-scans (daily/weekly/monthly)
- Tracks changes over time in: technologies, hosting, CDN, SSL, DNS, headers, SEO, performance, APIs

### 24. Alerts & Notifications
- Triggers: SSL expiring soon, technology stack changed, security regression
- Channels: Email, Slack, Discord, Microsoft Teams, Webhook, Telegram

### 25. Competitor Comparison & Monitoring
- Side-by-side compare (e.g. nike.com vs adidas.com) across tech, SEO, speed, security,
  framework, CDN, analytics, APIs
- Passive competitor monitoring, e.g.:
  - "Competitor migrated to Next.js"
  - "Competitor started using Cloudflare"
  - "Competitor removed Google Analytics"
  - "Competitor's SEO score increased"

### 26. Reports & Export
- PDF, Excel, CSV, JSON, API export

### 27. Team Features
- Organizations, teams, roles/permissions, shared reports, comments, audit logs

### 28. Public API & SDK
- REST API, SDK, webhooks, API keys, rate limiting

### 29. Enterprise Features
- SSO, SAML, SCIM, white-label, multi-region, on-prem deployment, audit logs, compliance dashboard

### 30. Admin Panel
- User management, subscription management, scan queue monitoring, worker status, AI usage,
  credits, billing, feature flags, system health, logs, platform analytics

---

## 8. Development Phases

### Phase 0 — Foundation (Week 1–2)
Groundwork that every later phase depends on.
- Repo setup: Next.js frontend + Express/TypeScript backend, monorepo structure
- PostgreSQL + Drizzle ORM schema for core tables (`websites`, `scans`, `technologies`, `dns_records`, `ssl`, `security`, `performance`, `seo`, `headers`, `screenshots`)
- Redis + BullMQ job queue wiring
- Auth — see [auth-requirements.md](auth-requirements.md): email/password + Google/GitHub OAuth, JWT sessions. API keys deferred to Phase 3.
- Cloudflare R2 bucket for screenshots
- CI/CD + basic deployment pipeline

### Phase 1 — MVP (Week 3–8)
Goal: something agencies, freelancers, and developers will actually pay for.
- Website Crawler (Playwright: HTML/CSS/JS/screenshot capture)
- Technology Detection (module 2)
- DNS Scanner + SSL Scanner (modules 5–6)
- HTTP Header Scanner + basic Security Scanner (modules 7–8)
- Performance Scanner via Lighthouse (module 9)
- SEO Scanner (module 10)
- AI Summary — single-shot executive summary + recommendations (module 21, non-conversational)
- Scan History (basic, no diffing yet)
- PDF Report Export
- Dashboard: Overview, Technology, Performance, SEO, Security, DNS, SSL, Headers tabs
- Monetization: Free tier (5 scans/day) + Pro tier ($19/mo) wired to billing

**MVP exit criteria:** a user can enter a domain, get a full one-time scan across the above
modules, read an AI summary, and export a PDF — end to end, no manual steps.

### Phase 2 — V1: Engagement & Depth (Week 9–14)
Goal: turn one-off scans into a reason to come back.
- CDN Detector + Hosting Detector (modules 3–4)
- API Discovery (module 12)
- Analytics & Marketing Stack Detector (module 13)
- JS/CSS Analysis, Images & Fonts, Cookies & Storage, Network Waterfall (modules 14–17)
- Accessibility Scanner (module 11)
- WHOIS (module 19)
- Historical Tracking: scheduled re-scans + change timeline (module 23) — **the core differentiator**
- Alerts: SSL expiry + tech-stack-change notifications via Email/Slack (module 24, partial)
- AI Chat over a completed scan (module 22)
- Excel/CSV/JSON export (module 26, partial)
- Dashboard: Analytics, API, AI Summary, History tabs

### Phase 3 — V2: Team & Competitive Intelligence (Week 15–20)
Goal: move upmarket from individual users to teams and agencies.
- Competitor Comparison (side-by-side) + passive Competitor Monitoring (module 25)
- Company Intelligence enrichment (module 20)
- Team Features: organizations, roles, shared reports, comments, audit logs (module 27)
- Full Alerts: Discord, Teams, Webhook, Telegram channels (module 24, complete)
- Public API + API keys + rate limiting (module 28, no SDK yet)
- Monetization: Team tier ($99/mo) with competitor monitoring + alerts + API access

### Phase 4 — Enterprise & Scale (Week 21+)
Goal: enterprise sales-readiness and platform hardening.
- SSO, SAML, SCIM, white-label, multi-region, on-prem deployment option (module 29)
- Compliance dashboard + full audit logging
- Official SDKs (module 28, complete)
- Admin Panel: user/subscription management, worker/queue monitoring, AI usage & credits,
  feature flags, system health, logs (module 30)
- Scheduled/automated reports for enterprise accounts
- Enterprise custom-pricing tier

---

## 9. Open Items / Future Exploration
- Competitor set / positioning deep-dive vs. BuiltWith, Wappalyzer, Similarweb, SecurityTrails, Shodan
- Detailed low-level system design (microservices boundaries, AI agent architecture)
- Full API documentation (REST endpoint spec)
- UI/UX wireframes per screen
- Week-by-week engineering plan within each phase above
- Testing strategy (unit/integration/e2e for scanners)
- Deployment architecture detail (AWS/Cloudflare/Docker/Kubernetes)
- Investor pitch deck



## 10. Entity Hierarchy

```
Users
│
├── Websites
│
├── Scans
│
├── Reports
│
└── Settings
```