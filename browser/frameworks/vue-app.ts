// The Vue fixture: a parent that holds a message and an unrelated counter, with the real vue runtime.

import { Markdown } from 'limmat/vue';
import { createApp, h, nextTick, reactive } from 'vue';

const state = reactive({ text: '', done: false, other: 0 });
const app = createApp({
  render: () =>
    h('div', [h('p', { 'data-other': '' }, String(state.other)), h(Markdown, { text: state.text, done: state.done, class: 'msg' })]),
});
app.mount('#mount');

(window as any).app = {
  set: async (text: string, done = false) => {
    Object.assign(state, { text, done });
    await nextTick();
  },
  bump: async () => {
    state.other++;
    await nextTick();
  },
  unmount: () => app.unmount(),
};
(window as any).ready = true;
