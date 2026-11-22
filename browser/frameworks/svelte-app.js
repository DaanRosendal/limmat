// The Svelte fixture: a real compiled .svelte component that uses the action as `use:limmat`, mounted with Svelte 5.
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';

const c = mount(App, { target: document.getElementById('mount') });
window.app = {
  set: (text, done = false) => {
    c.set(text, done);
    flushSync();
  },
  bump: () => {
    c.bump();
    flushSync();
  },
  unmount: () => unmount(c),
};
window.ready = true;
