import { describe, expect, it } from 'vitest';
import type { Options } from '../src/index';
import { audit, html, render, renderOpen } from './helpers/util';

const img = (root: Element) => Array.from(root.querySelectorAll('img'));

describe('images are on by default', () => {
  it('![alt](https-url) becomes an img with the alt text and a restrictive set of attributes', () => {
    const [el, ...rest] = img(render('![the alt](https://e.com/t.png)'));
    expect(rest).toEqual([]);
    expect(el.getAttribute('src')).toBe('https://e.com/t.png');
    expect(el.getAttribute('alt')).toBe('the alt');
    expect(el.getAttribute('class')).toBe('limmat-image');
    expect(el.getAttribute('loading')).toBe('lazy');
    expect(el.getAttribute('decoding')).toBe('async');
    expect(el.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(el.attributes.length).toBe(6);
  });

  it('an image is not wrapped in a link', () => {
    expect(render('![alt](https://e.com/t.png)').querySelectorAll('a').length).toBe(0);
  });

  it('formatting inside the alt text becomes plain alt text', () => {
    expect(img(render('![a *b* `c` [d](https://l.com)](https://e.com/t.png)'))[0].getAttribute('alt')).toBe('a b c d');
  });

  it('http and site-relative sources work, like links', () => {
    const srcs = img(render('![a](http://e.com/a.png) ![b](/img/b.png)')).map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['http://e.com/a.png', '/img/b.png']);
  });

  it('an image inside a link label stays an image inside the link', () => {
    const a = render('[![alt](https://e.com/i.png)](https://l.com)').querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://l.com');
    expect(a.querySelectorAll('img').length).toBe(1);
  });

  it('every chunking gives the same DOM as one write', () => {
    const md = 'before ![alt *x*](https://e.com/a.png) after [![i](https://e.com/b.png)](https://l.com)\n\n![c](/c.png)';
    const whole = html(render(md));
    for (const split of ['char', 'random', 3] as const) expect(html(render(md, split))).toBe(whole);
  });

  it('a half-open image shows its alt text and loads nothing until the destination closes', () => {
    expect(html(renderOpen('x ![alt](https://e.com/a.p'))).toBe('<p>x alt</p>');
    expect(html(renderOpen('x ![alt te'))).toBe('<p>x alt te</p>');
    expect(img(renderOpen('x ![alt](https://e.com/a.png)')).length).toBe(1);
  });

  it('passes the DOM audit', () => {
    expect(audit(render('![alt](https://e.com/t.png) and [![i](/b.png)](https://l.com)'))).toEqual([]);
  });
});

describe('images: false', () => {
  it('renders only the alt text and creates no img', () => {
    const root = render('![the alt](https://e.com/t.png)', 'whole', { images: false });
    expect(root.innerHTML).toBe('<p>the alt</p>');
  });
  it('keeps formatting in the alt text and leaves links inside it as text', () => {
    const root = render('![a *b* [c](https://l.com)](https://e.com/t.png)', 'whole', { images: false });
    expect(html(root)).toBe('<p>a <em>b</em> c</p>');
  });
  it('an image inside a link label becomes the label text', () => {
    const root = render('[![alt](https://e.com/i.png)](https://l.com)', 'whole', { images: false });
    expect(root.querySelectorAll('img').length).toBe(0);
    expect(root.querySelector('a')!.textContent).toBe('alt');
  });
});

describe('images with an origin allow-list', () => {
  const opt: Options = { images: ['https://cdn.e.com', 'http://plain.e.com:8080'] };
  const srcs = (md: string, o: Options = opt) => img(render(md, 'whole', o)).map((i) => i.getAttribute('src'));

  it('allows the listed origins and shows alt text for the rest', () => {
    expect(srcs('![a](https://cdn.e.com/a.png) ![b](https://other.com/b.png) ![c](http://plain.e.com:8080/c.png)')).toEqual([
      'https://cdn.e.com/a.png',
      'http://plain.e.com:8080/c.png',
    ]);
    expect(render('![b](https://other.com/b.png)', 'whole', opt).innerHTML).toBe('<p>b</p>');
  });

  it('matches the whole origin: scheme, host, and port', () => {
    expect(srcs('![a](http://cdn.e.com/a.png)')).toEqual([]);
    expect(srcs('![a](https://cdn.e.com:444/a.png)')).toEqual([]);
    expect(srcs('![a](https://x.cdn.e.com/a.png)')).toEqual([]);
    expect(srcs('![a](http://plain.e.com/a.png)')).toEqual([]);
  });

  it('is not fooled by look-alike hosts or userinfo', () => {
    expect(srcs('![a](https://cdn.e.com.evil.com/a.png)')).toEqual([]);
    expect(srcs('![a](https://cdn.e.com@evil.com/a.png)')).toEqual([]);
    expect(srcs('![a](https://evil.com/https://cdn.e.com/a.png)')).toEqual([]);
    expect(srcs('![a](https://evil.com/?u=https://cdn.e.com)')).toEqual([]);
  });

  it('normalizes the configured origins: case, a trailing slash, and a path are ignored', () => {
    expect(srcs('![a](https://cdn.e.com/a.png)', { images: ['HTTPS://CDN.E.COM/'] })).toEqual(['https://cdn.e.com/a.png']);
    expect(srcs('![a](https://cdn.e.com/a.png)', { images: ['https://cdn.e.com/some/path'] })).toEqual(['https://cdn.e.com/a.png']);
  });

  it('ignores invalid entries instead of throwing, and an empty list allows no images', () => {
    expect(srcs('![a](https://cdn.e.com/a.png)', { images: ['not a url', '', 'javascript:alert(1)', 'https://cdn.e.com'] })).toEqual([
      'https://cdn.e.com/a.png',
    ]);
    expect(srcs('![a](https://cdn.e.com/a.png)', { images: [] })).toEqual([]);
  });

  it('site-relative paths still work, because they are your own origin', () => {
    expect(srcs('![a](/img/a.png)')).toEqual(['/img/a.png']);
  });

  it('isInternalPath also gates image paths', () => {
    const o: Options = { images: true, isInternalPath: (p) => p.startsWith('/ok/') };
    expect(srcs('![a](/ok/a.png) ![b](/no/b.png)', o)).toEqual(['/ok/a.png']);
  });
});

describe('hostile image sources never create an img', () => {
  const hostile: [string, string][] = [
    ['javascript:', 'javascript:alert(1)'],
    ['mixed case javascript:', 'JaVaScRiPt:alert(1)'],
    ['data: svg', 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+'],
    ['data: png', 'data:image/png;base64,iVBORw0KGgo='],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['blob:', 'blob:https://evil.com/x'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://evil.com/x.png'],
    ['protocol-relative', '//evil.com/x.png'],
    ['backslash host', '/\\evil.com/x.png'],
    ['scheme with a zero-width character', 'java​script:alert(1)'],
    ['scheme with a line separator', 'java script:alert(1)'],
    ['scheme with an entity newline', 'java&NewLine;script:alert(1)'],
    ['no host', 'https:///x.png'],
    ['scheme only', 'https:'],
    ['no-break space before the scheme', ' https://evil.com/x.png'],
  ];
  for (const [name, src] of hostile) {
    for (const opts of [{}, { images: true }, { images: ['https://evil.com'] }] as Options[]) {
      it(`${name} with ${JSON.stringify(opts)}`, () => {
        for (const split of ['whole', 'char'] as const) {
          const root = render(`![alt](${src})`, split, opts);
          expect(root.querySelectorAll('img').length).toBe(0);
          expect(audit(root)).toEqual([]);
        }
      });
    }
  }

  it('allowedProtocols does not widen what an image may load', () => {
    const root = render('![a](mailto:a@b.c) ![b](ftp://e.com/x.png)', 'whole', { allowedProtocols: ['mailto', 'ftp', 'data'] });
    expect(root.querySelectorAll('img').length).toBe(0);
  });

  it('a link-protocol restriction also restricts images', () => {
    expect(render('![a](http://e.com/a.png)', 'whole', { allowedProtocols: ['https'] }).querySelectorAll('img').length).toBe(0);
    expect(render('![a](https://e.com/a.png)', 'whole', { allowedProtocols: ['https'] }).querySelectorAll('img').length).toBe(1);
  });

  it('a quote in the alt text or the source cannot break out of an attribute', () => {
    const root = render('![a" onerror="x](https://e.com/a.png)');
    expect(img(root)[0].getAttribute('alt')).toBe('a" onerror="x');
    expect(img(root)[0].hasAttribute('onerror')).toBe(false);
    expect(audit(root)).toEqual([]);
  });
});

describe('an image inside a link whose target is refused', () => {
  it('keeps the image and drops the link', () => {
    const root = render('[![alt](https://e.com/i.png)](javascript:alert(1))');
    expect(root.querySelectorAll('a').length).toBe(0);
    expect(img(root).length).toBe(1);
    expect(audit(root)).toEqual([]);
  });
});
