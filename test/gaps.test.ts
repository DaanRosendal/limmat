import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../src/index';
import { safeUrl } from '../src/url';
import { audit, html, render, renderOpen } from './helpers/util';

const mk = (o = {}) => {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, r: createRenderer(root, { throttleMs: 0, ...o }) };
};
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});
const click = (el: Element) => {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

describe('url gaps', () => {
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

describe('lifecycle gaps', () => {
  it('destroy with a pending throttle timer never renders later', () => {
    vi.useFakeTimers();
    const { root, r } = mk({ throttleMs: 50 });
    r.write('a');
    r.write('b');
    r.destroy();
    vi.advanceTimersByTime(500);
    expect(root.textContent).toBe('a');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reset with a pending throttle timer drops the stale render', () => {
    vi.useFakeTimers();
    const { root, r } = mk({ throttleMs: 50 });
    r.write('a');
    r.write('b');
    r.reset();
    vi.advanceTimersByTime(500);
    expect(root.textContent).toBe('');
    r.write('c');
    expect(root.textContent).toBe('c');
  });
  it('destroy while the copied label timer is pending clears it', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    const { root, r } = mk();
    r.write('```\nx\n```');
    r.end();
    click(root.querySelector('button')!);
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('button')!.textContent).toBe('Copied');
    r.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reset while a highlight promise is pending does not throw or touch the new content', async () => {
    let done!: () => void;
    const highlight = vi.fn(
      (el: HTMLElement) =>
        new Promise<void>(
          (res) =>
            (done = () => {
              el.textContent = 'HL';
              res();
            }),
        ),
    );
    const { root, r } = mk({ highlight });
    r.write('```\nold\n```');
    r.reset();
    r.write('new');
    r.end();
    done();
    await Promise.resolve();
    expect(root.textContent).toBe('new');
  });
  it('copy works for a fence rendered after reset', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { root, r } = mk();
    r.write('```\nold\n```');
    r.end();
    r.reset();
    r.write('```\nnew\n```');
    r.end();
    click(root.querySelector('button')!);
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('new');
  });
  it('reset removes content that was in the container before', () => {
    const root = document.createElement('div');
    root.innerHTML = '<b>pre</b>';
    const r = createRenderer(root, { throttleMs: 0 });
    r.reset();
    expect(root.childNodes.length).toBe(0);
  });
  it('two renderers on one page are independent', () => {
    const a = mk({ onLinkClick: vi.fn(() => true) });
    const calls: string[] = [];
    const b = mk({ onLinkClick: (h: string) => (calls.push(h), true) });
    a.r.write('[x](https://a.com)');
    b.r.write('[y](https://b.com)');
    a.r.end();
    b.r.end();
    click(b.root.querySelector('a')!);
    expect(calls).toEqual(['https://b.com']);
    expect((a.root as any).textContent).toBe('x');
  });
});

describe('options gaps', () => {
  it('onLinkClick fires for autolinks, bare urls and mailto', () => {
    const calls: string[] = [];
    const { root, r } = mk({ onLinkClick: (h: string) => (calls.push(h), true) });
    r.write('<https://a.com> https://b.com me@c.com [m](mailto:d@e.com)');
    r.end();
    root.querySelectorAll('a').forEach((a) => click(a));
    expect(calls).toEqual(['https://a.com', 'https://b.com', 'mailto:me@c.com', 'mailto:d@e.com']);
  });
  it('clicking non-link content does nothing', () => {
    const onLinkClick = vi.fn();
    const { root, r } = mk({ onLinkClick });
    r.write('text [a](https://a.com)');
    r.end();
    click(root.querySelector('p')!);
    expect(onLinkClick).not.toHaveBeenCalled();
  });
  it('classPrefix is applied to every generated class and nothing keeps the default', () => {
    const { root, r } = mk({ classPrefix: 'zz' });
    r.write('```ts\nx\n```\n\n| a |\n|---|\n| b |\n\n[l](https://a.com)\n\n- a\n1. b');
    r.end();
    const classes = Array.from(root.querySelectorAll('[class]')).flatMap((e) => Array.from(e.classList));
    expect(classes.length).toBeGreaterThan(8);
    expect(classes.filter((c) => !c.startsWith('zz-'))).toEqual([]);
  });
  it('all labels are applied', () => {
    const labels = { copy: 'C', copied: 'CD', table: 'T', done: 'D', todo: 'TD' };
    const { root, r } = mk({ labels });
    r.write('- [x] a\n- [ ] b\n\n```\nx\n```\n\n| a |\n|---|\n| b |');
    r.end();
    expect(Array.from(root.querySelectorAll('input')).map((i) => i.getAttribute('aria-label'))).toEqual(['D', 'TD']);
    expect(root.querySelector('button')!.textContent).toBe('C');
    expect(root.querySelector('button')!.getAttribute('aria-label')).toBe('C code');
    expect(root.querySelector('[role=region]')!.getAttribute('aria-label')).toBe('T');
  });
  it('partial labels keep defaults for the rest', () => {
    const { root, r } = mk({ labels: { copy: 'C' } });
    r.write('- [x] a');
    r.end();
    expect(root.querySelector('input')!.getAttribute('aria-label')).toBe('Completed');
  });
  it('allowedProtocols variants', () => {
    const f = (md: string, p: string[]) => render(md, 'whole', { allowedProtocols: p }).querySelectorAll('a').length;
    expect(f('[x](http://a.com)', ['https:'])).toBe(0);
    expect(f('[x](https://a.com)', ['http:'])).toBe(0);
    expect(f('[x](tel:123)', ['tel:'])).toBe(1);
    expect(f('[x](javascript:alert(1))', ['javascript:'])).toBe(0); // never allowed, even if listed
    expect(f('[x](data:text/html,x)', ['data:'])).toBe(0);
    expect(f('[x](vbscript:x)', ['vbscript:'])).toBe(0);
    expect(f('a@b.com', [])).toBe(0);
    expect(f('https://a.com', [])).toBe(0);
  });
  it('isInternalPath receives the raw path including query', () => {
    const seen: string[] = [];
    render('[x](/a/b?x=1#h)', 'whole', { isInternalPath: (p) => (seen.push(p), true) });
    expect([...new Set(seen)]).toEqual(['/a/b?x=1#h']);
  });
});

describe('table and nesting gaps', () => {
  const al = (md: string) => Array.from(render(md).querySelectorAll('th')).map((e) => (e as HTMLElement).style.textAlign);
  it('alignment edge cases', () => {
    expect(al('| a |\n|:-:|')).toEqual(['center']);
    expect(al('| a | b |\n| :- | -: |')).toEqual(['left', 'right']);
    expect(al('a | b\n:-:|--')).toEqual(['center', '']);
    expect(al('| a | b |\n|---|---|')).toEqual(['', '']);
    expect(al('| a |\n|:|')).toEqual([]); // not a delimiter row
  });
  it('rows with extra cells drop them, header with escaped pipe', () => {
    const root = render('| a \\| b | c |\n|--|--|\n| 1 | 2 | 3 |');
    expect(root.querySelectorAll('th')[0].textContent).toBe('a | b');
    expect(root.querySelectorAll('tbody tr')[0].children.length).toBe(2);
  });
  it('a table right after a blank line is a new table with its own alignment (ctx reset)', () => {
    const root = render('| a |\n|:-:|\n| 1 |\n\n| b |\n|---|\n| 2 |');
    const tds = root.querySelectorAll('td');
    expect((tds[0] as HTMLElement).style.textAlign).toBe('center');
    expect((tds[1] as HTMLElement).style.textAlign).toBe('');
  });
  it('a pipe row after a blank line is a paragraph, not a table row, even when streamed', () => {
    const md = '| a |\n|---|\n| 1 |\n\n| not a row |\n\nend';
    expect(render(md, 'char').innerHTML).toBe(render(md).innerHTML);
    expect(render(md).querySelectorAll('tbody tr').length).toBe(1);
  });
  it('nested blockquote plus list plus code', () => {
    expect(html(render('> - a\n>   - b\n> > c'))).toBe(
      '<blockquote><ul><li>a<ul><li>b</li></ul></li></ul><blockquote><p>c</p></blockquote></blockquote>',
    );
    const r2 = render('- a\n  > q1\n  > q2\n- b');
    expect(r2.querySelectorAll('li').length).toBe(2);
    expect(r2.querySelector('li blockquote')).not.toBeNull();
    expect(render('> ```js\n> x\n> ```').querySelector('blockquote pre code')!.textContent).toBe('x');
  });
  it('depth caps: 13+ nested lists and quotes stay safe and keep text', () => {
    const q = render('> '.repeat(40) + 'deep');
    expect(audit(q)).toEqual([]);
    expect(q.textContent).toContain('deep');
    expect(q.querySelectorAll('blockquote').length).toBeLessThanOrEqual(13);
    const l = render(Array.from({ length: 40 }, (_, i) => ' '.repeat(i * 2) + '- x' + i).join('\n'));
    expect(l.textContent).toContain('x39');
    expect(l.querySelectorAll('ul').length).toBeLessThanOrEqual(13);
  });
  it('inline depth cap keeps text and stays safe', () => {
    const s = '*a '.repeat(80) + 'z' + ' b*'.repeat(80);
    const root = render(s);
    expect(root.textContent).toContain('z');
    let d = 0;
    for (let e: Element | null = root.querySelector('em'); e; e = e.querySelector('em')) d++;
    expect(d).toBeLessThanOrEqual(31);
  });
});

describe('gaps found by mutation', () => {
  it('reset after a multi-block stream renders the next reply exactly like a fresh renderer (froz/fctx reset)', () => {
    const a = '# T\n\npara one\n\n| a |\n|:-:|\n| 1 |\n\npara two\n\n- x\n- y\n\ntail';
    const b = 'new *reply*\n\n| h |\n|--:|\n| 2 |';
    const { root, r } = mk();
    for (const ch of a) r.write(ch);
    r.write('\n\n');
    r.reset();
    for (const ch of b) r.write(ch);
    r.end();
    expect(root.innerHTML).toBe(render(b).innerHTML);
  });
  it('td cells get the column alignment', () => {
    const tds = Array.from(render('| a | b |\n|:-:|--:|\n| 1 | 2 |').querySelectorAll('td')).map((e) => (e as HTMLElement).style.textAlign);
    expect(tds).toEqual(['center', 'right']);
  });
  it('a link inside a link label is not nested', () => {
    expect(render('[a [b](https://b.com) c](https://a.com)').querySelectorAll('a a').length).toBe(0);
  });
  it('an image becomes text, not a link to the image URL', () => {
    expect(render('![alt](https://evil.com/t.png)').querySelectorAll('a').length).toBe(0);
  });
  it('uppercase [X] task checkbox', () => {
    expect((render('- [X] a').querySelector('input') as HTMLInputElement).defaultChecked).toBe(true);
  });
  it('a click on a link outside the container (container nested in an anchor) is ignored', () => {
    const a = document.createElement('a');
    a.href = 'https://outer.com';
    const root = document.createElement('div');
    a.append(root);
    document.body.append(a);
    const onLinkClick = vi.fn(() => true);
    const r = createRenderer(root, { throttleMs: 0, onLinkClick });
    r.write('plain');
    r.end();
    click(root.querySelector('p')!);
    expect(onLinkClick).not.toHaveBeenCalled();
  });
  it('onLinkClick returning a truthy non-true value does not prevent default (documented as "true")', () => {
    const { root, r } = mk({ onLinkClick: () => 1 as any });
    r.write('[a](https://a.com)');
    r.end();
    expect(click(root.querySelector('a')!).defaultPrevented).toBe(false);
  });
  it('end() with a throttled pending write and an unclosed fence still highlights once', () => {
    vi.useFakeTimers();
    const highlight = vi.fn();
    const { root, r } = mk({ throttleMs: 50, highlight });
    r.write('intro');
    r.write('\n\n```js\ncode');
    r.end();
    expect(root.querySelector('code')!.textContent).toBe('code');
    expect(highlight).toHaveBeenCalledTimes(1);
  });
  it('end() with a pending timer leaves no timers behind; destroy leaves none either', () => {
    vi.useFakeTimers();
    const { r } = mk({ throttleMs: 50 });
    r.write('a');
    r.write('b');
    expect(vi.getTimerCount()).toBe(1);
    r.end();
    expect(vi.getTimerCount()).toBe(0);
    const m = mk({ throttleMs: 50 });
    m.r.write('a');
    m.r.write('b');
    m.r.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('very long language and trailing-pipe escape', () => {
    expect(render('```' + 'a'.repeat(21) + '\nx\n```').querySelector('code')!.className).toBe('');
    expect(render('| a \\|\n|--|\n| b \\|').querySelectorAll('th')[0].textContent).toBe('a |');
  });
});

describe('reset after an open table', () => {
  it('does not leak the table context into the next reply (fctx reset)', () => {
    const { root, r } = mk();
    for (const ch of '| a |\n|---|\n| 1 |\n| 2 |\n| 3 |\n| 4 |') r.write(ch);
    r.reset();
    r.write('plain | text\n\nnext');
    r.end();
    expect(root.textContent).toBe('plain | textnext');
  });
});

describe('more gaps found by mutation', () => {
  it('a partial closing fence marker is not shown as code while streaming', () => {
    expect(renderOpen('```\nx\n``').querySelector('code')!.textContent).toBe('x');
    expect(renderOpen('~~~\nx\n~~').querySelector('code')!.textContent).toBe('x');
  });
  it('header and delimiter column counts must match for a table without leading pipe', () => {
    expect(render('a | b\n--|--|--\nc | d').querySelector('table')).toBeNull();
  });
  it('single trailing space before newline is not a hard break; two are', () => {
    expect(html(render('a \nb'))).toBe('<p>a \nb</p>');
    expect(html(render('a  \nb'))).toBe('<p>a<br>b</p>');
  });
  it('urls only autolink at a word boundary', () => {
    expect(render('xhttp://a.com and Xwww.a.com').querySelectorAll('a').length).toBe(0);
  });
  it('emphasis next to an astral emoji', () => {
    expect(html(render('\u{1F600}**a**'))).toBe('<p>\u{1F600}<strong>a</strong></p>');
    expect(html(render('**a**\u{1F600}'))).toBe('<p><strong>a</strong>\u{1F600}</p>');
  });
  it('email local part is capped, quote strip keeps extra indent', () => {
    expect(render('a'.repeat(200) + '@b.com').querySelector('a')!.textContent!.length).toBeLessThan(100);
    expect(html(render('>  a'))).toBe('<blockquote><p>a</p></blockquote>');
  });
  it('single tilde is literal inside text and strikethrough needs two on both sides', () => {
    expect(html(render('a ~b~ c'))).toBe('<p>a ~b~ c</p>');
    expect(html(render('a ~~b~ c'))).toBe('<p>a ~~b~ c</p>');
  });
  it('list item content with 5+ spaces after marker', () => {
    expect(html(render('-     a'))).toBe('<ul><li>a</li></ul>');
    expect(html(render('1.      a\n        b'))).toBe('<ol><li>a\nb</li></ol>');
  });
});
