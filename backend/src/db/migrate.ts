/** Run pending migrations, then exit. Used by `npm run db:migrate`. */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  // max: 1 — migrations must run serially on a single connection.
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    // Extensions the schema depends on. Idempotent, and needed for managed
    // Postgres (Supabase/Neon) where the docker init script never runs.
    await client.unsafe('CREATE EXTENSION IF NOT EXISTS citext');
    await client.unsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    logger.info('migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Logger may be silent in some envs; make failures unmissable.
  console.error('Migration failed:', err);
  process.exit(1);
});
