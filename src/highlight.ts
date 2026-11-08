import type { Options } from './index';

/**
 * Adapter for @speed-highlight/core. Each language loads as its own small chunk the first time it is needed,
 * so a reply without code never downloads the highlighter. Install the peer dependency yourself.
 */
export function speedHighlight(): NonNullable<Options['highlight']> {
  return async (el, _code, lang) => {
    const { highlightElement } = await import('@speed-highlight/core');
    await highlightElement(el, lang || undefined);
  };
}
