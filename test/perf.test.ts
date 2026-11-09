import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/index';
import { REPLY } from './helpers/cases';

// Timing budgets live in the Chromium suite (browser/bench.spec.ts), where they are stable.
// These only check that large and repeated inputs complete and leave a clean container.
describe('large and repeated input', () => {
  it('a 1 MB input renders in 4 KB chunks', () => {
    const root = document.createElement('div');
    const r = createRenderer(root, { throttleMs: 50 });
    const md = 'word '.repeat(200_000);
    for (let i = 0; i < md.length; i += 4096) r.write(md.slice(i, i + 4096));
    r.end();
    expect(root.textContent!.length).toBe(md.trim().length);
  });
  it('reset() leaves an empty container every time', () => {
    const root = document.createElement('div');
    const r = createRenderer(root, { throttleMs: 0 });
    for (let i = 0; i < 200; i++) {
      r.write(REPLY);
      r.end();
      r.reset();
      expect(root.childNodes.length).toBe(0);
    }
  });
});
