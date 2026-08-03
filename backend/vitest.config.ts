import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Redis is not needed for correctness here — rate limiting is disabled in
    // tests and OAuth state is its only other consumer — so tests run against
    // an in-memory stub rather than requiring a live server.
    alias: { ioredis: resolve(here, 'tests/ioredis-shim.ts') },
    // Auth tests share one database; running files in parallel would let one
    // file's truncate wipe another's fixtures mid-test.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:55432/iip_test',
      REDIS_URL: 'redis://localhost:6379/1',
      JWT_SECRET: 'test_secret_at_least_32_characters_long_for_hs256!!',
      COOKIE_SECURE: 'false',
      // Off by default so tests don't hit the network or trip limits; the
      // suites that exercise them turn them back on explicitly.
      HIBP_ENABLED: 'false',
      RATE_LIMIT_ENABLED: 'false',
      FRONTEND_URL: 'http://localhost:3000',
      BACKEND_URL: 'http://localhost:8000',
      LOG_LEVEL: 'silent',
      // The crawler suite drives a fixture server on loopback, so the
      // production 30s navigation budget only makes the timeout case slow.
      CRAWLER_NAV_TIMEOUT_MS: '3000',
      STORAGE_LOCAL_ROOT: './.storage-test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/migrate.ts', 'src/**/*.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
