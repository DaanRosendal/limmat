import { createDom } from './dom';
import { createRenderer, type Options } from './index.js';

/** The options that mean something without a page. `highlight`, `renderMath`, `onLinkClick`, and `throttleMs` need one, so they are left out, and math stays text. */
export type ServerOptions = Omit<Options, 'highlight' | 'renderMath' | 'singleDollarMath' | 'onLinkClick' | 'throttleMs'>;

/**
 * Markdown to an HTML string, with no DOM and no globals, for rendering on a server. The result is what `write` of the
 * whole text followed by `end()` leaves in the container (the same parser and builder run), and it comes out as
 * `<p>`, `<pre>`, and the rest of limmat's elements and classes. Code blocks are not highlighted. All text and
 * attribute values are escaped, so the string is safe to put in a page as it is. Aligned table cells carry a `style` attribute,
 * which a strict `style-src` Content-Security-Policy blocks.
 * @example
 * import { renderToString } from 'limmat/server';
 * const html = renderToString('# Hi\n\nSome **bold** text.');
 */
export function renderToString(markdown: string, options: ServerOptions = {}): string {
  if (typeof markdown !== 'string') throw new TypeError('limmat: markdown must be a string');
  const { root, html } = createDom();
  const r = createRenderer(root as unknown as HTMLElement, {
    ...options,
    highlight: undefined,
    renderMath: undefined,
    onLinkClick: undefined,
    throttleMs: 0,
  });
  r.write(markdown);
  r.end();
  return html();
}
