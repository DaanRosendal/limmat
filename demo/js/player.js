// The stream player: feeds chunks to a real limmat renderer, mirrors them in the raw pane, and scrubs.
import { createRenderer } from '../limmat.min.js';
import { follow, make, say, utf8 } from './dom.js';
import { el } from './els.js';
import { markOpen, updateReadouts } from './readouts.js';
import { s } from './state.js';
import { chunkText, STREAMS, textOf } from './streams.js';

const sticky = [follow(el.out), follow(el.raw)];
const resetHooks = [];
/** Run `fn` after every reset (the chunking check uses this to follow the stream). */
export const onReset = (fn) => resetHooks.push(fn);

function newRenderer() {
  s.r?.destroy();
  el.out.replaceChildren();
  s.r = createRenderer(el.out, {
    throttleMs: s.throttle,
    highlight: (code, text, lang) => s.hl?.(code, text, lang),
  });
}

function rebuildChunks() {
  const st = STREAMS[s.stream];
  s.chunks = st.chunks ? st.chunks.slice() : chunkText(textOf(st), s.size, s.random, s.seed);
  el.pos.max = String(s.chunks.length);
  for (const i of document.querySelectorAll('input[name="size"]')) i.disabled = !!st.chunks;
}

function appendRaw(chunk, n) {
  s.lastSpan?.classList.remove('new');
  s.lastSpan = make('span', `c${n % 2} new`, chunk);
  el.raw.append(s.lastSpan);
}

function writeChunk(showRaw = true) {
  const chunk = s.chunks[s.i];
  if (showRaw) appendRaw(chunk, s.i);
  const t0 = performance.now();
  s.r.write(chunk);
  s.dts.push(performance.now() - t0);
  s.bytes += utf8.encode(chunk).length;
  s.i++;
}

function setLabel(state, text) {
  el.play.dataset.state = state;
  el.play.lastElementChild.textContent = text;
}

function complete() {
  s.r.end();
  s.ended = true;
  s.playing = false;
  clearTimeout(s.timer);
  setLabel('stopped', 'Replay');
  markOpen();
  updateReadouts();
  say('Finished streaming.');
}

function tick() {
  if (!s.playing) return;
  writeChunk();
  updateReadouts();
  if (s.i >= s.chunks.length) return complete();
  s.timer = setTimeout(tick, s.speed);
}

export function play() {
  if (s.ended) return reset(true);
  if (!s.chunks.length) return;
  s.playing = true;
  setLabel('playing', 'Pause');
  say('Streaming.');
  tick();
}

export function pause() {
  s.playing = false;
  clearTimeout(s.timer);
  setLabel('stopped', 'Play');
  say('Paused.');
}

export function reset(autoplay) {
  clearTimeout(s.timer);
  Object.assign(s, { playing: false, ended: false, i: 0, dts: [], bytes: 0, scrubbed: false, lastSpan: null });
  el.raw.replaceChildren();
  newRenderer();
  rebuildChunks();
  for (const stick of sticky) stick();
  setLabel('stopped', 'Play');
  markOpen();
  updateReadouts();
  for (const fn of resetHooks) fn();
  if (autoplay && s.chunks.length) play();
}

export function step() {
  if (s.playing) pause();
  if (s.ended) reset(false);
  if (s.i < s.chunks.length) {
    writeChunk();
    updateReadouts();
    if (s.i >= s.chunks.length) complete();
  }
}

/** Write every remaining chunk to limmat, but show them in the raw pane as one block so a huge paste stays fast. */
export function finish() {
  if (s.ended) return;
  if (s.playing) pause();
  const rest = [];
  const first = s.i;
  while (s.i < s.chunks.length) {
    rest.push(s.chunks[s.i]);
    writeChunk(false);
  }
  if (rest.length) appendRaw(rest.join(''), first);
  s.lastSpan?.classList.remove('new');
  complete();
}

/** Rebuild the stream up to a chunk boundary, then stay paused so the open construct can be studied. */
export function scrub(target) {
  if (s.playing) pause();
  clearTimeout(s.timer);
  Object.assign(s, { ended: false, scrubbed: true, dts: [], lastSpan: null });
  setLabel('stopped', 'Play');
  el.raw.replaceChildren();
  newRenderer();
  const prefix = s.chunks.slice(0, target);
  prefix.forEach((c, n) => appendRaw(c, n));
  s.lastSpan?.classList.remove('new');
  s.r.write(prefix.join(''));
  s.i = target;
  s.bytes = utf8.encode(prefix.join('')).length;
  if (target >= s.chunks.length) {
    s.r.end();
    s.ended = true;
  }
  markOpen();
  updateReadouts();
}
