// The dock: transport buttons, the scrubber, the stream presets, and the sliders.
import { $$ } from './dom.js';
import { el } from './els.js';
import { closePanel, openName, openPanel } from './panels.js';
import { finish, pause, play, reset, scrub, step } from './player.js';
import { writeHash } from './share.js';
import { initSliders, syncSliders } from './sliders.js';
import { s } from './state.js';
import { STREAMS } from './streams.js';

/** Make the controls show the state (after a share link, or after a change made elsewhere). */
export function syncControls() {
  for (const i of $$('input[name="stream"]')) {
    i.checked = i.value === s.stream;
    // On a phone the presets scroll sideways: bring the chosen one into view without moving the page.
    const row = i.closest('.seg');
    if (i.checked && row) row.scrollLeft = i.parentElement.offsetLeft - (row.clientWidth - i.parentElement.offsetWidth) / 2;
  }
  syncSliders();
  syncMarks();
}

/** Make the Chunks button and the raw pane show whether the chunks are tinted. */
function syncMarks() {
  el.marks.setAttribute('aria-pressed', String(s.marks));
  el.raw.classList.toggle('plain', !s.marks);
}

export const canPlay = () => s.stream !== 'custom' || !!STREAMS.custom.text;

function pickStream(value) {
  // The editor belongs to Custom, so choosing any other stream puts it away.
  if (openName() === 'paste' && value !== 'custom') closePanel(false);
  s.stream = value;
  if (value === 'custom') openPanel('paste'); // Custom always opens the editor, so the text can be changed
  writeHash();
  reset(canPlay());
}

export function initControls() {
  // Radios fire click for arrow keys too, and when the checked one is clicked again.
  for (const i of $$('input[name="stream"]')) i.addEventListener('click', () => pickStream(i.value));
  initSliders(() => reset(canPlay()));
  el.marks.addEventListener('click', () => {
    s.marks = !s.marks;
    syncMarks();
    writeHash();
  });
  el.play.addEventListener('click', () => (s.playing ? pause() : play()));
  el.step.addEventListener('click', step);
  el.finish.addEventListener('click', finish);
  el.restart.addEventListener('click', () => reset(canPlay()));
  el.pos.addEventListener('input', () => scrub(Number(el.pos.value)));
}
