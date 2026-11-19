import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../src/index';
import { mk, render } from './helpers/util';

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const realExec = (document as any).execCommand;
const click = (el: Element) => {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard);
  else delete (navigator as any).clipboard;
  (document as any).execCommand = realExec;
});

describe('lifecycle', () => {
  it('write after end is a no-op until reset', () => {
    const { root, r } = mk();
    r.write('a');
    r.end();
    r.write('b');
    expect(root.textContent).toBe('a');
    r.reset();
    r.write('c');
    r.end();
    expect(root.textContent).toBe('c');
  });
  it('reset empties the container and keeps options', () => {
    const { root, r } = mk({ classPrefix: 'x' });
    r.write('```\na\n```');
    r.reset();
    expect(root.childNodes.length).toBe(0);
    r.write('```\nb\n```');
    r.end();
    expect(root.querySelector('.x-code')).not.toBeNull();
  });
  it('destroy makes everything a no-op and removes the click listener', () => {
    const onLinkClick = vi.fn();
    const { root, r } = mk({ onLinkClick });
    r.write('[a](https://e.com)');
    r.end();
    const a = root.querySelector('a')!;
    r.destroy();
    r.write('more');
    a.click();
    expect(onLinkClick).not.toHaveBeenCalled();
    expect(root.textContent).toBe('a');
  });
  it('is safe to import and call without options', () => {
    expect(() => createRenderer(document.createElement('div')).write('x')).not.toThrow();
  });
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
    const b = mk({
      onLinkClick: (h: string) => {
        calls.push(h);
        return true;
      },
    });
    a.r.write('[x](https://a.com)');
    b.r.write('[y](https://b.com)');
    a.r.end();
    b.r.end();
    click(b.root.querySelector('a')!);
    expect(calls).toEqual(['https://b.com']);
    expect((a.root as any).textContent).toBe('x');
  });
  it('reset after a multi-block stream renders the next reply exactly like a fresh renderer (buffer and context reset)', () => {
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
  it('does not leak the table context into the next reply (fctx reset)', () => {
    const { root, r } = mk();
    for (const ch of '| a |\n|---|\n| 1 |\n| 2 |\n| 3 |\n| 4 |') r.write(ch);
    r.reset();
    r.write('plain | text\n\nnext');
    r.end();
    expect(root.textContent).toBe('plain | textnext');
  });
});

describe('throttle', () => {
  it('renders the first write at once, then at most once per interval, and end flushes', () => {
    vi.useFakeTimers();
    const { root, r } = mk({ throttleMs: 50 });
    r.write('a');
    expect(root.textContent).toBe('a');
    r.write('b');
    r.write('c');
    expect(root.textContent).toBe('a');
    vi.advanceTimersByTime(60);
    expect(root.textContent).toBe('abc');
    r.write('d');
    r.end();
    expect(root.textContent).toBe('abcd');
  });
  it('the first write renders at once with the default throttle, and the next one waits', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const r = createRenderer(root);
    r.write('a');
    expect(root.textContent).toBe('a');
    r.write('b');
    expect(root.textContent).toBe('a');
    vi.advanceTimersByTime(50);
    expect(root.textContent).toBe('ab');
  });
  it('a throttleMs that is not a finite number behaves exactly like the default', () => {
    for (const throttleMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      vi.useFakeTimers();
      const { root, r } = mk({ throttleMs });
      r.write('a');
      expect(root.textContent, String(throttleMs)).toBe('a');
      r.write('b');
      expect(root.textContent, String(throttleMs)).toBe('a');
      vi.advanceTimersByTime(50);
      expect(root.textContent, String(throttleMs)).toBe('ab');
      vi.useRealTimers();
    }
  });
});

describe('links', () => {
  it('onLinkClick can handle a click', () => {
    const calls: string[] = [];
    const { root, r } = mk({
      onLinkClick: (href: string) => {
        calls.push(href);
        return true;
      },
    });
    r.write('[a](/p/) [b](https://e.com)');
    r.end();
    const [a, b] = Array.from(root.querySelectorAll('a'));
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true });
    b.dispatchEvent(ev2);
    expect(calls).toEqual(['/p/', 'https://e.com']);
  });
  it('returning nothing leaves the default action', () => {
    const { root, r } = mk({ onLinkClick: () => {} });
    r.write('[a](/p/)');
    r.end();
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('a')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
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
});

describe('code blocks', () => {
  it('copy button writes to the clipboard and shows the copied label', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { root, r } = mk({ labels: { copy: 'Kopieren', copied: 'Kopiert' } });
    r.write('```js\nx()\n```');
    r.end();
    const btn = root.querySelector('button')!;
    expect(btn.textContent).toBe('Kopieren');
    btn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith('x()');
    expect(btn.textContent).toBe('Kopiert');
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Kopiert');
    await vi.advanceTimersByTimeAsync(2500);
    expect(btn.textContent).toBe('Kopieren');
    expect(root.querySelector('[role="status"]')!.textContent).toBe('');
  });
  it('falls back to execCommand without the Clipboard API, and never claims success when copying failed', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    (document as any).execCommand = exec;
    const { root, r } = mk();
    r.write('```\nx\n```');
    r.end();
    const btn = root.querySelector('button')!;
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Copied'));
    expect(exec).toHaveBeenCalledWith('copy');
    exec.mockReturnValue(false);
    btn.textContent = 'Copy';
    btn.click();
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(btn.textContent).toBe('Copy');
  });
  it('highlight is called once when the fence closes, with element, code and lang', async () => {
    const highlight = vi.fn();
    const { root, r } = mk({ highlight });
    r.write('```ts\nlet a');
    expect(highlight).not.toHaveBeenCalled();
    r.write(' = 1\n```');
    expect(highlight).toHaveBeenCalledTimes(1);
    r.write('\n\nmore text\n\nand more');
    r.end();
    expect(highlight).toHaveBeenCalledTimes(1);
    const [el, code, lang] = highlight.mock.calls[0];
    expect(el).toBe(root.querySelector('code'));
    expect([code, lang]).toEqual(['let a = 1', 'ts']);
  });
  it('highlight runs for a fence closed by end(), and errors are swallowed', async () => {
    const highlight = vi.fn().mockRejectedValue(new Error('boom'));
    const { root, r } = mk({ highlight });
    r.write('```\nunterminated');
    r.end();
    expect(highlight).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(root.querySelector('code')!.textContent).toBe('unterminated');
  });
  it('an open fence keeps the same element while streaming', () => {
    const { root, r } = mk();
    r.write('```\na');
    const pre = root.querySelector('pre');
    r.write('b\nc');
    expect(root.querySelector('pre')).toBe(pre);
    expect(root.querySelector('code')!.textContent).toBe('ab\nc');
  });
  it('creating a renderer empties the container, so a remount does not duplicate a finished message', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>old</p>';
    for (let i = 0; i < 2; i++) {
      const r = createRenderer(root, { throttleMs: 0 });
      r.write('# Title');
      r.end();
      r.destroy();
    }
    expect(root.innerHTML).toBe('<h1>Title</h1>');
  });
  it('a text selection inside an open fence survives the next chunk', () => {
    const { root, r } = mk();
    r.write('```\nalpha beta');
    const text = root.querySelector('code')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    r.write(' gamma');
    expect(root.querySelector('code')!.firstChild).toBe(text);
    expect(sel.toString()).toBe('alpha');
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
  it('the highlight adapter only passes safe language names to the highlighter', async () => {
    const highlightElement = vi.fn();
    vi.doMock('@speed-highlight/core', () => ({ highlightElement }));
    const { speedHighlight } = await import('../src/highlight');
    const hl = speedHighlight()!;
    const el = document.createElement('code');
    for (const bad of ['../x', 'a/b', 'a.b', 'a b', 'x'.repeat(21), 'js"onload=1', '..%2f']) await hl(el, 'x', bad);
    expect(highlightElement).not.toHaveBeenCalled();
    for (const good of ['js', 'c++', 'c#', 'objective-c', 'x_y']) await hl(el, 'x', good);
    await hl(el, 'x', '');
    expect(highlightElement.mock.calls.map((c) => c[1])).toEqual(['js', 'c++', 'c#', 'objective-c', 'x_y', undefined]);
    vi.doUnmock('@speed-highlight/core');
  });
  it('the copy fallback puts its textarea inside the container, so it also works in a modal dialog', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    let inside: boolean | undefined;
    (document as any).execCommand = vi.fn(() => {
      const ta = document.querySelector('textarea');
      inside = !!ta && root.contains(ta);
      return true;
    });
    const { root, r } = mk();
    r.write('```\nx\n```');
    r.end();
    root.querySelector('button')!.click();
    await vi.waitFor(() => expect(inside).toBeDefined());
    expect(inside).toBe(true);
    expect(root.querySelector('textarea')).toBeNull();
  });
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

describe('accessibility', () => {
  it('task checkboxes have an accessible name', () => {
    const { root, r } = mk();
    r.write('- [x] a\n- [ ] b');
    r.end();
    expect(Array.from(root.querySelectorAll('input')).map((i) => i.getAttribute('aria-label'))).toEqual(['Completed', 'Not completed']);
  });
  it('no live regions on messages, language label hidden, only the copy status is a status', () => {
    const { root, r } = mk();
    r.write('# t\n\ntext\n\n```ts\nx\n```\n\n| a |\n|---|\n| b |');
    r.end();
    expect(root.querySelectorAll('[aria-live]').length).toBe(0);
    expect(root.querySelectorAll('[role="status"]').length).toBe(1);
    expect(root.querySelector('table')!.parentElement!.getAttribute('tabindex')).toBe('0');
  });
});

describe('option and input hardening', () => {
  it('a missing container throws a readable TypeError', () => {
    expect(() => createRenderer(null as any)).toThrow(/limmat: container must be an element/);
    expect(() => createRenderer({} as any)).toThrow(TypeError);
  });
  it('allowedProtocols accepts names with or without the colon, in any case', () => {
    for (const p of ['https', 'HTTPS', 'https:', 'Https:']) {
      const { root, r } = mk({ allowedProtocols: [p] });
      r.write('[a](https://e.com) [b](http://e.com)');
      r.end();
      expect(Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['https://e.com']);
    }
  });
  it('a non-finite throttleMs falls back to the default instead of breaking the timer', () => {
    for (const t of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      const { root, r } = mk({ throttleMs: t });
      r.write('a');
      r.write(' b');
      r.end();
      expect(root.textContent).toBe('a b');
    }
  });
  it('a copy that resolves after destroy or reset leaves no timer and no label change', async () => {
    for (const how of ['destroy', 'reset'] as const) {
      let done!: () => void;
      const writeText = vi.fn(() => new Promise<void>((res) => (done = res)));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { root, r } = mk();
      r.write('```\nx\n```');
      r.end();
      const btn = root.querySelector('button')!;
      btn.click();
      r[how]();
      vi.useFakeTimers();
      done();
      await Promise.resolve();
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);
      expect(btn.textContent).toBe('Copy');
      vi.useRealTimers();
    }
  });
  it('task items carry the task class, with the prefix applied', () => {
    const { root, r } = mk({ classPrefix: 'x' });
    r.write('- [x] a\n- b');
    r.end();
    expect(Array.from(root.querySelectorAll('li')).map((l) => l.className)).toEqual(['x-task', '']);
  });
});

describe('options', () => {
  it('onLinkClick fires for autolinks, bare urls and mailto', () => {
    const calls: string[] = [];
    const { root, r } = mk({
      onLinkClick: (h: string) => {
        calls.push(h);
        return true;
      },
    });
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
    expect(root.querySelector('[role=group]')!.getAttribute('aria-label')).toBe('T');
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
    render('[x](/a/b?x=1#h)', 'whole', {
      isInternalPath: (p) => {
        seen.push(p);
        return true;
      },
    });
    expect([...new Set(seen)]).toEqual(['/a/b?x=1#h']);
  });
  it('onLinkClick returning a truthy non-true value does not prevent default (documented as "true")', () => {
    const { root, r } = mk({ onLinkClick: () => 1 as any });
    r.write('[a](https://a.com)');
    r.end();
    expect(click(root.querySelector('a')!).defaultPrevented).toBe(false);
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

describe('strict Content-Security-Policy', () => {
  it('never sets a style attribute as a string, because style-src without unsafe-inline blocks it', async () => {
    const seen: string[] = [];
    const real = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      if (name.toLowerCase() === 'style') seen.push(`${this.tagName}:${value}`);
      return real.call(this, name, value);
    };
    try {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      (document as any).execCommand = vi.fn().mockReturnValue(true);
      const { root, r } = mk();
      r.write('| a | b |\n|:-:|--:|\n| 1 | 2 |\n\n```ts\nx\n```');
      r.end();
      root.querySelector<HTMLButtonElement>('button')!.click();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    } finally {
      Element.prototype.setAttribute = real;
    }
    expect(seen).toEqual([]);
  });
});
