// limmat with no options: the README quick start (default 50 ms throttle).
import { createRenderer } from '../../../dist/index.js';

window.LIB = {
  create(container) {
    const r = createRenderer(container);
    return { write: (x) => r.write(x), end: () => r.end(), destroy: () => r.destroy() };
  },
};
