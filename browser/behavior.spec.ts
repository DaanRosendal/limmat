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
    // The loaded and failed classes of an image arrive when its request settles, so they may differ between two renders.
    const norm = (h: string) => h.replace(/ limmat-image-(loaded|failed)/g, '');
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
        if (norm(c.root.innerHTML) !== norm(whole.root.innerHTML)) out.push(d);
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
  expect(seen).toEqual(['BUTTON:Copy js', 'PRE:', 'DIV:group']);
});

test('the highlight adapter highlights once the fence closes and keeps the text', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const lim = (window as any).limmat;
    const r = lim.createRenderer(root, { highlight: lim.speedHighlight() });
    r.write('```ts\nconst a: number = 1;\n');
    r.write('```\n');
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

test('the stylesheet also styles a renderer inside a shadow root', async ({ page }) => {
  const css = await page.evaluate(async () => {
    const text = await (await fetch('/style.css')).text();
    for (const l of document.querySelectorAll('link[rel=stylesheet]')) l.remove(); // only the copy inside the shadow root counts
    const host = document.getElementById('root')!;
    host.replaceChildren();
    const shadow = host.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style');
    sheet.textContent = text;
    const mount = document.createElement('div');
    shadow.append(sheet, mount);
    const r = (window as any).limmat.createRenderer(mount);
    r.write('```\nx\n```\n\n[a](https://a.com)');
    r.end();
    const code = getComputedStyle(mount.querySelector('.limmat-code')!);
    const link = getComputedStyle(mount.querySelector('a')!);
    return { border: code.borderTopWidth + ' ' + code.borderTopColor, link: link.color };
  });
  expect(css.border).not.toMatch(/^0px|rgba\(0, 0, 0, 0\)/);
  expect(css.link).toBe('rgb(29, 78, 216)');
});

test('a long link stays inside a narrow container', async ({ page }) => {
  const [scroll, client] = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    root.style.width = '200px';
    const r = (window as any).limmat.createRenderer(root);
    r.write('https://example.com/' + 'a'.repeat(120) + '\n\n[' + 'b'.repeat(120) + '](https://a.com)');
    r.end();
    return [root.scrollWidth, root.clientWidth];
  });
  expect(scroll).toBeLessThanOrEqual(client);
});

test('right-to-left pages keep code left to right and list indents on the right side', async ({ page }) => {
  const css = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    root.setAttribute('dir', 'rtl');
    const r = (window as any).limmat.createRenderer(root);
    r.write('- a\n- [ ] b\n\n```\nx;\n```\n\n| a |\n|-|\n| 1 |');
    r.end();
    const ul = getComputedStyle(root.querySelector('ul')!);
    const th = getComputedStyle(root.querySelector('th')!);
    return {
      pre: getComputedStyle(root.querySelector('pre')!).direction,
      left: ul.paddingLeft,
      right: ul.paddingRight,
      align: th.textAlign,
    };
  });
  expect(css).toEqual({ pre: 'ltr', left: '0px', right: '24px', align: 'start' });
});

test('an image holds a box until it loads, and a failed image is marked and styled', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
  await page.route('https://limmat.test/ok.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  const r = await page.evaluate(async () => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const r = (window as any).limmat.createRenderer(root);
    r.write('![ok](/ok.svg) ![gone](/missing.png) ![](/missing2.png)');
    r.end();
    const [ok, gone, bare] = Array.from(root.querySelectorAll('img'));
    const before = { w: ok.getBoundingClientRect().width, h: ok.getBoundingClientRect().height };
    await Promise.all([ok, gone, bare].map((i) => (i.complete ? 0 : new Promise((res) => (i.onload = i.onerror = res)))));
    await new Promise((res) => setTimeout(res, 50));
    return {
      before,
      okClass: ok.className,
      goneClass: gone.className,
      okSize: { w: ok.getBoundingClientRect().width, h: ok.getBoundingClientRect().height },
      goneBorder: getComputedStyle(gone).borderTopStyle,
      bareDisplay: getComputedStyle(bare).display,
    };
  });
  expect(r.okClass).toBe('limmat-image limmat-image-loaded');
  expect(r.goneClass).toBe('limmat-image limmat-image-failed');
  expect(r.before.h).toBeGreaterThanOrEqual(120); // the 8rem placeholder box
  expect(r.okSize).toEqual({ w: 40, h: 30 });
  expect(r.goneBorder).toBe('solid');
  expect(r.bareDisplay).toBe('none'); // a failed image with no alt text leaves no empty pill
});

test('an image that is not shown is a pill that says so', async ({ page }) => {
  const r = await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.replaceChildren();
    const r = (window as any).limmat.createRenderer(root, { images: false });
    r.write('See ![a *chart*](https://e.com/c.png) here.');
    r.end();
    const b = root.querySelector('.limmat-image-blocked') as HTMLElement;
    return { text: b.textContent, border: getComputedStyle(b).borderTopStyle, radius: getComputedStyle(b).borderTopLeftRadius !== '0px' };
  });
  expect(r).toEqual({ text: 'Image not shown: a chart', border: 'solid', radius: true });
});
