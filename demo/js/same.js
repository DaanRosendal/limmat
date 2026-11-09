// "Same as one write": when a stream is done, stream the same text again in the chosen chunks and in a single write,
// both into hidden containers with the real limmat, and compare the final HTML.
import { createRenderer } from '../limmat.min.js';
import { el } from './els.js';
import { onPhase } from './player.js';
import { s } from './state.js';

const MAX_CHARS = 20000; // keep the check instant, a longer paste is not re-streamed

function finalHtml(chunks) {
  const box = document.createElement('div');
  const r = createRenderer(box, { throttleMs: 0 });
  for (const c of chunks) r.write(c);
  r.end();
  const html = box.innerHTML;
  r.destroy();
  return html;
}

function setState(state, note = '') {
  el.sameChip.dataset.state = state;
  el.sameChip.textContent = note || 'Same as one write';
}

/** Run the comparison for the current chunks. Also used by the editor after each edit. */
export function runSame() {
  const text = s.chunks.join('');
  if (text.length > MAX_CHARS) return setState('idle', 'Too long to re-check');
  const same = finalHtml(s.chunks) === finalHtml([text]);
  setState(same ? 'done' : 'bad', same ? '' : 'Differs from one write');
}

export function initSame() {
  onPhase((ended) => (ended ? runSame() : setState('idle')));
}
