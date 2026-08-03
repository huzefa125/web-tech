/** Database client. One pooled connection shared process-wide. */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env, isTest } from '../config/env.js';
import * as schema from './schema/index.js';

const client = postgres(env.DATABASE_URL, {
  max: isTest ? 5 : 20,
  idle_timeout: 20,
  connect_timeout: 10,
  // postgres.js parses timestamptz into Date by default, which is what we want.
});

export const db = drizzle(client, { schema });
export { client as sqlClient, schema };

export type Database = typeof db;

/** Close the pool — used by tests and graceful shutdown. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
