# Backend — Internet Intelligence Platform

Express 5 + TypeScript API. Phase 0 scope is authentication; see
[../auth-requirements.md](../auth-requirements.md) for the spec this implements.

## Requirements

- Node.js 22+ (developed on 24)
- PostgreSQL 17 and Redis for running the server (**not** needed to run tests — see below)

## Setup

```bash
npm install
cp .env.example .env        # then fill in JWT_SECRET at minimum
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Datastores

`docker compose up -d` from the repo root starts Postgres 17 and Redis.

> On Windows, Docker Desktop requires WSL2. If `wsl --status` reports it is not
> installed, either run `wsl --install` (needs admin + a reboot) or point
> `DATABASE_URL`/`REDIS_URL` at hosted instances (Neon/Supabase + Upstash).
> The test suite needs neither — it starts its own Postgres.

### Migrate and run

```bash
npm run db:migrate
npm run dev                 # http://localhost:8000
```

`db:migrate` creates the `citext` and `pgcrypto` extensions before applying
migrations, so it works on managed Postgres where the compose init script
never runs.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Watch-mode server via tsx |
| `npm run build` / `npm start` | Compile to `dist/`, run compiled output |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm test` | Full Vitest suite |
| `npm run test:coverage` | Suite + coverage report |
| `npm run typecheck` | `tsc --noEmit` over src and tests |

## Tests

`npm test` is self-contained: a global setup starts a real PostgreSQL 17 using
portable binaries (`embedded-postgres`) on port 55432, applies migrations, and
tears it down afterwards. No Docker, no admin rights, no manual database.

If something is already listening on 55432 (or `TEST_PG_PORT`), that server is
used instead — which is how CI service containers get picked up.

Redis is stubbed in-process (`ioredis-mock`); rate limiting and OAuth state are
its only consumers and both are covered by tests.

Current state: **126 tests passing, 87% line coverage.**

## Layout

```
src/
  config/env.ts          Zod-validated environment; process exits on bad config
  db/
    schema/auth.ts       Drizzle tables: users, oauth_accounts, refresh_tokens,
                         verification_tokens
    migrate.ts           Migration runner
  lib/
    crypto.ts            Argon2id hashing, opaque token generation
    jwt.ts               HS256 access tokens (jose)
    password-policy.ts   Length rules + HIBP k-anonymity breach check
    errors.ts            Typed AppError with stable machine-readable codes
    logger.ts            Pino with credential redaction
    redis.ts             Shared connection
  services/
    auth-service.ts      Signup, login, verification, reset, change password
    token-service.ts     Refresh rotation + reuse detection  ← security-critical
    oauth-service.ts     Google/GitHub, PKCE, account-linking rules
    email-service.ts     Resend; logs to console when unconfigured
  http/
    routes/auth.ts       All /api/v1/auth endpoints
    middleware/          requireAuth, rate limiting, error handler
    cookies.ts           Refresh-cookie attributes
  app.ts                 Express app (exported for supertest)
  server.ts              Entry point + graceful shutdown
```

## Notes for whoever picks this up next

- **Refresh rotation is strict.** Replaying a rotated token revokes the entire
  token family. Two genuinely concurrent refreshes from one client will trip
  this, so the frontend must share a single in-flight refresh promise
  (auth-requirements.md §7). Failing closed is deliberate.
- **Access tokens are not revocable.** A logged-out user's token stays valid
  for up to 15 minutes. Accepted tradeoff of stateless JWT (spec §3.3).
- **The `plan` claim is embedded in the JWT** so quota middleware needs no DB
  read. It can be up to 15 minutes stale after an upgrade.
- **OAuth auto-linking is refused on unverified provider emails** — that path
  is an account-takeover vector. Users are told to sign in with a password and
  link from settings instead.
- `npm audit` reports dev-only advisories via drizzle-kit's esbuild and
  vitest's coverage tooling. Nothing in the runtime dependency tree.
