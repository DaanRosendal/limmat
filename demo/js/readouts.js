// What the page reports about the live output: position, open block, and the measured chips.
import { el } from './els.js';
import { s } from './state.js';

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
export function updateReadouts() {
  el.pos.value = String(s.i);
  el.posOut.textContent = `${s.i} / ${s.chunks.length}`;
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
