// The React, Vue, and Svelte wrappers, driven by the real frameworks in jsdom. The property under test is the same for all
// three: a `text` that only grows is written as chunks, and after any sequence of updates the DOM equals what a plain
// renderer gives for the same final text.
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { Markdown as ReactMarkdown } from '../src/react';
import { limmat } from '../src/svelte';
import { Markdown as VueMarkdown } from '../src/vue';
import { CORPUS } from './helpers/cases';
import { render, renderOpen } from './helpers/util';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOC = '# Title\n\nSome **bold** and `code` and [a link](https://example.com).\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n';
const prefixes = (s: string, step: number) => Array.from({ length: Math.ceil(s.length / step) }, (_, i) => s.slice(0, (i + 1) * step));

/** What every wrapper is driven through: mount, set the props, read the box, unmount. */
interface Harness {
  box: HTMLElement;
  set(p: { text: string; done?: boolean }): Promise<void> | void;
  unmount(): Promise<void> | void;
}
interface Kind {
  name: string;
  mount(p: { text: string; done?: boolean }, options?: object): Promise<Harness>;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.replaceChildren();
});
const host = () => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

const react = (strict: boolean): Kind => ({
  name: strict ? 'react (StrictMode)' : 'react',
  async mount(p, options) {
    const el = host();
    const root = createRoot(el);
    const view = (q: { text: string; done?: boolean }) => {
      const md = createElement(ReactMarkdown, { ...q, options: { throttleMs: 0, ...options }, className: 'msg' });
      return strict ? createElement(StrictMode, null, md) : md;
    };
    await act(async () => root.render(view(p)));
    return {
      box: el.firstElementChild as HTMLElement,
      set: (q) => act(async () => root.render(view(q))),
      unmount: () => act(async () => root.unmount()),
    };
  },
});

const vue: Kind = {
  name: 'vue',
  async mount(p, options) {
    const el = host();
    const props = reactive({ ...p });
    const app = createApp({ render: () => h(VueMarkdown, { ...props, options: { throttleMs: 0, ...options }, class: 'msg' }) });
    app.mount(el);
    await nextTick();
    return {
      box: el.firstElementChild as HTMLElement,
      set: async (q) => {
        Object.assign(props, { done: false }, q);
        await nextTick();
      },
      unmount: async () => {
        app.unmount();
        await nextTick();
      },
    };
  },
};

// Svelte's `use:limmat={...}` is a plain function call, so it is driven here the way a compiled component drives it. The
// compiled-component check, with a real .svelte file, is in browser/frameworks.spec.ts.
const svelte: Kind = {
  name: 'svelte',
  async mount(p, options) {
    const box = host();
    const o = { throttleMs: 0, ...options };
    const a = limmat(box, { ...p, options: o });
    return {
      box,
      set: (q) => a.update({ ...q, options: o }),
      unmount: () => a.destroy(),
    };
  },
};

const kinds = [react(false), react(true), vue, svelte];

describe.each(kinds)('$name wrapper', (kind) => {
  it('renders the text it is given', async () => {
    const { box } = await kind.mount({ text: DOC, done: true });
    expect(box.innerHTML).toBe(render(DOC).innerHTML);
  });

  it('streams: every growing prefix renders like the same text written in one piece', async () => {
    const m = await kind.mount({ text: '' });
    for (const text of prefixes(DOC, 3)) {
      await m.set({ text });
      expect(box(m).innerHTML).toBe(renderOpen(text).innerHTML);
    }
    await m.set({ text: DOC, done: true });
    expect(box(m).innerHTML).toBe(render(DOC).innerHTML);
  });

  it('streams one character at a time with no raw markers showing', async () => {
    const md = 'a **bold** and *it* and `c` and [l](https://example.com) and ~~s~~';
    const m = await kind.mount({ text: '' });
    for (const text of prefixes(md, 1)) {
      await m.set({ text });
      expect(box(m).textContent).not.toMatch(/\*|`|~~|\]\(|\[/);
    }
  });

  it('ending: done turns open constructs into literal text', async () => {
    const m = await kind.mount({ text: 'a **b' });
    expect(box(m).innerHTML).toBe(renderOpen('a **b').innerHTML);
    await m.set({ text: 'a **b', done: true });
    expect(box(m).innerHTML).toBe(render('a **b').innerHTML);
    expect(box(m).textContent).toContain('**b');
  });

  it('keeps finished blocks as the same nodes while the text grows', async () => {
    const m = await kind.mount({ text: '# Head\n\nfirst paragraph\n\nsecond' });
    const head = box(m).querySelector('h1');
    const first = box(m).querySelectorAll('p')[0];
    await m.set({ text: '# Head\n\nfirst paragraph\n\nsecond paragraph\n\nthird' });
    expect(box(m).querySelector('h1')).toBe(head);
    expect(box(m).querySelectorAll('p')[0]).toBe(first);
  });

  it('a text that is not an extension of the last one starts the message over', async () => {
    const m = await kind.mount({ text: '' });
    await m.set({ text: '# One\n\nfirst message' });
    await m.set({ text: 'second *message*' });
    expect(box(m).innerHTML).toBe(renderOpen('second *message*').innerHTML);
    await m.set({ text: 'second *message* grows' });
    expect(box(m).innerHTML).toBe(renderOpen('second *message* grows').innerHTML);
  });

  it('shrinking to the empty string clears the message', async () => {
    const m = await kind.mount({ text: 'hello' });
    await m.set({ text: '' });
    expect(box(m).innerHTML).toBe('');
    await m.set({ text: 'again' });
    expect(box(m).innerHTML).toBe(renderOpen('again').innerHTML);
  });

  it('new text after done starts a new message', async () => {
    const m = await kind.mount({ text: 'one **two', done: true });
    await m.set({ text: 'one **two three', done: false });
    expect(box(m).innerHTML).toBe(renderOpen('one **two three').innerHTML);
    await m.set({ text: 'one **two three**', done: true });
    expect(box(m).innerHTML).toBe(render('one **two three**').innerHTML);
  });

  it('done without a text change ends the message once, and again is harmless', async () => {
    const m = await kind.mount({ text: 'x *y' });
    await m.set({ text: 'x *y', done: true });
    const html = box(m).innerHTML;
    await m.set({ text: 'x *y', done: true });
    expect(box(m).innerHTML).toBe(html);
  });

  it('passes the options to the renderer', async () => {
    const plain = (await kind.mount({ text: '```\ncode\n```', done: true })).box;
    const custom = (await kind.mount({ text: '```\ncode\n```', done: true }, { classPrefix: 'zz' })).box;
    expect(plain.innerHTML).toContain('limmat-');
    expect(custom.innerHTML).toContain('zz-');
    expect(custom.innerHTML).not.toContain('limmat-');
  });

  it('is safe: hostile markdown stays inert', async () => {
    const md = '[x](javascript:alert(1)) <img src=x onerror=alert(1)> <script>alert(1)</script>';
    const m = await kind.mount({ text: md, done: true });
    expect(box(m).querySelector('script, img, [onerror]')).toBeNull();
    expect(Array.from(box(m).querySelectorAll('a')).every((a) => !/^javascript:/i.test(a.getAttribute('href') ?? ''))).toBe(true);
  });

  it('stops writing after unmount, and leaves nothing running', async () => {
    const m = await kind.mount({ text: 'abc' });
    const el = box(m);
    await m.unmount();
    const html = el.innerHTML;
    await new Promise((r) => setTimeout(r, 30));
    expect(el.innerHTML).toBe(html);
  });

  it('matches a plain renderer on the whole corpus, streamed in uneven pieces', async () => {
    for (const doc of CORPUS) {
      const m = await kind.mount({ text: '' });
      for (let i = 0, n = 1; i < doc.length; i += n, n = (n % 7) + 1) await m.set({ text: doc.slice(0, i + n) });
      await m.set({ text: doc, done: true });
      expect(box(m).innerHTML).toBe(render(doc).innerHTML);
      await m.unmount();
    }
  }, 60000);
});

const box = (m: Harness) => m.box;

describe('react specifics', () => {
  it('renders one div, with the className, and nothing else around it', async () => {
    const m = await react(false).mount({ text: 'x' });
    expect(m.box.tagName).toBe('DIV');
    expect(m.box.className).toBe('msg');
    expect(m.box.parentElement?.children.length).toBe(1);
  });

  it('StrictMode does not duplicate or lose content', async () => {
    const m = await react(true).mount({ text: DOC, done: true });
    expect(m.box.innerHTML).toBe(render(DOC).innerHTML);
    expect(m.box.querySelectorAll('h1').length).toBe(1);
  });

  it('a parent re-render with the same props does not touch the DOM', async () => {
    const m = await react(false).mount({ text: 'same *text*' });
    const p = m.box.querySelector('p');
    await m.set({ text: 'same *text*' });
    expect(m.box.querySelector('p')).toBe(p);
  });
});

describe('vue specifics', () => {
  it('renders one div that takes the fallthrough class', async () => {
    const m = await vue.mount({ text: 'x' });
    expect(m.box.tagName).toBe('DIV');
    expect(m.box.className).toBe('msg');
  });

  it('works as a component in a template-less parent with its own state', async () => {
    const el = host();
    const state = reactive({ text: '' });
    const Parent = defineComponent({ render: () => h('section', [h(VueMarkdown, { text: state.text, options: { throttleMs: 0 } })]) });
    const app = createApp(Parent);
    app.mount(el);
    cleanups.push(() => app.unmount());
    for (const text of prefixes(DOC, 5)) {
      state.text = text;
      await nextTick();
      expect(el.querySelector('div')?.innerHTML).toBe(renderOpen(text).innerHTML);
    }
  });
});

describe('svelte specifics', () => {
  it('the action returns update and destroy, and needs no import from svelte', () => {
    const a = limmat(document.createElement('div'), { text: '' });
    expect(typeof a.update).toBe('function');
    expect(typeof a.destroy).toBe('function');
    a.destroy();
  });

  it('works with no options object', () => {
    const el = document.createElement('div');
    const a = limmat(el, { text: 'hi *there*' });
    a.update({ text: 'hi *there*', done: true });
    expect(el.querySelector('em')?.textContent).toBe('there');
    a.destroy();
  });
});
