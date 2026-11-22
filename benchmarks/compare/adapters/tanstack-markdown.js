// TanStack Markdown as its AI streaming guide shows it: the React component with the streaming extension, frontmatter and heading ids off.
// The component parses the whole accumulated text on every update.
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming';
import { Markdown } from '@tanstack/markdown/react';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

const extensions = [streamingMarkdownExtension()];

window.LIB = {
  create(container) {
    const root = createRoot(container);
    let acc = '';
    const draw = () => flushSync(() => root.render(createElement(Markdown, { extensions, frontmatter: false, headingIds: false }, acc)));
    return {
      write(x) {
        acc += x;
        draw();
      },
      end() {},
      destroy: () => root.unmount(),
    };
  },
};
