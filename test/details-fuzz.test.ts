// Property fuzz for details blocks. Random documents are built from details lines, summaries, and the other block
// kinds, then checked against the library's rules. Raise the size with FUZZ_N=1500 and change the seed with FUZZ_SEED.
import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/index';
import { audit, rng } from './helpers/util';

const POOL_DET = [
  '<details>',
  '<details open>',
  '</details>',
  '<summary>S</summary>',
  '<summary>S *e*</summary>',
  '<details>',
  '</details>',
  '<details><summary>S</summary>',
  '<details open><summary>S</summary>',
  '<details><summary>S',
  '  <details>',
  '  </details>',
  '   </details>',
  '    </details>',
  ' <details open>',
  '<DETAILS>',
  '</Details>  ',
  '<details> x',
  '<details open >',
  '<summary>x</summary> y',
  '<summary></summary>',
  '- <details>',
  '  </details>',
  '> <details>',
  '> </details>',
  '> x',
  '\t<details>',
  '<details>\t',
  '</details> ',
  '<summary>S</summary>  ',
  '  <summary>S</summary>',
  '<Summary>S</SUMMARY>',
];
const POOL_OTHER = [
  '```',
  '~~~',
  '- x',
  '1. x',
  '| a |',
  '|---|',
  '| a | b |',
  '',
  '',
  'text',
  'text *em',
  '-',
  '# h',
  '---',
  '<b>x</b>',
  '- y',
  '  - z',
  '> q',
];
const SIMPLE = ['<details>', '<details open>', '</details>', '<summary>S</summary>', 'text', '', '# h', '<details>', '</details>'];

function genDoc(r: () => number, pool: string[], maxLines = 12): string {
  const n = 1 + Math.floor(r() * maxLines);
  const ls: string[] = [];
  for (let i = 0; i < n; i++) ls.push(pool[Math.floor(r() * pool.length)]);
  return ls.join('\n') + (r() < 0.5 ? '\n' : '');
}

type Split = 'whole' | 'char' | 'rand' | number;
function chunksOf(s: string, sp: Split, seed: number): string[] {
  if (sp === 'whole') return [s];
  const out: string[] = [];
  const r = rng(seed);
  for (let i = 0; i < s.length; ) {
    const n = sp === 'char' ? 1 : sp === 'rand' ? 1 + Math.floor(r() * 9) : sp;
    out.push(s.slice(i, i + n));
    i += n;
  }
  return out;
}

function run(md: string, sp: Split, seed: number, end: boolean) {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0 });
  for (const c of chunksOf(md, sp, seed)) r.write(c);
  if (end) r.end();
  return root;
}
const dom = (md: string, sp: Split, seed: number, end: boolean) => run(md, sp, seed, end).innerHTML;
const rawCount = (s: string) => (s.match(/<\/?(details|summary)/gi) ?? []).length;

/** Problems with the shape of details and summary elements, on top of the normal audit. */
function structure(root: Element): string[] {
  const bad: string[] = [];
  for (const e of Array.from(root.querySelectorAll('details, summary'))) {
    if (e.tagName === 'DETAILS') {
      for (const a of Array.from(e.attributes)) if (a.name !== 'class' && a.name !== 'open') bad.push(`details attribute ${a.name}`);
      if (e.className !== 'limmat-details') bad.push('details class');
      if (
        Array.from(e.children)
          .slice(1)
          .some((k) => k.tagName === 'SUMMARY')
      )
        bad.push('summary not first');
    } else {
      for (const a of Array.from(e.attributes)) if (a.name !== 'class') bad.push(`summary attribute ${a.name}`);
      if (e.className !== 'limmat-summary') bad.push('summary class');
    }
  }
  return [...bad, ...audit(root)];
}

type Prop = (md: string) => string | null;

const finalChunked: Prop = (md) => {
  const whole = dom(md, 'whole', 1, true);
  for (const sp of ['char', 2, 3, 5, 'rand', 'rand', 'rand'] as const) {
    const got = dom(md, sp, 7, true);
    if (got !== whole) return `final differs for split ${sp}\nwhole: ${whole}\nchunk: ${got}`;
  }
  return null;
};
const twoPart: Prop = (md) => {
  const whole = dom(md, 'whole', 1, true);
  for (let i = 1; i < md.length; i++) {
    const root = document.createElement('div');
    const r = createRenderer(root, { throttleMs: 0 });
    r.write(md.slice(0, i));
    r.write(md.slice(i));
    r.end();
    if (root.innerHTML !== whole) return `two-part split at ${i}\nwhole: ${whole}\ngot:   ${root.innerHTML}`;
  }
  return null;
};
const specChunked: Prop = (md) => {
  const whole = dom(md, 'whole', 1, false);
  for (const sp of ['char', 3, 'rand', 'rand'] as const) {
    const got = dom(md, sp, 11, false);
    if (got !== whole) return `midstream differs for split ${sp}\nwhole: ${whole}\nchunk: ${got}`;
  }
  return null;
};
/** Every opener, closer, and summary tag in the input is either an element or visible text: nothing is lost or invented. */
const conservation: Prop = (md) => {
  const root = run(md, 'whole', 1, true);
  const t = root.textContent ?? '';
  const cnt = (re: RegExp, s: string) => (s.match(re) ?? []).length;
  const nd = root.querySelectorAll('details').length;
  const ns = root.querySelectorAll('summary').length;
  for (const [name, re, n] of [
    ['openers', /<details( open)?>/gi, nd],
    ['closers', /<\/details>/gi, nd],
    ['summary open', /<summary>/gi, ns],
    ['summary close', /<\/summary>/gi, ns],
  ] as const) {
    // a closer can be missing from the output when its opener was never closed, so only count what the input and the output share
    if (name === 'closers') {
      if (cnt(re, md) < cnt(re, t)) return `closers: output shows more literal closers than the input has`;
      continue;
    }
    if (cnt(re, md) !== n + cnt(re, t)) return `${name}: input ${cnt(re, md)} != elements ${n} + literal ${cnt(re, t)}`;
  }
  return null;
};
const structureOk: Prop = (md) => {
  for (const end of [true, false]) {
    const bad = structure(run(md, 'whole', 1, end));
    if (bad.length) return `structure (end=${end}): ${bad.join('; ')}`;
  }
  return null;
};
/** At every prefix the midstream DOM shows no raw tag beyond what the finished document also shows. */
const noRawWhileStreaming: Prop = (md) => {
  const finalRaw = rawCount(run(md, 'whole', 1, true).textContent ?? '');
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0 });
  for (let i = 0; i < md.length; i++) {
    r.write(md[i]);
    const c = rawCount(root.textContent ?? '');
    if (c > finalRaw)
      return `prefix ${JSON.stringify(md.slice(0, i + 1))} shows ${c} raw tags (final shows ${finalRaw}): ${root.innerHTML}`;
  }
  return null;
};
/** A partial last line that is only the start of a tag line changes nothing yet. */
const holdIsInvisible: Prop = (md) => {
  const last = md.split('\n').pop() ?? '';
  const head = md.slice(0, md.length - last.length);
  if (!last || !/^ {0,3}<\/?[a-z ]*>?$/i.test(last)) return null;
  if (/^ {0,3}(```|~~~)/m.test(head)) return null; // an open fence shows code
  if ((head.trimEnd().split('\n').pop() ?? '').includes('|')) return null; // a pending table header looks at the next line
  const t = last.trim().toLowerCase();
  if (!['<details>', '<details open>', '</details>'].some((x) => x.startsWith(t))) return null;
  const a = dom(head, 'whole', 1, false);
  const b = dom(md, 'whole', 1, false);
  return a === b ? null : `partial ${JSON.stringify(last)} changed output\nhead: ${a}\nfull: ${b}`;
};
/** Nodes of finished top-level blocks are never replaced. */
const frozenStable: Prop = (md) => {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0 });
  let keep: Element[] = [];
  let src = '';
  for (const ch of md) {
    r.write(ch);
    src += ch;
    const kids = Array.from(root.children);
    for (let k = 0; k < keep.length; k++) if (kids[k] !== keep[k]) return `child ${k} replaced after ${JSON.stringify(src)}`;
    if (src.endsWith('\n') && kids.length > 1) keep = kids.slice(0, kids.length - 1);
  }
  return null;
};
/** Inside an unclosed details, finished blocks and the details node itself are never replaced. */
const frozenInner: Prop = (md) => {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0 });
  let prev: { el: Element; kids: Element[] } | null = null;
  let src = '';
  for (const ch of md) {
    r.write(ch);
    src += ch;
    const last = root.lastElementChild;
    if (prev && last === prev.el) {
      const kids = Array.from(last.children);
      for (let k = 0; k < prev.kids.length; k++)
        if (kids[k] !== prev.kids[k]) return `inner child ${k} replaced after ${JSON.stringify(src)}`;
    }
    prev = null;
    if (src.endsWith('\n') && last?.tagName === 'DETAILS')
      prev = { el: last, kids: Array.from(last.children).slice(0, Math.max(0, last.children.length - 2)) };
  }
  return null;
};
/** The reader opens the block while it is still open-ended, then the stream continues. */
const toggleKept: Prop = (md) => {
  const root = document.createElement('div');
  const r = createRenderer(root, { throttleMs: 0 });
  r.write('<details>\nfirst\n\n');
  (root.querySelector('details') as HTMLDetailsElement).open = true;
  for (const c of md) r.write(c);
  const now = root.querySelector('details') as HTMLDetailsElement | null;
  return now?.open ? null : 'reader toggle lost';
};
const crlf: Prop = (md) => {
  const want = dom(md, 'whole', 1, true);
  for (const sp of ['char', 'rand', 4] as const) {
    const got = dom(md.replace(/\n/g, '\r\n'), sp, 3, true);
    if (got !== want) return `CRLF ${sp}\nwant ${want}\ngot  ${got}`;
  }
  return null;
};

// An independent model for documents made only of details lines, summaries, text, blank lines, and headings.
// A closer pairs with the nearest earlier opener. An opener that stays open holds the rest of the document, and
// is only text if nothing but blank lines follows it.
function oracle(ls: string[]): string {
  const match = new Map<number, number>();
  const stack: number[] = [];
  ls.forEach((l, i) => {
    if (/^<details( open)?>$/.test(l)) stack.push(i);
    else if (l === '</details>' && stack.length) match.set(stack.pop()!, i);
  });
  const rec = (a: number, b: number): string => {
    let out = '';
    for (let i = a; i < b; i++) {
      const closer = match.get(i);
      if (closer === undefined && !/^<details( open)?>$/.test(ls[i])) continue;
      const end = closer ?? b;
      if (closer === undefined && !ls.slice(i + 1, b).some((x) => x.trim())) continue; // nothing follows: it stays text
      const sum = ls[i + 1] === '<summary>S</summary>' && i + 1 < end;
      const open = ls[i] === '<details open>' || closer === undefined;
      out += `D${open ? 'o' : ''}(${sum ? 'S' : ''}${rec(i + (sum ? 2 : 1), end)})`;
      i = closer === undefined ? b : closer;
    }
    return out;
  };
  return rec(0, ls.length);
}
function skeleton(el: Element): string {
  let out = '';
  for (const c of Array.from(el.children)) {
    if (c.tagName === 'DETAILS') {
      const k = Array.from(c.children);
      const sum = k[0]?.tagName === 'SUMMARY';
      const inner = document.createElement('div');
      for (const x of k.slice(sum ? 1 : 0)) inner.append(x.cloneNode(true));
      out += `D${c.hasAttribute('open') ? 'o' : ''}(${sum ? 'S' : ''}${skeleton(inner)})`;
    } else out += skeleton(c);
  }
  return out;
}
const oracleProp: Prop = (md) => {
  const want = oracle(md.split('\n').filter((_, i, a) => !(i === a.length - 1 && a[i] === '')));
  const got = skeleton(run(md, 'whole', 1, true));
  return want === got ? null : `oracle ${want} != dom ${got}`;
};

function shrink(md: string, fails: (m: string) => boolean): string {
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

const N = Number(process.env.FUZZ_N ?? 80);
const rand = rng(Number(process.env.FUZZ_SEED ?? 12345));
const failures: Record<string, string[]> = {};
function check(name: string, f: Prop, docs: string[]) {
  const seen = new Set<string>();
  for (const md of docs) {
    if (f(md) === null) continue;
    const small = shrink(md, (m) => f(m) !== null);
    if (seen.has(small)) continue;
    seen.add(small);
    (failures[name] ??= []).push(`${JSON.stringify(small)}\n${f(small)}`);
    if (seen.size >= 3) break;
  }
}

describe('details fuzz', () => {
  it('keeps the properties on random documents', () => {
    const mixed = Array.from({ length: N }, () => genDoc(rand, [...POOL_DET, ...POOL_OTHER]));
    const heavyPool = [...POOL_DET.slice(0, 7), 'text', '', '- x', '> x', '```', 'x'];
    const heavyDet = Array.from({ length: N }, () => genDoc(rand, heavyPool, 14));
    const base = Array.from({ length: N }, () => genDoc(rand, POOL_OTHER));
    const simple = Array.from({ length: N * 2 }, () => genDoc(rand, SIMPLE, 16));
    const all = [...mixed, ...heavyDet];
    const open = Array.from(
      { length: N },
      () => `<details>\n${genDoc(rand, ['text', '', '', '- x', '> q', '```', 'x', '## h', '| a |', '|---|', '<details>'], 30)}`,
    );

    check('oracle (simple documents)', oracleProp, simple);
    check('final chunked (simple)', finalChunked, simple);
    check('midstream chunked (simple)', specChunked, simple);
    check('no raw tags while streaming (simple)', noRawWhileStreaming, simple);
    check('frozen top level (simple)', frozenStable, simple);
    check('final chunked', finalChunked, all);
    check('two-part splits', twoPart, all.slice(0, Math.min(all.length, 120)));
    check('midstream chunked', specChunked, all);
    check('midstream chunked (no details syntax)', specChunked, base);
    check('CRLF', crlf, all.slice(0, 120));
    check('conservation', conservation, all);
    check('structure', structureOk, all);
    check('no raw tags while streaming', noRawWhileStreaming, all);
    check('held tag lines are invisible', holdIsInvisible, [
      ...all,
      ...all.map((d) => `${d.replace(/\n$/, '')}\n<det`),
      ...all.map((d) => `${d}\n</details>`),
      ...all.map((d) => `${d}\n<details>`),
    ]);
    check('frozen inside an unclosed block', frozenInner, open);
    check('frozen inside (mixed)', frozenInner, all);
    check('final chunked (long unclosed)', finalChunked, open);
    check('midstream chunked (long unclosed)', specChunked, open);
    check(
      'reader toggle kept',
      toggleKept,
      open.map((d) => d.replace('<details>\n', 'more\n')),
    );
    check('frozen top level', frozenStable, all);
    check('frozen top level (no details syntax)', frozenStable, base);

    const report = Object.entries(failures)
      .map(([k, v]) => `## ${k}\n${v.join('\n--\n')}`)
      .join('\n\n');
    expect(report).toBe('');
  });
});
