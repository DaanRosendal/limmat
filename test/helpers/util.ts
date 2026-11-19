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
