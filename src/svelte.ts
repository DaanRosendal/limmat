import { follow } from './follow';
import type { Options } from './index.js';

export interface LimmatParams {
  /** The whole message so far. Text that only grows is written as chunks, and any other text starts the message over. */
  text: string;
  /** Set once the message is complete: unfinished constructs become literal text and code blocks are highlighted. */
  done?: boolean;
  /** Renderer options, read when the action starts. */
  options?: Options;
}

/**
 * Streaming markdown as a Svelte action. The element it is used on is the box that limmat fills, so leave it empty.
 * It works in Svelte 3, 4, and 5, and in the browser only (use `renderToString` from `limmat/server` for a server).
 * @example
 * <script>
 *   import { limmat } from 'limmat/svelte';
 * </script>
 * <div use:limmat={{ text: message.text, done: message.done }}></div>
 */
export function limmat(node: HTMLElement, params: LimmatParams) {
  const f = follow(node, params.options);
  f.set(params.text, params.done);
  return {
    update: (p: LimmatParams) => f.set(p.text, p.done),
    destroy: () => f.destroy(),
  };
}
