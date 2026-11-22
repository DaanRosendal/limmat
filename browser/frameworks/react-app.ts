// The React fixture: a parent that holds a message and an unrelated counter, in StrictMode, with the real react-dom.

import { Markdown } from 'limmat/react';
import { createElement, StrictMode, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

let setState: (s: { text: string; done: boolean; other: number }) => void = () => {};
let state = { text: '', done: false, other: 0 };

function App() {
  const [s, set] = useState(state);
  setState = (n) => set((state = n));
  return createElement(
    'div',
    null,
    createElement('p', { 'data-other': '' }, String(s.other)),
    createElement(Markdown, { text: s.text, done: s.done, className: 'msg' }),
  );
}

const root = createRoot(document.getElementById('mount') as HTMLElement);
flushSync(() => root.render(createElement(StrictMode, null, createElement(App))));

(window as any).app = {
  set: (text: string, done = false) => flushSync(() => setState({ ...state, text, done })),
  bump: () => flushSync(() => setState({ ...state, other: state.other + 1 })),
  unmount: () => flushSync(() => root.unmount()),
};
(window as any).ready = true;
