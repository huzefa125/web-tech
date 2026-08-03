# Internet Intelligence Platform - Tech Stack

## Frontend
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Framer Motion
- Recharts / Apache ECharts

## Backend
- Node.js 24
- Express 5
- TypeScript
- Zod (validation)
- Drizzle ORM
- drizzle-kit (migrations)
- BullMQ
- Redis
- Pino (logging)

## Database
- PostgreSQL 17

## Web Crawling & Analysis
- Playwright
- BeautifulSoup4
- lxml
- aiohttp
- httpx
- dnspython

## Performance Analysis
- Lighthouse CLI
- Chrome DevTools Protocol

## AI
- Ollama (Development)
- OpenAI API (Production)
- LangChain
- Instructor
- tiktoken

## Background Jobs
- BullMQ
- Redis

## Authentication
Self-hosted in Express — no third-party auth provider. Full spec: [auth-requirements.md](auth-requirements.md)

- **jose** — JWT signing/verification (HS256)
- **@node-rs/argon2** — password hashing (Argon2id, native bindings)
- **arctic** — OAuth 2.0 / OIDC client for Google + GitHub, with PKCE
- **rate-limiter-flexible** — Redis-backed rate limiting on auth endpoints
- **Resend** — verification + password-reset email delivery
- Passkeys / WebAuthn (Phase 2+)
- API keys (Phase 3), SSO / SAML / SCIM (Phase 4)

## Storage
- Cloudflare R2
- Local Storage (Development)

## Reports
- ReportLab (PDF)
- Pandas
- OpenPyXL

## Search
- PostgreSQL Full Text Search
- pg_trgm

## Monitoring & Logging
- Sentry
- Logfire
- Structlog

## API Documentation
- OpenAPI
- Swagger UI
- ReDoc

## Testing
- Pytest
- Playwright
- Vitest
- React Testing Library

## DevOps
- Docker
- Docker Compose
- GitHub Actions

## Deployment
### Frontend
- Vercel

### Backend
- Railway / Hetzner VPS / Render

### Database
- Supabase PostgreSQL
- Neon PostgreSQL

### Cache
- Upstash Redis

## Package Managers
### Frontend
- npm

### Backend
- uv

## Code Quality
### Frontend
- ESLint
- Prettier

### Backend
- Ruff
- Black
- isort
- mypy

## UI Components
- shadcn/ui
- Radix UI
- Lucide Icons

## Charts
- Apache ECharts
- Recharts

## Email
- Resend

## Notifications
- Slack Webhooks
- Discord Webhooks
- Email Notifications

## Future Integrations
- VirusTotal
- WhoisXML API
- IPinfo
- DataForSEO
- SecurityTrails
- Similarweb