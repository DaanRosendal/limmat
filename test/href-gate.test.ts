import { describe, expect, it, vi } from 'vitest';
import { CORPUS, REPLY, XSS } from './helpers/cases';
import { render } from './helpers/util';

// Every href and image src must be the return value of safeUrl(). The stand-in below adds a suffix to what the real
// safeUrl returns, so a URL that reached the DOM by any other way lacks it.
const VIA = '#via-safeUrl';
vi.mock('../src/url', async () => {
  const real = await vi.importActual<typeof import('../src/url')>('../src/url');
  return {
    ...real,
    safeUrl: (...a: Parameters<typeof real.safeUrl>) => {
      const r = real.safeUrl(...a);
      return r === null ? null : `${r}#via-safeUrl`;
    },
  };
});

const ALL_KINDS =
  '[a](https://e.com/a) [b](/p/) [m](mailto:a@b.c) <https://e.com/auto> <a@b.c> https://e.com/bare www.e.com/w a@b.c ![i](https://e.com/i.png) ![j](/i.png) [c](<https://e.com/c d>) [x](javascript:alert(1)) [y](#a) [z](rel/p)';

describe('every href and src comes from safeUrl()', () => {
  const docs = [...XSS.map(([, md]) => md), ...CORPUS, REPLY, ALL_KINDS];
  const seen = { a: 0, img: 0 };
  for (const [i, md] of docs.entries()) {
    it(`document ${i}`, () => {
      for (const split of ['whole', 'char'] as const) {
        const root = render(md, split);
        for (const a of Array.from(root.querySelectorAll('[href]'))) {
          seen.a++;
          expect(a.tagName, md).toBe('A');
          expect(a.getAttribute('href'), md).toMatch(new RegExp(`${VIA}$`));
        }
        for (const im of Array.from(root.querySelectorAll('[src]'))) {
          seen.img++;
          expect(im.tagName, md).toBe('IMG');
          expect(im.getAttribute('src'), md).toMatch(new RegExp(`${VIA}$`));
        }
      }
    });
  }
  it('the corpus has links and images, so the check is not empty', () => {
    expect(seen.a).toBeGreaterThan(50);
    expect(seen.img).toBeGreaterThan(5);
  });
  it('every kind of link and image is covered, and the refused ones are text', () => {
    const root = render(ALL_KINDS);
    expect(Array.from(root.querySelectorAll('a'), (a) => a.textContent)).toEqual([
      'a',
      'b',
      'm',
      'https://e.com/auto',
      'a@b.c',
      'https://e.com/bare',
      'www.e.com/w',
      'a@b.c',
    ]);
    expect(root.querySelectorAll('img').length).toBe(2);
  });
});
