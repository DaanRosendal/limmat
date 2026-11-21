// Streamdown as its README shows it for streaming chat: default mode (streaming, with remend on), isAnimating true while text arrives and false at the end.
// A macrotask is yielded after every write, because React throws error 185 when dozens of flushSync renders land in one task.
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Streamdown } from 'streamdown';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

window.LIB = {
  create(container) {
    const root = createRoot(container);
    let acc = '';
    const draw = (isAnimating) => flushSync(() => root.render(createElement(Streamdown, { isAnimating }, acc)));
    return {
      async write(x) {
        acc += x;
        draw(true);
        await tick(0);
      },
      async end() {
        draw(false);
        await tick(30); // code blocks are highlighted asynchronously
      },
      destroy: () => root.unmount(),
    };
  },
};
