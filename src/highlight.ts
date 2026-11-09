import type { Options } from './index.js';

/**
 * Adapter for @speed-highlight/core. Each language loads as its own small chunk the first time it is needed,
 * so a reply without code never downloads the highlighter. Install the peer dependency yourself.
 * Very large blocks and very long lines are left as plain text, because the highlighter is slow on them
 * (seconds for a 16 KB block), which would freeze the page.
 */
export function speedHighlight({ maxChars = 4096, maxLine = 300 } = {}): NonNullable<Options['highlight']> {
  return async (el, code, lang) => {
    if (code.length > maxChars || new RegExp(`[^\\n]{${maxLine + 1}}`).test(code)) return;
    const { highlightElement } = await import('@speed-highlight/core');
    await highlightElement(el, lang || undefined);
  };
}
