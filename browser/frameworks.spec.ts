// The React, Vue, and Svelte wrappers in real browsers, with the real frameworks, against the built package (dist/). Each
// framework gets a small app (browser/frameworks/) that holds a message and an unrelated counter, bundled here from the
// package entries a user would import. React and Vue run their development builds (React in StrictMode, so effects run twice),
// which is where their own warnings come from, and any console error or warning fails the test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { build, type Plugin } from 'esbuild';
import { compile } from 'svelte/compiler';
import { REPLY } from '../test/helpers/cases';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const kinds = [
  { name: 'react', entry: 'browser/frameworks/react-app.ts' },
  { name: 'vue', entry: 'browser/frameworks/vue-app.ts' },
  { name: 'svelte', entry: 'browser/frameworks/svelte-app.js' },
] as const;

// Compiles a .svelte file with the real Svelte compiler, which is what a user's bundler plugin does.
const svelte: Plugin = {
  name: 'svelte',
  setup(b) {
    b.onLoad({ filter: /\.svelte$/ }, (args) => {
      const out = compile(readFileSync(args.path, 'utf8'), { filename: args.path, generate: 'client', dev: true });
      return { contents: `${out.js.code}\n//# sourceMappingURL=data:`, loader: 'js', resolveDir: ROOT };
    });
  },
};

const bundles = new Map<string, string>();
test.beforeAll(async () => {
  for (const k of kinds) {
    const r = await build({
      entryPoints: [ROOT + k.entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['svelte', 'browser', 'development'],
      alias: Object.fromEntries(['react', 'vue', 'svelte'].map((n) => [`limmat/${n}`, `${ROOT}dist/${n}.js`])),
      define: {
        'process.env.NODE_ENV': '"development"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
      plugins: [svelte],
      logLevel: 'error',
    });
    bundles.set(k.name, r.outputFiles[0].text);
  }
});

const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>frameworks</title><link rel="stylesheet" href="/style.css">
<main><div id="mount"></div></main>
<script type="module">import * as l from '/limmat.min.js'; window.limmat = l; window.plain = true;</script>
<script type="module" src="/app.js"></script>`;

/** Opens the app of one framework and collects everything that would be a problem. */
async function open(page: Page, name: string) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text()}`);
  });
  await page.route('https://limmat.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
    if (path === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: bundles.get(name)! });
    if (path === '/limmat.min.js')
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(`${ROOT}dist/limmat.min.js`) });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: readFileSync(`${ROOT}dist/style.css`) });
    return route.fulfill({ status: 404, body: 'not found' });
  });
  await page.goto('https://limmat.test/');
  await page.waitForFunction(() => (window as any).ready === true && (window as any).plain === true);
  return problems;
}

for (const { name } of kinds) {
  test.describe(name, () => {
    test('streams a reply with real timers: no raw markers, finished blocks stay put, and the end result equals a plain renderer', async ({
      page,
    }) => {
      const problems = await open(page, name);
      const r = await page.evaluate(async (reply) => {
        const w = window as any;
        const raw: string[] = [];
        const moved: string[] = [];
        const first = new Map<string, Element>();
        const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
        for (let i = 0; i < reply.length; i += 9) {
          await w.app.set(reply.slice(0, i + 9));
          await wait(8);
          const box = document.querySelector('.msg') as HTMLElement;
          const clone = box.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('pre').forEach((p) => p.remove());
          const m = /\*\*|\]\(|\[[^\]]*$|(^|\n)\s*\|.*\|\s*(\n|$)|~~|(^|\n)#{1,6} /.exec(clone.textContent ?? '');
          if (m) raw.push(JSON.stringify(m[0]) + ' at ' + i);
          // The first heading and the first paragraph are finished once the second block starts: they must stay the same nodes.
          for (const sel of ['h2', 'p']) {
            const el = box.querySelector(sel);
            if (!el) continue;
            if (box.children.length > 2 && first.has(sel) && first.get(sel) !== el) moved.push(sel + ' at ' + i);
            if (!first.has(sel) && box.children.length > 2) first.set(sel, el);
          }
        }
        await w.app.set(reply, true);
        await wait(200);
        const got = (document.querySelector('.msg') as HTMLElement).innerHTML;
        const plain = document.createElement('div');
        const pr = w.limmat.createRenderer(plain, { throttleMs: 0 });
        pr.write(reply);
        pr.end();
        // An image's loaded and failed classes arrive when its request settles, so they may differ between two renders.
        const norm = (h: string) => h.replace(/ limmat-image-(loaded|failed)/g, '');
        return { raw: raw.slice(0, 5), moved: moved.slice(0, 5), same: norm(got) === norm(plain.innerHTML), got: got.length };
      }, REPLY);
      expect(r.raw).toEqual([]);
      expect(r.moved).toEqual([]);
      expect(r.same).toBe(true);
      expect(r.got).toBeGreaterThan(500);
      expect(problems).toEqual([]);
    });

    test('a parent that re-renders for another reason leaves the message alone', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () => (window as any).app.set('# Head\n\nsome *words* here', true));
      await expect(page.locator('.msg h1')).toHaveText('Head');
      const same = await page.evaluate(async () => {
        const h1 = document.querySelector('.msg h1');
        const a = (window as any).app;
        for (let i = 0; i < 3; i++) await a.bump();
        return document.querySelector('.msg h1') === h1;
      });
      expect(same).toBe(true);
      await expect(page.locator('[data-other]')).toHaveText('3');
      expect(problems).toEqual([]);
    });

    test('a new message replaces the old one, and the next one grows from it', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () => (window as any).app.set('# One\n\nfirst message', true));
      await expect(page.locator('.msg h1')).toHaveText('One');
      await page.evaluate(async () => (window as any).app.set('second *message*', false));
      await expect(page.locator('.msg')).toHaveText('second message');
      await expect(page.locator('.msg h1')).toHaveCount(0);
      await page.evaluate(async () => (window as any).app.set('second *message* grows\n\n- a\n- b', false));
      await expect(page.locator('.msg li')).toHaveCount(2);
      await expect(page.locator('.msg em')).toHaveCount(1);
      expect(problems).toEqual([]);
    });

    test('a text selection in a growing code block survives each update', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () => (window as any).app.set('```js\nconst first = 1;\n'));
      await expect(page.locator('.msg pre')).toHaveCount(1);
      const before = await page.evaluate(() => {
        const code = document.querySelector('.msg pre code, .msg pre') as HTMLElement;
        const text = (function walk(n: Node): Text | null {
          if (n.nodeType === 3 && n.textContent?.includes('const first')) return n as Text;
          for (const c of Array.from(n.childNodes)) {
            const t = walk(c);
            if (t) return t;
          }
          return null;
        })(code)!;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, 'const first'.length);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        return sel.toString();
      });
      expect(before).toBe('const first');
      for (const more of [
        '```js\nconst first = 1;\nconst second = 2;\n',
        '```js\nconst first = 1;\nconst second = 2;\nconst third = 3;\n',
      ]) {
        await page.evaluate(async (t) => (window as any).app.set(t), more);
        await expect(page.locator('.msg pre')).toContainText(more.split('\n').slice(-2)[0]);
        expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('const first');
      }
      expect(problems).toEqual([]);
    });

    test('the copy button of a finished code block works inside the framework box', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () => (window as any).app.set('```js\nconsole.log(1);\n```', true));
      await page.getByRole('button', { name: 'Copy js' }).click();
      await expect(page.getByRole('status')).toHaveText('Copied');
      expect(problems).toEqual([]);
    });

    test('hostile markdown stays inert, including a click on its link', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () =>
        (window as any).app.set(
          '[click](javascript:window.__pwn=1) <img src=x onerror="window.__pwn=2"> <script>window.__pwn=3</script>',
          true,
        ),
      );
      await expect(page.locator('.msg')).toContainText('click');
      expect(await page.locator('.msg img, .msg script, .msg [onerror]').count()).toBe(0);
      const link = page.locator('.msg a');
      if (await link.count()) await link.first().click({ force: true });
      expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined();
      expect(problems).toEqual([]);
    });

    test('done turns an open construct into literal text', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () => (window as any).app.set('a **b'));
      await expect(page.locator('.msg strong')).toHaveText('b');
      await page.evaluate(async () => (window as any).app.set('a **b', true));
      await expect(page.locator('.msg strong')).toHaveCount(0);
      await expect(page.locator('.msg')).toContainText('a **b');
      expect(problems).toEqual([]);
    });

    test('unmounting while a render is pending leaves no errors and drops that render', async ({ page }) => {
      const problems = await open(page, name);
      await page.evaluate(async () => {
        const w = window as any;
        w.box = document.querySelector('.msg');
        await w.app.set('# Streaming\n\nsome **text');
        await w.app.set('# Streaming\n\nsome **text that is still arriving');
        w.app.unmount();
        w.at = w.box.innerHTML;
      });
      await page.waitForTimeout(250);
      expect(await page.locator('.msg').count()).toBe(0);
      expect(await page.evaluate(() => (window as any).box.innerHTML === (window as any).at)).toBe(true);
      expect(problems).toEqual([]);
    });
  });
}
