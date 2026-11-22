// Math in real browsers with the real KaTeX (its stylesheet and fonts too), against the built package (dist/): that formulas get laid
// out, that streaming shows no delimiter and ends on the same page as the whole text, that an async hook fills the kept box, that
// it all works under a strict CSP and Trusted Types, and that hostile formulas make no request and run nothing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOC =
  'Euler: \\(e^{i\\pi}+1=0\\), and $x_1 + y_2$ with a price of $5 and $10.\n\n$$\n\\int_0^1 x\\,dx = \\frac12\n$$\n\nAnd \\[\\sum_{i=1}^n i\\] done.\n';

let app = '';
test.beforeAll(async () => {
  const r = await build({
    entryPoints: [`${ROOT}browser/math/app.ts`],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    alias: { limmat: `${ROOT}dist/index.js`, 'limmat/katex': `${ROOT}dist/katex.js` },
    logLevel: 'error',
  });
  app = r.outputFiles[0].text;
});

const STRICT =
  "default-src 'none'; script-src https://limmat.test; style-src https://limmat.test; font-src https://limmat.test; img-src data:; require-trusted-types-for 'script'";

/** Opens a page with limmat, the adapter, and KaTeX. `csp` is the Content-Security-Policy of the page itself. */
async function open(page: Page, csp?: string) {
  const problems: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    (window as unknown as { csp: string[] }).csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { csp: string[] }).csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.route('https://limmat.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = csp ? { 'content-security-policy': csp } : undefined;
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        headers,
        body: `<!doctype html><html lang="en"><meta charset="utf-8"><title>math</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex.css"><main><div id="out"></div></main><script type="module" src="/app.js"></script>`,
      });
    if (path === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: app });
    if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: readFileSync(`${ROOT}dist/style.css`) });
    if (path === '/katex.css')
      return route.fulfill({ contentType: 'text/css', body: readFileSync(`${ROOT}node_modules/katex/dist/katex.min.css`) });
    if (path.startsWith('/fonts/'))
      return route.fulfill({ contentType: 'font/woff2', body: readFileSync(`${ROOT}node_modules/katex/dist/${path}`) });
    return route.fulfill({ status: 404, body: 'not found' });
  });
  await page.goto('https://limmat.test/');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  return { problems, requests };
}

type Kit = {
  katex: { render(t: string, el: HTMLElement, o?: object): void };
  temml: { render(t: string, el: HTMLElement, o?: object): void };
  createRenderer(el: HTMLElement, o?: object): { write(c: string): void; end(): void };
  katexMath(k: unknown, o?: object): (el: HTMLElement, tex: string, i: { display: boolean }) => void | Promise<void>;
};

for (const strict of [false, true]) {
  test.describe(strict ? 'under a strict CSP and Trusted Types' : 'plain page', () => {
    test('formulas are laid out with the real fonts, streaming shows no delimiter, and the end equals the whole text', async ({ page }) => {
      const { problems } = await open(page, strict ? STRICT : undefined);
      const r = await page.evaluate(async (doc) => {
        const { createRenderer, katexMath, katex } = (window as unknown as { kit: Kit }).kit;
        const out = document.getElementById('out') as HTMLElement;
        const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
        const md = createRenderer(out, { renderMath: katexMath(katex) });
        const leaks: string[] = [];
        for (let i = 0; i < doc.length; i += 3) {
          md.write(doc.slice(i, i + 3));
          await wait(6);
          const clone = out.cloneNode(true) as HTMLElement;
          for (const k of Array.from(clone.querySelectorAll('.katex'))) k.remove();
          const m = /\\\(|\\\[|\$\$/.exec(clone.textContent ?? '');
          if (m) leaks.push(`${m[0]} at ${i}`);
        }
        md.end();
        await wait(50);
        const whole = document.createElement('div');
        document.body.append(whole);
        const w = createRenderer(whole, { renderMath: katexMath(katex), throttleMs: 0 });
        w.write(doc);
        w.end();
        const boxes = Array.from(out.querySelectorAll('.katex'));
        const sizes = boxes.map((b) => {
          const rect = b.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const strut = out.querySelector('.katex-strut') as HTMLElement;
        return {
          leaks,
          same: out.innerHTML === whole.innerHTML,
          count: boxes.length,
          sized: sizes.every(Boolean),
          strut: strut ? getComputedStyle(strut).height : '',
          noPageScroll: document.documentElement.scrollWidth <= window.innerWidth,
          price: out.textContent?.includes('$5 and $10'),
          csp: (window as unknown as { csp: string[] }).csp,
        };
      }, DOC);
      expect(r.leaks).toEqual([]);
      expect(r.same).toBe(true);
      expect(r.count).toBe(4);
      expect(r.sized).toBe(true);
      expect(r.strut).not.toBe('0px'); // the formula's own heights are set from script, which a strict style-src allows (CSSOM)
      expect(r.noPageScroll).toBe(true);
      expect(r.price).toBe(true);
      expect(r.csp).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}

test('an async hook (KaTeX loaded late) fills the kept box, and the box stays while the text grows', async ({ page }) => {
  const { problems } = await open(page);
  const r = await page.evaluate(async () => {
    const { createRenderer, katexMath, katex } = (window as unknown as { kit: Kit }).kit;
    const out = document.getElementById('out') as HTMLElement;
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const render = katexMath(katex);
    let calls = 0;
    const md = createRenderer(out, {
      throttleMs: 0,
      renderMath: async (el: HTMLElement, tex: string, info: { display: boolean }) => {
        calls++;
        await wait(60); // the library arrives late
        await render(el, tex, info);
      },
    });
    md.write('first $a^2$');
    const box = out.querySelector('.limmat-math');
    const before = box?.textContent;
    for (const w of [' and', ' more', ' words', ' and **bold', '** text']) {
      md.write(w);
      await wait(15);
    }
    const kept = out.querySelector('.limmat-math') === box;
    await wait(150);
    md.end();
    return { before, kept, calls, filled: !!box?.querySelector('.katex'), same: out.querySelector('.limmat-math') === box };
  });
  expect(r.before).toBe('a^2'); // the tex shows as text until the result lands
  expect(r.kept).toBe(true);
  expect(r.same).toBe(true);
  expect(r.calls).toBe(1);
  expect(r.filled).toBe(true);
  expect(problems).toEqual([]);
});

test('hostile formulas make no request and run nothing', async ({ page }) => {
  const { requests } = await open(page);
  let dialog = false;
  page.on('dialog', (d) => {
    dialog = true;
    void d.dismiss();
  });
  const r = await page.evaluate(async () => {
    const { createRenderer, katexMath, katex } = (window as unknown as { kit: Kit }).kit;
    const out = document.getElementById('out') as HTMLElement;
    const md = createRenderer(out, { renderMath: katexMath(katex, { trust: true }), throttleMs: 0 });
    md.write(
      [
        '$\\href{javascript:alert(1)}{x}$',
        '$\\includegraphics{https://evil.example/x.png}$',
        '$\\htmlStyle{background:url(https://evil.example/y.png)}{x}$',
        '$\\text{<img src=https://evil.example/z.png onerror=alert(1)>}$',
        '\\[\\htmlClass{evil}{x}\\]',
      ].join('\n\n'),
    );
    md.end();
    await new Promise((res) => setTimeout(res, 300));
    return {
      unsafe: out.querySelectorAll('a, img, script, iframe, [onerror], [href], [src], [id]').length,
      count: out.querySelectorAll('.limmat-math').length,
    };
  });
  expect(r.unsafe).toBe(0);
  expect(r.count).toBe(5);
  expect(requests.filter((u) => u.includes('evil.example'))).toEqual([]);
  expect(dialog).toBe(false);
});

test('the same hook draws formulas with Temml (MathML), under a strict CSP', async ({ page }) => {
  const { problems } = await open(page, STRICT);
  const r = await page.evaluate(async (doc) => {
    const { createRenderer, temml } = (window as unknown as { kit: Kit }).kit;
    const out = document.getElementById('out') as HTMLElement;
    const md = createRenderer(out, {
      renderMath: (el: HTMLElement, tex: string, { display }: { display: boolean }) =>
        temml.render(tex, el, { displayMode: display, throwOnError: true }),
    });
    for (let i = 0; i < doc.length; i += 4) md.write(doc.slice(i, i + 4));
    md.end();
    const maths = Array.from(out.querySelectorAll('math'));
    return {
      count: maths.length,
      sized: maths.every((m) => m.getBoundingClientRect().width > 0 && m.getBoundingClientRect().height > 0),
      display: out.querySelectorAll('math[display="block"]').length,
      csp: (window as unknown as { csp: string[] }).csp,
    };
  }, DOC);
  expect(r.count).toBe(4);
  expect(r.sized).toBe(true);
  expect(r.display).toBe(2); // the block and the \\[ \\] formula
  expect(r.csp).toEqual([]);
  expect(problems).toEqual([]);
});
