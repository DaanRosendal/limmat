// Remembers highlighted code so a rebuilt code block comes back coloured in the same frame, with no plain flash.
// The highlighter is async, so without this every rebuild of a finished block shows plain text for a moment.
import { s } from './state.js';

const cache = new Map(); // `${lang}\0${code}` -> { cls, nodes }
const LIMIT = 40;

export function highlight(el, text, lang) {
  const key = `${lang}\0${text}`;
  const hit = cache.get(key);
  if (hit) {
    el.className = hit.cls;
    el.replaceChildren(...hit.nodes.map((n) => n.cloneNode(true)));
    return;
  }
  return s.hl?.(el, text, lang)?.then(() => {
    if (el.textContent !== text || !el.firstElementChild) return; // nothing was coloured, so nothing to remember
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, { cls: el.className, nodes: Array.from(el.childNodes, (n) => n.cloneNode(true)) });
  });
}
