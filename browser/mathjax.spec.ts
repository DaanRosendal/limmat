// The MathJax recipe from docs/math.md, in real browsers: that formulas are drawn, that streaming shows no delimiter and ends on the
// same page as the whole text, that its safe extension keeps hostile formulas inert, and that it needs a looser CSP than KaTeX.
// MathJax runs a blob worker, which Playwright's route.fulfill breaks in WebKit, so this page is served by a real local server.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MJ = `${ROOT}node_modules/mathjax/`;
const DOC =
  'Euler: \\(e^{i\\pi}+1=0\\), and $x_1 + y_2$ with a price of $5 and $10.\n\n$$\n\\int_0^1 x\\,dx = \\frac12\n$$\n\nAnd \\[\\sum_{i=1}^n i\\] done.\n';

// The recipe in docs/math.md, and the same without ui/safe.
const SAFE = `window.MathJax = { loader: { load: ['ui/safe'] }, tex: { formatError: (jax, err) => { throw err; } }, startup: { typeset: false } };`;
const UNSAFE = `window.MathJax = { tex: { formatError: (jax, err) => { throw err; } }, startup: { typeset: false } };`;
const LOOSE = "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; worker-src blob:; img-src data:";
const STRICT = "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:";

let server: http.Server;
let base = '';
let config = SAFE;
let csp: string | undefined;

test.beforeAll(async () => {
  const limmat = readFileSync(`${ROOT}dist/index.js`);
  const css = readFileSync(`${ROOT}dist/style.css`);
  server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (type: string, body: string | Buffer, status = 200) => {
      res.writeHead(status, { 'content-type': type, ...(csp && path === '/' ? { 'content-security-policy': csp } : {}) });
      res.end(body);
    };
    if (path === '/')
      return send(
        'text/html',
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>mathjax</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/s.css"><main><div id="out"></div></main><script src="/cfg.js"></script><script src="/mj/tex-svg.js"></script>',
      );
    if (path === '/cfg.js') return send('text/javascript', config);
    if (path === '/limmat.js') return send('text/javascript', limmat);
    if (path === '/s.css') return send('text/css', css);
    if (path.startsWith('/mj/') && !path.includes('..')) {
      try {
        return send(
          path.endsWith('.js') || path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream',
          readFileSync(MJ + path.slice(4)),
        );
      } catch {
        return send('text/plain', 'not found', 404);
      }
    }
    return send('text/plain', 'not found', 404);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
test.afterAll(() => server.close());

/** Opens a page that has limmat and MathJax. `cfg` is the MathJax settings and `policy` the page's Content-Security-Policy. */
async function open(page: Page, cfg: string, policy?: string) {
  config = cfg;
  csp = policy;
  const problems: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(base);
  await page.waitForFunction(() => !!(window as unknown as { MathJax?: { startup?: { promise?: unknown } } }).MathJax?.startup?.promise);
  return { problems, requests };
}

// The page side: the recipe's renderMath, then a renderer on #out.
// shape() is the page with each finished formula replaced by its tex: MathJax adds speech text and counters of its own, which differ
// between two pages and arrive late.
const PAGE = `
  window.shape = (root) => {
    const c = root.cloneNode(true);
    for (const m of Array.from(c.querySelectorAll('mjx-container'))) {
      const tex = m.querySelector('[data-latex]');
      m.replaceWith(c.ownerDocument.createTextNode('[math ' + (tex ? tex.getAttribute('data-latex') : '') + ']'));
    }
    return c.innerHTML;
  };
  window.drawn = (root) => Array.from(root.querySelectorAll('mjx-container')).filter((c) => c.querySelector('svg')).length;
  window.setup = async (opts) => {
    const { createRenderer } = await import('/limmat.js');
    const hook = async (el, tex, { display }) => {
      await MathJax.startup.promise;
      el.replaceChildren(await MathJax.tex2svgPromise(tex, { display }));
    };
    return { createRenderer, hook };
  };
`;

type Kit = {
  createRenderer(el: HTMLElement, o?: object): { write(c: string): void; end(): void };
  hook(el: HTMLElement, tex: string, i: { display: boolean }): Promise<void>;
};
declare global {
  interface Window {
    setup(): Promise<Kit>;
    drawn(root: Element): number;
    shape(root: Element): string;
  }
}

for (const policy of [undefined, LOOSE]) {
  test(`formulas are drawn, streaming shows no delimiter, and the end equals the whole text${policy ? ' (under the looser CSP)' : ''}`, async ({
    page,
  }) => {
    const { problems } = await open(page, SAFE, policy);
    await page.evaluate(PAGE);
    const r = await page.evaluate(async (doc) => {
      const { createRenderer, hook } = await window.setup();
      const out = document.getElementById('out') as HTMLElement;
      const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const md = createRenderer(out, { renderMath: hook });
      const leaks: string[] = [];
      for (let i = 0; i < doc.length; i += 3) {
        md.write(doc.slice(i, i + 3));
        await wait(6);
        const clone = out.cloneNode(true) as HTMLElement;
        for (const k of Array.from(clone.querySelectorAll('mjx-container, .limmat-math-open'))) k.remove();
        const m = /\\\(|\\\[|\$\$/.exec(clone.textContent ?? '');
        if (m) leaks.push(`${m[0]} at ${i}`);
      }
      md.end();
      const whole = document.createElement('div');
      document.body.append(whole);
      const w = createRenderer(whole, { renderMath: hook, throttleMs: 0 });
      w.write(doc);
      w.end();
      const until = Date.now() + 20000;
      while (Date.now() < until && (window.drawn(out) < 4 || window.drawn(whole) < 4)) await wait(50);
      const containers = Array.from(out.querySelectorAll('mjx-container'));
      return {
        leaks,
        chunked: window.shape(out),
        whole: window.shape(whole),
        svgs: window.drawn(out),
        boxes: out.querySelectorAll('.limmat-math').length,
        sized: containers.every((c) => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0),
        display: out.querySelectorAll('.limmat-math-display').length,
        price: out.textContent?.includes('$5 and $10'),
      };
    }, DOC);
    expect(r.leaks).toEqual([]);
    expect(r.boxes).toBe(4);
    expect(r.svgs).toBe(4);
    expect(r.display).toBe(2);
    expect(r.sized).toBe(true);
    expect(r.chunked).toBe(r.whole);
    expect(r.chunked).toContain('[math e^{i\\pi}+1=0]');
    expect(r.price).toBe(true);
    expect(problems).toEqual([]);
  });
}

test('the kept box is filled when MathJax answers late, and stays while the text grows', async ({ page }) => {
  const { problems } = await open(page, SAFE);
  await page.evaluate(PAGE);
  const r = await page.evaluate(async () => {
    const { createRenderer, hook } = await window.setup();
    const out = document.getElementById('out') as HTMLElement;
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
    let calls = 0;
    const md = createRenderer(out, {
      throttleMs: 0,
      renderMath: (el: HTMLElement, tex: string, i: { display: boolean }) => {
        calls++;
        return hook(el, tex, i);
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
    const until = Date.now() + 20000;
    while (Date.now() < until && !box?.querySelector('svg')) await wait(50);
    md.end();
    return { before, kept, calls, filled: !!box?.querySelector('svg'), same: out.querySelector('.limmat-math') === box };
  });
  expect(r.before).toBe('a^2'); // the tex shows as text until the result lands
  expect(r.kept).toBe(true);
  expect(r.same).toBe(true);
  expect(r.calls).toBe(1);
  expect(r.filled).toBe(true);
  expect(problems).toEqual([]);
});

// Formulas a hostile reply could contain, and the MathJax commands they use.
const HOSTILE = [
  '$\\href{javascript:alert(1)}{x}$',
  '$\\style{background:url(https://evil.example/y.png)}{x}$',
  '$\\class{fixed inset-0 bg-black}{x}$',
  '$\\cssId{app}{x}$',
  '$\\frac{1$',
];

/** Renders the hostile formulas and reports what ended up on the page. */
async function hostile(page: Page) {
  await page.evaluate(PAGE);
  return page.evaluate(async (items) => {
    const { createRenderer, hook } = await window.setup();
    const out = document.getElementById('out') as HTMLElement;
    const md = createRenderer(out, { renderMath: hook, throttleMs: 0 });
    md.write(items.join('\n\n'));
    md.end();
    const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const until = Date.now() + 20000;
    while (Date.now() < until && window.drawn(out) < 4) await wait(50);
    await wait(300);
    const boxes = Array.from(out.querySelectorAll('.limmat-math'));
    const foreign = Array.from(out.querySelectorAll('[class], [id]')).flatMap((e) => [
      ...(e.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !/^(mjx-|MathJax|CtxtMenu)/.test(c) && c !== 'limmat-math' && c !== 'limmat-math-display'),
      ...(e.id && !/^(mjx-|MJX)/.test(e.id) ? [`#${e.id}`] : []),
    ]);
    return {
      boxes: boxes.length,
      svgs: window.drawn(out),
      jsTarget: Array.from(out.querySelectorAll('*')).some((e) =>
        Array.from(e.attributes).some((a) => a.name !== 'data-latex' && /^\s*javascript:/i.test(a.value)),
      ),
      foreign,
      broken: boxes[boxes.length - 1]?.textContent,
      brokenSvg: !!boxes[boxes.length - 1]?.querySelector('svg'),
    };
  }, HOSTILE);
}

test('with ui/safe, hostile formulas make no request, keep no javascript link, class, or id, and a bad formula stays as its tex', async ({
  page,
}) => {
  const { requests, problems } = await open(page, SAFE);
  const r = await hostile(page);
  expect(r.boxes).toBe(5);
  expect(r.svgs).toBe(4);
  expect(r.jsTarget).toBe(false);
  expect(r.foreign).toEqual([]);
  expect(r.brokenSvg).toBe(false);
  expect(r.broken).toBe('\\frac{1');
  expect(requests.filter((u) => u.includes('evil.example'))).toEqual([]);
  expect(problems).toEqual([]);
});

test('without ui/safe MathJax does make the request and keeps the classes (the control for the test above)', async ({ page }) => {
  const { requests } = await open(page, UNSAFE);
  const r = await hostile(page);
  expect(r.jsTarget).toBe(true);
  expect(r.foreign).toContain('bg-black');
  expect(requests.filter((u) => u.includes('evil.example')).length).toBeGreaterThan(0);
});

test('under a strict CSP the formulas stay as their tex, and nothing breaks', async ({ page }) => {
  await open(page, SAFE, STRICT);
  await page.evaluate(PAGE);
  const r = await page.evaluate(async () => {
    const { createRenderer, hook } = await window.setup();
    const out = document.getElementById('out') as HTMLElement;
    const md = createRenderer(out, { renderMath: hook, throttleMs: 0 });
    md.write('a $x^2$ and\n\n$$\ny\n$$\n');
    md.end();
    await new Promise((res) => setTimeout(res, 2000));
    return { svgs: out.querySelectorAll('svg').length, boxes: Array.from(out.querySelectorAll('.limmat-math')).map((b) => b.textContent) };
  });
  expect(r.svgs).toBe(0);
  expect(r.boxes).toEqual(['x^2', 'y']);
});
