// @vitest-environment node
// renderToString runs with no `document`, `window`, or DOM library at all.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createDom, El } from '../src/dom';
import { createRenderer, type Options } from '../src/index';
import { renderToString } from '../src/server';
import { audit } from './helpers/audit';
import { CORPUS, REPLY, XSS } from './helpers/cases';

const docs: [string, string][] = [['reply', REPLY], ...CORPUS.map((c, i) => [`corpus ${i}`, c] as [string, string]), ...XSS];
const dom = () => new JSDOM('<body><div id="r"></div></body>').window.document as Document;
/** What the browser path leaves in a jsdom element, serialized by jsdom. */
const viaDom = (md: string, options: Options = {}) => {
  const el = dom().getElementById('r')!;
  const r = createRenderer(el, { ...options, throttleMs: 0 });
  r.write(md);
  r.end();
  return el.innerHTML;
};
type N = {
  nodeType: number;
  data?: string;
  localName?: string;
  attributes?: ArrayLike<{ name: string; value: string }>;
  childNodes: ArrayLike<N>;
};
const tree = (n: N): string =>
  n.nodeType === 3
    ? JSON.stringify(n.data)
    : `<${n.localName} ${Array.from(n.attributes ?? [], (a) => `${a.name}=${JSON.stringify(a.value)}`).join(' ')}>${Array.from(n.childNodes, tree).join('')}</${n.localName}>`;
/** An HTML string parsed back into a tree inside a div, the way a browser would read it. */
const parse = (html: string) => {
  const d = dom();
  d.body.innerHTML = `<div>${html}</div>`;
  return d.body.firstElementChild as Element;
};

describe('renderToString', () => {
  it('runs with no document or window global', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(renderToString('# Hi')).toBe('<h1 class="limmat-heading">Hi</h1>'.replace(' class="limmat-heading"', ''));
  });
  it('gives exactly what the DOM path serializes to, for every test document', () => {
    const bad: string[] = [];
    for (const [name, md] of docs) if (renderToString(md) !== viaDom(md)) bad.push(name);
    expect(bad).toEqual([]);
  });
  it('honors the options like the DOM path does', () => {
    const o: Options = { images: false, classPrefix: 'x', html: ['kbd'], externalLinksNewTab: false, labels: { copy: 'Kopieer' } };
    for (const [name, md] of docs) expect(renderToString(md, o), name).toBe(viaDom(md, o));
    expect(renderToString('```\nx\n```', { labels: { copy: 'Kopieer' } })).toContain('>Kopieer</button>');
  });
  it('leaves out the options that need a page: no highlight, no click handler, no throttle', () => {
    let called = 0;
    const out = renderToString('```ts\nlet x;\n```', { highlight: () => void called++, onLinkClick: () => true, throttleMs: 500 } as never);
    expect(called).toBe(0);
    expect(out).toBe(renderToString('```ts\nlet x;\n```'));
  });
  it('escapes text and attribute values', () => {
    expect(renderToString('<script>alert(1)</script> a & b > c')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; a &amp; b &gt; c</p>');
    expect(renderToString('a b')).toBe('<p>a&nbsp;b</p>');
    const img = renderToString('![a"b<c>&d](https://x.com/i.png)');
    expect(img).toContain('alt="a&quot;b&lt;c&gt;&amp;d"');
    expect(img).not.toMatch(/alt="[^"]*[<>][^"]*"/);
    const lang = renderToString('```">\'<script>alert(1)</script>\nx\n```');
    expect(lang).not.toContain('<script');
    expect(lang).toContain('aria-label="Copy &quot;&gt;');
  });
  it('every test document parses back to the same tree, with nothing the audit forbids', () => {
    const bad: string[] = [];
    for (const [name, md] of docs) {
      const want = parse(viaDom(md));
      const got = parse(renderToString(md));
      if (tree(got as unknown as N) !== tree(want as unknown as N)) bad.push(`${name}: tree`);
      const found = audit(got as unknown as Element);
      if (found.length) bad.push(`${name}: ${found.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });
  it('is the same on every call, and does not keep state between calls', () => {
    const a = renderToString(REPLY);
    expect(renderToString('# other')).toBe('<h1>other</h1>');
    expect(renderToString(REPLY)).toBe(a);
  });
  it('rejects input that is not a string', () => {
    expect(() => renderToString(undefined as never)).toThrow(TypeError);
    expect(() => renderToString(5 as never)).toThrow(TypeError);
    expect(renderToString('')).toBe('');
  });
});

describe('the DOM stub', () => {
  it('refuses a tag or attribute name that is not a plain name', () => {
    expect(() => new El('a b')).toThrow(TypeError);
    expect(() => new El('p onclick=')).toThrow(TypeError);
    const e = new El('p');
    expect(() => e.setAttribute('onclick="x()" a', '')).toThrow(TypeError);
    expect(() => e.setAttribute('a>', '')).toThrow(TypeError);
    e.setAttribute('data-x', '"><script>');
    expect(e.html()).toBe('<p data-x="&quot;&gt;&lt;script&gt;"></p>');
  });
  it('moves a node that is appended again, and serializes void elements without a closing tag', () => {
    const { root, html } = createDom();
    const a = new El('p');
    const b = new El('p');
    a.append('x', new El('br'), 'y');
    root.append(a, b);
    b.append(a.kids[1]);
    expect(html()).toBe('<p>xy</p><p><br></p>');
  });
});
