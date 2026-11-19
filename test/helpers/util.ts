import { createRenderer, type Options } from '../../src/index';

export type Split = 'whole' | 'char' | number | 'random';

export function rng(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function chunks(s: string, split: Split, seed = 1): string[] {
  if (split === 'whole') return [s];
  const out: string[] = [];
  const r = rng(seed);
  for (let i = 0; i < s.length; ) {
    const n = split === 'char' ? 1 : split === 'random' ? 1 + Math.floor(r() * 12) : split;
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
export function renderOpen(md: string, options: Options = {}) {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0, ...options });
  r.write(md);
  return root;
}

/** innerHTML without class attributes, to keep expectations short. */
export const html = (el: Element) => el.innerHTML.replace(/ class="[^"]*"/g, '');

const TAGS = new Set(
  'P H1 H2 H3 H4 H5 H6 HR BLOCKQUOTE UL OL LI DIV SPAN BUTTON PRE CODE TABLE THEAD TBODY TR TH TD A EM STRONG DEL BR INPUT IMG B I U S INS MARK SMALL KBD SUB SUP'.split(
    ' ',
  ),
);
const ATTRS = new Set([
  'class',
  'href',
  'target',
  'rel',
  'tabindex',
  'role',
  'aria-label',
  'aria-hidden',
  'type',
  'disabled',
  'checked',
  'start',
  'style',
  'alt',
  'src',
  'loading',
  'decoding',
  'referrerpolicy',
]);
const SAFE_HREF = /^(https?:\/\/[^/?#\s]|mailto:[^\s]|\/(?![/\\]))/i;
const SAFE_SRC = /^(https?:\/\/[^/?#\s]|\/(?![/\\]))/i;

/** Returns a list of problems found in the DOM. Empty means safe. */
export function audit(root: Element): string[] {
  const bad: string[] = [];
  for (const e of root.querySelectorAll('*')) {
    const tag = e.tagName;
    if (!TAGS.has(tag)) bad.push(`tag ${tag}`);
    if (tag === 'INPUT' && e.getAttribute('type') !== 'checkbox') bad.push('input type');
    if (tag === 'BUTTON' && e.getAttribute('type') !== 'button') bad.push('button type');
    if (tag === 'IMG' && e.getAttribute('referrerpolicy') !== 'no-referrer') bad.push('img referrerpolicy');
    for (const a of Array.from(e.attributes)) {
      if (!ATTRS.has(a.name)) bad.push(`attr ${a.name}`);
      if (a.name.startsWith('on')) bad.push(`handler ${a.name}`);
      if (a.name === 'href' && (tag !== 'A' || !SAFE_HREF.test(a.value))) bad.push(`href ${a.value}`);
      if (a.name === 'src' && (tag !== 'IMG' || !SAFE_SRC.test(a.value))) bad.push(`src ${a.value}`);
      if (a.name === 'style' && !(['TH', 'TD'].includes(tag) && /^text-align: ?(left|center|right);?$/.test(a.value)))
        bad.push(`style ${a.value}`);
      if (a.name === 'class' && /[\s"'<>]/.test(a.value.replace(/ /g, ''))) bad.push('class chars');
    }
    if (
      tag === 'A' &&
      /^https?:/i.test(e.getAttribute('href') ?? '') &&
      (e.getAttribute('target') !== '_blank' || e.getAttribute('rel') !== 'noopener noreferrer')
    )
      bad.push('external link rel');
  }
  return bad;
}
