// The three sliders (chunk size, throttle, speed). Each has preset marks that the thumb snaps to when it is close,
// and every value in between is still reachable. Positions are 0 to 100, the scales are not linear so presets spread out.
import { $ } from './dom.js';
import { closePanel, openName } from './panels.js';
import { writeHash } from './share.js';
import { s } from './state.js';

const SNAP = 3; // positions
const ln = Math.log;
const delayOfRate = (rate) => Math.min(400, Math.max(10, 1000 / rate));

const SPECS = {
  size: {
    presets: [1, 5, 20],
    toValue: (p) => Math.round(50 ** (p / 100)),
    toPos: (v) => Math.round((100 * ln(v)) / ln(50)),
    get: () => s.size,
    set: (v) => {
      s.size = v;
    },
    text: () => (s.random ? `1 to ${s.size}` : String(s.size)),
    restart: true,
  },
  throttle: {
    presets: [0, 50, 200],
    toValue: (p) => Math.round((500 * (p / 100) ** 2) / 5) * 5,
    toPos: (v) => Math.round(100 * Math.sqrt(v / 500)),
    get: () => s.throttle,
    set: (v) => {
      s.throttle = v;
    },
    text: () => `${s.throttle} ms`,
    restart: true,
  },
  speed: {
    // The state keeps the delay between chunks in ms (share links use it), the slider shows chunks per second.
    presets: [200, 60, 15],
    toValue: (p) => Math.round(delayOfRate(2 * 50 ** (p / 100))),
    toPos: (d) => Math.round((100 * ln(1000 / d / 2)) / ln(50)),
    get: () => s.speed,
    set: (v) => {
      s.speed = v;
    },
    text: () => `${Math.round(1000 / s.speed)} per s`,
    restart: false, // the delay is read on every tick, so the stream keeps going
  },
};

const NS = 'http://www.w3.org/2000/svg';

function show(name) {
  const spec = SPECS[name];
  $(`#val-${name}`).textContent = spec.text();
  $(`#sl-${name}`).setAttribute('aria-valuetext', spec.text());
}

/** Make the sliders and the Random button show the state (after a share link, or after a change made elsewhere). */
export function syncSliders() {
  for (const [name, spec] of Object.entries(SPECS)) {
    $(`#sl-${name}`).value = String(spec.toPos(spec.get()));
    show(name);
  }
  $('#rand').setAttribute('aria-pressed', String(s.random));
}

/** `restart` re-runs the stream after a change that needs it. */
export function initSliders(restart) {
  for (const [name, spec] of Object.entries(SPECS)) {
    const input = $(`#sl-${name}`);
    const ticks = $('.ticks', input.parentElement);
    for (const v of spec.presets) {
      const x = `${spec.toPos(v)}%`;
      const line = document.createElementNS(NS, 'line');
      for (const [k, val] of [
        ['x1', x],
        ['x2', x],
        ['y1', '0'],
        ['y2', '6'],
      ])
        line.setAttribute(k, val);
      ticks.append(line);
    }
    input.addEventListener('input', () => {
      const p = Number(input.value);
      const snap = spec.presets.find((v) => Math.abs(spec.toPos(v) - p) <= SNAP);
      if (snap === undefined) spec.set(spec.toValue(p));
      else {
        spec.set(snap);
        input.value = String(spec.toPos(snap));
      }
      show(name);
    });
    input.addEventListener('change', () => {
      if (openName() === 'paste') closePanel(false);
      writeHash();
      if (spec.restart) restart();
    });
  }
  $('#rand').addEventListener('click', () => {
    if (openName() === 'paste') closePanel(false);
    s.random = !s.random;
    if (s.random) s.seed += 1; // turning Random on picks fresh cuts
    syncSliders();
    writeHash();
    restart();
  });
}
