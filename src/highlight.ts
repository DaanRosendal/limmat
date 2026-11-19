import type { Options } from './index.js';

/**
 * Adapter for @speed-highlight/core. Each language loads as its own small chunk the first time it is needed,
 * so a reply without code never downloads the highlighter. Install the peer dependency yourself.
 * Very large blocks and very long lines are left as plain text, because the highlighter is slow on very long
 * lines (seconds for a single 16 KB line), which would freeze the page. Tune the limits with `speedHighlight({ maxChars, maxLine })`.
 *
 * Also load one of the highlighter's theme stylesheets, for example `@speed-highlight/core/themes/default.css`: without a
 * theme the code stays uncolored, and the theme only adds token colors (limmat keeps its own frame when `limmat/style.css` is loaded).
 * @example
 * createRenderer(el, { highlight: speedHighlight() });
 */
export function speedHighlight({ maxChars = 4096, maxLine = 300 } = {}): NonNullable<Options['highlight']> {
  return async (el, code, lang) => {
    if (code.length > maxChars || new RegExp(`[^\\n]{${maxLine + 1}}`).test(code)) return;
    if (lang && !/^[\w+#-]{1,20}$/.test(lang)) return; // the language names a file the highlighter loads, so it is checked here too
    const { highlightElement } = await import('@speed-highlight/core');
    await highlightElement(el, lang || undefined);
  };
}
