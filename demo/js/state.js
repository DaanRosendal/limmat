// The one mutable state object. Modules read and write it directly.
export const s = {
  stream: 'reply',
  size: 12,
  random: true,
  seed: 1,
  speed: 60,
  throttle: 50,
  chunks: [],
  i: 0,
  playing: false,
  ended: false,
  timer: 0,
  r: null,
  dts: [],
  bytes: 0,
  customText: '',
  hl: null,
  scrubbed: false,
  lastSpan: null,
  rendered: null, // the text in the live renderer while the visitor edits, null otherwise
  stats: { n: -1, q50: 0 },
};

/** Payload alert() calls, counted by a patched window.alert (see main.js). */
export const counters = { alerts: 0 };
export const SPEEDS = { slow: 200, normal: 60, fast: 15 };
export const CUSTOM_MAX = 200000;
export const SHARE_MAX = 4096;
