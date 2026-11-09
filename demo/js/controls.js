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
  for (const i of $$('input[name="stream"]')) i.checked = i.value === s.stream;
  syncSliders();
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
  el.play.addEventListener('click', () => (s.playing ? pause() : play()));
  el.step.addEventListener('click', step);
  el.finish.addEventListener('click', finish);
  el.restart.addEventListener('click', () => reset(canPlay()));
  el.pos.addEventListener('input', () => scrub(Number(el.pos.value)));
}
