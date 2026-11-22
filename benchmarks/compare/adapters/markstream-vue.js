// markstream-vue as its README shows it for AI chat: `mode="chat"`, the accumulated text as `content`, `final` once the stream has ended, no fade.
import MarkdownRender from 'markstream-vue';
import 'markstream-vue/index.css';
import { createApp, h, nextTick, ref } from 'vue';

window.LIB = {
  create(container) {
    const content = ref('');
    const final = ref(false);
    const app = createApp({
      render: () => h(MarkdownRender, { mode: 'chat', content: content.value, final: final.value, smoothStreaming: 'auto', fade: false }),
    });
    app.mount(container);
    return {
      async write(x) {
        content.value += x;
        await nextTick();
      },
      async end() {
        final.value = true;
        await nextTick();
        await new Promise((r) => setTimeout(r, 60)); // it finishes its nodes (code blocks, tables) a little after the last update
      },
      destroy: () => app.unmount(),
    };
  },
};
