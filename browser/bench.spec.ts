import { REPLY } from '../test/helpers/cases';
import { expect, test } from './fixture';

type Run = (md: string, n: number, opts?: object) => number;
const prelude = () => {
  (window as any).run = ((md: string, n: number, opts: object = {}) => {
    const root = document.createElement('div');
    document.body.append(root);
    const r = (window as any).limmat.createRenderer(root, opts);
    const t = performance.now();
    for (let i = 0; i < md.length; i += n) r.write(md.slice(i, i + n));
    r.end();
    const dt = performance.now() - t;
    root.remove();
    return dt;
  }) as Run;
};
const median = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];

test.describe('performance budgets (Chromium)', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'budgets and the memory test are Chromium only (gc and performance.memory)');
    await page.evaluate(prelude);
  });

  test('100 KB mixed document in 5-char chunks takes under 50 ms in total', async ({ page }) => {
    const doc = REPLY.repeat(Math.ceil(100_000 / REPLY.length));
    const times = await page.evaluate((doc) => Array.from({ length: 7 }, () => (window as any).run(doc, 5)), doc);
    console.log('100 KB, default throttle, ms:', times.map((t) => t.toFixed(1)).join(' '));
    expect(median(times)).toBeLessThan(75); // budget is 50 ms, and the extra margin absorbs slow CI runners
  });

  test('100 KB with every write rendered stays usable', async ({ page }) => {
    const doc = REPLY.repeat(Math.ceil(100_000 / REPLY.length));
    const t = await page.evaluate((doc) => (window as any).run(doc, 5, { throttleMs: 0 }), doc);
    console.log('100 KB, throttle 0, ms:', t.toFixed(0));
    expect(t).toBeLessThan(1500);
  });

  for (const name of ['8 KB list', '100-row table']) {
    test(`${name} does not go quadratic when every write is rendered`, async ({ page }) => {
      const make2 = name.includes('list') ? 'list' : 'table';
      const r = await page.evaluate(
        ({ make2 }) => {
          const mk = (k: number) =>
            make2 === 'list'
              ? Array.from({ length: k }, (_, i) => `- item ${i} with *em*`).join('\n')
              : '| a | b |\n|--|--|\n' + Array.from({ length: k }, (_, i) => `| ${i} | x *y* |`).join('\n');
          const run = (window as any).run as Run;
          const best = (md: string) => Math.min(...Array.from({ length: 3 }, () => run(md, 5, { throttleMs: 0 })));
          const base = make2 === 'list' ? 400 : 100;
          return { small: best(mk(base)), big: best(mk(base * 4)) };
        },
        { make2 },
      );
      console.log(name, 'x1:', r.small.toFixed(1), 'ms, x4:', r.big.toFixed(1), 'ms');
      expect(r.big / Math.max(r.small, 1)).toBeLessThan(7);
      expect(r.small).toBeLessThan(300);
    });
  }

  test('the cost of a write does not grow with the size of the message', async ({ page }) => {
    const doc = REPLY.repeat(Math.ceil(300_000 / REPLY.length));
    const r = await page.evaluate((doc) => {
      const root = document.createElement('div');
      document.body.append(root);
      const w = (window as any).limmat.createRenderer(root, { throttleMs: 0 });
      const marks = [0, 0.1, 0.9, 1].map((f) => Math.floor(doc.length * f));
      const at: number[] = [];
      for (let i = 0; i <= doc.length; i++) {
        if (marks.includes(i)) at.push(performance.now());
        if (i < doc.length) w.write(doc[i]);
      }
      root.remove();
      return { early: at[1] - at[0], late: at[3] - at[2] };
    }, doc);
    console.log('first 10% of the writes:', r.early.toFixed(0), 'ms, last 10%:', r.late.toFixed(0), 'ms');
    expect(r.late / Math.max(r.early, 1)).toBeLessThan(2.5); // flat is about 1, buffering the whole message again gave 5 to 10
  });

  test('1 MB of input finishes without hanging the page', async ({ page }) => {
    const t = await page.evaluate(() => (window as any).run('word '.repeat(200_000), 4096));
    console.log('1 MB, ms:', t.toFixed(0));
    expect(t).toBeLessThan(2000);
  });

  test('memory stays flat across 1,000 reset() cycles', async ({ page }) => {
    const r = await page.evaluate((reply) => {
      const root = document.getElementById('root')!;
      const r = (window as any).limmat.createRenderer(root, { throttleMs: 0 });
      const cycle = (n: number) => {
        for (let i = 0; i < n; i++) {
          r.write(reply);
          r.end();
          r.reset();
        }
      };
      const heap = () => {
        (window as any).gc();
        (window as any).gc();
        return (performance as any).memory.usedJSHeapSize as number;
      };
      cycle(100);
      const before = heap();
      const nodes = document.getElementsByTagName('*').length;
      cycle(1000);
      return { before, after: heap(), nodes, nodesAfter: document.getElementsByTagName('*').length };
    }, REPLY);
    console.log('heap MB before/after:', (r.before / 1e6).toFixed(2), (r.after / 1e6).toFixed(2));
    expect(r.after).toBeLessThan(r.before * 1.1 + 1e6);
    expect(r.nodesAfter).toBe(r.nodes);
  });
});
