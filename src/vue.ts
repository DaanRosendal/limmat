import { defineComponent, h, onBeforeUnmount, onMounted, type PropType, ref, watch } from 'vue';
import { type Follower, follow } from './follow';
import type { Options } from './index.js';

/**
 * Streaming markdown as a Vue component. It renders one `<div>` that limmat owns, so Vue never patches its children, and a
 * `class` on the component lands on that div. The `options` prop is read when the component mounts. On the server it renders
 * an empty `<div>` (use `renderToString` from `limmat/server` there).
 * @example
 * import { Markdown } from 'limmat/vue';
 * <Markdown :text="message.text" :done="message.done" />
 */
export const Markdown = defineComponent({
  name: 'LimmatMarkdown',
  props: {
    /** The whole message so far. Text that only grows is written as chunks, and any other text starts the message over. */
    text: { type: String, required: true },
    /** Set once the message is complete: unfinished constructs become literal text and code blocks are highlighted. */
    done: { type: Boolean, default: false },
    /** Renderer options, read when the component mounts. */
    options: { type: Object as PropType<Options>, default: undefined },
  },
  setup(props) {
    const box = ref<HTMLElement>();
    let f: Follower | undefined;
    onMounted(() => {
      f = follow(box.value as HTMLElement, props.options);
      f.set(props.text, props.done);
    });
    watch(
      () => [props.text, props.done] as const,
      ([text, done]) => f?.set(text, done),
    );
    onBeforeUnmount(() => f?.destroy());
    return () => h('div', { ref: box });
  },
});
