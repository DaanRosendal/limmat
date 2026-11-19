import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { CORPUS, REPLY, XSS } from '../test/helpers/cases';
import { expect, test } from './fixture';

const docs = [...CORPUS, ...XSS.map(([, md]) => md)];

test('chunked output equals whole output, with real timers and the default throttle', async ({ page }) => {
  const bad = await page.evaluate(async (docs) => {
    const out: number[] = [];
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const mk = () => {
      const root = document.createElement('div');
      return { root, r: (window as any).limmat.createRenderer(root, {}) };
    };
    for (let d = 0; d < docs.length; d++) {
      const whole = mk();
      whole.r.write(docs[d]);
      whole.r.end();
      for (const size of [1, 3, 0]) {
        const c = mk();
        for (let i = 0; i < docs[d].length; ) {
          const n = size || 1 + Math.floor(rnd() * 12);
          c.r.write(docs[d].slice(i, i + n));
          i += n;
          if (d % 4 === 0 && rnd() < 0.01) await new Promise((r) => setTimeout(r, 60));
        }
        c.r.end();
        if (c.root.innerHTML !== whole.root.innerHTML) out.push(d);
      }
    }
    return out;
  }, docs);
  expect(bad).toEqual([]);
});

test('streaming never shows raw markers, and finished blocks never move', async ({ page }) => {
  const r = await page.evaluate((reply) => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const r = (window as any).limmat.createRenderer(root, { throttleMs: 0 });
    const raw: string[] = [];
    const heights = new Map<Element, number>();
    const jumps: string[] = [];
    for (const ch of reply) {
      r.write(ch);
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('pre').forEach((p) => p.remove());
      const m = /\*\*|\]\(|\[[^\]]*$|(^|\n)\s*\|.*\|\s*(\n|$)|~~|(^|\n)#{1,6} /.exec(clone.textContent!);
      if (m) raw.push(JSON.stringify(m[0]) + ' after ' + JSON.stringify(reply.slice(0, root.textContent!.length + 5).slice(-30)));
      const kids = Array.from(root.children);
      kids.slice(0, -1).forEach((k) => {
        const h = k.getBoundingClientRect().height;
        if (heights.has(k) && Math.abs(heights.get(k)! - h) > 0.5) jumps.push(k.tagName);
        heights.set(k, h);
      });
    }
    r.end();
    return { raw: raw.slice(0, 5), jumps: jumps.slice(0, 5) };
  }, REPLY);
  expect(r.raw).toEqual([]);
  expect(r.jumps).toEqual([]);
});

test('copy button copies the code and announces it', async ({ page, context, browserName }) => {
  // Only Chromium lets a test grant clipboard permissions and read the clipboard back.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.install(); // the label resets after a 2 s timer: fast-forward it instead of waiting
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const r = (window as any).limmat.createRenderer(root, {});
    r.write('```js\nconsole.log(1);\nlet b = 2;\n```');
    r.end();
  });
  await page.getByRole('button', { name: 'Copy js' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('console.log(1);\nlet b = 2;');
  await page.clock.fastForward(2100);
  await expect(page.getByRole('status')).toHaveText('', { timeout: 4000 });
});

test('keyboard users can reach the copy button, the code, and a wide table', async ({ page, browserName }) => {
  // Safari on macOS skips buttons with Tab unless Option is held. Elsewhere plain Tab reaches them.
  const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const r = (window as any).limmat.createRenderer(root, {});
    r.write('```js\n' + 'x'.repeat(400) + '\n```\n\n| a | b |\n|--|--|\n| ' + 'y'.repeat(400) + ' | z |\n');
    r.end();
  });
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press(tab);
    seen.push(
      await page.evaluate(() => {
        const a = document.activeElement!;
        return a.tagName + ':' + (a.getAttribute('role') ?? a.getAttribute('aria-label') ?? '');
      }),
    );
  }
  expect(seen).toEqual(['BUTTON:Copy js', 'PRE:', 'DIV:region']);
});

test('the highlight adapter highlights once the fence closes and keeps the text', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const lim = (window as any).limmat;
    const r = lim.createRenderer(root, { highlight: lim.speedHighlight() });
    r.write('```ts\nconst a: number = 1;\n');
    r.write('```');
  });
  await expect(page.locator('code span[class*="shj-"]').first()).toBeVisible({ timeout: 5000 });
  expect(await page.locator('code').textContent()).toBe('const a: number = 1;');
});

test('a speed-highlight theme does not add a second frame inside the code block', async ({ page }) => {
  await page.addStyleTag({ content: readFileSync('node_modules/@speed-highlight/core/dist/themes/default.css', 'utf8') });
  await page.addStyleTag({ path: 'dist/style.css' });
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const lim = (window as any).limmat;
    const r = lim.createRenderer(root, { highlight: lim.speedHighlight() });
    r.write('```ts\nconst a: number = 1;\n```');
    r.end();
  });
  await expect(page.locator('code span[class*="shj-"]').first()).toBeVisible({ timeout: 5000 });
  const css = await page.locator('code').evaluate((el) => {
    const c = getComputedStyle(el);
    return { border: c.borderTopWidth, padding: c.paddingTop, margin: c.marginTop, bg: c.backgroundColor };
  });
  expect(css).toEqual({ border: '0px', padding: '0px', margin: '0px', bg: 'rgba(0, 0, 0, 0)' });
});

for (const [name, opts] of [
  ['light', { colorScheme: 'light' }],
  ['dark', { colorScheme: 'dark' }],
  ['forced colors', { forcedColors: 'active' }],
] as const) {
  test(`axe finds no accessibility violations (${name})`, async ({ page }) => {
    await page.emulateMedia(opts as any);
    await page.evaluate((reply) => {
      const root = document.getElementById('root')!;
      root.replaceChildren();
      const r = (window as any).limmat.createRenderer(root, { isInternalPath: () => true });
      r.write(reply);
      r.end();
    }, REPLY);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`)).toEqual([]);
  });
}
