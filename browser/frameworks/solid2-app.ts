// The Solid 2 fixture: a parent with a message and an unrelated counter. `createComponent` is what compiled JSX calls.

import { render } from '@solidjs/web';
import { Markdown } from 'limmat/solid';
import { createComponent, createEffect, createSignal, flush } from 'solid-js';

const [state, setState] = createSignal({ text: '', done: false, other: 0 });
const dispose = render(() => {
  const p = document.createElement('p');
  p.setAttribute('data-other', '');
  createEffect(
    () => state().other,
    (n) => {
      p.textContent = String(n);
    },
  );
  const wrap = document.createElement('div');
  wrap.append(p);
  const md = createComponent(Markdown, {
    get text() {
      return state().text;
    },
    get done() {
      return state().done;
    },
    class: 'msg',
  }) as unknown as Node;
  wrap.append(md);
  return wrap;
}, document.getElementById('mount') as HTMLElement);

(window as any).app = {
  set: (text: string, done = false) => {
    setState({ ...state(), text, done });
    flush();
  },
  bump: () => {
    setState({ ...state(), other: state().other + 1 });
    flush();
  },
  unmount: () => dispose(),
};
(window as any).ready = true;
