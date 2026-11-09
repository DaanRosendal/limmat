import { describe, expect, it } from 'vitest';
import { CORPUS, XSS } from './helpers/cases';
import { render, rng, type Split } from './helpers/util';

const docs = [...CORPUS, ...XSS.map(([, md]) => md)];

describe('chunked output equals whole output', () => {
  docs.forEach((md, i) => {
    it(`doc ${i} at every boundary and random sizes`, () => {
      const whole = render(md).innerHTML;
      const splits: Split[] = ['char', 2, 3, 5, 7, 12];
      for (const s of splits) expect(render(md, s).innerHTML, `split ${s}`).toBe(whole);
      for (let seed = 1; seed <= 12; seed++) expect(render(md, 'random', {}, seed).innerHTML, `seed ${seed}`).toBe(whole);
    });
  });

  it('two-part splits at every index', async () => {
    const { createRenderer } = await import('../src/index');
    for (const md of CORPUS.slice(0, 6)) {
      const whole = render(md).innerHTML;
      for (let i = 1; i < md.length; i++) {
        const root = document.createElement('div');
        const r = createRenderer(root, { throttleMs: 0 });
        r.write(md.slice(0, i));
        r.write(md.slice(i));
        r.end();
        expect(root.innerHTML).toBe(whole);
      }
    }
  });

  it('throttled renderer reaches the same final DOM', async () => {
    const { createRenderer } = await import('../src/index');
    for (const md of CORPUS) {
      const root = document.createElement('div');
      const r = createRenderer(root, { throttleMs: 50 });
      const rand = rng(3);
      for (let i = 0; i < md.length; ) {
        const n = 1 + Math.floor(rand() * 8);
        r.write(md.slice(i, i + n));
        i += n;
      }
      r.end();
      expect(root.innerHTML).toBe(render(md).innerHTML);
    }
  });
});
