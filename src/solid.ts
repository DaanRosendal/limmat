import * as solid from 'solid-js';
import { follow } from './follow';
import type { Options } from './index.js';

export interface MarkdownProps {
  /** The whole message so far. Text that only grows is written as chunks, and any other text starts the message over. */
  text: string;
  /** Set once the message is complete: unfinished constructs become literal text and code blocks are highlighted. */
  done?: boolean;
  /** Renderer options, read when the component first renders. */
  options?: Options;
  class?: string;
}

// Solid 2 removed the one-function createEffect (it takes a compute and an apply function now), so the two majors are told
// apart by `onSettled`, which only 2 has. The calls are untyped because the types of one major reject the other.
const S = solid as unknown as { createEffect(...a: unknown[]): void; onCleanup(f: () => void): void };
const v2 = 'onSettled' in S;

/**
 * Streaming markdown as a Solid component, for Solid 1 and 2. It returns one `<div>` that limmat owns, so Solid never
 * touches its children. It runs in the browser only: on a server it renders nothing (use `renderToString` from
 * `limmat/server` there).
 * @example
 * import { Markdown } from 'limmat/solid';
 * <Markdown text={message().text} done={message().done} />
 */
export function Markdown(props: MarkdownProps): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  const box = document.createElement('div');
  let f: ReturnType<typeof follow> | undefined;
  const show = (text: string, done: boolean | undefined, cls: string | undefined, options: Options | undefined) => {
    f ??= follow(box, options);
    box.className = cls ?? '';
    f.set(text, done);
  };
  // Solid 2 wants every prop read in the compute function (and warns when apply reads one), so the values are passed along.
  if (v2)
    S.createEffect(
      () => [props.text, props.done, props.class, props.options],
      (a: Parameters<typeof show>) => show(...a),
    );
  else S.createEffect(() => show(props.text, props.done, props.class, props.options));
  S.onCleanup(() => f?.destroy());
  return box;
}
