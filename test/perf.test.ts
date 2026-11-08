import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/index';
import { REPLY } from './helpers/cases';

// jsdom is several times slower than a real browser, so these are loose proxies for the Chromium suite.
function stream(md: string, n: number, throttleMs = 0) {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs });
  const t = performance.now();
  for (let i = 0; i < md.length; i += n) r.write(md.slice(i, i + n));
  r.end();
  return performance.now() - t;
}
const list = (k: number) => Array.from({ length: k }, (_, i) => `- item ${i} with *em*`).join('\n');
const table = (k: number) => '| a | b |\n|--|--|\n' + Array.from({ length: k }, (_, i) => `| ${i} | x *y* |`).join('\n');
const para = (k: number) => 'word **bold** and `code` text '.repeat(k);

describe('performance proxies (jsdom)', () => {
  it('100 KB mixed document, 5 char chunks, default throttle', () => {
    const doc = REPLY.repeat(Math.ceil(100_000 / REPLY.length));
    expect(stream(doc, 5, 50)).toBeLessThan(400);
  });
  it('100 KB mixed document, every write rendered', () => {
    const doc = REPLY.repeat(Math.ceil(100_000 / REPLY.length));
    expect(stream(doc, 5)).toBeLessThan(3000);
  });
  for (const [name, make, k] of [['list', list, 400], ['table', table, 400]] as const) {
    it(`${name} does not go quadratic with every write rendered`, () => {
      stream(make(50), 5);
      const a = stream(make(k), 5);
      const b = stream(make(k * 4), 5);
      expect(b / Math.max(a, 1)).toBeLessThan(9);
      expect(a).toBeLessThan(1500);
    });
  }
  it('a long paragraph is fast with the default throttle', () => {
    expect(stream(para(3000), 5, 50)).toBeLessThan(400);
  });
  it('1 MB input finishes', () => expect(stream('word '.repeat(200_000), 4096)).toBeLessThan(5000));
  it('memory is flat across 1000 reset cycles (node count)', () => {
    const root = document.createElement('div');
    const r = createRenderer(root, { throttleMs: 0 });
    for (let i = 0; i < 1000; i++) { r.write(REPLY); r.end(); r.reset(); }
    expect(root.childNodes.length).toBe(0);
  });
});
