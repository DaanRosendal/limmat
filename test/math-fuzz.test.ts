// Math must obey the two rules every construct obeys: the text split into any chunks gives the whole text's output, and while
// streaming no delimiter shows. These run with a stub hook, because the shared corpus tests run without options (math off).
import { describe, expect, it } from 'vitest';
import { scan } from '../src/block';
import { createRenderer, type Options } from '../src/index';
import { render, renderOpen, renderTwoPart, rng, type Split } from './helpers/util';

const stub: NonNullable<Options['renderMath']> = (el, tex, { display }) => {
  el.textContent = `${display ? 'D' : 'I'}[${tex}]`;
};
const on: Options = { renderMath: stub };

// Documents that mix every delimiter with the constructs around them. The first group has no literal delimiter in its output.
const CLEAN = [
  'Euler: \\(e^{i\\pi}+1=0\\) and $x_1 + y_2$ done.\n',
  'Intro\n\n$$\n\\int_0^1 x\\,dx\n= \\frac{1}{2}\n$$\n\nOutro $z$.\n',
  '- item $a$\n  $$\n  b = c\n  - d\n  $$\n- next \\[e\\]\n',
  '> quote \\(q\\)\n> $$\n> r\n> $$\n',
  '| $a$ | \\(b\\) |\n|---|---|\n| $$c$$ | d |\n',
  '\\[\na\n\\]\n$$\nb $$\nend with $e$ and \\(f\\)\n',
  'before\n\\begin{cases}\nx & 1 \\\\\ny & 2\n\\end{cases}\nafter $k$\n',
  '# Head $h$\n\nbody with **$i$ bold** and *$j$* and [$k$](https://example.com/x)\n',
  '<details>\n<summary>S $s$</summary>\n\ninside $t$\n\n$$\nu\n$$\n\n</details>\n',
];
// These keep delimiters as text (prices, escapes, unclosed openers), so only the chunking property applies to them.
const LITERAL = [
  'costs $5 and $10 but $x$ is math, US$5, $5-$10 and 5$ too\n',
  'unclosed \\(a and $b and $$c at the end',
  'x\n$$\nunclosed block\nmore text\n',
  'escaped \\$a\\$ and \\\\(b\\\\) and `$c$` code and $5x$ and $5x$7\n',
  '$$\n$$\n$$\nodd number of lines\n$$',
  'a $ b $ c $d$ e $\n',
  '\\[1\\] a citation and \\[ \\] blank and \\(\\) empty\n',
];
const DOCS = [...CLEAN, ...LITERAL];
const LEAK = /\\\(|\\\[|\$\$/;

describe('math: chunked output equals whole output', () => {
  DOCS.forEach((md, i) => {
    it(`doc ${i} at several chunk sizes and random splits`, () => {
      const whole = render(md, 'whole', on).innerHTML;
      for (const s of ['char', 2, 3, 5, 7, 12] as Split[]) expect(render(md, s, on).innerHTML, `split ${s}`).toBe(whole);
      for (let seed = 1; seed <= 12; seed++) expect(render(md, 'random', on, seed).innerHTML, `seed ${seed}`).toBe(whole);
    });
  });

  it('two-part splits at every index', () => {
    for (const md of DOCS) {
      const whole = render(md, 'whole', on).innerHTML;
      for (let i = 1; i < md.length; i++)
        expect(renderTwoPart(md, i, on).innerHTML, `${JSON.stringify(md.slice(0, i))} | rest`).toBe(whole);
    }
  });

  it('a throttled renderer reaches the same final DOM', () => {
    for (const md of DOCS) {
      const root = document.createElement('div');
      const r = createRenderer(root, { ...on, throttleMs: 50 });
      const rand = rng(3);
      for (let i = 0; i < md.length; ) {
        const n = 1 + Math.floor(rand() * 8);
        r.write(md.slice(i, i + n));
        i += n;
      }
      r.end();
      expect(root.innerHTML).toBe(render(md, 'whole', on).innerHTML);
    }
  });
});

describe('math: no delimiter shows while streaming', () => {
  CLEAN.forEach((md, i) => {
    it(`doc ${i}, every prefix`, () => {
      for (let n = 1; n <= md.length; n++) {
        const text = renderOpen(md.slice(0, n), on).textContent ?? '';
        expect(LEAK.test(text), `prefix ${JSON.stringify(md.slice(0, n))} shows ${JSON.stringify(text)}`).toBe(false);
      }
    });
  });

  it('every prefix of every document renders without throwing, one character at a time', () => {
    for (const md of DOCS) {
      const root = document.createElement('div');
      const r = createRenderer(root, { ...on, throttleMs: 0 });
      for (const c of md) r.write(c);
      r.end();
      expect(root.textContent!.length).toBeGreaterThan(0);
    }
  });

  it('a kept box is never a different element than the one first shown, however the text is split', () => {
    const md = 'one $a$ two \\(b\\) three $$c$$ four\n';
    const root = document.createElement('div');
    const r = createRenderer(root, { ...on, throttleMs: 0 });
    const first: Element[] = [];
    for (const c of md) {
      r.write(c);
      const now = Array.from(root.querySelectorAll('.limmat-math:not(.limmat-math-open)'));
      for (const [k, el] of now.entries()) {
        if (first[k]) expect(el).toBe(first[k]);
        else first[k] = el;
      }
    }
    expect(first.length).toBe(3);
  });
});

describe('math: hostile input stays inert', () => {
  const hostile = [
    '$<script>alert(1)</script>$',
    '\\(<img src=x onerror=alert(1)>\\)',
    '$$\n<script>alert(1)</script>\n$$\n',
    '[$x$](javascript:alert(1))',
    '$\\href{javascript:alert(1)}{x}$',
    '$$"><img src=x onerror=alert(1)>$$',
  ];
  for (const md of hostile)
    it(`${JSON.stringify(md)} gives no element beyond the box`, () => {
      const done = render(md, 'char', on);
      expect(done.querySelector('script, img, [onerror]')).toBeNull();
      expect(Array.from(done.querySelectorAll('a')).every((a) => !/^javascript:/i.test(a.getAttribute('href') ?? ''))).toBe(true);
    });
});

describe('math: input that tries to be slow stays fast', () => {
  const big: [string, string][] = [
    ['a dollar and a digit, repeated', 'a$1 '.repeat(20000)],
    ['an opening bracket and a dollar, repeated', '($1 '.repeat(20000)],
    ['a parenthesis opener with no closer, repeated', '\\( '.repeat(20000)],
    ['a bracket opener with no closer, repeated', '\\[ '.repeat(20000)],
    ['a double dollar opener with no closer, repeated', '$$ '.repeat(20000)],
    ['a dollar and a letter, repeated', '$a '.repeat(20000)],
    ['dollars with spaces, repeated', '$ '.repeat(20000)],
    ['bracket opener lines with no closer', '\\[\n'.repeat(4000)],
    ['double dollar opener lines with text and no closer', '$$ x\n'.repeat(4000)],
    ['backslashes then a closer-looking character', '\\'.repeat(20000) + ')'],
  ];
  for (const [name, md] of big)
    it(name, () => {
      const t = performance.now();
      render(md, 'whole', on);
      expect(performance.now() - t).toBeLessThan(3000);
    });
});

describe('math: the block scanner stays linear', () => {
  const inputs: [string, string[]][] = [
    ['a bracket opener on every line, none closing', Array.from({ length: 30000 }, () => '\\[')],
    ['a double dollar opener on every line', Array.from({ length: 30000 }, () => '$$')],
    ['an environment opener on every line, none closing', Array.from({ length: 30000 }, () => '\\begin{cases}')],
    ['an opener, then blank lines, again and again', Array.from({ length: 30000 }, (_, i) => (i % 40 ? '' : '$$'))],
    ['a paragraph of prose lines that start with an opener and go on', Array.from({ length: 30000 }, () => '\\[ and text')],
  ];
  for (const [name, L] of inputs)
    it(name, () => {
      for (const [final, partial] of [
        [true, false],
        [false, false],
        [false, true],
      ] as const) {
        const t = performance.now();
        scan(L, null, partial, final, 0, false, undefined, true);
        expect(performance.now() - t, `final ${final}, partial ${partial}`).toBeLessThan(1500);
      }
    });
});
