// Once a stream is done, the raw pane becomes an editor: type, and limmat renders each keystroke as a live open stream.

import { syncControls } from './controls.js';
import { el } from './els.js';
import { edit, onPhase } from './player.js';
import { writeHash } from './share.js';
import { s } from './state.js';

function show(on) {
  el.raw.hidden = on;
  el.rawEdit.hidden = !on;
  el.editHint.hidden = !on;
  el.marks.hidden = on;
  if (on) {
    el.rawEdit.value = s.chunks.join('');
    el.rawEdit.scrollTop = el.rawEdit.scrollHeight;
  }
}

export function initEditor() {
  onPhase((ended) => show(ended));
  let saved = 0;
  el.rawEdit.addEventListener('input', () => {
    edit(el.rawEdit.value);
    syncControls();
    clearTimeout(saved);
    saved = setTimeout(writeHash, 400); // the link follows the edit, but not every keystroke
  });
}
