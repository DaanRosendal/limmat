import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../src/index';
import { mk } from './helpers/util';

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const realExec = (document as any).execCommand;
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
