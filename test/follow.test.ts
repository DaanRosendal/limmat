// The text-following core under the React, Vue, and Svelte wrappers, with the default throttle and a fake clock.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { follow } from '../src/follow';
import { render, renderOpen } from './helpers/util';

afterEach(() => vi.useRealTimers());

describe('follow', () => {
  it('destroy drops a render that is still waiting for the throttle', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const f = follow(el);
    f.set('first');
    f.set('first second');
    const before = el.innerHTML;
    f.destroy();
    vi.advanceTimersByTime(500);
    expect(el.innerHTML).toBe(before);
    expect(before).toBe(renderOpen('first').innerHTML);
  });

  it('with the default throttle, the last text wins once the timer runs', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const f = follow(el);
    for (const t of ['a', 'a **b', 'a **bold', 'a **bold** c']) f.set(t);
    vi.advanceTimersByTime(500);
    expect(el.innerHTML).toBe(renderOpen('a **bold** c').innerHTML);
    f.set('a **bold** c', true);
    expect(el.innerHTML).toBe(render('a **bold** c').innerHTML);
  });

  it('set(text, false) after done on the same text reopens the message', () => {
    const el = document.createElement('div');
    const f = follow(el, { throttleMs: 0 });
    f.set('x *y', true);
    expect(el.textContent).toBe('x *y');
    f.set('x *y', false);
    expect(el.innerHTML).toBe(renderOpen('x *y').innerHTML);
  });

  it('a text that ends in a lone surrogate half still equals the whole when it completes', () => {
    const el = document.createElement('div');
    const f = follow(el, { throttleMs: 0 });
    const full = 'smile \u{1F600} done';
    const cut = full.indexOf('\u{1F600}') + 1;
    f.set(full.slice(0, cut));
    f.set(full, true);
    expect(el.innerHTML).toBe(render(full).innerHTML);
  });
});
