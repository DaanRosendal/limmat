import type { MathRenderer } from './index.js';

/** The part of KaTeX that the adapter calls: pass the `katex` object you imported, so limmat itself depends on nothing. */
export interface KatexLike {
  render(tex: string, el: HTMLElement, options?: object): void;
}

/**
 * Adapter that draws formulas with KaTeX, for the `renderMath` option. Install `katex` yourself and load its stylesheet
 * (`katex/dist/katex.min.css`), which also brings the fonts. It renders with KaTeX's DOM path, so it works under a strict
 * `style-src` and Trusted Types, and it keeps `trust` off: a formula can then never make a link, load an image, or set an
 * id or a class. A formula KaTeX cannot parse throws, so limmat shows its tex as text instead of a red error. `strict`,
 * `maxExpand` (macro expansions), and `maxSize` (sizes in em) default to the safe values below, and `options` can change them,
 * but not `trust`, `throwOnError`, or `displayMode`.
 * @example
 * import katex from 'katex';
 * createRenderer(el, { renderMath: katexMath(katex) });
 */
export function katexMath(katex: KatexLike, options: Record<string, unknown> = {}): MathRenderer {
  return (el, tex, { display }) =>
    katex.render(tex, el, {
      strict: 'ignore',
      maxExpand: 200,
      maxSize: 10,
      ...options,
      throwOnError: true,
      trust: false,
      displayMode: display,
    });
}
