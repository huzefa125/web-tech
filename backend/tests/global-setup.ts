/**
 * Starts a real PostgreSQL 17 for the test run.
 *
 * Uses embedded-postgres (portable binaries, no Docker or admin rights) so
 * `npm test` works on a fresh checkout. If a server is already listening on
 * TEST_PG_PORT — e.g. the docker-compose one, or CI's service container — we
 * use that instead and start nothing.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';

const PORT = Number(process.env.TEST_PG_PORT ?? 55432);
// Unique per run: Windows keeps a lock on the data dir briefly after the
// server exits, so reusing one path makes the next run fail with EBUSY.
const DATA_DIR = join(process.cwd(), '.pg-test-data', String(process.pid));

let pg: EmbeddedPostgres | null = null;

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

export async function setup(): Promise<void> {
  if (await portInUse(PORT)) {
    console.log(`[test-db] reusing server already on :${PORT}`);
    return;
  }

  // A data dir left behind by a killed run will not re-initdb cleanly.
  if (existsSync(DATA_DIR)) await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {});
  await mkdir(DATA_DIR, { recursive: true });

  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    // Manual cleanup below — with persistent:false the library deletes the
    // data dir during stop(), which races Windows' file lock and throws EBUSY.
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  console.log(`[test-db] starting PostgreSQL on :${PORT} …`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('iip_test');
  console.log('[test-db] ready');
}

export async function teardown(): Promise<void> {
  if (!pg) return;
  await pg.stop();

  // Windows releases the data-dir handles a moment after the process exits.
  // Retry briefly, then give up — a stale dir is gitignored and harmless.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(DATA_DIR, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
