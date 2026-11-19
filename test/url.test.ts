import { describe, expect, it } from 'vitest';
import { safeUrl } from '../src/url';
import { render } from './helpers/util';

describe('safeUrl', () => {
  const ok = () => true;
  it('http(s) needs a host', () => {
    for (const u of ['https:///evil.com', 'http://?x', 'https://#f', 'HTTPS:///x'])
      expect(safeUrl(u, ['https:', 'http:'], ok), u).toBeNull();
    expect(safeUrl('https://a.com', ['https:'], ok)).toBe('https://a.com');
  });
  it('rejects every character class in BAD', () => {
    for (const ch of [
      '\\',
      '\u0000',
      '\t',
      '\n',
      ' ',
      '\u007f',
      '\u0085',
      '\u009f',
      '\u00a0',
      '\u00ad',
      '\u200b',
      '\u200f',
      '\u2028',
      '\u2029',
      '\u202e',
      '\u2066',
      '\u2060',
      '\u3000',
      '\ufeff',
    ])
      expect(safeUrl(`https://a.com/${ch}x`, ['https:'], ok), JSON.stringify(ch)).toBeNull();
    expect(safeUrl('/a%20b', ['https:'], ok)).toBe('/a%20b');
  });
  it('scheme matching is case-insensitive and mailto needs a payload', () => {
    expect(safeUrl('MAILTO:a@b.c', ['mailto:'], ok)).toBe('MAILTO:a@b.c');
    expect(safeUrl('mailto:', ['mailto:'], ok)).toBeNull();
    expect(safeUrl('//x.com', ['https:'], ok)).toBeNull();
    expect(safeUrl('/x', ['https:'], () => false)).toBeNull();
  });
});

describe('link destinations', () => {
  it('refuses bidi, soft hyphen, nbsp and unparseable hosts in links', () => {
    for (const u of [
      'https://a.com/\u202e',
      'https://a\u00ad.com',
      'https://a.com\u00a0x',
      'https://a.com/\u2066x',
      'https://a.com\u2060/',
    ]) {
      expect(render(`[x](${u})`).querySelector('a'), JSON.stringify(u)).toBeNull();
    }
    expect(render('www.javascript:alert(1)').querySelector('a')).toBeNull();
    expect(render('[x](https://a.com/ok)').querySelector('a')).not.toBeNull();
  });
  const url = (n: number) => `https://e.com/${'a'.repeat(n - 14)}`;
  it('a destination up to 8192 characters is a link with the label as its text, in both forms', () => {
    for (const md of [`[x](${url(8000)})`, `[x](<${url(8000)}>)`]) {
      const root = render(md);
      expect(root.textContent).toBe('x');
      expect(root.querySelector('a')!.getAttribute('href')).toBe(url(8000));
    }
  });
  it('a longer destination is not a link: the markup stays as text', () => {
    for (const md of [`[x](${url(9000)})`, `[x](<${url(9000)}>)`]) {
      expect(render(md).textContent?.startsWith('[x](')).toBe(true);
    }
  });
  it('a long image source works too', () => {
    expect(
      render(`![x](${url(8000)})`)
        .querySelector('img')!
        .getAttribute('src'),
    ).toBe(url(8000));
  });
});
