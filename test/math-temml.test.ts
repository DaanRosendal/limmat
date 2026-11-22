// The renderMath hook with a second real library (Temml, which draws with the browser's own MathML), to check that the hook is
// not shaped around KaTeX. The recipe in docs/math.md is this code. Temml's display mode sets `style` on a MathML element, which jsdom
// does not have (the hook then throws and the tex stays as text), so display math with Temml is checked in the browser (browser/math.spec.ts).
import temml from 'temml';
import { describe, expect, it } from 'vitest';
import type { Options } from '../src/index';
import { render } from './helpers/util';

const on: Options = {
  renderMath: (el, tex, { display }) => temml.render(tex, el, { displayMode: display, throwOnError: true }),
};
const boxes = (root: Element) => Array.from(root.querySelectorAll('.limmat-math'));

describe('renderMath with Temml', () => {
  it('draws inline formulas as MathML', () => {
    const b = boxes(render('Inline $x^2$ and \\(a_1\\) here', 'whole', on));
    expect(b.length).toBe(2);
    for (const x of b) expect(x.querySelector('math')).not.toBeNull();
  });

  it('a display formula that the library cannot draw stays as its tex', () => {
    // In jsdom, which has no style on MathML elements. A browser draws it.
    expect(boxes(render('\\[\\frac{1}{2}\\]', 'whole', on))[0].textContent).toBe('\\frac{1}{2}');
  });

  it('streams one character at a time to the same page as the whole text', () => {
    const md = 'Euler: \\(e^{i\\pi}+1=0\\) and $x_1 + y_2$ done.\n';
    expect(render(md, 'char', on).innerHTML).toBe(render(md, 'whole', on).innerHTML);
  });

  it('a formula Temml cannot parse, or a link in one, stays as its tex', () => {
    const b = boxes(render('$\\frac{$ and $\\href{javascript:alert(1)}{x}$', 'whole', on));
    expect(b.map((x) => x.textContent)).toEqual(['\\frac{', '\\href{javascript:alert(1)}{x}']);
  });
});
