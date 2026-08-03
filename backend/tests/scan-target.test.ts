/**
 * Target resolution and the SSRF guard.
 *
 * These are the checks standing between "user submits a URL" and "the backend
 * fetches it from inside our network", so they get the most direct coverage in
 * the suite.
 */

import { describe, expect, it } from 'vitest';

import { AppError } from '../src/lib/errors.js';
import { isPublicAddress, parseTarget, resolveTarget } from '../src/lib/scan-target.js';

describe('parseTarget', () => {
  it('defaults a bare domain to https', () => {
    expect(parseTarget('nike.com')).toEqual({ host: 'nike.com', url: 'https://nike.com/' });
  });

  it('normalises case, trailing dots and fragments', () => {
    const { host, url } = parseTarget('  HTTPS://Nike.COM./products#reviews  ');
    expect(host).toBe('nike.com');
    expect(url).toBe('https://nike.com/products');
  });

  it('keeps the path and query, which identify the page scanned', () => {
    expect(parseTarget('example.com/a/b?x=1').url).toBe('https://example.com/a/b?x=1');
  });

  it('punycodes an internationalised domain', () => {
    expect(parseTarget('münchen.de').host).toBe('xn--mnchen-3ya.de');
  });

  it.each([
    ['file:///etc/passwd', 'non-http scheme'],
    ['ftp://example.com', 'non-http scheme'],
    ['javascript:alert(1)', 'non-http scheme'],
    ['https://user:pass@example.com', 'embedded credentials'],
    ['localhost', 'loopback name'],
    ['localhost:8000', 'loopback name with port'],
    ['redis.local', '.local suffix'],
    ['metadata.google.internal', 'cloud metadata name'],
    ['postgres', 'bare hostname with no dot'],
    ['', 'empty input'],
    ['   ', 'whitespace only'],
  ])('refuses %s (%s)', (input) => {
    expect(() => parseTarget(input)).toThrow(AppError);
  });
});

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:4700:4700::1111',
  ])('accepts the public address %s', (addr) => {
    expect(isPublicAddress(addr)).toBe(true);
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback range'],
    ['10.0.0.5', 'RFC1918'],
    ['172.16.0.1', 'RFC1918'],
    ['172.31.255.255', 'RFC1918 upper bound'],
    ['192.168.1.1', 'RFC1918'],
    ['169.254.169.254', 'cloud instance metadata'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'this network'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['::1', 'IPv6 loopback'],
    ['fd00::1', 'IPv6 unique-local'],
    ['fe80::1', 'IPv6 link-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata address'],
    ['not-an-ip', 'not an address at all'],
  ])('rejects %s (%s)', (addr) => {
    expect(isPublicAddress(addr)).toBe(false);
  });

  it('accepts 172.32.0.0, which sits just outside RFC1918', () => {
    expect(isPublicAddress('172.32.0.0')).toBe(true);
  });
});

describe('resolveTarget', () => {
  it('accepts a public literal address without a DNS lookup', async () => {
    const target = await resolveTarget('93.184.216.34');
    expect(target.host).toBe('93.184.216.34');
    expect(target.addresses).toEqual(['93.184.216.34']);
  });

  it.each([
    '127.0.0.1',
    'http://10.0.0.1',
    'https://169.254.169.254/latest/meta-data/',
    '[::1]',
  ])('refuses the private literal address %s', async (input) => {
    await expect(resolveTarget(input)).rejects.toThrow(AppError);
  });

  it('refuses a name that does not resolve', async () => {
    await expect(
      resolveTarget('this-domain-should-never-exist-9f8a7b6c.invalid'),
    ).rejects.toThrow(AppError);
  });
});
