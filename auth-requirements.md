# Authentication — Requirements

Phase 0 deliverable. Self-hosted in Express; no third-party auth provider.

**In scope (Phase 0):** email/password signup + login, email verification, password reset,
Google + GitHub OAuth, JWT sessions, logout, account linking.

**Deferred:** API keys (Phase 3), organizations/roles (Phase 3), passkeys (Phase 2+),
SSO / SAML / SCIM (Phase 4), 2FA/TOTP (Phase 2+).

---

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Provider | Self-hosted Express | Own the identity data; no per-MAU cost; Phase 3/4 org + SSO work needs full control |
| Password hashing | Argon2id (`@node-rs/argon2`) | OWASP-recommended; bcrypt's 72-byte truncation is a real footgun. Native bindings, no node-gyp build step |
| Session transport | Short-lived access JWT + rotating refresh cookie | See §3 — the important one |
| Access token lifetime | 15 minutes | Short enough that revocation lag is tolerable without a DB check per request |
| Refresh token lifetime | 30 days, sliding | Balance between "stay logged in" and blast radius |
| JWT algorithm | HS256 (`jose`) | Single backend service; asymmetric (RS256) only becomes worth it at Phase 4 multi-service |
| OAuth client | `arctic` | Handles PKCE, state, and token exchange for both Google and GitHub without the OIDC-library weight |
| Validation | Zod | Shared schema shapes with the React Hook Form frontend |

### Domain layout (required for the cookie strategy to work)

Frontend on Vercel and backend on Railway are **different registrable domains**, which forces
`SameSite=None` on the refresh cookie — weaker CSRF posture and blocked by some privacy browsers.

**Requirement:** put both on the same parent domain from day one:

```
app.<product>.com   → Next.js (Vercel)
api.<product>.com   → FastAPI (Railway)
```

Cookie is then set with `Domain=.<product>.com; SameSite=Lax`, which is the safe default.

---

## 2. Data Model

Four new tables. Alembic migration `0001_auth`.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `email` | `citext` UNIQUE NOT NULL | case-insensitive; requires `CREATE EXTENSION citext` |
| `email_verified_at` | `timestamptz` NULL | NULL = unverified |
| `password_hash` | `text` NULL | NULL for OAuth-only accounts — see §5.3 |
| `full_name` | `text` NULL | |
| `avatar_url` | `text` NULL | |
| `plan` | `text` NOT NULL DEFAULT `'free'` | `free` \| `pro` \| `team` \| `enterprise` |
| `status` | `text` NOT NULL DEFAULT `'active'` | `active` \| `suspended` \| `deleted` |
| `created_at` / `updated_at` | `timestamptz` NOT NULL | |
| `last_login_at` | `timestamptz` NULL | |

`plan` lives here so Phase 1 quota enforcement can read it off the authenticated user with no join.

### `oauth_accounts`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` ON DELETE CASCADE | |
| `provider` | `text` NOT NULL | `google` \| `github` |
| `provider_account_id` | `text` NOT NULL | the provider's stable user id — **not** the email |
| `created_at` | `timestamptz` NOT NULL | |

UNIQUE `(provider, provider_account_id)`. One user may have both providers linked.

> Match on `provider_account_id`, never on email — emails at both Google and GitHub are mutable.

### `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` ON DELETE CASCADE | |
| `token_hash` | `text` NOT NULL | SHA-256 of the raw token; raw value never stored |
| `family_id` | `uuid` NOT NULL | rotation lineage — see §3.2 |
| `expires_at` | `timestamptz` NOT NULL | |
| `revoked_at` | `timestamptz` NULL | |
| `user_agent` / `ip` | `text` NULL | for the "active sessions" UI |
| `created_at` | `timestamptz` NOT NULL | |

INDEX on `token_hash`, INDEX on `(user_id, revoked_at)`.

### `verification_tokens`
Single table for both email-verification and password-reset flows.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` ON DELETE CASCADE | |
| `token_hash` | `text` NOT NULL UNIQUE | SHA-256; raw token only ever exists in the email |
| `purpose` | `text` NOT NULL | `email_verify` \| `password_reset` |
| `expires_at` | `timestamptz` NOT NULL | 24h verify / 1h reset |
| `used_at` | `timestamptz` NULL | single-use enforcement |

---

## 3. Session Strategy

### 3.1 Token split

- **Access token** — JWT, 15 min, returned in the JSON response body. Frontend holds it **in
  memory only** (Zustand, non-persisted). Sent as `Authorization: Bearer <token>`.
- **Refresh token** — opaque 32-byte random string, 30 days, delivered as
  `HttpOnly; Secure; SameSite=Lax; Domain=.<product>.com; Path=/auth`.

Rationale: access token in memory means XSS can't read it from `localStorage`; refresh token in an
`HttpOnly` cookie means JS can't read it at all. Access token is never persisted, so a page reload
silently calls `/auth/refresh` to get a new one.

**Access token claims:**
```json
{ "sub": "<user uuid>", "email": "...", "plan": "free", "iat": …, "exp": …, "jti": "<uuid>" }
```
`plan` is embedded so quota middleware needs no DB read — accepted staleness is ≤15 min, which is
fine for an upgrade (users get their new limit within a refresh cycle).

### 3.2 Refresh rotation + reuse detection

Every `/auth/refresh` call issues a **new** refresh token and revokes the presented one, keeping the
same `family_id`.

If an **already-revoked** token from a family is presented, that means the token was stolen and
replayed. **Revoke the entire family** and force re-login. This is the single most important
security behaviour in this spec — implement it in Phase 0, not later.

### 3.3 Logout

- `POST /auth/logout` — revoke the presented refresh token, clear the cookie.
- `POST /auth/logout-all` — revoke every non-revoked `refresh_tokens` row for the user.

Access tokens are **not** revocable (that's the tradeoff of stateless JWT). A logged-out user's
access token stays valid ≤15 min. Acceptable for Phase 0.

---

## 4. API Surface

All under `/api/v1/auth`.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/signup` | `email`, `password`, `full_name?` | `201` + user; sends verification email |
| `POST` | `/login` | `email`, `password` | `200` + access token + sets refresh cookie |
| `POST` | `/refresh` | — (cookie) | `200` + new access token + rotated cookie |
| `POST` | `/logout` | — (cookie) | `204` |
| `POST` | `/logout-all` | — (bearer) | `204` |
| `GET` | `/me` | — (bearer) | `200` + current user |
| `PATCH` | `/me` | `full_name?`, `avatar_url?` | `200` + updated user |
| `POST` | `/verify-email` | `token` | `204` |
| `POST` | `/verify-email/resend` | `email` | `202` |
| `POST` | `/password/forgot` | `email` | `202` (always) |
| `POST` | `/password/reset` | `token`, `new_password` | `204`; revokes all sessions |
| `POST` | `/password/change` | `current_password`, `new_password` (bearer) | `204`; revokes other sessions |
| `GET` | `/oauth/{provider}` | — | `302` to provider |
| `GET` | `/oauth/{provider}/callback` | `code`, `state` | `302` to frontend + sets refresh cookie |
| `GET` | `/sessions` | — (bearer) | `200` + active refresh tokens |
| `DELETE` | `/sessions/{id}` | — (bearer) | `204` |

### Enumeration safety
`/signup`, `/password/forgot`, and `/verify-email/resend` **must** return the same response whether
or not the email exists. Otherwise they become a user-enumeration oracle. `/signup` on an existing
email sends a "someone tried to sign up with your email" notice instead of erroring.

---

## 5. Flows

### 5.1 Email signup
1. Validate — email format (Zod `z.email()`), password against §6 policy.
2. Hash with Argon2id. Insert `users` row, `email_verified_at = NULL`.
3. Generate 32-byte token, store SHA-256 in `verification_tokens` (24h, `email_verify`).
4. Send via Resend: `https://app.<product>.com/verify?token=<raw>`.
5. Return `201`. **No session issued** — user must verify first.

### 5.2 Login
1. Look up by email. **Always run the Argon2 verify**, even when no user exists (against a dummy
   hash) — otherwise response timing leaks whether the account exists.
2. Reject if `status != 'active'`.
3. Reject if `email_verified_at IS NULL` → `403 EMAIL_NOT_VERIFIED` (frontend offers "resend").
4. Issue access token + refresh token (new `family_id`). Update `last_login_at`.

### 5.3 OAuth (Google / GitHub)
1. `GET /oauth/{provider}` — generate `state` (CSRF) + PKCE `code_verifier`, store both in Redis
   keyed by `state` with 10 min TTL. Redirect to provider.
2. Callback — validate `state` against Redis (reject if missing/expired), exchange code, fetch
   profile.
3. Resolve the account, in this order:
   - `oauth_accounts` row matching `(provider, provider_account_id)` → log that user in.
   - Else a `users` row with that email:
     - **and the provider says the email is verified** (`email_verified` for Google,
       a *primary + verified* email from GitHub's `/user/emails`) → link: insert `oauth_accounts`,
       log in.
     - **and it is not verified by the provider** → refuse to auto-link. Return an error telling the
       user to log in with their password and link the account from settings. Auto-linking on an
       unverified provider email is an account-takeover vector.
   - Else → create a new `users` row with `email_verified_at = now()`, `password_hash = NULL`.
4. Set refresh cookie, redirect to `https://app.<product>.com/auth/callback`.

> GitHub does not return an email in the `/user` payload when the user has it set to private —
> always call `GET /user/emails` and pick the primary verified one. If none exists, fail with a
> clear message.

### 5.4 Password reset
1. `/password/forgot` — always `202`. If the user exists, create a 1h single-use `password_reset`
   token and email it.
2. `/password/reset` — validate hash, expiry, and `used_at IS NULL`. Set new hash, mark used,
   **revoke every refresh token for the user**, set `email_verified_at = now()` if still NULL
   (control of the inbox is proven).

### 5.5 Users with no password
An OAuth-created user has `password_hash = NULL`. `/login` for them returns
`403 PASSWORD_NOT_SET` naming the linked provider. They can set a password via the
`/password/forgot` flow.

---

## 6. Security Requirements

**Password policy** — min 12 chars, no composition rules (NIST SP 800-63B), rejected if it appears
in the HaveIBeenPwned k-anonymity range API (fail-open if the API is unreachable — never block
signup on a third-party outage).

**Rate limits** (`rate-limiter-flexible` on Redis, keyed by IP **and** by email where applicable):

| Endpoint | Limit |
|---|---|
| `/login` | 5 / 15 min per email + 20 / 15 min per IP |
| `/signup` | 3 / hour per IP |
| `/password/forgot` | 3 / hour per email |
| `/verify-email/resend` | 3 / hour per email |
| `/refresh` | 60 / hour per user |

**Account lockout** — after 10 consecutive failed logins, soft-lock the account for 15 min and email
the user. Never a permanent lock (that's a denial-of-service against your own users).

**Secrets** — `JWT_SECRET` (min 32 bytes), OAuth client secrets, and `RESEND_API_KEY` come from env
only. Never committed; validated at startup by a Zod env schema so the process refuses to boot if
any are missing or malformed.

**Transport** — HTTPS enforced; HSTS on the API (`helmet`). CORS `origin` is an explicit list
(`https://app.<product>.com`), never `*`, with `credentials: true`.

**Logging** — never log passwords, raw tokens, or `Authorization` headers. Pino `redact` paths must
cover these keys. Log auth *events* (login success/fail, reset requested, family revoked) with
`user_id` for the Phase 3 audit trail.

---

## 7. Frontend Integration

- **Route protection** — Next.js middleware checks for the refresh cookie's presence to gate
  `/dashboard/*`. Presence is a UX hint only; the API is the real authority on every request.
- **Token refresh** — a single TanStack Query / axios response interceptor catches `401`, calls
  `/auth/refresh` once, retries the original request. Concurrent 401s must share **one** in-flight
  refresh promise, or rotation will revoke a family and log the user out spuriously. This is the
  most common bug in this design — cover it with a test.
- **State** — Zustand store holding `{ user, accessToken }`, **not** persisted to localStorage. On
  app mount, call `/auth/refresh`; on failure, treat as logged out.
- **Forms** — React Hook Form + Zod, importing the password schema directly from the backend's
  shared validation module so the two cannot drift.

---

## 8. Acceptance Criteria

Phase 0 auth is done when:

1. A user signs up, receives a verification email, verifies, logs in, and reaches the dashboard.
2. An unverified user is blocked at login with an actionable "resend" path.
3. Google and GitHub login both work, and a second provider links to the same account when the
   provider email is verified.
4. A page refresh keeps the user logged in without re-entering credentials.
5. Password reset works and invalidates all existing sessions.
6. A replayed (already-rotated) refresh token revokes the whole family and forces re-login —
   **covered by an automated test**.
7. Rate limits return `429` with `Retry-After` and are covered by tests.
8. `/login` response time is statistically indistinguishable between existing and non-existing
   emails.
9. Vitest coverage ≥85% on the auth module; every flow in §5 has an integration test.

---

## 9. Open Questions

- **Session count cap** — limit concurrent sessions per user? Suggest no cap for Phase 0, revisit
  if refresh-token table growth becomes an issue.
- **Cleanup job** — expired `refresh_tokens` / `verification_tokens` need a daily Celery beat task.
  Trivial, but must not be forgotten or the tables grow unbounded.
- **Plan claim staleness** — if a Stripe upgrade should apply instantly rather than within 15 min,
  we need a Redis `plan_version` check in the auth dependency. Deferred until billing lands.
