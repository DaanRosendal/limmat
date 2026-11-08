import { describe, expect, it } from 'vitest';
import { audit, render } from './helpers/util';
import { XSS } from './helpers/cases';

describe('xss battery', () => {
  it('has at least 50 cases', () => expect(XSS.length).toBeGreaterThanOrEqual(50));
  for (const [name, md] of XSS) {
    for (const split of ['whole', 'char', 'random'] as const) {
      it(`${name} (${split})`, () => {
        const root = render(md, split);
        expect(audit(root)).toEqual([]);
        expect(root.querySelector('script,img,iframe,svg,style,form')).toBeNull();
      });
    }
  }
  it('images become plain text', () => {
    const root = render('![the alt](https://evil.com/t.png)');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toBe('the alt');
  });
  it('blocked links keep the label as text with no stray characters', () => {
    expect(render('[x](javascript:alert(1))').innerHTML).toBe('<p>x</p>');
    expect(render('a [x](//evil.com) b').textContent).toBe('a x b');
  });
  it('external links get target and rel, internal ones do not', () => {
    const a = render('[x](https://e.com) [y](/p/)').querySelectorAll('a');
    expect(a[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(a[0].getAttribute('target')).toBe('_blank');
    expect(a[1].getAttribute('target')).toBeNull();
  });
  it('allowedProtocols and isInternalPath are honored', () => {
    expect(render('[x](mailto:a@b.c)', 'whole', { allowedProtocols: ['https:'] }).querySelector('a')).toBeNull();
    const root = render('[x](/no/) [y](/yes/)', 'whole', { isInternalPath: (p) => p === '/yes/' });
    expect(Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/yes/']);
  });
  it('fence language becomes a sanitized class only', () => {
    const code = render('```ts\nx\n```').querySelector('code')!;
    expect(code.className).toMatch(/^limmat-lang-ts$/);
    expect(render('```a"b\nx\n```').querySelector('code')!.className).toBe('');
  });
});
