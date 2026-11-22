import { createRenderer, type Options } from './index.js';

/** A renderer that is driven by "the whole text so far" instead of chunks, which is how a framework holds a message. */
export interface Follower {
  /** Show `text`. Text that extends the last text is written as the new part only, and anything else starts the message over. */
  set(text: string, done?: boolean): void;
  destroy(): void;
}

export function follow(el: HTMLElement, options?: Options): Follower {
  const r = createRenderer(el, options);
  let text = '';
  let ended = false;
  return {
    set(next, done = false) {
      if (ended ? next !== text || !done : !next.startsWith(text)) {
        r.reset();
        text = '';
        ended = false;
      }
      if (next.length > text.length) {
        r.write(next.slice(text.length));
        text = next;
      }
      if (done && !ended) {
        r.end();
        ended = true;
      }
    },
    destroy: () => r.destroy(),
  };
}
