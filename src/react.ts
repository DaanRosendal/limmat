import { createElement, type ReactElement, useEffect, useRef } from 'react';
import { type Follower, follow } from './follow';
import type { Options } from './index.js';

export interface MarkdownProps {
  /** The whole message so far. Text that only grows is written as chunks, and any other text starts the message over. */
  text: string;
  /** Set once the message is complete: unfinished constructs become literal text and code blocks are highlighted. */
  done?: boolean;
  /** Renderer options. They are read when the component mounts, so change `key` to apply new ones. */
  options?: Options;
  className?: string;
}

/**
 * Streaming markdown as a React component. It renders one `<div>` that limmat owns, so React never re-renders its children.
 * On the server it renders an empty `<div>` (use `renderToString` from `limmat/server` there).
 * @example
 * import { Markdown } from 'limmat/react';
 * <Markdown text={message.text} done={message.done} />
 */
export function Markdown({ text, done, options, className }: MarkdownProps): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const f = useRef<Follower | null>(null);
  const opts = useRef(options);
  opts.current = options;
  useEffect(() => {
    const x = follow(box.current as HTMLElement, opts.current);
    f.current = x;
    return () => {
      x.destroy();
      f.current = null;
    };
  }, []);
  useEffect(() => {
    f.current?.set(text, done);
  }, [text, done]);
  return createElement('div', { ref: box, className });
}
