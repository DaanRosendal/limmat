import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS demo module, pure data
import { SHOWCASE } from '../demo/js/showcase.js';
// @ts-expect-error plain JS demo module
import { chunkText } from '../demo/js/streams.js';
import { audit, render, renderOpen } from './helpers/util';

// The demo builds its renderer with this image setting (demo/js/player.js), so the Showcase is checked the same way.
const OPTIONS = { images: ['https://example.com'] };
const text: string = SHOWCASE;
const ATTACK = text.indexOf('### Attack replay');
const whole = render(text, 'whole', OPTIONS);

describe('the Showcase stream', () => {
  it('renders the same in any chunking, including the demo chunker', () => {
    const expected = whole.innerHTML;
    for (const split of ['char', 2, 3, 5, 7, 12] as const) expect(render(text, split, OPTIONS).innerHTML, `split ${split}`).toBe(expected);
    for (let seed = 1; seed <= 12; seed++) expect(render(text, 'random', OPTIONS, seed).innerHTML, `seed ${seed}`).toBe(expected);
    for (const size of [1, 5, 12, 20]) {
      for (const seed of [1, 2, 3, 4]) {
        const root = render(chunkText(text, size, true, seed).join(''), 'whole', OPTIONS);
        expect(root.innerHTML, `demo chunker size ${size} seed ${seed}`).toBe(expected);
      }
    }
  });

  it('never shows a raw marker at any point while it streams, apart from the attack section', () => {
    const bad: string[] = [];
    for (let i = 1; i <= text.length; i++) {
      const root = renderOpen(text.slice(0, i), OPTIONS);
      for (const n of root.querySelectorAll('pre, code')) n.remove();
      const visible = root.textContent ?? '';
      // The attack section shows hostile text on purpose, and a "<" is part of it.
      const re = i > ATTACK ? /\*\*|~|\]\(|`|!\[|[[\]]/ : /\*\*|~|\]\(|`|!\[|[[\]]|</;
      const m = re.exec(visible);
      if (m) bad.push(`${JSON.stringify(m[0])} after ${JSON.stringify(text.slice(Math.max(0, i - 24), i))}`);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('passes the same DOM audit as every other input', () => {
    expect(audit(whole)).toEqual([]);
  });

  it('shows every kind of thing limmat renders', () => {
    const has = (sel: string) => whole.querySelectorAll(sel).length;
    const checks: [string, string, number][] = [
      ['headings', 'h2, h3', 4],
      ['bold, italic, and strikethrough', 'strong, em, del', 4],
      ['inline code', 'p code, li code, td code', 3],
      ['links with a real address', 'a[href^="https://"], a[href^="mailto:"]', 5],
      ['a table with alignment', 'table th[style], table td[style]', 6],
      ['a nested list', 'ol ul', 1],
      ['task list checkboxes', 'input[type="checkbox"]', 5],
      ['fenced code with a language label', '.limmat-code', 2],
      ['a block quote', 'blockquote', 1],
      ['safe tags', 'kbd, sub, sup, mark, ins', 5],
      ['a local image', 'img[src="/limmat-mark.svg"]', 1],
      ['an open section holding a closed one', 'details[open] details:not([open])', 1],
    ];
    for (const [what, sel, min] of checks) expect(has(sel), what).toBeGreaterThanOrEqual(min);
    expect(has('a[href="https://en.wikipedia.org/wiki/Rust_(programming_language)"]'), 'a link with parentheses').toBe(1);
  });

  it('keeps the hostile section inert', () => {
    expect(whole.querySelectorAll('script, iframe, style, form, [onclick], [onerror]').length).toBe(0);
    expect(Array.from(whole.querySelectorAll('img'), (i) => i.getAttribute('src'))).toEqual(['/limmat-mark.svg']);
    expect(
      Array.from(whole.querySelectorAll('a'), (a) => a.getAttribute('href') ?? '').filter((h) => !/^(https?:|mailto:)/.test(h)),
    ).toEqual([]);
    expect(whole.textContent).toContain('<script>alert(1)</script>');
  });

  it('points at an image that the demo build ships, and uses no em or en dashes', () => {
    expect(existsSync('demo/assets/limmat-mark.svg')).toBe(true);
    const dash = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
    expect(dash.test(text)).toBe(false);
  });
});
