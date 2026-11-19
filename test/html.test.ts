import { describe, expect, it } from 'vitest';
import type { Options } from '../src/index';
import { audit, html, render, renderOpen } from './helpers/util';

const TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'kbd', 'sub', 'sup'];

describe('safe inline HTML tags are on by default', () => {
  for (const t of TAGS) {
    it(`<${t}>x</${t}> becomes a ${t} element`, () => {
      const root = render(`a <${t}>x</${t}> b`);
      expect(html(root)).toBe(`<p>a <${t}>x</${t}> b</p>`);
      expect(root.querySelector(t)!.attributes.length).toBe(t === 'kbd' ? 1 : 0); // only kbd gets a class
    });
  }

  it('tag names are case-insensitive', () => {
    expect(html(render('<KBD>Ctrl</KBD> and <Sup>2</sUP>'))).toBe('<p><kbd>Ctrl</kbd> and <sup>2</sup></p>');
  });

  it('markdown works inside a tag and tags work inside markdown', () => {
    expect(html(render('<b>a *b* `c` c</b>'))).toBe('<p><b>a <em>b</em> <code>c</code> c</b></p>');
    expect(html(render('**x <kbd>k</kbd> y**'))).toBe('<p><strong>x <kbd>k</kbd> y</strong></p>');
    expect(html(render('<kbd>Ctrl</kbd>+<kbd>C</kbd>'))).toBe('<p><kbd>Ctrl</kbd>+<kbd>C</kbd></p>');
  });

  it('tags nest, and work in link labels, headings, lists, quotes, and table cells', () => {
    expect(html(render('<b><i>x</i></b>'))).toBe('<p><b><i>x</i></b></p>');
    expect(render('[<kbd>k</kbd>](https://e.com)').querySelector('a kbd')!.textContent).toBe('k');
    expect(html(render('# a <sub>2</sub>'))).toBe('<h1>a <sub>2</sub></h1>');
    expect(html(render('- a <mark>b</mark>'))).toBe('<ul><li>a <mark>b</mark></li></ul>');
    expect(html(render('> a <u>b</u>'))).toBe('<blockquote><p>a <u>b</u></p></blockquote>');
    expect(render('| a |\n|---|\n| <kbd>x</kbd> |').querySelector('td kbd')!.textContent).toBe('x');
  });

  it('a tag can wrap an image, and the image keeps its checks', () => {
    const root = render('<b>![a](https://e.com/i.png)</b>');
    expect(root.querySelector('b img')).not.toBeNull();
    expect(audit(root)).toEqual([]);
  });

  it('passes the DOM audit', () => {
    expect(audit(render('<b>a</b> <kbd>b</kbd> <sub>c</sub> <sup>d</sup> <mark>e</mark>'))).toEqual([]);
  });

  it('every chunking gives the same DOM as one write', () => {
    const md = 'x <b>a *b* <kbd>c</kbd></b> y </i> z <u>open\n\n<sup>2</sup> and <br> and <kb';
    const whole = html(render(md));
    for (const split of ['char', 'random', 3] as const) expect(html(render(md, split))).toBe(whole);
  });
});

describe('tags with attributes, unknown tags, and unbalanced tags stay text', () => {
  const same = (md: string) => {
    const root = render(md);
    expect(root.textContent).toBe(md);
    expect(root.querySelectorAll('b,i,u,s,em,strong,del,ins,mark,small,kbd,sub,sup,script,img,a,div,span').length).toBe(0);
  };
  for (const md of [
    '<kbd class="x">k</kbd>',
    '<b onclick=alert(1)>x</b>',
    '<b\nonclick=x>x</b>',
    '<kbd/onclick=x>k</kbd>',
    '<b/>x</b>',
    '<b >x</b >',
    '< b>x</ b>',
    '<mark style="color:red">m</mark>',
    '<script>alert(1)</script>',
    '<thinking>hmm</thinking>',
    '<div>x</div>',
    '<span>x</span>',
    '<a href="https://e.com">x</a>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
  ])
    it(`${JSON.stringify(md)} is shown as text`, () => same(md));

  it('an unmatched closing tag is text', () => same('a </kbd> b'));
  it('an unmatched opening tag is text once the message ends', () => same('a <kbd>b'));
  it('a half-typed tag is text once the message ends', () => same('a <kb'));
  it('improper nesting keeps the inner tag as text', () => {
    expect(html(render('<b><i>x</b></i>'))).toBe('<p><b>&lt;i&gt;x</b>&lt;/i&gt;</p>');
  });
  it('a tag inside inline code or a fence is code text', () => {
    expect(render('`<kbd>x</kbd>`').querySelector('code')!.textContent).toBe('<kbd>x</kbd>');
    const fence = render('```\n<kbd>x</kbd>\n```');
    expect(fence.querySelector('kbd')).toBeNull();
    expect(fence.querySelector('code')!.textContent).toBe('<kbd>x</kbd>');
  });
  it('a tag inside a link destination or title is not parsed', () => {
    expect(render('[x](https://e.com/<b>)').querySelector('b')).toBeNull();
  });
});

describe('half-open tags while streaming show no raw markers', () => {
  const cases: [string, string, string][] = [
    ['open tag is closed speculatively', '<kbd>Ct', '<p><kbd>Ct</kbd></p>'],
    ['open tag with open emphasis', 'a <b>x *y', '<p>a <b>x <em>y</em></b></p>'],
    ['nested open tags', '<b>a <i>c', '<p><b>a <i>c</i></b></p>'],
    ['closed inner, open outer', '<b>a <i>c</i> d', '<p><b>a <i>c</i> d</b></p>'],
    ['lone <', 'a <', '<p>a </p>'],
    ['<k', 'a <k', '<p>a </p>'],
    ['<kbd', 'a <kbd', '<p>a </p>'],
    ['</', 'a </', '<p>a </p>'],
    ['</kb', 'a </kb', '<p>a </p>'],
    ['</strong without the bracket', 'a </strong', '<p>a </p>'],
    ['<br', 'a <br', '<p>a </p>'],
    ['not a tag prefix is text', 'a <z', '<p>a &lt;z</p>'],
    ['a less-than sign that is not a tag', 'a < b', '<p>a &lt; b</p>'],
    ['the tag name continues past a known tag', 'a <bold', '<p>a &lt;bold</p>'],
    ['complete tag then text', 'a <kbd>x</kbd> b', '<p>a <kbd>x</kbd> b</p>'],
  ];
  for (const [name, md, expected] of cases) it(name, () => expect(html(renderOpen(md))).toBe(expected));
});

describe('the html option', () => {
  const o = (x: Options['html']): Options => ({ html: x });
  it('false turns the tags off, but <br> still works', () => {
    const root = render('<kbd>x</kbd> <b>y</b> a<br>b', 'whole', o(false));
    expect(root.querySelector('kbd,b')).toBeNull();
    expect(root.querySelectorAll('br').length).toBe(1);
    expect(root.textContent).toBe('<kbd>x</kbd> <b>y</b> ab');
  });
  it('an array narrows the list', () => {
    const root = render('<kbd>x</kbd> <b>y</b>', 'whole', o(['kbd']));
    expect(root.querySelectorAll('kbd').length).toBe(1);
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).toBe('x <b>y</b>');
  });
  it('names that are not on the built-in list are ignored, so the option cannot create a script', () => {
    for (const bad of ['script', 'iframe', 'img', 'a', 'div', 'style', 'svg', 'math', 'form', 'constructor', 'toString']) {
      const root = render(`<${bad}>x</${bad}>`, 'whole', o([bad, 'kbd']));
      expect(root.querySelectorAll('p *').length).toBe(0);
      expect(root.textContent).toBe(`<${bad}>x</${bad}>`);
    }
  });
  it('prototype names in the list are harmless', () => {
    const root = render('<kbd>x</kbd>', 'whole', o(['__proto__', 'constructor', 'hasOwnProperty']));
    expect(root.textContent).toBe('<kbd>x</kbd>');
  });
  it('names are case-insensitive and an empty list allows none', () => {
    expect(render('<kbd>x</kbd>', 'whole', o(['KBD'])).querySelectorAll('kbd').length).toBe(1);
    expect(render('<kbd>x</kbd>', 'whole', o([])).querySelector('kbd')).toBeNull();
  });
  it('true is the default', () => {
    expect(render('<kbd>x</kbd>', 'whole', o(true)).querySelectorAll('kbd').length).toBe(1);
  });
});

describe('hostile tag input stays bounded', () => {
  it('deep nesting is capped and keeps all the text', () => {
    const md = '<b>'.repeat(200) + 'deep' + '</b>'.repeat(200);
    const root = render(md);
    expect(root.querySelectorAll('b').length).toBeLessThanOrEqual(31);
    expect(root.textContent).toContain('deep');
    expect((root.textContent ?? '').replace(/<\/?b>/g, '')).toBe('deep');
  });
  it('many unclosed and many unmatched tags are fast', () => {
    for (const md of ['<b>'.repeat(50000), '</b>'.repeat(50000), '<b></i>'.repeat(30000), '<b>x</b>'.repeat(30000), '<b>*'.repeat(30000)]) {
      const t = performance.now();
      render(md);
      renderOpen(md);
      expect(performance.now() - t).toBeLessThan(5000);
    }
  });
});
