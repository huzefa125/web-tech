/**
 * Environment configuration.
 *
 * Every secret comes from the environment and is validated here at import time.
 * A missing or malformed value crashes the process on boot rather than failing
 * mysteriously on the first request that needs it.
 */

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const csv = (v: unknown) =>
  typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;

const envSchema = z.object({
  // ---- App ----------------------------------------------------------
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  API_V1_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // ---- Datastores ---------------------------------------------------
  DATABASE_URL: z.string().startsWith('postgres'),
  REDIS_URL: z.string().startsWith('redis'),

  // ---- JWT ----------------------------------------------------------
  // 32 bytes minimum: HS256's security is bounded by the key length.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // ---- Cookies ------------------------------------------------------
  // Set COOKIE_DOMAIN to the shared parent ('.example.com') so app.* and api.*
  // can use SameSite=Lax. Leave unset for localhost.
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // ---- URLs ---------------------------------------------------------
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  BACKEND_URL: z.url().default('http://localhost:8000'),
  CORS_ORIGINS: z.preprocess(csv, z.array(z.string())).default(['http://localhost:3000']),

  // ---- OAuth --------------------------------------------------------
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // ---- Email --------------------------------------------------------
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Internet Intelligence <noreply@example.com>'),

  // ---- Storage ------------------------------------------------------
  // Captured HTML/CSS/JS and screenshots. Local disk in dev; R2 in production
  // once the bucket exists — see src/lib/storage.ts.
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./.storage'),

  // ---- Crawler (module 1) -------------------------------------------
  CRAWLER_NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CRAWLER_ASSET_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** Per-scan cap on stored CSS/JS files. Some sites ship hundreds. */
  CRAWLER_MAX_ASSETS: z.coerce.number().int().positive().default(50),
  /** Per-asset byte cap; anything larger is recorded but not stored. */
  CRAWLER_MAX_ASSET_BYTES: z.coerce.number().int().positive().default(5_000_000),
  CRAWLER_VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1440),
  CRAWLER_VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(900),
  CRAWLER_USER_AGENT: z
    .string()
    .default(
      'Mozilla/5.0 (compatible; IIPBot/0.1; +https://example.com/bot) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    ),

  // ---- Queue --------------------------------------------------------
  SCAN_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  SCAN_JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // ---- Quotas (§6) --------------------------------------------------
  FREE_SCANS_PER_DAY: z.coerce.number().int().positive().default(5),

  // ---- Security policy ----------------------------------------------
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
  HIBP_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  HIBP_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(10),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().positive().default(24),
  PASSWORD_RESET_TTL_HOURS: z.coerce.number().int().positive().default(1),
  RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Deliberately console.error, not the logger: the logger depends on this module.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const githubOAuthConfigured = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

/** Name of the refresh cookie. Path is scoped so it is not sent to every route. */
export const REFRESH_COOKIE_NAME = 'iip_refresh';
export const REFRESH_COOKIE_PATH = `${env.API_V1_PREFIX}/auth`;
