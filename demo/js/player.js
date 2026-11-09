// The stream player: feeds chunks to a real limmat renderer, mirrors them in the raw pane, and scrubs.
import { createRenderer } from '../limmat.min.js';
import { follow, make, say, utf8 } from './dom.js';
import { el } from './els.js';
import { highlight } from './hlcache.js';
import { markOpen, updateReadouts } from './readouts.js';
import { s } from './state.js';
import { chunkText, STREAMS, textOf } from './streams.js';

const sticky = [follow(el.out), follow(el.raw)];
const phaseHooks = [];
/** Run `fn(ended)` whenever the stream finishes or goes back to being open (the editor follows this). */
export const onPhase = (fn) => phaseHooks.push(fn);
const emitPhase = () => {
  for (const fn of phaseHooks) fn(s.ended);
};

function newRenderer() {
  s.rendered = null;
  s.r?.destroy();
  el.out.replaceChildren();
  s.r = createRenderer(el.out, {
    throttleMs: s.throttle,
    highlight,
  });
}

function rebuildChunks() {
  const st = STREAMS[s.stream];
  s.chunks = st.chunks ? st.chunks.slice() : chunkText(textOf(st), s.size, s.random, s.seed);
  el.pos.max = String(s.chunks.length);
  s.totalBytes = utf8.encode(s.chunks.join('')).length;
  syncSizeEnabled();
}

/** Scripted streams have fixed cuts, so the chunk size toggle only applies to the others. */
function syncSizeEnabled() {
  for (const i of document.querySelectorAll('input[name="size"]')) i.disabled = !!STREAMS[s.stream].chunks;
}

function appendRaw(chunk, n) {
  s.lastSpan?.classList.remove('new');
  s.lastSpan = make('span', `c${n % 2} new`, chunk);
  el.raw.append(s.lastSpan);
}

function writeChunk(showRaw = true) {
  const chunk = s.chunks[s.i];
  if (showRaw) appendRaw(chunk, s.i);
  s.r.write(chunk);
  s.bytes += utf8.encode(chunk).length;
  s.i++;
}

function setLabel(state, text) {
  el.play.dataset.state = state;
  el.play.lastElementChild.textContent = text;
}

function complete() {
  s.rendered = null; // end() closes the renderer, so the next edit starts a fresh one
  s.r.end();
  s.ended = true;
  s.playing = false;
  clearTimeout(s.timer);
  setLabel('stopped', 'Replay');
  markOpen();
  updateReadouts();
  emitPhase();
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
  if (s.ended || s.i >= s.chunks.length) return reset(true); // also after typing in the editor
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
  Object.assign(s, { playing: false, ended: false, i: 0, bytes: 0, scrubbed: false, lastSpan: null });
  el.raw.replaceChildren();
  newRenderer();
  rebuildChunks();
  for (const stick of sticky) stick();
  setLabel('stopped', 'Play');
  markOpen();
  updateReadouts();
  emitPhase();
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
  Object.assign(s, { ended: false, scrubbed: true, lastSpan: null });
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
  emitPhase();
}

/** The visitor typed in the editor: the text becomes "Custom", and limmat renders it as an open stream, not a finished one. */
export function edit(text) {
  if (s.playing) pause();
  clearTimeout(s.timer);
  STREAMS.custom.text = s.customText = text;
  s.stream = 'custom';
  s.chunks = chunkText(text, s.size, s.random, s.seed);
  Object.assign(s, {
    i: s.chunks.length,
    ended: false,
    scrubbed: true,
    bytes: utf8.encode(text).length,
    totalBytes: utf8.encode(text).length,
  });
  el.pos.max = String(s.chunks.length);
  syncSizeEnabled();
  setLabel('stopped', 'Replay');
  // Typing at the end only appends, so write just the new characters and leave every finished block alone.
  // Anything else (a first edit after the stream ended, a deletion, a change in the middle) rebuilds from scratch.
  if (s.rendered !== null && text.length > s.rendered.length && text.startsWith(s.rendered)) s.r.write(text.slice(s.rendered.length));
  else {
    s.r.reset();
    s.r.write(text);
  }
  s.rendered = text;
  markOpen();
  updateReadouts();
}
