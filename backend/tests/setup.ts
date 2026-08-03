/**
 * Test bootstrap: create the test database if needed, apply migrations once,
 * and truncate between tests so each one starts from a clean slate.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll } from 'vitest';

const TEST_DB_URL = process.env.DATABASE_URL!;
const dbName = new URL(TEST_DB_URL).pathname.slice(1);
const adminUrl = new URL(TEST_DB_URL);
adminUrl.pathname = '/postgres';

beforeAll(async () => {
  // Create the test database if this is a fresh checkout.
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  // onnotice: idempotent DDL below emits "already exists" NOTICEs on every
  // run, which would bury the actual test output.
  const client = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe('CREATE EXTENSION IF NOT EXISTS citext');
    await client.unsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  } finally {
    await client.end();
  }
});

afterEach(async () => {
  const { sqlClient } = await import('../src/db/index.js');
  // CASCADE handles the FKs; RESTART IDENTITY keeps sequences predictable.
  await sqlClient.unsafe(
    'TRUNCATE TABLE users, oauth_accounts, refresh_tokens, verification_tokens, ' +
      'websites, scans, scan_assets, screenshots, technologies RESTART IDENTITY CASCADE',
  );

  const { redis } = await import('../src/lib/redis.js');
  await redis.flushdb();
});

afterAll(async () => {
  const { closeDb } = await import('../src/db/index.js');
  const { closeRedis } = await import('../src/lib/redis.js');
  await Promise.allSettled([closeDb(), closeRedis()]);
});
