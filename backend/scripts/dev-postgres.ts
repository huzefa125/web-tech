/**
 * A development PostgreSQL that does not need Docker.
 *
 * docker-compose.yml is still the intended way to run the datastores, but it
 * requires a working WSL2 VM, which requires virtualisation enabled in
 * firmware. On a machine where that is off, this gets you a real PostgreSQL 17
 * from the same portable binaries the test suite already uses.
 *
 * Runs in the foreground and shuts the server down cleanly on Ctrl-C.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import postgres from 'postgres';

const PORT = Number(process.env.DEV_PG_PORT ?? 5432);
const DATA_DIR = join(process.cwd(), '.pg-dev-data');
const DB_NAME = 'iip';
const USER = 'iip';
const PASSWORD = 'iip_dev_password';

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 1000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  if (await portInUse(PORT)) {
    console.log(`[dev-db] something is already listening on :${PORT} — leaving it alone`);
    return;
  }

  // initdb only runs on a fresh directory; an existing one is an existing
  // cluster and must be started, not re-initialised.
  const firstRun = !existsSync(DATA_DIR);
  if (firstRun) await mkdir(DATA_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    // Data survives restarts — this is a dev database, not a test fixture.
    persistent: true,
    onLog: () => {},
    onError: (err: unknown) => console.error('[dev-db]', err),
  });

  if (firstRun) {
    console.log('[dev-db] initialising a new cluster …');
    await pg.initialise();
  }

  await pg.start();

  if (firstRun) {
    await pg.createDatabase(DB_NAME);

    // Extensions are per-database, so this has to connect to `iip` itself —
    // creating them on the default database would leave the app's own
    // database without citext and every migration would fail.
    const sql = postgres(`postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}`, {
      max: 1,
      onnotice: () => {},
    });
    try {
      await sql.unsafe('CREATE EXTENSION IF NOT EXISTS citext');
      await sql.unsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    } finally {
      await sql.end();
    }
  }

  console.log(`[dev-db] ready on postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}`);
  console.log('[dev-db] Ctrl-C to stop');

  const stop = async (): Promise<void> => {
    console.log('\n[dev-db] stopping …');
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());

  // Hold the process open; the server runs as a child of this one.
  await new Promise(() => {});
}

void main();
