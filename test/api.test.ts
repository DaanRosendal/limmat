import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderer } from '../src/index';

const mk = (o = {}) => {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, r: createRenderer(root, { throttleMs: 0, ...o }) };
};
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('lifecycle', () => {
  it('write after end is a no-op until reset', () => {
    const { root, r } = mk();
    r.write('a'); r.end(); r.write('b');
    expect(root.textContent).toBe('a');
    r.reset(); r.write('c'); r.end();
    expect(root.textContent).toBe('c');
  });
  it('reset empties the container and keeps options', () => {
    const { root, r } = mk({ classPrefix: 'x' });
    r.write('```\na\n```'); r.reset();
    expect(root.childNodes.length).toBe(0);
    r.write('```\nb\n```'); r.end();
    expect(root.querySelector('.x-code')).not.toBeNull();
  });
  it('destroy makes everything a no-op and removes the click listener', () => {
    const onLinkClick = vi.fn();
    const { root, r } = mk({ onLinkClick });
    r.write('[a](https://e.com)'); r.end();
    const a = root.querySelector('a')!;
    r.destroy(); r.write('more');
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
    r.write('b'); r.write('c');
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
    const { root, r } = mk({ onLinkClick: (href: string) => (calls.push(href), true) });
    r.write('[a](/p/) [b](https://e.com)'); r.end();
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
    r.write('[a](/p/)'); r.end();
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
    r.write('```js\nx()\n```'); r.end();
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
    r.write('```\nunterminated'); r.end();
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
  it('no live regions on messages, language label hidden, only the copy status is a status', () => {
    const { root, r } = mk();
    r.write('# t\n\ntext\n\n```ts\nx\n```\n\n| a |\n|---|\n| b |'); r.end();
    expect(root.querySelectorAll('[aria-live]').length).toBe(0);
    expect(root.querySelectorAll('[role="status"]').length).toBe(1);
    expect(root.querySelector('table')!.parentElement!.getAttribute('tabindex')).toBe('0');
  });
});
