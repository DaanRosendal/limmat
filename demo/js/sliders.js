// The three sliders (chunk size, throttle, speed), built from scratch so the value can sit inside the thumb.
// Each is an ARIA slider drawn as SVG (positions are SVG attributes, so the strict CSP needs no inline style).
// The thumb snaps to a preset mark when dragged close, a click on a mark jumps to it, and every value in between
// is reachable, with the mouse, touch, or the keyboard. Positions run 0 to 100 and the scales are not linear,
// so the presets spread out.
import { $ } from './dom.js';
import { closePanel, openName } from './panels.js';
import { writeHash } from './share.js';
import { s } from './state.js';

const SNAP = 3; // positions
const INSET = 26; // px kept free at each end so the widest thumb stays inside
const H = 52;
const MID = 16; // the track's height in the svg
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
    text: (v = s.size) => (s.random ? `1-${v}` : String(v)),
    mark: (v) => String(v),
    hint: (v) => `${v} ${v === 1 ? 'character' : 'characters'}`,
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
    text: (v = s.throttle) => `${v} ms`,
    mark: (v) => String(v),
    hint: (v) => `${v} ms`,
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
    text: (v = s.speed) => `${Math.round(1000 / v)}/s`,
    mark: (v) => `${Math.round(1000 / v)}/s`,
    hint: (v) => `${Math.round(1000 / v)} chunks per second`,
    restart: false, // the delay is read on every tick, so the stream keeps going
  },
};

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const sliders = {}; // name -> { root, spec, fill, pill, label, marks, pos }

function build(name, spec) {
  const root = $(`#sl-${name}`);
  const rail = svg('svg', { class: 'rail', 'aria-hidden': 'true', focusable: 'false' });
  const track = svg('line', { class: 'track', x1: '0', x2: '100%', y1: MID, y2: MID });
  const fill = svg('line', { class: 'fill', x1: '0', y1: MID, y2: MID });
  const marks = spec.presets.map((v) => {
    const x = `${spec.toPos(v)}%`;
    const g = svg('g', { class: 'tick' });
    const title = svg('title');
    title.textContent = spec.hint(v);
    // A wide invisible target makes the thin mark easy to hit.
    g.append(
      title,
      svg('rect', { x, y: MID + 8, width: 18, height: H - MID - 8, transform: 'translate(-9 0)' }),
      svg('line', { x1: x, x2: x, y1: MID + 14, y2: MID + 20 }),
      Object.assign(svg('text', { x, y: MID + 33 }), { textContent: spec.mark(v) }),
    );
    g.dataset.value = String(v);
    return { v, g };
  });
  const thumb = svg('g', { class: 'thumb' });
  const pill = svg('rect', { height: 22, rx: 11, y: MID - 11 });
  const label = svg('text', { y: MID + 4 });
  thumb.append(pill, label);
  rail.append(track, fill, ...marks.map((m) => m.g), thumb);
  root.append(rail);
  sliders[name] = { root, spec, fill, pill, label, marks, pos: 0 };
  return sliders[name];
}

/** Draw the slider at its position, with the value in the thumb. */
function draw(sl) {
  const { spec, root, fill, pill, label, marks } = sl;
  const x = `${sl.pos}%`;
  const text = spec.text();
  const w = Math.max(32, Math.min(2 * INSET, text.length * 6.7 + 14));
  label.textContent = text;
  label.setAttribute('x', x);
  pill.setAttribute('x', x);
  pill.setAttribute('width', String(w));
  pill.setAttribute('transform', `translate(${-w / 2} 0)`);
  fill.setAttribute('x2', x);
  root.setAttribute('aria-valuenow', String(sl.pos));
  root.setAttribute('aria-valuetext', text);
  for (const { v, g } of marks) g.classList.toggle('on', v === spec.get());
}

const posOf = (sl, clientX) => {
  const box = sl.root.getBoundingClientRect();
  const p = ((clientX - box.left - INSET) / (box.width - 2 * INSET)) * 100;
  return Math.round(Math.min(100, Math.max(0, p)));
};

/** Move to a position. With `snap` (a drag), a position near a preset lands exactly on it. */
function moveTo(sl, p, snap) {
  const { spec } = sl;
  const preset = snap ? spec.presets.find((v) => Math.abs(spec.toPos(v) - p) <= SNAP) : undefined;
  if (preset === undefined) {
    sl.pos = p;
    spec.set(spec.toValue(p));
  } else {
    sl.pos = spec.toPos(preset);
    spec.set(preset);
  }
  draw(sl);
}

/** Make the sliders and the Random button show the state (after a share link, or after a change made elsewhere). */
export function syncSliders() {
  for (const sl of Object.values(sliders)) {
    sl.pos = sl.spec.toPos(sl.spec.get());
    draw(sl);
  }
  $('#rand').setAttribute('aria-pressed', String(s.random));
}

/** Scripted streams have fixed cuts, so the chunk size controls only apply to the others. */
export function setSizeEnabled(on) {
  const root = sliders.size.root;
  root.setAttribute('aria-disabled', String(!on));
  root.tabIndex = on ? 0 : -1;
  $('#rand').disabled = !on;
}

/** `restart` re-runs the stream after a change that needs it. */
export function initSliders(restart) {
  for (const [name, spec] of Object.entries(SPECS)) {
    const sl = build(name, spec);
    const { root } = sl;
    const off = () => root.getAttribute('aria-disabled') === 'true';
    let keyTimer = 0;
    const commit = () => {
      if (openName() === 'paste') closePanel(false);
      writeHash();
      if (spec.restart) restart();
    };
    let dragging = false;
    root.addEventListener('pointerdown', (e) => {
      if (off() || e.button !== 0) return;
      const tick = e.target.closest?.('.tick');
      if (tick) {
        // A click on a mark jumps straight to that preset.
        const v = Number(tick.dataset.value);
        sl.pos = spec.toPos(v);
        spec.set(v);
        draw(sl);
        commit();
        return;
      }
      dragging = true;
      root.setPointerCapture(e.pointerId);
      root.focus({ preventScroll: true });
      moveTo(sl, posOf(sl, e.clientX), true);
    });
    root.addEventListener('pointermove', (e) => {
      if (dragging) moveTo(sl, posOf(sl, e.clientX), true);
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      commit();
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('keydown', (e) => {
      if (off()) return;
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
      let p;
      if (step !== undefined) p = Math.min(100, Math.max(0, sl.pos + step));
      else if (e.key === 'Home') p = 0;
      else if (e.key === 'End') p = 100;
      else return;
      e.preventDefault();
      moveTo(sl, p, false);
      clearTimeout(keyTimer);
      keyTimer = setTimeout(commit, 350); // wait for the key presses to finish before restarting the stream
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
  syncSliders();
}
