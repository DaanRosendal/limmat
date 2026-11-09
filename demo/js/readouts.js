// What the page reports about the live output: position, open block, and the measured chips.
import { el } from './els.js';
import { counters, s } from './state.js';

function kindOf(n) {
  if (n.matches('.limmat-code')) return 'code block';
  if (n.matches('.limmat-table-wrap')) return 'table';
  if (/^(UL|OL)$/.test(n.tagName)) return 'list';
  if (/^H[1-6]$/.test(n.tagName)) return 'heading';
  if (n.tagName === 'BLOCKQUOTE') return 'quote';
  return 'paragraph';
}

/** Outline the last block while the stream is live (a teaching device that lives outside limmat). */
export function markOpen() {
  for (const n of el.out.querySelectorAll('.is-open')) n.classList.remove('is-open');
  const last = el.out.lastElementChild;
  const chip = el.openChip;
  if (s.ended || !last) {
    chip.dataset.state = s.ended ? 'done' : 'idle';
    chip.textContent = s.ended ? 'Done: every block final' : 'Open: none yet';
    return;
  }
  last.classList.add('is-open');
  chip.dataset.state = 'open';
  chip.textContent = `Open: ${kindOf(last)}`;
}

// Links that are not http, https, mailto, or a plain site path. A DOM check that does not trust limmat's own link policy.
const unsafeHref = (a) => {
  const h = (a.getAttribute('href') ?? '').trim();
  if (h.startsWith('//') || h.includes('\\')) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(h)?.[1].toLowerCase();
  return !!scheme && !['http', 'https', 'mailto'].includes(scheme);
};

/** Show a count in its chip, and turn the chip red if it is ever not zero. */
function setCount(node, n) {
  node.textContent = String(n);
  node.parentElement.classList.toggle('bad', n > 0);
}

export function updateReadouts() {
  el.pos.value = String(s.i);
  el.posOut.textContent = `${s.i} / ${s.chunks.length}`;
  el.v.chunks.textContent = String(s.chunks.length);
  el.v.bytes.textContent = String(s.bytes);
  if (s.stats.n !== s.dts.length) {
    const sorted = s.dts.slice().sort((a, b) => a - b);
    s.stats = { n: s.dts.length, q50: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0 };
  }
  const all = Array.from(el.out.querySelectorAll('*'));
  setCount(el.v.scripts, all.filter((n) => n.tagName === 'SCRIPT').length + counters.alerts);
  setCount(el.v.images, all.filter((n) => n.tagName === 'IMG').length);
  setCount(el.v.handlers, all.filter((n) => Array.from(n.attributes).some((a) => /^on/i.test(a.name))).length);
  setCount(el.v.bad, all.filter((n) => n.tagName === 'A' && unsafeHref(n)).length);
  el.v.ms.textContent = s.dts.length ? s.stats.q50.toFixed(2) : '-';
}

/** Follow the output as it changes, including late changes such as the highlighter adding spans after a fence closes. */
export function watchOutput() {
  new MutationObserver(markOpen).observe(el.out, { childList: true });
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      updateReadouts();
    });
  }).observe(el.out, { childList: true, subtree: true });
}
