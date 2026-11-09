// Regenerates docs/demo-light.png and docs/demo-dark.png from the built demo (run `npm run build && npm run build:demo` first).
// It scrubs the "believable reply" stream to the moment a link is half-open after a finished, highlighted code block.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = new URL('../demo/out/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route('https://limmat.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    try {
      return route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(ROOT + file) });
    } catch {
      return route.fulfill({ status: 404, body: 'not found' });
    }
  });
  await page.goto('https://limmat.test/#v=1&stream=reply&c=12&r=1&s=3&t=0&d=60');
  await page.waitForFunction(() => window.__demoReady === true);
  const found = await page.evaluate(async () => {
    const pos = document.querySelector('#pos');
    const raw = document.querySelector('#raw');
    for (let i = 1; i <= Number(pos.max); i++) {
      pos.value = String(i);
      pos.dispatchEvent(new Event('input', { bubbles: true }));
      const t = raw.textContent;
      if (t.includes('](https://developer.mozilla.o') && !t.includes('setTimeout)')) return i;
    }
    return -1;
  });
  if (found < 0) throw new Error('could not find the half-open link moment');
  await page.waitForSelector('#out .shj-syn-kwd');
  await page.screenshot({ path: `docs/demo-${scheme}.png` });
  await ctx.close();
}
await browser.close();
console.log('wrote docs/demo-light.png and docs/demo-dark.png');
