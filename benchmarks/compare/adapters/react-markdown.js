// react-markdown with no plugins: render <Markdown>{text}</Markdown> again on every write.
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';

window.LIB = {
  create(container) {
    const root = createRoot(container);
    let acc = '';
    const draw = () => flushSync(() => root.render(createElement(Markdown, null, acc)));
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
