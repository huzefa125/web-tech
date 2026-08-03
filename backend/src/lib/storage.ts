/**
 * Object storage for captured assets.
 *
 * techstack.md names Cloudflare R2 for production and local disk for
 * development. Both sit behind this one interface so the crawler never learns
 * which is in play — and so tests can write to a temp directory without an
 * S3 client or network.
 *
 * The R2 driver is deliberately not implemented yet: no bucket exists, and a
 * driver that cannot be exercised is a driver that is wrong. It throws on
 * construction rather than silently degrading to local disk in production,
 * where a scan's screenshots would then live on an ephemeral container's
 * filesystem and vanish on redeploy.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface PutResult {
  storageKey: string;
  byteSize: number;
  sha256: string;
}

export interface Storage {
  put(key: string, body: Buffer, contentType?: string): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
}

/** Keys are slash-separated and must stay inside the storage root. */
function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error(`unsafe storage key: ${key}`);
  }
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = resolve(this.root, ...key.split('/'));
    // Belt and braces: even with the key check above, refuse anything that
    // resolved outside the root.
    if (!full.startsWith(resolve(this.root) + sep)) {
      throw new Error(`storage key escapes root: ${key}`);
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<PutResult> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);

    return {
      storageKey: key,
      byteSize: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }
}

let instance: Storage | null = null;

export function getStorage(): Storage {
  if (instance) return instance;

  if (env.STORAGE_DRIVER === 'r2') {
    throw new Error(
      'STORAGE_DRIVER=r2 is not implemented yet. Set STORAGE_DRIVER=local, or wire the R2 driver before deploying.',
    );
  }

  const root = resolve(env.STORAGE_LOCAL_ROOT);
  logger.info({ root }, 'using local storage driver');
  instance = new LocalStorage(root);
  return instance;
}

/** Test seam — lets a suite point storage at a temp directory. */
export function setStorage(driver: Storage | null): void {
  instance = driver;
}

/**
 * Storage key for a scan artefact. Scan id first so everything from one run
 * lives under a single prefix and can be deleted with one recursive call when
 * retention (§9) lands.
 */
export function scanKey(scanId: string, ...parts: string[]): string {
  return join('scans', scanId, ...parts).split(sep).join('/');
}
