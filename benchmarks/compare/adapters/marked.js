// marked: not a streaming library, so the documented usage is to parse the whole text again on every write.
import { marked } from 'marked';

window.LIB = {
  create(container) {
    let acc = '';
    return {
      write(x) {
        acc += x;
        container.innerHTML = marked.parse(acc);
      },
      end() {},
      destroy() {},
    };
  },
};
