// The renderMath option with the real KaTeX, through the limmat/katex adapter (jsdom is in standards mode here, which KaTeX needs).
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { createRenderer, type Options } from '../src/index';
import { katexMath } from '../src/katex';
import { render } from './helpers/util';

const on: Options = { renderMath: katexMath(katex) };
const R = (md: string, o: Options = on) => render(md, 'whole', o);
const boxes = (root: Element) => Array.from(root.querySelectorAll('.limmat-math'));

/** Anything in KaTeX's output that could load, link, run, or style the page from the formula's text. */
const unsafe = (root: Element) => {
  const bad: string[] = [];
  for (const e of Array.from(root.querySelectorAll('*'))) {
    if (
      ['A', 'IMG', 'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'LINK', 'FOREIGNOBJECT', 'IMAGE', 'USE'].includes(
        e.tagName.toUpperCase(),
      )
    )
      bad.push(e.tagName);
    for (const a of Array.from(e.attributes)) {
      if (/^on|href|src|^id$/i.test(a.name)) bad.push(`${e.tagName}[${a.name}]`);
      if (a.name === 'style' && /url\(|@import|expression/i.test(a.value)) bad.push(`style ${a.value}`);
    }
  }
  return bad;
};

describe('limmat/katex with the real KaTeX', () => {
  it('draws inline, display, and block formulas', () => {
    const root = R('Inline $x^2$ and \\(a_1\\) and \\[\\frac{1}{2}\\]\n\n$$\n\\sum_{i=1}^n i\n$$\n');
    const b = boxes(root);
    expect(b.length).toBe(4);
    for (const x of b) expect(x.querySelector('.katex')).not.toBeNull();
    expect(b[2].querySelector('.katex-display')).not.toBeNull(); // \[ \] is display mode
    expect(b[3].tagName).toBe('DIV');
    expect(b[0].querySelector('annotation')?.textContent).toBe('x^2');
    expect(b[0].querySelector('.katex-display')).toBeNull(); // $ $ is inline mode
  });

  it('streamed one character at a time gives the same page as the whole text', () => {
    const md = 'Euler: \\(e^{i\\pi}+1=0\\), and $x_1 + y_2$.\n\n$$\n\\int_0^1 x\\,dx = \\frac12\n$$\n\nPrice $5 and $10.\n';
    expect(render(md, 'char', on).innerHTML).toBe(render(md, 'whole', on).innerHTML);
    expect(render(md, 7, on).innerHTML).toBe(render(md, 'whole', on).innerHTML);
  });

  it('a formula KaTeX cannot parse stays as its tex, not a red error', () => {
    const root = R('a $\\frac{$ b and $\\unknownmacro$ c');
    const b = boxes(root);
    expect(b.map((x) => x.textContent)).toEqual(['\\frac{', '\\unknownmacro']);
    expect(root.querySelector('.katex-error, .katex')).toBeNull();
  });

  describe('hostile formulas stay inert', () => {
    const hostile = [
      '\\href{javascript:alert(1)}{click}',
      '\\url{javascript:alert(1)}',
      '\\htmlClass{evil}{x}',
      '\\htmlId{location}{x}',
      '\\htmlStyle{background:url(//evil/x);position:fixed;top:0}{x}',
      '\\htmlData{a=b}{x}',
      '\\includegraphics{https://evil.example/x.png}',
      '\\includegraphics[height=1em]{javascript:alert(1)}',
      '\\text{<script>alert(1)</script>}',
      '\\verb|<img src=x onerror=alert(1)>|',
      '\\color{red;background:url(//evil/x)}{x}',
      '\\rule{100em}{100em}',
    ];
    for (const tex of hostile)
      it(tex, () => {
        const root = R(`$${tex}$`);
        expect(unsafe(root)).toEqual([]);
        expect(root.querySelector('.evil, [id], [data-a]')).toBeNull();
        // maxSize clamps the rule: the size is in the tex (the annotation) but in no attribute
        expect(Array.from(root.querySelectorAll('*')).some((e) => Array.from(e.attributes).some((x) => /100em/.test(x.value)))).toBe(false);
      });

    it('options cannot turn trust on or errors into red text', () => {
      const root = R('$\\href{javascript:alert(1)}{x}$ and $\\frac{$', {
        renderMath: katexMath(katex, { trust: true, throwOnError: false }),
      });
      expect(unsafe(root)).toEqual([]);
      expect(root.querySelector('.katex-error')).toBeNull();
      expect(boxes(root)[1].textContent).toBe('\\frac{');
    });

    it('a macro bomb is stopped by maxExpand and shows as text', () => {
      const t = performance.now();
      const root = R('$\\def\\a{\\a\\a}\\a$');
      expect(performance.now() - t).toBeLessThan(2000);
      expect(boxes(root)[0].textContent).toBe('\\def\\a{\\a\\a}\\a');
    });

    it('a deeply nested formula neither throws nor hangs', () => {
      const tex = `${'{'.repeat(900)}x${'}'.repeat(900)}`;
      const t = performance.now();
      const root = R(`$${tex}$`);
      expect(boxes(root).length).toBe(1);
      expect(performance.now() - t).toBeLessThan(5000);
    });
  });

  it('keeps its own options: macros, output', () => {
    const root = R('$\\RR$', { renderMath: katexMath(katex, { macros: { '\\RR': '\\mathbb{R}' }, output: 'mathml' }) });
    expect(boxes(root)[0].querySelector('.katex-html')).toBeNull();
    expect(boxes(root)[0].querySelector('math')).not.toBeNull();
  });

  it('works with the throttled renderer and keeps the box while the text grows', () => {
    const root = document.createElement('div');
    const r = createRenderer(root, { ...on, throttleMs: 0 });
    r.write('a $x^2$');
    const box = boxes(root)[0];
    r.write(' and more words');
    expect(boxes(root)[0]).toBe(box);
    expect(box.querySelector('.katex')).not.toBeNull();
  });
});
