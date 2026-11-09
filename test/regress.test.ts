import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../src/index';
import { parseInline } from '../src/inline';
import { html, render, renderOpen } from './helpers/util';

const CEILING = 1500; // ms, far above normal (a few ms) and far below the pre-fix times (seconds)
const timed = (fn: () => void) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};
const depth = (root: Element) => {
  let max = 0;
  const stack: [Element, number][] = [[root, 0]];
  while (stack.length) {
    const [e, d] = stack.pop()!;
    max = Math.max(max, d);
    for (const c of Array.from(e.children)) stack.push([c, d + 1]);
  }
  return max;
};
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('hostile input stays bounded (batch 1)', () => {
  it('deeply nested links inside emphasis do not build a deep DOM', () => {
    let root!: HTMLElement;
    const ms = timed(() => {
      root = render('*['.repeat(20000) + 'x' + '](x:)*'.repeat(20000), 'whole', { throttleMs: 0 });
    });
    expect(ms).toBeLessThan(5000);
    expect(depth(root)).toBeLessThan(45);
  });
  it('lines with unusual line terminators do not trigger regex backtracking', () => {
    for (const nl of [' ', ' ', '\r']) {
      expect(timed(() => render(`# ${' '.repeat(1500)}${nl}`))).toBeLessThan(CEILING);
      expect(timed(() => render(`${'`'.repeat(30000)}${nl}`))).toBeLessThan(CEILING);
    }
  });
  it('speculative closing of many openers is linear', () => {
    expect(timed(() => parseInline('*a '.repeat(10000), true))).toBeLessThan(CEILING);
    expect(timed(() => parseInline('~~a '.repeat(10000), true))).toBeLessThan(CEILING);
  });
  it('link destinations and titles cannot cause quadratic scanning', () => {
    expect(timed(() => render('[](a ('.repeat(40000)))).toBeLessThan(CEILING);
    expect(timed(() => render('[]('.repeat(100000)))).toBeLessThan(CEILING);
    expect(timed(() => render('[a](b "'.repeat(30000)))).toBeLessThan(CEILING);
  });
  it('the highlight adapter skips very large code', async () => {
    const highlightElement = vi.fn();
    vi.doMock('@speed-highlight/core', () => ({ highlightElement }));
    const { speedHighlight } = await import('../src/highlight');
    const hl = speedHighlight()!;
    const el = document.createElement('code');
    await hl(el, 'a'.repeat(5000), 'js');
    await hl(el, `${'a'.repeat(400)}\nb`, 'js');
    expect(highlightElement).not.toHaveBeenCalled();
    await hl(el, 'let a = 1;', 'js');
    expect(highlightElement).toHaveBeenCalledTimes(1);
    vi.doUnmock('@speed-highlight/core');
  });
  it('refuses bidi, soft hyphen, nbsp and unparseable hosts in links', () => {
    for (const u of ['https://a.com/‮', 'https://a­.com', 'https://a.com x', 'https://a.com/⁦x', 'https://a.com⁠/']) {
      expect(render(`[x](${u})`).querySelector('a'), JSON.stringify(u)).toBeNull();
    }
    expect(render('www.javascript:alert(1)').querySelector('a')).toBeNull();
    expect(render('[x](https://a.com/ok)').querySelector('a')).not.toBeNull();
  });
  it('a throwing isInternalPath renders plain text and does not poison the renderer', () => {
    const root = document.createElement('div');
    const r = createRenderer(root, {
      throttleMs: 0,
      isInternalPath: () => {
        throw new Error('boom');
      },
    });
    expect(() => r.write('[x](/a/) more')).not.toThrow();
    expect(() => r.write(' and more')).not.toThrow();
    r.end();
    expect(root.querySelector('a')).toBeNull();
    expect(root.textContent).toBe('x more and more');
  });
  it('undefined labels keep the defaults', () => {
    const root = render('```js\nx\n```', 'whole', { labels: { copy: undefined } });
    expect(root.querySelector('button')!.textContent).toBe('Copy');
    expect(root.querySelector('button')!.getAttribute('aria-label')).toBe('Copy js');
  });
});

describe('line endings', () => {
  const lf = '# H\n\n```js\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y\n';
  it('CRLF and CR render like LF, whole and split anywhere, including between CR and LF', () => {
    const want = render(lf).innerHTML;
    expect(render(lf.replace(/\n/g, '\r\n')).innerHTML).toBe(want);
    expect(render(lf.replace(/\n/g, '\r')).innerHTML).toBe(want);
    const crlf = lf.replace(/\n/g, '\r\n');
    for (let i = 1; i < crlf.length; i++) {
      const root = document.createElement('div');
      const r = createRenderer(root, { throttleMs: 0 });
      r.write(crlf.slice(0, i));
      r.write(crlf.slice(i));
      r.end();
      expect(root.innerHTML).toBe(want);
    }
  });
  it('a lone CR at the very end becomes a newline when the stream ends', () => {
    expect(html(render('a\r'))).toBe('<p>a</p>');
    expect(html(render('a\rb'))).toBe('<p>a\nb</p>');
  });
});

describe('correctness (batch 2)', () => {
  it('highlight is called exactly once for fences nested in lists and quotes, streamed per character', () => {
    for (const md of ['- l\n  ```c\n  z\n  ```\n- m', '> ```c\n> z\n> ```\n\nafter', '1. a\n   ```c\n   z\n   ```\n2. b']) {
      const highlight = vi.fn();
      const root = document.createElement('div');
      const r = createRenderer(root, { throttleMs: 0, highlight });
      for (const ch of md) r.write(ch);
      r.end();
      expect(highlight, JSON.stringify(md)).toHaveBeenCalledTimes(1);
      expect(highlight.mock.calls[0][1]).toBe('z');
    }
  });
  it('an unclosed nested fence is highlighted once, at end()', () => {
    const highlight = vi.fn();
    const root = document.createElement('div');
    const r = createRenderer(root, { throttleMs: 0, highlight });
    r.write('- a\n  ```c\n  z');
    expect(highlight).not.toHaveBeenCalled();
    r.end();
    expect(highlight).toHaveBeenCalledTimes(1);
  });
  it('lazy blockquote continuation only follows paragraph text', () => {
    expect(html(render('> ```\n> a\n> ```\nafter'))).toBe(
      '<blockquote><pre><code>a</code></pre></blockquote><p>after</p>'.replace(/<pre><code>a<\/code><\/pre>/, html(render('```\na\n```'))),
    );
    expect(html(render('> # h\ntext'))).toBe('<blockquote><h1>h</h1></blockquote><p>text</p>');
    expect(html(render('> a\nb'))).toBe('<blockquote><p>a\nb</p></blockquote>');
    expect(html(render('> bar\n>\nbaz'))).toBe('<blockquote><p>bar</p></blockquote><p>baz</p>');
  });
  it('speculative styling applies only to the last nested block', () => {
    expect(html(renderOpen('> **a\n>\n> b'))).not.toContain('<strong>');
    expect(html(renderOpen('- a **x\n  - b'))).not.toContain('<strong>');
    expect(html(renderOpen('> a\n>\n> **b'))).toContain('<strong>b</strong>');
  });
  it('a bare list marker at the end of the text is withheld until it is known', () => {
    for (const m of ['*', '-', '+', '1.', '1)', 'text\n-']) {
      const root = renderOpen(m);
      expect(root.querySelector('ul,ol'), JSON.stringify(m)).toBeNull();
    }
    expect(renderOpen('- a\n-').querySelectorAll('li').length).toBe(1);
    expect(html(render('-'))).toBe('<ul><li></li></ul>');
  });
  it('the Copy button resets even if end() is called while it says Copied', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    const root = document.createElement('div');
    document.body.append(root);
    const r = createRenderer(root, { throttleMs: 0 });
    r.write('```\nx\n```');
    const btn = root.querySelector('button')!;
    btn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(btn.textContent).toBe('Copied');
    r.end();
    await vi.advanceTimersByTimeAsync(2500);
    expect(btn.textContent).toBe('Copy');
  });
  it('list scanning: indent decides interruption, and an unclosed fence does not swallow the next item', () => {
    expect(html(render('para\n        - x'))).toBe('<p>para\n- x</p>');
    const root = render('- a\n  ```\n  code\n- b');
    expect(root.querySelectorAll('li').length).toBe(2);
    expect(root.querySelectorAll('code').length).toBe(1);
    expect(root.querySelectorAll('li')[1].textContent).toBe('b');
  });
  it('focus returns to the Copy button after the execCommand fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    const root = document.createElement('div');
    document.body.append(root);
    const r = createRenderer(root, { throttleMs: 0 });
    r.write('```\nx\n```');
    r.end();
    const btn = root.querySelector('button')!;
    btn.focus();
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Copied'));
    expect(document.activeElement).toBe(btn);
  });
});

describe('browser support guards (batch 3)', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
  it('no regex lookbehind in the source: Safari before 16.4 cannot even parse it', () => {
    for (const f of ['src/block.ts', 'src/inline.ts', 'src/index.ts', 'src/url.ts']) expect(src(f), f).not.toMatch(/\(\?<[!=]/);
  });
  it('the stylesheet has plain fallbacks before the color-mix upgrade', () => {
    const css = src('src/style.css');
    expect(css).toMatch(/--limmat-border:\s*rgba?\(/);
    expect(css).toMatch(/@supports \(color: color-mix/);
  });
});
