import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>limmat</title>
<link rel="stylesheet" href="/style.css"><style>body{background:Canvas;color:CanvasText;font:16px system-ui}</style>
<script type="importmap">{"imports":{"@speed-highlight/core":"/sh/index.js"}}</script>
<main><h1>limmat test page</h1><div id="root"></div></main>
<script type="module">
  import * as l from '/limmat.min.js';
  import { speedHighlight } from '/highlight.js';
  window.limmat = { ...l, speedHighlight };
  window.ready = true;
</script>`;

const FILES: Record<string, [string, string]> = {
  '/limmat.min.js': ['dist/limmat.min.js', 'text/javascript'],
  '/highlight.js': ['dist/highlight.js', 'text/javascript'],
  '/style.css': ['dist/style.css', 'text/css'],
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://limmat.test/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: HTML });
      if (FILES[path]) return route.fulfill({ contentType: FILES[path][1], body: readFileSync(ROOT + FILES[path][0]) });
      if (path.startsWith('/sh/')) {
        try {
          return route.fulfill({
            contentType: 'text/javascript',
            body: readFileSync(ROOT + 'node_modules/@speed-highlight/core/dist/' + path.slice(4)),
          });
        } catch {
          /* fall through */
        }
      }
      return route.fulfill({ status: 404, body: 'not found' });
    });
    await page.goto('https://limmat.test/');
    await page.waitForFunction(() => (window as any).ready === true);
    await use(page);
  },
});
export { expect };
