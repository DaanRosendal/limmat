// @humanspeak/svelte-markdown as its README shows it for streaming: `<SvelteMarkdown source="" streaming />` and `writeChunk` for every chunk.
// The component is mounted and its first effects have run before the first chunk, as in an app. It batches updates into animation frames,
// so end() waits for the last one.
import SvelteMarkdown from '@humanspeak/svelte-markdown';
import { flushSync, mount, unmount } from 'svelte';

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

window.LIB = {
  create(container) {
    const component = mount(SvelteMarkdown, { target: container, props: { source: '', streaming: true } });
    flushSync();
    return {
      write(x) {
        component.writeChunk(x);
        flushSync();
      },
      async end() {
        await frames();
      },
      destroy: () => unmount(component),
    };
  },
};
