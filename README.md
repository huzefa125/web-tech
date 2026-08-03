# Internet Intelligence Platform

Enter a domain. The platform opens it in a real browser, captures what it is
made of, and tells you what it is built with.

The long-term goal is historical intelligence — not just "this site uses
Next.js" but "this site moved from WordPress to Next.js on 12 March". That is
why nothing here ever overwrites a previous scan: every run appends, so two
scans of the same site can be diffed later.

Full requirements: [requirement.md](requirement.md) ·
Auth spec: [auth-requirements.md](auth-requirements.md)

---

## What works today

| Module | Status |
|---|---|
| **Auth** — email/password, Google & GitHub OAuth, JWT sessions, rotating refresh tokens | ✅ Built |
| **Module 1 — Website Crawler** — Playwright captures HTML, CSS, JS and a screenshot | ✅ Built |
| **Module 2 — Technology Detector** — 102 rules across 13 categories | ✅ Built |
| Modules 3–4 — Hosting & CDN detection | ✅ Folded into module 2 |
| Modules 5–30 — DNS, SSL, security, performance, SEO, AI analysis, … | ⬜ Not started |

279 tests, all passing.

---

## Tech stack

The stack that is **actually running**. Note that [techstack.md](techstack.md)
still lists Python tooling for the backend (BeautifulSoup, httpx, Pytest, Ruff,
`uv`) — that document is out of date; the backend is TypeScript throughout and
uses the Node equivalents below.

### Backend

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 24, TypeScript, ES modules | |
| HTTP | Express 5 | Async rejections reach the error handler without try/catch in every route |
| Database | PostgreSQL 17 + Drizzle ORM | Typed schema, SQL you can actually read |
| Migrations | drizzle-kit | |
| Cache / queue | Redis + BullMQ | |
| Browser automation | Playwright (Chromium) | Captures the page *after* scripts run, which is what client-rendered frameworks require |
| HTML parsing | Cheerio | |
| Validation | Zod | Same schemas shared with the frontend |
| Password hashing | Argon2id (`@node-rs/argon2`) | OWASP recommendation; bcrypt's 72-byte truncation is a real footgun |
| JWT | `jose` (HS256) | |
| OAuth | `arctic` | PKCE and token exchange for Google + GitHub without OIDC-library weight |
| Rate limiting | `rate-limiter-flexible` on Redis | |
| Email | Resend | Logs to console when unconfigured |
| Logging | Pino | |
| Tests | Vitest + Supertest + embedded-postgres | Real Postgres, no Docker required |

### Frontend

Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui (radix-nova),
Aceternity UI, TanStack Query, Zustand, React Hook Form.

---

## Architecture

```
Browser ──► Next.js (:3001)
                │  bearer token in memory + HttpOnly refresh cookie
                ▼
           Express API (:8000)
                │
       ┌────────┴─────────┐
       ▼                  ▼
   PostgreSQL      BullMQ queue (Redis)
                          │
                          ▼
                   Scan worker  ──►  Playwright / Chromium
                          │
                   ┌──────┴──────┐
                   ▼             ▼
             Detection      Object storage
             engine         (local disk / R2)
```

**Why the worker is a separate process.** A Playwright run takes seconds to
tens of seconds and is memory-hungry. Holding an HTTP request open for it would
tie up a connection and time out behind most proxies, and a crashed renderer
would take the API down with it. `POST /scans` returns `202` immediately; the
UI polls.

---

## How a scan works

1. **`POST /scans`** — the URL is normalised (`nike.com` → `https://nike.com/`)
   and resolved. Every address it resolves to must be publicly routable; see
   *SSRF* below. A `websites` row is found or created, a `scans` row is written
   as `queued`, and a job is pushed to BullMQ using the scan id as the job id —
   which makes enqueueing idempotent.

2. **The worker crawls.** One Chromium is shared process-wide; each scan gets a
   fresh incognito context, so scans cannot see each other's cookies or cache.
   Navigation waits for `networkidle`. As responses arrive, CSS and JS bodies
   are collected — read at response time rather than re-fetched, so what is
   stored is exactly what the page received.

3. **Artefacts are persisted.** Bytes go to object storage under
   `scans/<scan-id>/…`; rows hold metadata, a storage key, and a SHA-256. The
   digest is what will make timeline diffing cheap: a later scan can see a file
   is byte-identical without re-reading it.

4. **Detection runs.** See below.

5. **The row settles** to `succeeded` or `failed`. A failed crawl still records
   a stable `errorCode` the frontend can branch on.

---

## The detection engine

`backend/src/services/detectors/` — **every rule is listed in
[detectors/README.md](backend/src/services/detectors/README.md)**, generated from the
rule set itself so the documentation cannot drift from the code.

Detection is a **pure function** over captured data — no database, no network,
no browser. That is deliberate: it means the rule set can be tested against
fixtures instead of against live sites that redesign under the test, and it
means a new rule can eventually be replayed over old scans to answer "when did
this site start using X?" without re-crawling.

### Six signal kinds

| Signal | Looks at | Example |
|---|---|---|
| `global` | Names on `window` | `__NEXT_DATA__` → Next.js |
| `cookie` | Cookie **names** | `PHPSESSID` → PHP |
| `header` | One response header | `cf-ray` → Cloudflare |
| `assetUrl` | URLs of loaded CSS/JS | `/_astro/` → Astro |
| `html` / `css` / `js` | Captured bodies | `--tw-ring-offset-shadow` → Tailwind |
| `url` | The final URL | `/default.aspx` → ASP.NET |

Globals and cookie names are matched **whole**, never as substrings — matching
`$` as a substring would fire half the library rules on every page.

### Confidence is reported, not hidden

Evidence genuinely differs in strength, so the UI says which it is:

| Label | Score | Means |
|---|---|---|
| **Confirmed** | ≥ 90 | The site told us outright — a framework's own global or data blob |
| **Likely** | 70–89 | A signature only that technology produces |
| **Possible** | < 70 | A hint worth showing but not relying on |

A `__NEXT_DATA__` global is proof. A class list that *looks* like Tailwind is a
guess — both are reported, labelled differently. Every detection carries its
evidence strings ("generator meta names WordPress · Loads assets from
`/wp-content/`") so a wrong call is explicable rather than mysterious.

### `implies`

A page can be unmistakably Next.js without ever naming React. Rules declare
what they necessarily bring with them, and the engine fills those in at
confidence 70 — unless direct evidence already found them, which always wins.

```
Next.js ──► React, Node.js
WooCommerce ──► WordPress ──► PHP
Vanta.js ──► Three.js
```

### Coverage (102 rules)

Frameworks · static site generators · CMS · ecommerce · UI kits ·
**animation & 3D** · libraries · languages & runtimes · web servers · hosting ·
CDN · analytics · fonts

Backend detection leans hardest on **cookie names**. A CDN routinely strips
`Server` and `X-Powered-By`, but a session cookie has to reach the browser or
the application cannot function — which makes `PHPSESSID`, `JSESSIONID`,
`connect.sid`, `laravel_session` and friends the last reliable evidence on most
production sites.

---

## Security

**SSRF is the central risk** and is handled in `backend/src/lib/scan-target.ts`.
"Fetch the URL the user gave us" is a server-side request forgery primitive: the
backend can reach the Postgres and Redis containers beside it, the Docker bridge
network, and — on every major cloud — the instance metadata endpoint at
`169.254.169.254`, which hands out credentials to anyone who asks.

So resolution happens before the browser is ever opened. The URL is parsed, DNS
is resolved by us, and **every** address it resolves to must be publicly
routable. Loopback, RFC1918, link-local, CGNAT, unique-local IPv6 and
IPv4-mapped forms of all of those are refused. One private answer is enough to
reject the whole host — that is exactly the shape a DNS rebinding attack takes.

> There is a residual TOCTOU: DNS could change between our check and Chromium's
> own lookup. Closing that properly means pinning the connection to the checked
> address, which Playwright does not expose. The practical mitigation is to run
> the worker in a network namespace with no route to private ranges; this check
> is the in-process half of that defence, not the whole of it.

Other properties, all covered by tests:

- Access token in memory only (never `localStorage`); refresh token in an
  `HttpOnly` cookie scoped to the auth path.
- Refresh rotation with **reuse detection** — replaying an already-rotated token
  revokes the entire token family.
- Enumeration-safe `/signup`, `/password/forgot` and `/verify-email/resend`:
  identical responses whether or not the address exists.
- Constant-time login: Argon2 runs against a dummy hash even when no user
  exists, so response timing is not an oracle.
- OAuth refuses to auto-link on an unverified provider email — that is an
  account-takeover vector.
- Scans are scoped to their owner, and another user's scan `404`s rather than
  `403`s, since a `403` would confirm the id is real.

---

## Running it

### Prerequisites

- Node.js ≥ 22
- Docker Desktop **or** the no-Docker path below

### 1. Datastores

**With Docker** (preferred):

```bash
docker compose up -d
```

**Without Docker.** Docker Desktop on Windows needs WSL2, which needs
virtualisation enabled in firmware. If that is off, `docker info` fails and no
amount of restarting helps. Use the portable path instead:

```bash
cd backend
npm run db:dev        # real PostgreSQL 17, no Docker, no admin rights
```

There is no equivalent for Redis, so set `SCAN_QUEUE_DRIVER=inline` (below).

### 2. Backend

```bash
cd backend
npm install
npx playwright install chromium     # ~150 MB, once
cp .env.example .env                # then fill in JWT_SECRET
npm run db:migrate
npm run dev                         # API on :8000
npm run worker                      # scan worker (skip if using the inline driver)
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local
npm run dev                         # :3000
```

If the frontend lands on a different port, update `FRONTEND_URL` and
`CORS_ORIGINS` in `backend/.env` to match, or CORS will reject the browser.

---

## Configuration

Everything is validated by a Zod schema at import time — the process refuses to
boot on a missing or malformed value rather than failing on the first request
that needs it. Full list in [`backend/.env.example`](backend/.env.example).

The ones worth knowing:

| Variable | Default | Notes |
|---|---|---|
| `SCAN_QUEUE_DRIVER` | `redis` | `inline` runs the crawl in the API process — no retries, no durability, no backpressure. Refuses to boot under `NODE_ENV=production`. |
| `STORAGE_DRIVER` | `local` | `r2` is **not implemented yet** and throws on startup rather than silently writing to an ephemeral container disk |
| `FREE_SCANS_PER_DAY` | `5` | Free tier cap. Failed scans count — otherwise the limit is evaded by scanning addresses that always fail |
| `CRAWLER_NAV_TIMEOUT_MS` | `30000` | |
| `CRAWLER_MAX_ASSETS` | `50` | Some sites ship hundreds of files |
| `RATE_LIMIT_ENABLED` | `true` | Needs Redis |

---

## API

All under `/api/v1`. Errors share one shape:
`{ "error": { "code": "…", "message": "…" } }`.

### Scans — bearer token required

| Method | Path | Returns |
|---|---|---|
| `POST` | `/scans` | `202` + queued scan |
| `GET` | `/scans` | Your scans, newest first (`?limit`, `?offset`) |
| `GET` | `/scans/quota` | Plan, used, remaining |
| `GET` | `/scans/:id` | Full detail: status, headers, assets, **technologies** |
| `GET` | `/scans/:id/screenshot` | PNG bytes |

### Auth

`POST /auth/signup` · `login` · `refresh` · `logout` · `logout-all` ·
`verify-email` · `verify-email/resend` · `password/forgot` · `password/reset` ·
`password/change` — plus `GET|PATCH /auth/me`, `GET /auth/sessions`,
`DELETE /auth/sessions/:id`, and `GET /auth/oauth/:provider[/callback]`.

---

## Project layout

```
backend/
  drizzle/                  SQL migrations (checked in, never edited by hand)
  scripts/
    dev-postgres.ts         Docker-free PostgreSQL for development
    init-extensions.sql     citext + pgcrypto, mounted by docker-compose
  src/
    config/env.ts           Zod-validated environment; exits on bad config
    db/schema/              auth.ts · scans.ts
    http/
      middleware/           authenticate · rate-limit · error-handler
      routes/               auth.ts · scans.ts
    lib/
      scan-target.ts        URL normalisation + the SSRF guard
      storage.ts            Object storage behind one interface
      crypto.ts jwt.ts      Argon2id, opaque tokens, HS256
    services/
      crawler.ts            Playwright capture (module 1)
      detectors/            Detection engine (module 2)
      scan-service.ts       Scan lifecycle
      auth-service.ts       token-service.ts  oauth-service.ts
    queue/  workers/        BullMQ producer and consumer
  tests/                    15 files, 279 tests
frontend/
  src/app/(auth)/           login · signup · verify · forgot · reset
  src/app/(dashboard)/      dashboard · scans/[id]
  src/components/           technology-list · scan-screenshot · ui/
  src/lib/api.ts            Typed client with single in-flight refresh
```

---

## Tests

```bash
cd backend
npm test              # 279 tests
npm run test:coverage
```

The suite starts a real PostgreSQL 17 via `embedded-postgres` — no Docker, no
service container, works on a fresh checkout. Redis is stubbed in-memory.

Two conventions worth preserving:

- **The detector suite never touches the network.** A test asserting
  "nike.com uses React" starts failing the day nike.com redesigns, which says
  nothing about our code. Rules are tested against fixture inputs.
- **The crawler suite drives a real Chromium against a loopback fixture
  server.** `crawlTarget` exists as a seam for exactly this, because `crawl`
  runs the SSRF guard and refuses loopback — correctly, and it should keep
  refusing.

---

## Known gaps

- **`STORAGE_DRIVER=r2` is unimplemented.** No bucket exists yet, and a driver
  that cannot be exercised is a driver that is wrong. It throws on startup.
- **OAuth login CSRF.** The `state` parameter lives in Redis but is not bound to
  the browser that started the flow, so a victim can be induced to complete an
  attacker's callback. The fix is a short-lived `HttpOnly` state cookie.
- **No account-linking endpoint.** `OAUTH_LINK_REQUIRED` tells users to link the
  provider from settings, but no such endpoint exists.
- **`npm run lint` does not work** — the script calls ESLint, which is not in
  `devDependencies`.
- **No cleanup job.** `pruneExpiredTokens` exists but nothing schedules it.
- **`techstack.md` is out of date** for the backend (see *Tech stack* above).

---

## A note on Windows

Two problems surfaced on Windows that are worth writing down, because both were
invisible until a real site tripped them.

**`initdb` inherits the system locale.** That produced a **WIN1252** cluster,
which rejects anything outside Latin-1. `wordpress.org` serves an `x-olaf: ⛄`
header — a long-standing joke of theirs — and storing it failed outright.
`dev-postgres.ts` and the test setup now both pass `--encoding=UTF8`, matching
what the `postgres:17-alpine` image already did.

**An error handler can fail the same way as the thing it is reporting.**
Recording that failure meant writing the error message, which *quoted the
snowman back*, so the write rejecting the character could not be stored either.
The scan wedged in `running` forever with no error and no way to retry. The
failure path now truncates the message and falls back to one built from nothing
but our own constants.
