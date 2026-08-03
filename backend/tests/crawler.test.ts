/**
 * Website Crawler — module 1.
 *
 * Driven against a fixture server on loopback rather than a real site: the
 * suite must not depend on nike.com being up, and asserting on exact captured
 * bytes is only possible when we control what is served.
 *
 * `crawlTarget` is used directly because `crawl` runs the SSRF guard first,
 * and that guard refuses loopback — correctly. See scan-target.test.ts.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeBrowser, crawlTarget } from '../src/services/crawler.js';
import type { ScanTarget } from '../src/lib/scan-target.js';

const PAGE = `<!doctype html>
<html>
  <head>
    <title>Fixture Site</title>
    <link rel="stylesheet" href="/styles.css">
    <script src="/app.js" defer></script>
  </head>
  <body><h1>Hello from the fixture</h1></body>
</html>`;

const CSS = 'body{background:#101014;color:#fff;font-family:sans-serif}';
const JS = 'window.__fixture = true;';

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/styles.css') {
      res.writeHead(200, { 'content-type': 'text/css' }).end(CSS);
    } else if (req.url === '/app.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' }).end(JS);
    } else if (req.url === '/slow') {
      // Never responds — exercises the navigation timeout.
    } else if (req.url === '/missing') {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<html><body>gone</body></html>');
    } else {
      res.writeHead(200, { 'content-type': 'text/html', 'x-fixture': 'yes' }).end(PAGE);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const target = (path = '/'): ScanTarget => ({
  host: '127.0.0.1',
  url: `${origin}${path}`,
  addresses: ['127.0.0.1'],
});

describe('crawlTarget', () => {
  it('captures the rendered HTML', async () => {
    const result = await crawlTarget(target());

    expect(result.httpStatus).toBe(200);
    expect(result.html.toString('utf8')).toContain('Hello from the fixture');
    // page.content() returns the DOM after scripts run, not the raw bytes —
    // that is what module 2 needs to detect client-rendered frameworks.
    expect(result.html.toString('utf8')).toContain('<title>Fixture Site</title>');
  });

  it('captures linked CSS and JS with their bodies intact', async () => {
    const result = await crawlTarget(target());

    const css = result.assets.find((a) => a.kind === 'css');
    const js = result.assets.find((a) => a.kind === 'js');

    expect(css?.body.toString('utf8')).toBe(CSS);
    expect(js?.body.toString('utf8')).toBe(JS);
    expect(css?.url).toBe(`${origin}/styles.css`);
  });

  it('records the response headers and load time', async () => {
    const result = await crawlTarget(target());

    expect(result.responseHeaders['x-fixture']).toBe('yes');
    expect(result.loadTimeMs).toBeGreaterThan(0);
    expect(result.finalUrl).toBe(`${origin}/`);
  });

  it('takes a screenshot at the configured viewport', async () => {
    const result = await crawlTarget(target());

    expect(result.screenshot.width).toBe(1440);
    expect(result.screenshot.height).toBe(900);
    // PNG magic number — proves it is an image, not an error page.
    expect(result.screenshot.body.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('still produces a scan for a 404 page', async () => {
    // A site returning 404 is a finding to report, not a crawler failure.
    const result = await crawlTarget(target('/missing'));
    expect(result.httpStatus).toBe(404);
    expect(result.html.toString('utf8')).toContain('gone');
  });

  it('fails with a user-facing error when the page never loads', async () => {
    await expect(crawlTarget(target('/slow'))).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }, 60_000);
});
