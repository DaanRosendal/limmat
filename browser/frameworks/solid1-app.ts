// @ts-nocheck: written for solid-js 1.9 (installed as solid-js-v1 and aliased to solid-js in the bundle), but the repo's types are Solid 2's.
// The Solid 1 fixture.

import { Markdown } from 'limmat/solid';
import { createComponent, createEffect, createSignal } from 'solid-js';
import { render } from 'solid-js/web';

const [state, setState] = createSignal({ text: '', done: false, other: 0 });
const dispose = render(() => {
  const p = document.createElement('p');
  p.setAttribute('data-other', '');
  createEffect(() => {
    p.textContent = String(state().other);
  });
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
  set: (text: string, done = false) => setState({ ...state(), text, done }),
  bump: () => setState({ ...state(), other: state().other + 1 }),
  unmount: () => dispose(),
};
(window as any).ready = true;
