// Share links: the whole run lives in the URL fragment, so nothing leaves the browser.
import { clamp, notice, utf8 } from './dom.js';
import { el } from './els.js';
import { DEFAULT_STREAM, SHARE_MAX, s } from './state.js';
import { STREAMS } from './streams.js';

const b64url = {
  enc: (str) => {
    let bin = '';
    for (const b of utf8.encode(str)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (str) => {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

export function writeHash() {
  const p = new URLSearchParams({
    v: '1',
    stream: s.stream,
    c: String(s.size),
    r: s.random ? '1' : '0',
    s: String(s.seed),
    t: String(s.throttle),
    d: String(s.speed),
  });
  if (s.stream === 'custom' && s.customText) p.set('m', b64url.enc(s.customText.slice(0, SHARE_MAX)));
  history.replaceState(null, '', `#${p.toString()}`);
}

/** Apply a share link to the state. Anything unreadable falls back to the default stream. */
export function readHash() {
  if (location.hash.length <= 1) return;
  try {
    if (location.hash.length > 12000) throw new Error('too long');
    const p = new URLSearchParams(location.hash.slice(1));
    const name = p.get('stream');
    if (name !== null) {
      if (!Object.hasOwn(STREAMS, name)) throw new Error('unknown stream');
      s.stream = name;
    }
    if (p.has('c')) s.size = clamp(p.get('c'), 1, 50, 12);
    if (p.has('r')) s.random = p.get('r') !== '0';
    if (p.has('s')) s.seed = clamp(p.get('s'), 0, 4294967295, 1);
    if (p.has('t')) s.throttle = clamp(p.get('t'), 0, 500, 50);
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
    notice('That link could not be read, so the default stream is playing.');
    s.stream = DEFAULT_STREAM;
  }
}

let doneTimer = 0;
export async function copyLink() {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    notice('Link copied: it opens this exact run');
    const btn = document.querySelector('#share');
    btn.dataset.done = '';
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => btn.removeAttribute('data-done'), 1800);
  } catch {
    notice('Copying is blocked here. The address bar holds the link.');
  }
}
