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

/** Unsafe patterns in the text, by pattern. This reads the input, so it never trusts limmat's own output. */
export function attacksIn(text) {
  const count = (re) => text.match(re)?.length ?? 0;
  return (
    count(/<script/gi) +
    count(/<img\b|!\[/gi) +
    count(/\bon[a-z]+\s*=/gi) +
    count(/\]\(\s*(?:(?:javascript|data|vbscript)\s*:|\/\/|\/\\|java[\t&])/gi)
  );
}

/** Live elements that must never exist in the output: scripts, images, on... attributes, unsafe links, and alert() calls. */
function throughCount(all) {
  const bad = (n) =>
    n.tagName === 'SCRIPT' ||
    n.tagName === 'IMG' ||
    Array.from(n.attributes).some((a) => /^on/i.test(a.name)) ||
    (n.tagName === 'A' && unsafeHref(n));
  return all.filter(bad).length + counters.alerts;
}

export function updateReadouts() {
  el.pos.value = String(s.i);
  el.posOut.textContent = `${s.i} / ${s.chunks.length}`;
  const all = Array.from(el.out.querySelectorAll('*'));
  const through = throughCount(all);
  const sent = attacksIn(s.chunks.slice(0, s.i).join(''));
  // Shown only when there is something to defend against, or when something got through (which must never happen).
  const chip = el.attacksChip;
  chip.hidden = sent === 0 && through === 0;
  chip.textContent = through > 0 ? 'Something unsafe got through' : 'Nothing unsafe got through';
  chip.classList.toggle('bad', through > 0);
  chip.classList.toggle('safe', sent > 0 && through === 0);
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
