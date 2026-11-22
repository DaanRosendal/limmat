// The one mutable state object. Modules read and write it directly.
/** The stream that plays first, and the one a link that cannot be read falls back to. */
export const DEFAULT_STREAM = 'showcase';

export const s = {
  stream: DEFAULT_STREAM,
  size: 1,
  random: true,
  marks: true, // tint the chunks in the raw pane
  seed: 1,
  speed: 60,
  throttle: 50,
  chunks: [],
  i: 0,
  playing: false,
  ended: false,
  timer: 0,
  r: null,
  customText: '',
  hl: null,
  math: null, // the renderMath function (KaTeX), once its file has loaded
  lastSpan: null,
  rendered: null, // the text in the live renderer while the visitor edits, null otherwise
};

export const CUSTOM_MAX = 200000;
export const SHARE_MAX = 4096;
