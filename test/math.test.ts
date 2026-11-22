// Opt-in math: `renderMath` turns \(x\), \[x\], $x$, and $$x$$ into boxes that the host fills. The stub below stands in for KaTeX
// (it writes `I[tex]` for inline and `D[tex]` for display), so every expectation here is exact and needs no math library.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRenderer, type Options } from '../src/index';
import { renderToString } from '../src/server';
import { html, mk, render, renderOpen } from './helpers/util';

const stub: NonNullable<Options['renderMath']> = (el, tex, { display }) => {
  el.textContent = `${display ? 'D' : 'I'}[${tex}]`;
};
const on: Options = { renderMath: stub };
const R = (md: string, o: Options = {}) => html(render(md, 'whole', { ...on, ...o }));
const O = (md: string, o: Options = {}) => html(renderOpen(md, { ...on, ...o }));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('inline math, finished text', () => {
  const cases: [string, string, string][] = [
    ['parentheses', 'a \\(x^2\\) b', '<p>a <span>I[x^2]</span> b</p>'],
    ['brackets in a sentence are display math', 'a \\[x\\] b', '<p>a <span>D[x]</span> b</p>'],
    ['single dollars', 'a $x^2$ b', '<p>a <span>I[x^2]</span> b</p>'],
    ['double dollars in a sentence are display math', 'a $$x$$ b', '<p>a <span>D[x]</span> b</p>'],
    ['the tex is trimmed', '\\( x \\)', '<p><span>I[x]</span></p>'],
    ['two formulas', '$a$ and $b$', '<p><span>I[a]</span> and <span>I[b]</span></p>'],
    ['a formula may cross a soft line break', 'a \\(x\n= y\\) b', '<p>a <span>I[x\n= y]</span> b</p>'],
    [
      'markup characters inside are not markup',
      '\\(a*b*c\\) and $x_1_2$ and $a<b>c$',
      '<p><span>I[a*b*c]</span> and <span>I[x_1_2]</span> and <span>I[a&lt;b&gt;c]</span></p>',
    ],
    ['in a heading', '# T $x$', '<h1>T <span>I[x]</span></h1>'],
    ['in a list item', '- a \\(y\\)', '<ul><li>a <span>I[y]</span></li></ul>'],
    ['in a quote', '> $z$', '<blockquote><p><span>I[z]</span></p></blockquote>'],
    [
      'in a table cell',
      '| a | b |\n|---|---|\n| $x$ | y |',
      '<div tabindex="0" role="group" aria-label="Table"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td><span>I[x]</span></td><td>y</td></tr></tbody></table></div>',
    ],
    [
      'in link text',
      '[$x$](https://e.com)',
      '<p><a href="https://e.com" target="_blank" rel="noopener noreferrer"><span>I[x]</span></a></p>',
    ],
    ['bold around a formula', '**$d$ bold**', '<p><strong><span>I[d]</span> bold</strong></p>'],
    ['a code span that opens first wins', '`$x$` and $y$', '<p><code>$x$</code> and <span>I[y]</span></p>'],
    ['deliberate: a formula that opens before a code span runs over it', '$a `b` c$', '<p><span>I[a `b` c]</span></p>'],
  ];
  for (const [name, md, out] of cases) it(name, () => expect(R(md)).toBe(out));
});

describe('what stays text', () => {
  const text: [string, string, string][] = [
    ['prices', 'It costs $5 and $10', '<p>It costs $5 and $10</p>'],
    ['a price range', '$5-$10', '<p>$5-$10</p>'],
    ['currency codes', 'US$5 or US$6', '<p>US$5 or US$6</p>'],
    ['prices with commas', '$1,350 to $1,100', '<p>$1,350 to $1,100</p>'],
    ['a space after the opening dollar', 'a $ x$ b', '<p>a $ x$ b</p>'],
    ['a space before the closing dollar', 'a $x $ b', '<p>a $x $ b</p>'],
    ['a lone dollar', 'a $ b', '<p>a $ b</p>'],
    ['a single dollar does not cross a line', '$x\ny$', '<p>$x\ny$</p>'],
    ['a shell variable on its own', 'echo "$HOME" now', '<p>echo "$HOME" now</p>'],
    ['shell variables in code', '`echo "$HOME" and "$PATH"`', '<p><code>echo "$HOME" and "$PATH"</code></p>'],
    ['escaped dollars', '\\$x\\$', '<p>$x$</p>'],
    ['an escaped backslash before the parenthesis', '\\\\(x\\\\)', '<p>\\(x\\)</p>'],
    ['a blank body is not math', 'a \\[ \\] b', '<p>a [ ] b</p>'],
    ['a blank double dollar body is not math', '$$ $$', '<p>$$ $$</p>'],
    ['an empty pair of parentheses', 'a \\(\\) b', '<p>a () b</p>'],
    ['an unclosed parenthesis at the end is the escape it is without math', 'a \\(x', '<p>a (x</p>'],
    ['an unclosed bracket at the end is the escape it is without math', 'a \\[x', '<p>a [x</p>'],
    ['unclosed dollar at the end is literal', 'a $x', '<p>a $x</p>'],
    ['unclosed double dollar at the end is literal', 'a $$x', '<p>a $$x</p>'],
  ];
  for (const [name, md, out] of text) it(name, () => expect(R(md)).toBe(out));

  it('price then formula: only the formula is math', () => expect(R('It costs $5 or $x$')).toBe('<p>It costs $5 or <span>I[x]</span></p>'));
  it('a letter before the closing dollar is not a digit rule case', () => expect(R('$x$2')).toBe('<p><span>I[x]</span>2</p>'));
  it('an escaped dollar inside a formula stays in its tex', () => expect(R('$a\\$b$')).toBe('<p><span>I[a\\$b]</span></p>'));
  it('deliberate: two shell variables outside code read as one formula', () => {
    expect(R('echo "$HOME" and "$PATH"')).toBe('<p>echo "<span>I[HOME" and "]</span>PATH"</p>');
    expect(R('echo "$HOME" and "$PATH"', { singleDollarMath: false })).toBe('<p>echo "$HOME" and "$PATH"</p>');
  });
  it('image alt text carries the tex', () =>
    expect(R('![a $x$](https://e.com/a.png)')).toBe(
      '<p><img alt="a x" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="https://e.com/a.png"></p>',
    ));
  it('a formula in the alt text of an image that is not shown is shown as a formula', () =>
    expect(R('![a $x$](https://e.com/a.png)', { images: false })).toBe('<p><span>Image not shown: a <span>I[x]</span></span></p>'));
});

describe('options', () => {
  it('singleDollarMath: false keeps \\( \\) and $$ but not $', () =>
    expect(R('$x$ and \\(y\\) and $$z$$', { singleDollarMath: false })).toBe('<p>$x$ and <span>I[y]</span> and <span>D[z]</span></p>'));
  it('a half-typed environment opener shows nothing, at the start of the text and after text', () => {
    for (const opener of ['\\begin{cases}', '\\begin{aligned}', '\\begin{pmatrix}'])
      for (let n = 2; n < opener.length; n++) {
        expect(O(opener.slice(0, n)), opener.slice(0, n)).toBe('');
        expect(O(`text\n${opener.slice(0, n)}`), opener.slice(0, n)).toBe('<p>text</p>');
      }
  });
  it('without renderMath nothing changes', () => {
    expect(html(render('\\(x\\) $x$ $$y$$ \\[z\\]'))).toBe('<p>(x) $x$ $$y$$ [z]</p>');
    expect(html(render('$$\nx\n$$'))).toBe('<p>$$\nx\n$$</p>');
  });
  it('a renderMath that is not a function turns math off', () => {
    for (const bad of ['katex', null, 1, {}])
      expect(html(render('$x$ \\(y\\)', 'whole', { renderMath: bad as never }))).toBe('<p>$x$ (y)</p>');
  });
  it('limmat/server leaves math as text', () => {
    // @ts-expect-error renderMath is not a server option
    expect(renderToString('a $x$ and \\(y\\)', { renderMath: stub })).toBe('<p>a $x$ and (y)</p>');
  });
});

describe('inline math while streaming', () => {
  const open: [string, string, string][] = [
    ['an open parenthesis shows its tex without the delimiter', 'a \\(x^2', '<p>a <span>x^2</span></p>'],
    ['an open parenthesis with nothing after it shows nothing', 'a \\(', '<p>a </p>'],
    ['an open bracket', 'a \\[x', '<p>a <span>x</span></p>'],
    ['half of the closing delimiter is hidden', 'a \\(x\\', '<p>a <span>x</span></p>'],
    ['an escaped backslash at the end is shown', 'a \\(x\\\\', '<p>a <span>x\\\\</span></p>'],
    ['an open double dollar', 'a $$x', '<p>a <span>x</span></p>'],
    ['half of the closing double dollar is hidden', 'a $$x$', '<p>a <span>x</span></p>'],
    ['an open single dollar stays literal', 'costs $5 per month', '<p>costs $5 per month</p>'],
    ['an open single dollar with letters stays literal', 'a $x^2', '<p>a $x^2</p>'],
    ['a closed single dollar formula renders', 'a $x^2$', '<p>a <span>I[x^2]</span></p>'],
    ['a lone dollar at the end', 'a $', '<p>a $</p>'],
    ['a closing dollar after a digit opener waits for the next character', 'a $5x$', '<p>a $5x$</p>'],
    ['a digit opener closes when the next character is not a digit', 'a $5x$ b', '<p>a <span>I[5x]</span> b</p>'],
    ['a digit opener does not close before a digit', 'a $5x$7', '<p>a $5x$7</p>'],
    ['a closed parenthesis formula renders', 'a \\(x\\)', '<p>a <span>I[x]</span></p>'],
  ];
  for (const [name, md, out] of open) it(name, () => expect(O(md)).toBe(out));

  it('the finished text closes a digit opener at the end', () => expect(R('a $5x$')).toBe('<p>a <span>I[5x]</span></p>'));

  it('an open formula is a pending box and a closed one is the hook box', () => {
    expect(renderOpen('a \\(x', on).innerHTML).toBe('<p>a <span class="limmat-math limmat-math-open">x</span></p>');
    expect(renderOpen('a \\(x\\)', on).innerHTML).toBe('<p>a <span class="limmat-math">I[x]</span></p>');
    expect(renderOpen('a $$x$$', on).innerHTML).toBe('<p>a <span class="limmat-math limmat-math-display">D[x]</span></p>');
  });
});

describe('block math', () => {
  const blocks: [string, string, string][] = [
    ['double dollars', '$$\nx = 1\n$$\n', '<div>D[x = 1]</div>'],
    ['brackets', '\\[\nx\n\\]', '<div>D[x]</div>'],
    ['it interrupts a paragraph', 'Intro\n$$\na\n$$\nOutro', '<p>Intro</p><div>D[a]</div><p>Outro</p>'],
    ['list markers inside are tex', '$$\na = b\n- c\n$$', '<div>D[a = b\n- c]</div>'],
    ['a heading underline inside is tex', '$$\na\n---\nb\n$$', '<div>D[a\n---\nb]</div>'],
    ['a blank line inside is tex', '$$\na\n\nb\n$$', '<div>D[a\n\nb]</div>'],
    ['the closer may follow text on its line', '$$\na\nb = c $$', '<div>D[a\nb = c]</div>'],
    ['text after the opener makes it prose, not a block', '$$ a\nb', '<p>$$ a\nb</p>'],
    ['brackets with text after the opener are an inline formula across lines', '\\[ a\nb\n\\]', '<p><span>D[a\nb]</span></p>'],
    ['a $$ alone on its line after prose that opened with $$ starts a block of its own', '$$ a\nb\n$$', '<p>$$ a\nb</p><p>$$</p>'],
    ['an escaped closer does not close', '$$\na \\$$\nb\n$$', '<div>D[a \\$$\nb]</div>'],
    ['one line with both delimiters is inline display math', '$$x$$', '<p><span>D[x]</span></p>'],
    ['brackets on one line are inline display math', '\\[x\\]', '<p><span>D[x]</span></p>'],
    ['in a list item', '- item\n  $$\n  x\n  $$\n- next', '<ul><li>item<div>D[x]</div></li><li>next</li></ul>'],
    ['in a quote', '> $$\n> x\n> $$', '<blockquote><div>D[x]</div></blockquote>'],
    [
      'an environment with no delimiters around it is display math',
      '\\begin{cases}\na\nb\n\\end{cases}',
      '<div>D[\\begin{cases}\na\nb\n\\end{cases}]</div>',
    ],
    ['an environment on one line', '\\begin{pmatrix} 1 & 0 \\end{pmatrix}', '<div>D[\\begin{pmatrix} 1 &amp; 0 \\end{pmatrix}]</div>'],
    ['an environment in the middle of a line is text', 'see \\begin{cases} here', '<p>see \\begin{cases} here</p>'],
    ['an environment that is not math is text', '\\begin{foo}\nx\n\\end{foo}', '<p>\\begin{foo}\nx\n\\end{foo}</p>'],
    ['an environment that never closes is text', '\\begin{cases}\na', '<p>\\begin{cases}\na</p>'],
    [
      'an environment inside display math is part of its tex',
      '$$\n\\begin{aligned}\na\n\\end{aligned}\n$$',
      '<div>D[\\begin{aligned}\na\n\\end{aligned}]</div>',
    ],
    ['two blocks in a row', '$$\na\n$$\n\n$$\nb\n$$', '<div>D[a]</div><div>D[b]</div>'],
    ['unclosed at the end is literal text', '$$\nx = 1', '<p>$$\nx = 1</p>'],
    ['unclosed in a quote at the end is literal text', '> $$\n> x', '<blockquote><p>$$\nx</p></blockquote>'],
  ];
  for (const [name, md, out] of blocks) it(name, () => expect(R(md)).toBe(out));

  it('indented four spaces is code, as it is without math', () => {
    const md = '    $$\n    x\n    $$';
    expect(R(md)).toBe(html(render(md)));
    expect(R(md)).toContain('<code>$$\nx\n$$</code>');
  });
  it('a fence that contains the delimiters is code', () => {
    const md = '```\n$$\nx\n$$\n```';
    expect(R(md)).toBe(html(render(md)));
  });

  it('without renderMath a block is an ordinary paragraph', () => expect(html(render('$$\nx\n$$'))).toBe('<p>$$\nx\n$$</p>'));
});

describe('block math while streaming', () => {
  const open: [string, string, string][] = [
    ['an open block shows its text', '$$\nx = ', '<div>x =</div>'],
    ['an open block with nothing in it yet', '$$', '<div></div>'],
    ['half of the closer is hidden', '$$\nx\n$', '<div>x</div>'],
    ['a whole closer line that is still arriving is hidden', '$$\nx\n$$', '<div>x</div>'],
    ['the closer is final once its line is complete', '$$\nx\n$$\n', '<div>D[x]</div>'],
    ['half of a bracket closer is hidden', '\\[\nx\n\\', '<div>x</div>'],
    ['an open block in a quote', '> $$\n> x', '<blockquote><div>x</div></blockquote>'],
    ['an open block in a list item', '- a\n  $$\n  x', '<ul><li>a<div>x</div></li></ul>'],
    ['an open environment shows its body', '\\begin{cases}\na', '<div>a</div>'],
    ['half of the environment closer is hidden', '\\begin{cases}\na\n\\end{ca', '<div>a</div>'],
    ['a whole environment closer that is still arriving is hidden', '\\begin{cases}\na\n\\end{cases}', '<div>a</div>'],
    ['an environment opener that is still arriving is held back', 'before\n\\begin{ca', '<p>before</p>'],
    ['a backslash word that is not an environment shows', 'before\n\\bar', '<p>before\n\\bar</p>'],
    ['the text before an open block stays', 'Intro\n$$\nx', '<p>Intro</p><div>x</div>'],
  ];
  for (const [name, md, out] of open) it(name, () => expect(O(md)).toBe(out));

  it('an open block is a pending box, a closed one the hook box', () => {
    expect(renderOpen('$$\nx', on).innerHTML).toBe('<div class="limmat-math limmat-math-display limmat-math-open">x</div>');
    expect(renderOpen('$$\nx\n$$\n', on).innerHTML).toBe('<div class="limmat-math limmat-math-display">D[x]</div>');
  });
});

describe('the hook', () => {
  const recorder = (impl: (el: HTMLElement, tex: string, info: { display: boolean }) => void | Promise<void> = stub) => {
    const calls: { tex: string; display: boolean; attached: boolean; empty: boolean }[] = [];
    const fn: NonNullable<Options['renderMath']> = (el, tex, info) => {
      calls.push({ tex, display: info.display, attached: el.isConnected, empty: false });
      return impl(el, tex, info);
    };
    return { calls, fn };
  };

  it('is called once per finished formula, with an attached box', () => {
    const { calls, fn } = recorder();
    const { r } = mk({ renderMath: fn });
    for (const c of 'a $x$ b \\[y\\] c\n\n$$\nz\n$$\n') r.write(c);
    r.end();
    expect(calls).toEqual([
      { tex: 'x', display: false, attached: true, empty: false },
      { tex: 'y', display: true, attached: true, empty: false },
      { tex: 'z', display: true, attached: true, empty: false },
    ]);
  });

  it('gets the tex as text in the box until it replaces it', () => {
    let seen = '';
    const { r } = mk({ renderMath: (el) => void (seen = el.textContent ?? '') });
    r.write('a $x^2$ b');
    r.end();
    expect(seen).toBe('x^2');
  });

  it('is not called for a formula that is still open', () => {
    const { calls, fn } = recorder();
    const { r } = mk({ renderMath: fn });
    r.write('a \\(x');
    expect(calls.length).toBe(0);
    r.write('\\)');
    expect(calls.length).toBe(1);
  });

  it('is not called again, and keeps the same box, when the open paragraph is rebuilt', () => {
    const { calls, fn } = recorder();
    const { root, r } = mk({ renderMath: fn });
    r.write('a $x$ b');
    const box = root.querySelector('.limmat-math');
    for (const w of [' more', ' words', ' and **bold', '** text']) r.write(w);
    expect(root.querySelector('.limmat-math')).toBe(box);
    expect(calls.length).toBe(1);
    expect(box?.textContent).toBe('I[x]');
  });

  it('gives two equal formulas two boxes and keeps both', () => {
    const { calls, fn } = recorder();
    const { root, r } = mk({ renderMath: fn });
    r.write('$x$ and $x$');
    const boxes = Array.from(root.querySelectorAll('.limmat-math'));
    expect(boxes.length).toBe(2);
    expect(boxes[0]).not.toBe(boxes[1]);
    r.write(' and more');
    expect(Array.from(root.querySelectorAll('.limmat-math'))).toEqual(boxes);
    expect(calls.length).toBe(2);
  });

  it('keeps a finished block box when the text after it grows', () => {
    const { calls, fn } = recorder();
    const { root, r } = mk({ renderMath: fn });
    r.write('$$\nx\n$$\n');
    const box = root.querySelector('.limmat-math');
    r.write('after text');
    r.write(' and more');
    expect(root.querySelector('.limmat-math')).toBe(box);
    expect(calls.length).toBe(1);
  });

  it('an async hook that finishes after a rebuild fills the box that is on the page', async () => {
    let done!: () => void;
    const { calls, fn } = recorder(
      (el) =>
        new Promise<void>((res) => {
          done = () => {
            el.textContent = 'RENDERED';
            res();
          };
        }),
    );
    const { root, r } = mk({ renderMath: fn });
    r.write('a $x$');
    const box = root.querySelector('.limmat-math');
    r.write(' more words');
    r.write(' and more');
    expect(root.querySelector('.limmat-math')).toBe(box);
    expect(box?.textContent).toBe('x');
    done();
    await tick();
    expect(root.querySelector('.limmat-math')).toBe(box);
    expect(box?.textContent).toBe('RENDERED');
    expect(calls.length).toBe(1);
  });

  it('a hook that throws leaves the tex as text, and drops what it wrote before throwing', () => {
    const { root, r } = mk({
      renderMath: (el) => {
        el.append(document.createElement('b'));
        throw new Error('bad tex');
      },
    });
    r.write('a $x$ b');
    r.end();
    expect(root.innerHTML).toBe('<p>a <span class="limmat-math">x</span> b</p>');
  });

  it('a hook that rejects leaves the tex as text, and drops what it wrote first', async () => {
    const { root, r } = mk({
      renderMath: (el) => {
        el.textContent = 'PARTIAL';
        return Promise.reject(new Error('bad tex'));
      },
    });
    r.write('a $x$ b');
    r.end();
    await tick();
    expect(root.innerHTML).toBe('<p>a <span class="limmat-math">x</span> b</p>');
  });

  it('a hook that returns something that is not a promise is fine', () => {
    const { root, r } = mk({
      renderMath: ((el: HTMLElement) => {
        el.textContent = 'ok';
        return 42;
      }) as never,
    });
    r.write('a $x$ b');
    r.end();
    expect(root.textContent).toBe('a ok b');
  });

  it('is not called after destroy, even for a throttled write', () => {
    const { calls, fn } = recorder();
    const root = document.createElement('div');
    document.body.append(root);
    const r = createRenderer(root, { renderMath: fn, throttleMs: 50 });
    r.write('first ');
    r.write('a $x$ b');
    r.destroy();
    expect(calls.length).toBe(0);
  });

  it('a hook that writes more text does not re-enter the renderer', () => {
    let n = 0;
    const { root, r } = mk({
      renderMath: (el) => {
        n++;
        el.textContent = 'M';
        r.write(' tail');
      },
    });
    r.write('a $x$');
    r.end();
    expect(n).toBe(1);
    expect(root.textContent).toBe('a M tail');
  });

  it('reset starts counting again', () => {
    const { calls, fn } = recorder();
    const { r } = mk({ renderMath: fn });
    r.write('$a$');
    r.reset();
    r.write('$a$');
    expect(calls.length).toBe(2);
  });

  it('is called with an attached box inside an open <details>', () => {
    const { calls, fn } = recorder();
    const { r } = mk({ renderMath: fn });
    r.write('<details>\n\nthe formula $x$ and more');
    expect(calls).toEqual([{ tex: 'x', display: false, attached: true, empty: false }]);
  });

  it('finished math in a frozen block is never touched again', () => {
    const { calls, fn } = recorder();
    const { root, r } = mk({ renderMath: fn });
    r.write('first $a$\n\nsecond\n\nthird');
    const box = root.querySelector('.limmat-math');
    r.write(' paragraph and more\n\nfourth');
    expect(root.querySelector('.limmat-math')).toBe(box);
    expect(calls.length).toBe(1);
  });

  describe('limits', () => {
    it('a formula over 2000 characters is not passed to the hook, and stays text', () => {
      const { calls, fn } = recorder();
      const tex = 'a'.repeat(2001);
      const { root, r } = mk({ renderMath: fn });
      r.write(`x $${tex}$ y`);
      r.end();
      expect(calls.length).toBe(0);
      expect(root.querySelector('.limmat-math')?.textContent).toBe(tex);
    });
    it('at most 200 formulas per message reach the hook', () => {
      const { calls, fn } = recorder();
      const { root, r } = mk({ renderMath: fn });
      r.write(Array.from({ length: 205 }, (_, i) => `$a${i}$`).join(' '));
      r.end();
      expect(calls.length).toBe(200);
      expect(root.querySelectorAll('.limmat-math').length).toBe(205);
    });
    it('at most 20000 characters of tex per message reach the hook', () => {
      const { calls, fn } = recorder();
      const { r } = mk({ renderMath: fn });
      r.write(Array.from({ length: 12 }, () => `$${'b'.repeat(1900)}$`).join(' '));
      r.end();
      expect(calls.length).toBe(10);
    });
  });
});

describe('math only changes the output where a formula closes', () => {
  const off = (md: string) => render(md).innerHTML;
  const onRaw = (md: string, o: Options = {}) => render(md, 'whole', { ...on, ...o }).innerHTML;

  const same = [
    'a \\(x',
    'a \\[x',
    'x\n\\[not closed\nmore text',
    '\\[not a link](/foo)\n`not code`',
    '[link \\[bar](/uri)',
    '\\(x86) and \\[a, b)',
    'cost $5 and $10, US$5, $5-$10',
    'text\n\\[ unclosed\nand $5\n',
    '> quote\n> \\[ unclosed',
    '- item\n  \\[ unclosed',
    'a \\\\(x\\\\)',
    '\\$x\\$',
  ];
  for (const md of same) it(`${JSON.stringify(md)} renders as it does without math`, () => expect(onRaw(md)).toBe(off(md)));

  it('every in-scope CommonMark example renders as without math, except the one with a real \\[ ... \\] pair', () => {
    const spec: { example: number; markdown: string }[] = JSON.parse(readFileSync('test/fixtures/commonmark-spec.json', 'utf8'));
    const differing = spec.filter((e) => off(e.markdown) !== onRaw(e.markdown)).map((e) => e.example);
    expect(differing).toEqual([12]); // `\[\\\]` is a display formula whose tex is `\\`
  });
});
