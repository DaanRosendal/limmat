// Property test for streaming: random documents built from letters-only text, written to the renderer a few characters
// at a time. Letters-only means that any markdown character visible outside a code block is a marker that leaked.
// Raise the size with FUZZ_N=500 and change the seed with FUZZ_SEED. A failing document is shrunk before it is reported.
import { describe, expect, it } from 'vitest';
import { createRenderer, type Options } from '../src/index';
import { renderOpen, rng } from './helpers/util';

const N = Number(process.env.FUZZ_N ?? 60);
const SEED = Number(process.env.FUZZ_SEED ?? 4242);
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'x'];
// A lone `!` or `|` can be real text ("great!", "a | b"), so only `![` and a table delimiter row count as leaks.
const MARKERS = /[*_~[\]()<>#\\`=]|!\[|--|:-|-:/;

// Both properties run twice: with the default options, and with math on, where the stub hook writes `«tex»` without backslashes or braces (no marker character).
let OPTS: Options = {};
let LEAK: RegExp = MARKERS;

type R = () => number;
const pick = <T>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const words = (r: R, max: number) => Array.from({ length: 1 + Math.floor(r() * max) }, () => pick(r, WORDS)).join(' ');

// Inline text, nested a level or two. Different delimiters may touch (`**~~x~~**`), but two runs of the same character
// never do ("~~~~" or "***" is literal text in the final output, which the marker check cannot tell from a leak).
// A link's label holds no other link.
function spans(r: R, depth: number, inLink = false): string {
  const out: string[] = [];
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
    const deep = depth >= 2;
    const k = Math.floor(r() * (deep ? 4 : inLink ? 7 : 12));
    const wrap = (mark: string) => {
      const inner = deep ? words(r, 2) : spans(r, depth + 1, inLink);
      return `${mark}${inner[0] === mark[0] ? `${pick(r, WORDS)} ` : ''}${inner}${inner.endsWith(mark[0]) ? ` ${pick(r, WORDS)}` : ''}${mark}`;
    };
    out.push(
      [
        () => words(r, 3),
        () => words(r, 2),
        () => pick(r, WORDS),
        () => `\`${pick(r, WORDS)}\``,
        () => wrap('**'),
        () => wrap('*'),
        () => wrap('_'),
        () => wrap('~~'),
        () => `[${spans(r, depth + 1, true)}](https://example.com/p)`,
        () => `![${pick(r, WORDS)}](https://example.com/a.png)`,
        () => pick(r, ['<https://example.com/a>', 'https://example.com/a', 'www.example.com']),
        () => `${pick(r, WORDS)} ${pick(r, ['&amp;', '&#38;', '&#x26;', '&nbsp;'])} ${pick(r, WORDS)}`,
      ][k](),
    );
  }
  return out.join(' ');
}

function table(r: R): string {
  const cols = 2 + Math.floor(r() * 2);
  const outer = r() < 0.5;
  const row = (cells: string[]) => (outer ? `| ${cells.join(' | ')} |` : cells.join(' | '));
  const cell = () => (r() < 0.3 ? `**${pick(r, WORDS)}**` : pick(r, WORDS));
  const delim = Array.from({ length: cols }, () => pick(r, ['---', ':--', '--:', ':-:']));
  const rows = Array.from({ length: 1 + Math.floor(r() * 3) }, () => row(Array.from({ length: cols }, cell)));
  return [row(Array.from({ length: cols }, cell)), outer ? `|${delim.join('|')}|` : delim.join('|'), ...rows].join('\n');
}

function block(r: R): string {
  const items = (mark: (i: number) => string) =>
    Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => mark(i) + spans(r, 1) + (r() < 0.25 ? `\n  - ${spans(r, 2)}` : '')).join(
      '\n',
    );
  return [
    () => spans(r, 0) + (r() < 0.5 ? '.' : ''),
    () => `${'#'.repeat(1 + Math.floor(r() * 3))} ${spans(r, 1)}`,
    () => items(() => '- '),
    () => items((i) => `${i + 1}. `),
    () => items(() => pick(r, ['- [ ] ', '- [x] '])),
    () => `> ${spans(r, 1)}${r() < 0.4 ? `\n> ${spans(r, 1)}` : ''}`,
    () => `\`\`\`ts\nconst ${pick(r, WORDS)} = ${pick(r, WORDS)};${r() < 0.5 ? `\nreturn ${pick(r, WORDS)};` : ''}\n\`\`\``,
    () => table(r),
    () => `<details>\n<summary>${words(r, 3)}</summary>\n\n${spans(r, 1)}\n\n</details>`,
    () => `> [!${pick(r, ['NOTE', 'tip', 'IMPORTANT', 'Warning', 'CAUTION'])}]\n> ${spans(r, 1)}${r() < 0.4 ? `\n> - ${spans(r, 1)}` : ''}`,
    () => {
      const under = pick(r, ['===', '=', '---', '-', '--', '=====']);
      const text = spans(r, 1) + (r() < 0.4 ? `\n${spans(r, 1)}` : '');
      return r() < 0.3 ? `> ${text.replace(/\n/g, '\n> ')}\n> ${under}` : `${text}\n${under}`;
    },
    () =>
      `${spans(r, 1)}\n\n    ${words(r, 3)}${r() < 0.5 ? `\n\n      ${words(r, 2)}` : ''}${r() < 0.3 ? `\n${pick(r, ['\t', '    '])}${words(r, 2)}` : ''}`,
  ][Math.floor(r() * 12)]();
}

// Math in the same places as everything else: in a sentence, a heading, a list item, a quote, a table cell, and as blocks. Letters only.
function mathBlock(r: R): string {
  const tex = () => pick(r, WORDS) + (r() < 0.5 ? ` ${pick(r, WORDS)}` : '');
  const m = () =>
    pick(r, [
      () => `\\(${tex()}\\)`,
      () => `$${pick(r, WORDS)}$`,
      () => `$$${tex()}$$`,
      () => `\\[${tex()}\\]`,
      () => `$${pick(r, WORDS)} ${pick(r, WORDS)}$`,
    ])();
  return [
    () => `${words(r, 2)} ${m()} ${words(r, 2)}`,
    () => `${words(r, 2)} ${m()} and ${m()}.`,
    () => `$$\n${tex()}\n${tex()}\n$$`,
    () => `\\[\n${tex()}\n\\]`,
    () => `${words(r, 2)}\n$$\n${tex()}\n${tex()} $$\n${words(r, 2)}`,
    () => `- ${words(r, 1)} ${m()}\n  $$\n  ${tex()}\n  $$\n- ${m()}`,
    () => `> ${words(r, 1)} ${m()}\n> \\[\n> ${tex()}\n> \\]`,
    () => `| a | b |\n|---|---|\n| ${m()} | ${words(r, 1)} |`,
    () => `${'#'.repeat(1 + Math.floor(r() * 3))} ${words(r, 1)} ${m()}`,
    () => `**${words(r, 1)} ${m()}** and *${m()}*`,
    () => `\\begin{cases}\n${tex()}\n${tex()}\n\\end{cases}`,
    () => `<details>\n<summary>${words(r, 2)}</summary>\n\n${m()}\n\n$$\n${tex()}\n$$\n\n</details>`,
  ][Math.floor(r() * 12)]();
}
const genBlocks = (r: R) => Array.from({ length: 2 + Math.floor(r() * 4) }, () => block(r));
const genMathBlocks = (r: R) => Array.from({ length: 2 + Math.floor(r() * 4) }, () => (r() < 0.6 ? mathBlock(r) : block(r)));
const join = (blocks: string[]) => blocks.join('\n\n');

const visibleText = (root: Element) => {
  const copy = root.cloneNode(true) as Element;
  for (const pre of Array.from(copy.querySelectorAll('pre'))) pre.remove();
  return copy.textContent ?? '';
};

// `at` is how many characters of the document had been written when the property first failed.
type Fail = { at: number; why: string };
type Prop = (md: string, r: R) => Fail | null;

// After every character, no marker is visible outside code blocks.
const noRawMarkers: Prop = (md) => {
  const root = document.createElement('div');
  const w = createRenderer(root, { throttleMs: 0, ...OPTS });
  for (let i = 0; i < md.length; i++) {
    w.write(md[i]);
    const text = visibleText(root);
    const m = LEAK.exec(text);
    if (m) return { at: i + 1, why: `the text shows ${JSON.stringify(m[0])}: ${JSON.stringify(text)}` };
  }
  return null;
};

// After every chunk, the DOM equals what the same text gives when it is written in one piece.
const prefixEqualsWhole: Prop = (md, r) => {
  const root = document.createElement('div');
  const w = createRenderer(root, { throttleMs: 0, ...OPTS });
  for (let i = 0; i < md.length; ) {
    const n = 1 + Math.floor(r() * 6);
    w.write(md.slice(i, i + n));
    i += n;
    const want = renderOpen(md.slice(0, i), OPTS).innerHTML;
    if (root.innerHTML !== want) return { at: i, why: `\nchunked: ${root.innerHTML}\nwhole:   ${want}` };
  }
  return null;
};

// Cut the document where it first fails, then drop whole blocks while it still fails, so what is reported stays valid markdown.
function shrinkBlocks(blocks: string[], prop: Prop, seed: number): { md: string; fail: Fail } {
  let cur = blocks;
  for (;;) {
    const smaller = cur.map((_, i) => cur.filter((_, j) => j !== i)).find((b) => b.length > 0 && prop(join(b), rng(seed)) !== null);
    if (!smaller) break;
    cur = smaller;
  }
  const md = join(cur);
  const fail = prop(md, rng(seed))!;
  return { md: md.slice(0, fail.at), fail };
}

describe('streaming property test', () => {
  const variants = [
    { name: 'default options', opts: {} as Options, leak: MARKERS, gen: genBlocks },
    {
      name: 'math on',
      opts: {
        renderMath: (el: HTMLElement, tex: string) => {
          el.textContent = `«${tex.replace(/[\\{}]/g, '')}»`; // an environment's tex holds its own \begin{...}
        },
      } as Options,
      leak: new RegExp(`${MARKERS.source}|\\$\\$`), // a single `$` may be a price, but `$$` is never shown
      gen: genMathBlocks,
    },
  ];
  for (const v of variants)
    it(`keeps the properties on random documents (${v.name})`, () => {
      OPTS = v.opts;
      LEAK = v.leak;
      const r = rng(SEED);
      const docs = Array.from({ length: N }, () => v.gen(r));
      const failures: string[] = [];
      for (const [name, prop] of [
        ['markers stay hidden', noRawMarkers],
        ['prefix equals whole', prefixEqualsWhole],
      ] as const) {
        const seen = new Set<string>();
        for (const blocks of docs) {
          if (prop(join(blocks), rng(SEED)) === null) continue;
          const { md, fail } = shrinkBlocks(blocks, prop, SEED);
          if (seen.has(md)) continue;
          seen.add(md);
          failures.push(`## ${name} (seed ${SEED})\n${JSON.stringify(md)}\n${fail.why}`);
          if (seen.size >= 3) break;
        }
      }
      OPTS = {};
      LEAK = MARKERS;
      expect(failures.join('\n\n')).toBe('');
    });
});
