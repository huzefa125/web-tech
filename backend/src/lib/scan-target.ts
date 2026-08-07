/**
 * Turning user input into a scan target.
 *
 * This module exists because "fetch the URL the user gave us" is a
 * server-side request forgery primitive. The backend can reach things the
 * caller cannot: the Postgres and Redis containers next to it, the Docker
 * bridge network, and — on every major cloud — the instance metadata endpoint
 * at 169.254.169.254, which hands out credentials to anyone who asks.
 *
 * So resolution happens here, before the browser is ever opened: parse,
 * normalise, resolve DNS ourselves, and refuse any address that is not
 * publicly routable. `nike.com` is fine; `localhost`, `10.0.0.5`,
 * `metadata.google.internal`, and a public hostname whose A record points at
 * 127.0.0.1 are all not.
 */

import { lookup, resolveCname, resolveNs, resolveMx, resolveTxt } from 'node:dns/promises';
import { isIP } from 'node:net';

import { badRequest } from './errors.js';

export interface ScanTarget {
  /** Normalised registrable host — the `websites.host` key. */
  host: string;
  /** Full URL to navigate to. */
  url: string;
  /** Addresses the host resolved to, all verified public. */
  addresses: string[];
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Hostnames that never belong to a scannable site. DNS resolution catches most
 * of these anyway, but `.internal` and friends may not resolve at all in
 * development and would otherwise produce a confusing timeout instead of a
 * clear refusal.
 */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'instance-data']);

/** Parse and normalise, without touching the network. */
export function parseTarget(input: string): { host: string; url: string } {
  const trimmed = input.trim();
  if (!trimmed) throw badRequest('VALIDATION_ERROR', 'Enter a website to scan');

  // Users type `nike.com`, not `https://nike.com`. Default the scheme rather
  // than rejecting, but never default it to something we would refuse anyway.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw badRequest('VALIDATION_ERROR', `"${input}" is not a valid website address`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw badRequest('VALIDATION_ERROR', 'Only http and https addresses can be scanned');
  }
  if (parsed.username || parsed.password) {
    throw badRequest('VALIDATION_ERROR', 'Credentials in the URL are not supported');
  }

  // URL lowercases and punycodes the host for us; strip a trailing root dot so
  // `nike.com.` and `nike.com` do not become two websites.
  const host = parsed.hostname.replace(/\.$/, '');
  if (!host) throw badRequest('VALIDATION_ERROR', 'That address has no hostname');

  const isLiteralIp = isIP(host) !== 0;
  if (!isLiteralIp && !host.includes('.')) {
    throw badRequest('VALIDATION_ERROR', `"${host}" is not a public website address`);
  }
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw badRequest('VALIDATION_ERROR', `"${host}" is not a public website address`);
  }

  parsed.hostname = host;
  parsed.hash = '';
  return { host, url: parsed.toString() };
}

/**
 * True when an address is reachable from the public internet. Everything else
 * — loopback, RFC1918, link-local, CGNAT, multicast, unique-local v6 — is a
 * network the scanner has no business reaching on a user's behalf.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // RFC1918
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 192 && b === 0) return false; // 192.0.0.0/24 + 192.0.2.0/24 (TEST-NET-1)
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51) return false; // TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast + reserved + broadcast

  return true;
}

function isPublicIPv6(address: string): boolean {
  const addr = address.toLowerCase().split('%')[0]!; // drop any zone index

  if (addr === '::' || addr === '::1') return false; // unspecified, loopback
  if (addr.startsWith('fe8') || addr.startsWith('fe9')) return false; // link-local
  if (addr.startsWith('fea') || addr.startsWith('feb')) return false; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return false; // unique-local
  if (addr.startsWith('ff')) return false; // multicast

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible forms tunnel the v4
  // ranges straight through, so judge them as v4.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isPublicIPv4(mapped[1]!);

  return true;
}

/**
 * DNS answers for a host, as `TYPE value` lines.
 *
 * Worth collecting because a site behind a proxy strips the headers that would
 * otherwise name its host — but the CNAME still points at `cname.vercel-dns.com`
 * and the NS records still say Cloudflare. TXT records give away verified SaaS
 * (`google-site-verification`, `stripe-verification`), and MX names the mail
 * provider.
 *
 * Every lookup is best-effort and independent: most hosts have no CNAME at the
 * apex, and one NXDOMAIN must not lose the records that did resolve.
 */
export async function lookupDnsRecords(host: string): Promise<string[]> {
  if (isIP(host) !== 0) return [];

  const records: string[] = [];
  const collect = async (type: string, fn: () => Promise<string[]>): Promise<void> => {
    try {
      for (const value of await fn()) records.push(`${type} ${value}`);
    } catch {
      // NODATA and NXDOMAIN are the normal case for most record types.
    }
  };

  await Promise.all([
    collect('CNAME', () => resolveCname(host)),
    collect('NS', async () => resolveNs(host)),
    collect('MX', async () => (await resolveMx(host)).map((r) => r.exchange)),
    collect('TXT', async () => (await resolveTxt(host)).map((parts) => parts.join(''))),
  ]);

  return records;
}

/**
 * Full resolution: parse, then check every address the host resolves to.
 *
 * Note the residual TOCTOU — DNS could change between this check and the
 * browser's own lookup (a "DNS rebinding" attack). Closing that hole properly
 * means pinning the connection to the address checked here, which Playwright
 * does not expose. The practical mitigation is to run the crawler worker in a
 * network namespace with no route to private ranges; this check is the
 * in-process half of that defence, not the whole of it.
 */
export async function resolveTarget(input: string): Promise<ScanTarget> {
  const { host, url } = parseTarget(input);

  if (isIP(host) !== 0) {
    if (!isPublicAddress(host)) {
      throw badRequest('VALIDATION_ERROR', `${host} is not a public address`);
    }
    return { host, url, addresses: [host] };
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw badRequest('VALIDATION_ERROR', `Could not resolve "${host}". Check the address.`);
  }

  const addresses = resolved.map((r) => r.address);
  if (addresses.length === 0) {
    throw badRequest('VALIDATION_ERROR', `Could not resolve "${host}". Check the address.`);
  }

  // Every address must be public. One private answer is enough to refuse —
  // a host with both is exactly the shape a rebinding attack takes.
  const priv = addresses.find((a) => !isPublicAddress(a));
  if (priv) {
    throw badRequest('VALIDATION_ERROR', `"${host}" resolves to a private address and cannot be scanned`);
  }

  return { host, url, addresses };
}
