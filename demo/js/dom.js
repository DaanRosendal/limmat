// Small DOM helpers shared by every module. No innerHTML and no inline styles (the page runs under a strict CSP).
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const utf8 = new TextEncoder();
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function make(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export const clamp = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Keep a scrolling pane pinned to its end while content grows, unless the visitor scrolled up. */
export function follow(pane) {
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

let toastTimer = 0;
/** A short message in the toast, also announced to screen readers. Pass '' to hide it. */
export function notice(msg) {
  const t = $('#notice');
  t.textContent = msg;
  t.classList.toggle('show', !!msg);
  clearTimeout(toastTimer);
  if (msg) toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
export const say = (msg) => {
  $('#live').textContent = msg;
};
