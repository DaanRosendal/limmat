// Demo page for limmat. Plain ES module, no bundler, no innerHTML, no inline styles (the page runs under a strict CSP).
// Everything on the page runs the real built limmat (./limmat.min.js). Nothing here is mocked.
import { createRenderer } from './limmat.min.js';

const $ = (sel, root = document) => root.querySelector(sel);
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const utf8 = new TextEncoder();

// ---------------------------------------------------------------- streams

const REPLY = `## Debouncing a search box

A **debounce** waits until typing *pauses* before it runs your handler. The plan:

1. Wrap the handler in a timer.
2. Clear the timer on every keystroke.
3. Run the handler when the timer fires.

| Delay | Feels like | Good for |
|:------|:----------:|---------:|
| 100 ms | instant | autocomplete |
| 300 ms | smooth | search boxes |
| 1000 ms | laggy | autosave |

A small version in TypeScript:

\`\`\`ts
function debounce<T extends unknown[]>(fn: (...a: T) => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...a: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...a), ms);
  };
}
\`\`\`

See [setTimeout on MDN](https://developer.mozilla.org/en-US/docs/Web/API/setTimeout).

Before you ship:

- [x] Pick a delay
- [ ] Cancel on unmount
`;

const TOUR = `Chunks can cut **bold** text, \`code\`, and [a link](https://example.com/docs) anywhere.

| Step | Status |
|:-----|-------:|
| Parse | done |
| Render | done |

\`\`\`ts
const ok = true;
\`\`\`

- parent
  - child
    - grandchild
  - sibling
`;

const LONG = Array.from(
  { length: 40 },
  (_, i) => `Sentence ${i + 1} has **bold**, *italic*, \`code\`, and a [link](https://example.com/${i}) in a single long paragraph.`,
).join(' ');

const STREAMS = {
  reply: { label: 'A believable reply', text: REPLY },
  tour: { label: 'Half-open tour', text: TOUR },
  'mid-marker': { label: 'Cut mid-marker', chunks: ['Hi **bo', 'ld** there, and `co', 'de` too.'] },
  'link-split': { label: 'Link split across chunks', chunks: ['See [the pa', 'per](https://exa', 'mple.com/a) now.'] },
  table: { label: 'Half-open table', chunks: ['| a | b |\n', '|---|---|\n', '| 1 | 2 |\n', '| 3 | 4 |\n'] },
  fence: { label: 'Half-open code fence', chunks: ['``', '`ts\nlet a = 1;\n', '``', '`\ndone'] },
  list: { label: 'Nested list', chunks: ['- a\n', '  - b\n', '    - c\n', '  - d\n'] },
  long: { label: 'One long paragraph (6 KB)', text: LONG },
  custom: { label: 'Your own markdown', text: '' },
};
const textOf = (s) => (s.chunks ? s.chunks.join('') : s.text);
const CUSTOM_MAX = 200000;
const SHARE_MAX = 4096;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split into chunks of whole code points: fixed size, or random lengths from 1 to size, from a seed. */
function chunkText(text, size, random, seed) {
  const cps = Array.from(text);
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < cps.length; ) {
    const n = random ? 1 + Math.floor(rnd() * size) : size;
    out.push(cps.slice(i, i + n).join(''));
    i += n;
  }
  return out;
}

// ---------------------------------------------------------------- state and elements

const el = {
  out: $('#out'),
  raw: $('#raw'),
  play: $('#play'),
  step: $('#step'),
  finish: $('#finish'),
  restart: $('#restart'),
  stream: $('#stream'),
  size: $('#size'),
  sizeOut: $('#size-out'),
  mode: $('#mode'),
  seed: $('#seed'),
  speed: $('#speed'),
  speedOut: $('#speed-out'),
  throttle: $('#throttle'),
  pos: $('#pos'),
  posOut: $('#pos-out'),
  openReadout: $('#open-readout'),
  metrics: $('#metrics'),
  notice: $('#notice'),
  live: $('#live'),
  custom: $('#custom'),
  customText: $('#custom-text'),
  customGo: $('#custom-go'),
};

const s = {
  stream: 'reply',
  size: 5,
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
  stats: { n: -1, q50: 0, q95: 0 },
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const say = (msg) => {
  el.live.textContent = msg;
};
const notice = (msg) => {
  el.notice.textContent = msg;
};

// ---------------------------------------------------------------- panes that follow the end of the stream

function follow(pane) {
  let stuck = true;
  pane.addEventListener('scroll', () => {
    stuck = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 24;
  });
  new MutationObserver(() => {
    if (stuck) pane.scrollTop = pane.scrollHeight;
  }).observe(pane, { childList: true, subtree: true, characterData: true });
  return () => {
    stuck = true;
  };
}
const stickOut = follow(el.out);
const stickRaw = follow(el.raw);

// ---------------------------------------------------------------- the open block marker (a teaching device, outside limmat)

function kindOf(n) {
  if (n.matches('.limmat-code')) return 'code block';
  if (n.matches('.limmat-table-wrap')) return 'table';
  if (/^(UL|OL)$/.test(n.tagName)) return 'list';
  if (/^H[1-6]$/.test(n.tagName)) return 'heading';
  if (n.tagName === 'BLOCKQUOTE') return 'quote';
  return 'paragraph';
}
function markOpen() {
  for (const n of el.out.querySelectorAll('.is-open')) n.classList.remove('is-open');
  const last = el.out.lastElementChild;
  if (s.ended || !last) {
    el.openReadout.textContent = s.ended ? 'Done: every block is final' : 'Open block: none yet';
    return;
  }
  last.classList.add('is-open');
  el.openReadout.textContent = `Open block: ${kindOf(last)}`;
}
new MutationObserver(markOpen).observe(el.out, { childList: true });
// The node count must follow late changes too, such as the highlighter adding spans after a fence closes.
let refreshQueued = false;
new MutationObserver(() => {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    updateReadouts();
  });
}).observe(el.out, { childList: true, subtree: true });

// ---------------------------------------------------------------- player

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
  const scripted = !!st.chunks;
  el.size.disabled = scripted;
  el.mode.disabled = scripted;
  el.seed.disabled = scripted;
  el.pos.max = String(s.chunks.length);
}

function appendRaw(chunk, n) {
  s.lastSpan?.classList.remove('new');
  s.lastSpan = make('span', `c${n % 2} new`, chunk);
  el.raw.append(s.lastSpan);
}

function updateReadouts() {
  el.pos.value = String(s.i);
  el.posOut.textContent = `${s.i} / ${s.chunks.length}`;
  if (s.stats.n !== s.dts.length) {
    const sorted = s.dts.slice().sort((a, b) => a - b);
    const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    s.stats = { n: s.dts.length, q50: q(0.5), q95: q(0.95) };
  }
  const nodes = el.out.querySelectorAll('*').length;
  el.metrics.textContent = s.dts.length
    ? `Measured in this tab, not a benchmark. ${s.dts.length} writes, synchronous write() time: median ${s.stats.q50.toFixed(2)} ms, p95 ${s.stats.q95.toFixed(2)} ms (renders deferred by the throttle are not counted). ${nodes} DOM nodes in the output, ${s.bytes} bytes streamed.`
    : s.scrubbed
      ? 'Scrubbing rebuilds the output with a single write, so there is nothing to time here. Press Play or Step to measure real writes.'
      : 'Measured in this tab, not a benchmark: nothing streamed yet.';
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

function complete() {
  s.r.end();
  s.ended = true;
  s.playing = false;
  clearTimeout(s.timer);
  for (const n of el.out.querySelectorAll('.is-open')) n.classList.remove('is-open');
  markOpen();
  el.play.textContent = 'Replay';
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

function reset(autoplay) {
  clearTimeout(s.timer);
  s.playing = false;
  s.ended = false;
  s.i = 0;
  s.dts = [];
  s.bytes = 0;
  s.scrubbed = false;
  el.raw.replaceChildren();
  newRenderer();
  rebuildChunks();
  stickOut();
  stickRaw();
  markOpen();
  updateReadouts();
  el.play.textContent = 'Play';
  if (autoplay && s.chunks.length) play();
}

function play() {
  if (s.ended) return reset(true);
  if (!s.chunks.length) return;
  s.playing = true;
  el.play.textContent = 'Pause';
  say('Streaming.');
  tick();
}
function pause() {
  s.playing = false;
  clearTimeout(s.timer);
  el.play.textContent = 'Play';
  say('Paused.');
}

el.play.addEventListener('click', () => (s.playing ? pause() : play()));
el.step.addEventListener('click', () => {
  if (s.playing) pause();
  if (s.ended) reset(false);
  if (s.i < s.chunks.length) {
    writeChunk();
    updateReadouts();
    if (s.i >= s.chunks.length) complete();
  }
});
// Write every remaining chunk to limmat, but show them in the raw pane as one block so a huge paste stays fast.
function writeRest() {
  const rest = [];
  const first = s.i;
  while (s.i < s.chunks.length) {
    rest.push(s.chunks[s.i]);
    writeChunk(false);
  }
  if (rest.length) appendRaw(rest.join(''), first);
  s.lastSpan?.classList.remove('new');
  updateReadouts();
  complete();
}
el.finish.addEventListener('click', () => {
  if (s.ended) return;
  if (s.playing) pause();
  writeRest();
});
el.restart.addEventListener('click', () => reset(true));

// Scrub: rebuild the stream up to a chunk boundary, then stay paused so the open construct can be studied.
el.pos.addEventListener('input', () => {
  const target = Number(el.pos.value);
  if (s.playing) pause();
  clearTimeout(s.timer);
  s.ended = false;
  s.scrubbed = true;
  el.play.textContent = 'Play';
  s.dts = [];
  s.bytes = 0;
  el.raw.replaceChildren();
  newRenderer();
  s.i = 0;
  const prefix = s.chunks.slice(0, target);
  for (let n = 0; n < prefix.length; n++) appendRaw(prefix[n], n);
  s.r.write(prefix.join(''));
  s.i = target;
  s.bytes = utf8.encode(prefix.join('')).length;
  markOpen();
  updateReadouts();
  if (target >= s.chunks.length) {
    s.r.end();
    s.ended = true;
    markOpen();
  }
});

// ---------------------------------------------------------------- controls and the share link

function fillStreamSelect() {
  for (const [key, st] of Object.entries(STREAMS)) el.stream.append(Object.assign(make('option', '', st.label), { value: key }));
}
fillStreamSelect();

function syncControls() {
  el.stream.value = s.stream;
  el.size.value = String(s.size);
  el.sizeOut.textContent = String(s.size);
  el.mode.value = s.random ? 'random' : 'fixed';
  el.seed.value = String(s.seed);
  el.speed.value = String(s.speed);
  el.speedOut.textContent = String(s.speed);
  el.throttle.value = [0, 50, 200].includes(s.throttle) ? String(s.throttle) : '50';
  el.custom.hidden = s.stream !== 'custom';
}

const b64url = {
  enc: (str) => {
    let bin = '';
    for (const b of utf8.encode(str)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (str) => {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  },
};

function writeHash() {
  const p = new URLSearchParams({
    v: '1',
    stream: s.stream,
    c: String(s.size),
    r: s.random ? '1' : '0',
    s: String(s.seed),
    t: String(s.throttle),
    d: String(s.speed),
  });
  if (s.stream === 'custom' && s.customText) {
    const enc = b64url.enc(s.customText.slice(0, SHARE_MAX));
    p.set('m', enc);
  }
  history.replaceState(null, '', `#${p.toString()}`);
}

const clamp = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

function readHash() {
  if (location.hash.length <= 1) return;
  try {
    if (location.hash.length > 12000) throw new Error('too long');
    const p = new URLSearchParams(location.hash.slice(1));
    const name = p.get('stream');
    if (name !== null) {
      if (!Object.hasOwn(STREAMS, name)) throw new Error('unknown stream');
      s.stream = name;
    }
    if (p.has('c')) s.size = clamp(p.get('c'), 1, 50, 5);
    if (p.has('r')) s.random = p.get('r') !== '0';
    if (p.has('s')) s.seed = clamp(p.get('s'), 0, 4294967295, 1);
    if (p.has('t')) s.throttle = [0, 50, 200].includes(Number(p.get('t'))) ? Number(p.get('t')) : 50;
    if (p.has('d')) s.speed = clamp(p.get('d'), 10, 400, 60);
    if (p.has('m')) {
      const text = b64url.dec(p.get('m'));
      if (utf8.encode(text).length > SHARE_MAX) throw new Error('markdown too long');
      s.customText = text;
      STREAMS.custom.text = text;
      s.stream = 'custom';
      el.customText.value = text;
    }
  } catch {
    notice('That link could not be read, so the default stream is playing instead.');
    s.stream = 'reply';
  }
}

function onControl() {
  s.stream = el.stream.value;
  s.size = clamp(el.size.value, 1, 50, 5);
  s.random = el.mode.value === 'random';
  s.seed = clamp(el.seed.value, 0, 4294967295, 1);
  s.speed = clamp(el.speed.value, 10, 400, 60);
  s.throttle = clamp(el.throttle.value, 0, 500, 50);
  syncControls();
  writeHash();
  notice('');
  reset(s.stream !== 'custom' || !!STREAMS.custom.text);
}
for (const c of [el.stream, el.size, el.mode, el.seed, el.throttle]) c.addEventListener('change', onControl);
el.size.addEventListener('input', () => {
  el.sizeOut.textContent = el.size.value;
});
el.speed.addEventListener('input', () => {
  s.speed = clamp(el.speed.value, 10, 400, 60);
  el.speedOut.textContent = String(s.speed);
});
el.speed.addEventListener('change', writeHash);

el.customGo.addEventListener('click', () => {
  let text = el.customText.value;
  if (text.length > CUSTOM_MAX) {
    text = text.slice(0, CUSTOM_MAX);
    notice(`Your text was longer than ${CUSTOM_MAX.toLocaleString('en')} characters, so it was cut there.`);
  } else notice('');
  s.customText = text;
  STREAMS.custom.text = text;
  writeHash();
  reset(!!text);
});

$('#share').addEventListener('click', async () => {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    notice('Link copied.');
  } catch {
    notice('Copying is blocked here. The address bar already holds the link.');
  }
});

// ---------------------------------------------------------------- the chunking check

function finalHtml(chunks, throttleMs) {
  const box = document.createElement('div');
  const r = createRenderer(box, { throttleMs });
  for (const c of chunks) r.write(c);
  r.end();
  const html = box.innerHTML;
  const nodes = box.querySelectorAll('*').length;
  r.destroy();
  return { html, nodes, writes: chunks.length };
}

$('#run-check').addEventListener('click', () => {
  const text = textOf(STREAMS[s.stream]);
  const tbody = $('#check-table tbody');
  tbody.replaceChildren();
  $('#check-table').hidden = false;
  const whole = finalHtml([text], 0);
  const plans = [['One write', [text]]];
  const len = Array.from(text).length;
  for (const [label, size, random] of [
    ['1 character at a time', 1, false],
    ['7 characters at a time', 7, false],
    [`random 1 to 12, seed ${s.seed}`, 12, true],
  ]) {
    if (len / (random ? 6 : size) > 6000) continue; // keep the check quick on very long text
    plans.push([label, chunkText(text, size, random, s.seed)]);
  }
  if (STREAMS[s.stream].chunks) plans.push(['The scripted cuts above', STREAMS[s.stream].chunks]);
  let same = true;
  for (const [label, chunks] of plans) {
    const res = finalHtml(chunks, 0);
    const ok = res.html === whole.html;
    same &&= ok;
    const tr = make('tr');
    tr.append(
      make('td', '', label),
      make('td', '', String(res.writes)),
      make('td', '', String(res.nodes)),
      make('td', '', ok ? 'yes, identical' : 'NO'),
    );
    tbody.append(tr);
  }
  const v = $('#check-verdict');
  v.className = `verdict ${same ? 'ok' : 'bad'}`;
  v.textContent = same
    ? `All ${plans.length} chunkings produced exactly the same HTML.`
    : 'The chunkings differ. That would be a bug in limmat.';
});

// ---------------------------------------------------------------- hostile gallery

const HOSTILE = [
  ['javascript: link', '[x](javascript:alert(1))', 'Refused. The label stays as text.'],
  ['Tab inside the scheme', '[x](java\tscript:alert(1))', 'Not a link at all. The whole input is shown as text.'],
  ['Entity trick', '[x](java&#115;cript:alert(1))', 'Entities are not decoded into a scheme. Label only.'],
  ['data: URL', '[x](data:text/html,<script>alert(1)</script>)', 'Refused, label only.'],
  ['Protocol-relative', '[x](//evil.com)', 'It would leave the site, so no link.'],
  ['Backslash trick', '[x](/\\evil.com)', 'Browsers read the backslash as a slash, so it is refused.'],
  ['Script tag', '<script>alert(1)</script>', 'Raw HTML is shown as text. No element is created.'],
  ['Event handler', '<img src=x onerror=alert(1)>', 'Shown as text. No img element, so nothing to fail and fire.'],
  ['Tracking image', '![x](https://evil.com/track.png)', 'Only the alt text is shown. Zero image requests.'],
  ['Image inside a link', '[![x](https://evil.com/p.png)](https://ok.com)', 'A link with the alt text. The image is never loaded.'],
  ['5,000 nested quotes', `${'> '.repeat(5000)}deep`, 'Nesting is capped, and the rest is kept as text.'],
  ['Class breakout in a fence', '```a b" onclick="alert(1)\ncode\n```', 'The language becomes the label "a" only. No onclick anywhere.'],
];

let alerts = 0;
window.alert = () => {
  alerts++;
};

function dump(node, depth, lines, budget) {
  if (lines.length >= budget) return;
  const pad = '  '.repeat(Math.min(depth, 12));
  if (node.nodeType === 3) {
    const t = node.textContent.replace(/\s+/g, ' ').trim();
    if (t) lines.push(`${pad}"${t.length > 60 ? `${t.slice(0, 60)}...` : t}"`);
    return;
  }
  const attrs = Array.from(node.attributes, (a) => ` ${a.name}="${a.value}"`).join('');
  lines.push(`${pad}<${node.tagName.toLowerCase()}${attrs}>`);
  for (const k of node.childNodes) dump(k, depth + 1, lines, budget);
}

function buildGallery() {
  const cards = $('#cards');
  const results = [];
  for (const [title, md, verdict] of HOSTILE) {
    const card = make('div', 'card');
    card.append(make('h3', '', title), make('p', 'label', 'Input'));
    card.append(make('pre', '', md.length > 200 ? `${md.slice(0, 40)}... (${md.length} characters)` : md.replace(/\t/g, '[TAB]')));
    card.append(make('p', 'label', 'What limmat built, live (inert)'));
    const result = make('div', 'result');
    result.setAttribute('inert', '');
    const r = createRenderer(result, { throttleMs: 0 });
    r.write(md);
    r.end();
    results.push(result);
    card.append(result, make('p', 'label', 'The same output as DOM text'));
    const lines = [];
    for (const k of result.childNodes) dump(k, 0, lines, 14);
    card.append(make('pre', '', lines.join('\n') || '(empty)'), make('p', 'verdict-line', verdict));
    cards.append(card);
  }
  cards.addEventListener('click', (e) => {
    if (e.target.closest?.('a')) e.preventDefault(); // the links are real, but a click must not leave the demo
  });
  return results;
}

function proof(results) {
  const all = results.flatMap((r) => Array.from(r.querySelectorAll('*')));
  const count = (f) => all.filter(f).length;
  const bad = (a) => /^(javascript|data|vbscript):/i.test(a.getAttribute('href') ?? '');
  const imgRequests = () => performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'img').length;
  const rows = [
    ['Script elements in output', count((n) => n.tagName === 'SCRIPT')],
    ['Image elements in output', count((n) => n.tagName === 'IMG')],
    ['Event-handler attributes', count((n) => Array.from(n.attributes).some((a) => /^on/i.test(a.name)))],
    ['Links to javascript:, data:, or vbscript:', count((n) => n.tagName === 'A' && bad(n))],
    ['Links created', count((n) => n.tagName === 'A')],
    ['Image requests this page made', imgRequests()],
    ['alert() calls from payloads', alerts],
  ];
  const dl = $('#proof');
  dl.replaceChildren();
  for (const [k, v] of rows) {
    const d = make('div');
    d.append(make('dt', '', k), make('dd', '', String(v)));
    dl.append(d);
  }
}

// ---------------------------------------------------------------- support table

async function buildSupport() {
  const rows = await (await fetch('support.json')).json();
  const tbody = $('#support-table tbody');
  const label = { supported: 'Supported', partial: 'Partial', 'not-yet': 'Not yet', wont: 'Will not' };
  for (const r of rows) {
    const tr = make('tr');
    tr.dataset.status = r.status;
    const status = make('td');
    status.append(make('span', `chip ${r.status}`, label[r.status] ?? r.status));
    tr.append(make('td', '', r.feature.replace(/`/g, '')), status, make('td', '', r.spec), make('td', '', r.note.replace(/`/g, '')));
    tbody.append(tr);
  }
  for (const b of document.querySelectorAll('.filters button')) {
    b.addEventListener('click', () => {
      for (const o of document.querySelectorAll('.filters button')) o.setAttribute('aria-pressed', String(o === b));
      for (const tr of tbody.children) tr.hidden = b.dataset.filter !== 'all' && tr.dataset.status !== b.dataset.filter;
    });
  }
}

// ---------------------------------------------------------------- release info, theme, install

async function showRelease() {
  try {
    const rel = await (await fetch('release.json')).json();
    const kb = (rel.gzip / 1000).toFixed(1);
    $('#release').textContent =
      `This page runs limmat ${rel.version} (build ${rel.sha256.slice(0, 12)}, ${rel.bytes.toLocaleString('en')} bytes, ${rel.gzip.toLocaleString('en')} bytes gzip).`;
    $('[data-size]').textContent = `${kb} kB`;
  } catch {
    $('#release').textContent = 'Build details are unavailable.';
  }
}

$('#theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  root.dataset.theme = next;
});

$('#copy-install').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText('npm install limmat');
    e.target.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#install'));
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    e.target.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => {
    e.target.textContent = 'Copy';
  }, 2000);
});

// ---------------------------------------------------------------- start

async function start() {
  readHash();
  syncControls();
  s.customText = STREAMS.custom.text;
  buildSupport();
  showRelease();
  proof(buildGallery());
  try {
    const mod = await import('./hl/highlight.js');
    s.hl = mod.speedHighlight();
  } catch {
    /* plain code blocks are fine */
  }
  reset(false);
  if (reduceMotion) {
    // No autoplay with reduced motion: show the finished state and let the visitor press Play.
    writeRest();
    el.play.textContent = 'Replay';
  } else if (s.stream !== 'custom' || STREAMS.custom.text) play();
  window.__demoReady = true;
}
start();
