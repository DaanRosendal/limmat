// The dock: transport buttons, the scrubber, and the segmented option groups.
import { $$, clamp } from './dom.js';
import { el } from './els.js';
import { closePanel, openName, openPanel } from './panels.js';
import { finish, pause, play, reset, scrub, step } from './player.js';
import { writeHash } from './share.js';
import { SPEEDS, s } from './state.js';
import { STREAMS } from './streams.js';

function check(name, value) {
  for (const i of $$(`input[name="${name}"]`)) i.checked = i.value === value;
}
const nearest = (map, ms) => Object.keys(map).reduce((a, b) => (Math.abs(map[b] - ms) < Math.abs(map[a] - ms) ? b : a));

/** Make the radios show the state (after a share link, or after a change made elsewhere). */
export function syncControls() {
  check('stream', s.stream);
  check('size', s.random ? 'random' : [1, 5, 20].includes(s.size) ? String(s.size) : '5');
  check('throttle', String(s.throttle));
  check('speed', nearest(SPEEDS, s.speed));
}

export const canPlay = () => s.stream !== 'custom' || !!STREAMS.custom.text;

function apply(name, value) {
  // The editor belongs to Yours, so choosing anything else in the dock puts it away.
  if (openName() === 'paste' && !(name === 'stream' && value === 'custom')) closePanel(false);
  if (name === 'stream') {
    s.stream = value;
    if (value === 'custom') openPanel('paste'); // Yours always opens the editor, so the text can be changed
  } else if (name === 'size') {
    if (value === 'random') {
      if (s.random) s.seed += 1; // clicking Random again reshuffles the cuts
      s.random = true;
      s.size = 12;
    } else {
      s.random = false;
      s.size = Number(value);
    }
  } else if (name === 'throttle') s.throttle = clamp(value, 0, 500, 50);
  else if (name === 'speed') {
    s.speed = SPEEDS[value];
    writeHash();
    return; // the delay is read on every tick, so the stream keeps going
  }
  writeHash();
  reset(canPlay());
}

export function initControls() {
  // Radios fire click for arrow keys too, and when the checked one is clicked again, which Random uses to reshuffle.
  for (const i of $$('.dock input[type="radio"]')) i.addEventListener('click', () => apply(i.name, i.value));
  el.play.addEventListener('click', () => (s.playing ? pause() : play()));
  el.step.addEventListener('click', step);
  el.finish.addEventListener('click', finish);
  el.restart.addEventListener('click', () => reset(canPlay()));
  el.pos.addEventListener('input', () => scrub(Number(el.pos.value)));
}
