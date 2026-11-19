import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

// Serves the built demo (demo/out) on https://limmat.test with the response headers from demo/_headers,
// and records everything a visitor could be harmed by: page errors, CSP violations, and requests.
const ROOT = fileURLToPath(new URL('../demo/out/', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const HEADERS = Object.fromEntries(
  readFileSync(`${ROOT}_headers`, 'utf8')
    .split('\n')
    .filter((l) => /^\s+[\w-]+:/.test(l))
    .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
);

interface Seen {
  errors: string[];
  requests: string[];
}

export const test = base.extend<{ seen: Seen }>({
  seen: [
    async ({ page }, use) => {
      const seen: Seen = { errors: [], requests: [] };
      page.on('pageerror', (e) => seen.errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') seen.errors.push(`console: ${m.text()}`);
      });
      page.on('request', (r) => seen.requests.push(r.url()));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          ((window as any).__csp ||= []).push(`${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      await page.route('https://limmat.test/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        const file = path === '/' ? 'index.html' : path.slice(1);
        try {
          return route.fulfill({
            contentType: TYPES[extname(file)] ?? 'application/octet-stream',
            headers: HEADERS,
            body: readFileSync(ROOT + file),
          });
        } catch {
          return route.fulfill({ status: 404, body: 'not found' });
        }
      });
      await use(seen);
    },
    { auto: true },
  ],
});

export { expect };
export const open = async (page: import('@playwright/test').Page, hash = '') => {
  await page.goto(`https://limmat.test/${hash}`);
  await page.waitForFunction(() => (window as any).__demoReady === true);
};
