import { createRenderer, type Options } from '../../src/index';

export type Split = 'whole' | 'char' | number | 'random';

export function rng(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

export function chunks(s: string, split: Split, seed = 1, max = 12): string[] {
  if (split === 'whole') return [s];
  const out: string[] = [];
  const r = rng(seed);
  for (let i = 0; i < s.length; ) {
    const n = split === 'char' ? 1 : split === 'random' ? 1 + Math.floor(r() * max) : split;
    out.push(s.slice(i, i + n));
    i += n;
  }
  return out;
}

export function render(md: string, split: Split = 'whole', options: Options = {}, seed = 1) {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0, ...options });
  for (const c of chunks(md, split, seed)) r.write(c);
  r.end();
  return root;
}

/** Renderer mounted in the document (so focus, clipboard, and layout work) with throttling off. */
export const mk = (o: Options = {}) => {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, r: createRenderer(root, { throttleMs: 0, ...o }) };
};

/** Midstream state: write everything but do not call end(). */
export function renderOpen(md: string, options: Options = {}, split: Split = 'whole', seed = 1) {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0, ...options });
  for (const c of chunks(md, split, seed)) r.write(c);
  return root;
}

/** Render `md` written as exactly two chunks, cut at index `at`. */
export function renderTwoPart(md: string, at: number, options: Options = {}) {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0, ...options });
  r.write(md.slice(0, at));
  r.write(md.slice(at));
  r.end();
  return root;
}

/** innerHTML without class attributes, to keep expectations short. */
export const html = (el: Element) => el.innerHTML.replace(/ class="[^"]*"/g, '');

export { audit } from './audit';

/** The smallest variant of a failing document that still fails: drops lines and edge characters while `fails` stays true. */
export function shrink(md: string, fails: (m: string) => boolean): string {
  let cur = md;
  for (let pass = 0; pass < 6; pass++) {
    const ls = cur.split('\n');
    const candidates = ls.map((_, i) => [...ls.slice(0, i), ...ls.slice(i + 1)].join('\n'));
    candidates.push(cur.replace(/\n$/, ''), cur.slice(0, -1), cur.slice(1));
    const next = candidates.find((t) => t && t !== cur && fails(t));
    if (next === undefined) break;
    cur = next;
  }
  return cur;
}
