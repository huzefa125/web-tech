/** Local storage driver — the one that actually runs in dev and in tests. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { scanKey, type Storage } from '../src/lib/storage.js';

let root: string;
let storage: Storage;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'iip-storage-'));
  vi.stubEnv('STORAGE_LOCAL_ROOT', root);
  vi.resetModules();
  const mod = await import('../src/lib/storage.js');
  storage = mod.getStorage();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(root, { recursive: true, force: true });
});

describe('local storage', () => {
  it('round-trips a payload and reports its size and digest', async () => {
    const body = Buffer.from('<html><body>hello</body></html>', 'utf8');
    const put = await storage.put('scans/abc/index.html', body, 'text/html');

    expect(put.byteSize).toBe(body.byteLength);
    // sha256 of the payload, so a later scan can spot an unchanged file.
    expect(put.sha256).toMatch(/^[0-9a-f]{64}$/);

    const read = await storage.get('scans/abc/index.html');
    expect(read.equals(body)).toBe(true);
  });

  it('gives different digests to different payloads', async () => {
    const a = await storage.put('scans/a/x.css', Buffer.from('a{}'));
    const b = await storage.put('scans/b/x.css', Buffer.from('b{}'));
    expect(a.sha256).not.toBe(b.sha256);
  });

  it('creates nested directories on the way', async () => {
    const put = await storage.put('scans/deep/nested/path/file.js', Buffer.from('x'));
    expect(put.storageKey).toBe('scans/deep/nested/path/file.js');
  });

  it.each([
    '../escape.txt',
    'scans/../../escape.txt',
    '/absolute/path.txt',
    'windows\\separator.txt',
    '',
  ])('refuses the unsafe key %j', async (key) => {
    // A storage key is derived from a scan id today, but the moment anything
    // user-controlled reaches it, path traversal is a file-write primitive.
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow();
  });
});

describe('scanKey', () => {
  it('builds slash-separated keys regardless of platform', () => {
    // Runs on Windows in this project, where node:path would otherwise emit
    // backslashes that the key validator rejects.
    expect(scanKey('abc-123', 'css', '0.css')).toBe('scans/abc-123/css/0.css');
    expect(scanKey('abc-123', 'index.html')).toBe('scans/abc-123/index.html');
  });
});
