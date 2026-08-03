/**
 * Have I Been Pwned breach lookup.
 *
 * HIBP is disabled for the rest of the suite, and `env` is parsed once at
 * import time — so stubbing the variable is not enough, the module graph has
 * to be rebuilt after the stub is in place.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Long enough to clear the structural checks and reach the network call, and
// deliberately not the literal string "password" — the API's own hostname
// contains that substring, which would defeat the leak assertion below.
const PASSWORD = 'correct-horse-battery';
// SHA-1(PASSWORD) = F97979FF44A9A1A4105F4BAE6FE809715E0A0A84
const PREFIX = 'F9797';
const SUFFIX = '9FF44A9A1A4105F4BAE6FE809715E0A0A84';

let isPasswordBreached: (p: string) => Promise<boolean>;

beforeAll(async () => {
  vi.stubEnv('HIBP_ENABLED', 'true');
  vi.resetModules();
  ({ isPasswordBreached } = await import('../src/lib/password-policy.js'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function mockRange(body: string, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(body, { status }) as unknown as Response);
}

describe('HIBP breach lookup', () => {
  it('sends only the first 5 hash characters (k-anonymity)', async () => {
    const spy = mockRange('');
    await isPasswordBreached(PASSWORD);

    const url = String(spy.mock.calls[0]![0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    // Neither the password nor the rest of its hash may leave the process.
    expect(url).not.toContain(SUFFIX);
    expect(url).not.toContain(PASSWORD);
  });

  it('requests padding so response size does not leak the answer', async () => {
    const spy = mockRange('');
    await isPasswordBreached(PASSWORD);

    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('flags a password present in the corpus', async () => {
    mockRange(`${SUFFIX}:12345\r\n0000000000000000000000000000000000A:1`);
    expect(await isPasswordBreached(PASSWORD)).toBe(true);
  });

  it('allows a password absent from the corpus', async () => {
    mockRange('0000000000000000000000000000000000A:5\r\n0000000000000000000000000000000000B:9');
    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  it('treats a zero-count padding row as not breached', async () => {
    // With Add-Padding the API injects filler rows carrying a count of 0.
    mockRange(`${SUFFIX}:0`);
    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  it('fails open on a non-OK response', async () => {
    mockRange('rate limited', 429);
    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  it('fails open when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    // A third-party outage must never block a signup.
    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });

  it('fails open on timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    );
    expect(await isPasswordBreached(PASSWORD)).toBe(false);
  });
});

describe('validatePassword with HIBP enabled', () => {
  it('rejects a breached password with an actionable reason', async () => {
    vi.resetModules();
    const { validatePassword } = await import('../src/lib/password-policy.js');
    mockRange(`${SUFFIX}:99999`);

    const res = await validatePassword(PASSWORD);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/data breach/i);
  });

  it('skips the network call when the password fails a structural check', async () => {
    vi.resetModules();
    const { validatePassword } = await import('../src/lib/password-policy.js');
    const spy = mockRange('');

    const res = await validatePassword('short');
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
