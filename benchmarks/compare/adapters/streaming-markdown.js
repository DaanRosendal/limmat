// streaming-markdown with the default DOM renderer: the README quick start.
import * as smd from 'streaming-markdown';

window.LIB = {
  create(container) {
    const p = smd.parser(smd.default_renderer(container));
    return { write: (x) => smd.parser_write(p, x), end: () => smd.parser_end(p), destroy() {} };
  },
};
