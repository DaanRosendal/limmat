// Block scanner: lines to units. Forward-only, so a unit followed by a unit that starts on a complete line is final.
/** Column alignments of a table: 'left', 'center', 'right', or null. */
export type Al = (string | null)[];
/** Line range shared by every unit. Lines are indexes into the array passed to scan(). */
interface Span {
  a: number; // first line
  e: number; // end of content (exclusive)
  b: number; // end including trailing blank lines (exclusive)
}
/** One top-level block. A list item is one unit per item, and a table is a header unit plus one unit per row. */
export type Unit = Span &
  (
    | { k: 'p' | 'hr' | 'q' } // paragraph, thematic break, blockquote (its inner lines are scanned again when built)
    | { k: 'h'; lv: number; se?: true } // heading, level 1 to 6 (`se`: setext, its text is the lines before the underline on the last line)
    | { k: 'f'; lang: string; closed: boolean; ind: number; ic?: true } // fenced code, `ind` is the opening fence indent to strip (`ic`: indented code, with no fence lines, `ind` is 4)
    | { k: 'li'; ord: boolean; num: number; off: number; mk: string; sep?: true; inh?: true } // list item, `off` is the content column, `num` the start number, `mk` the bullet or the number delimiter (`sep`: a blank line separates it from the next item of the same list, `inh`: an earlier item of its list is loose, set by the renderer)
    | { k: 'th'; al: Al; pend?: boolean } // table header, `pend` while the delimiter row is still arriving
    | { k: 'tr'; al: Al } // table body row
    | { k: 'd'; open: boolean; closed: boolean; sum: string | null; bs: number } // details container, inner lines are scanned again when built
    | { k: 'm'; closed: boolean; op: string } // display math from an opener line (`$$`, `\\[`, or a `\\begin{env}` line) to a line that ends with the closer (`$$`, `\\]`, or `\\end{env}`); the opener may be followed by tex
  );

// `[^\n]` instead of `.`: a dot stops at \r, \u2028 and \u2029, which made some of these regexes backtrack badly.
const ATXRE = /^ {0,3}(#{1,6})(?:[ \t]([^\n]*))?$/;
export const LI = /^( *)([-*+]|\d{1,9}[.)])(?:( +)([^\n]*)|$)/;
const FENCE = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/;
const STAR_BOLD = /^ {0,3}\*[ \t]+\*{2,}$/;
const BARE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])$/;
// The underline of a setext heading: one run of = (level 1) or - (level 2), which may not be a lazy line.
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
export const BQ = /^ {0,3}>/;
const PIPE = /^ {0,3}\|/;
const DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*(?:\|[ \t]*)?$/;
const PREFIX = /^[ \t|:-]*$/;
// A delimiter row, or the start of one still arriving. A line that is a list item (`- |---|`) is neither, because a list item interrupts the paragraph before the table check.
const delim = (l: string) => DELIM.test(l) && !LI.exec(l)?.[4];
const prefix = (l: string) => PREFIX.test(l) && !LI.exec(l)?.[4];
// `<details>` or `<details open>`, alone on its line or followed by `<summary>text</summary>`. No other attribute, spacing, or text.
const OPEN = /^ {0,3}<details( open)?>(?:<summary>((?:(?!<\/summary>)[^\n])*)<\/summary>)?[ \t]*$/i;
const CLOSE = /^ {0,3}<\/details>[ \t]*$/i;
const SUMM = /^ {0,3}<summary>((?:(?!<\/summary>)[^\n])*)<\/summary>[ \t]*$/i;
const TAGS = ['<details>', '<details open>', '</details>'];
const PARTIAL_CLOSE = /^ {0,3}(?:`+|~+)$/;
// Environments that only make sense as math, which models often write with no `$$` or `\[` around them.
export const ENVS = [
  'aligned',
  'align',
  'align*',
  'equation',
  'equation*',
  'gather',
  'gather*',
  'split',
  'multline',
  'multline*',
  'eqnarray',
  'eqnarray*',
  'cases',
  'array',
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
];
const ENV_OPENERS = ENVS.map((n) => `\\begin{${n}}`);
// `$$`, `\[`, or `\begin{name}` of one of those environments.
const MATH_OPEN = new RegExp(`^ {0,3}(\\$\\$|\\\\\\[|\\\\begin\\{(?:${ENVS.map((n) => n.replace(/\*/g, '\\*')).join('|')})\\})`);
/** Could the unfinished line `l` still become a `\begin{env}` opener (`\b`, `\begin{cas`)? Then it is held back while streaming. */
function envStart(l: string): boolean {
  const t = l.trimStart();
  return l.length - t.length < 4 && t[0] === '\\' && ENV_OPENERS.some((f) => f.length > t.length && f.startsWith(t));
}
/** Something with a `test` method that says whether a line closes the code or math block that is open. */
interface Closer {
  test(l: string): boolean;
}

export const spaces = (l: string) => l.length - l.trimStart().length;

/** ATX heading: [level, text without the optional closing #s], or null. Linear, no regex backtracking. */
export function atx(l: string): [number, string] | null {
  const m = ATXRE.exec(l);
  if (!m) return null;
  let t = (m[2] ?? '').trim();
  let k = t.length;
  while (k > 0 && t[k - 1] === '#') k--;
  if (k < t.length && (k === 0 || t[k - 1] === ' ' || t[k - 1] === '\t')) t = t.slice(0, k).trimEnd();
  return [m[1].length, t];
}
export function cells(l: string): string[] {
  l = l.trim();
  if (l[0] === '|') l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  // Split on unescaped pipes by hand: a regex lookbehind would stop the module loading on Safari before 16.4.
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < l.length; i++) {
    if (l[i] === '\\' && l[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (l[i] === '|') {
      out.push(cur.trim());
      cur = '';
    } else cur += l[i];
  }
  out.push(cur.trim());
  return out;
}
const aligns = (l: string): Al =>
  cells(l).map((c) => (c[0] === ':' ? (c.endsWith(':') ? 'center' : 'left') : c.endsWith(':') ? 'right' : null));

const fence = (l: string) => {
  const m = FENCE.exec(l);
  return m && !(m[2][0] === '`' && m[3].includes('`')) ? m : null;
};
const closer = (m: RegExpExecArray, indent: string) => new RegExp(`^${indent}${m[2][0]}{${m[2].length},}[ \\t]*$`);
/** The match of a details opener line, or null. A one-line summary that is blank does not make an opener. */
function opener(l: string): RegExpExecArray | null {
  const m = OPEN.exec(l);
  return m && (m[2] === undefined || m[2].trim()) ? m : null;
}
/** Could the unfinished line `l` still become a details opener, closer, or (if `sum`) summary line? Then it is held back while streaming. */
function tagPrefix(l: string, sum: boolean): boolean {
  let k = 0;
  while (k < 4 && l[k] === ' ') k++;
  if (k > 3) return false;
  const r = l.slice(k).toLowerCase();
  let e = r.length;
  while (e > 0 && (r[e - 1] === ' ' || r[e - 1] === '\t')) e--; // a regex here backtracks quadratically on a long run of spaces
  const t = r.slice(0, e);
  if (TAGS.some((x) => x.startsWith(r) || (t.length < r.length && x === t))) return true;
  const o = /^<details( open)?>/.exec(r);
  if (o) {
    const rest = r.slice(o[0].length); // the one-line form: `<details><summary>T</summary>`
    return !!rest && ('<summary>'.startsWith(rest) || (rest.startsWith('<summary>') && !rest.includes('</summary>')));
  }
  if (sum && (r.length < 9 ? '<summary>'.startsWith(r) : r.startsWith('<summary>'))) {
    const rest = r.slice(9);
    const e = rest.indexOf('</summary>');
    return e < 0 || !rest.slice(e + 10).trim();
  }
  return false;
}
/**
 * Does the line L[j] (with a pipe in it), inside a paragraph, start a table? 1: yes, its next line is a delimiter row with as many cells.
 * 2: not known yet, because the next line has not arrived or is still arriving and looks like part of a delimiter row. 0: no.
 */
function pipeHead(L: string[], j: number, partial: boolean, final: boolean): 0 | 1 | 2 {
  const n = L.length;
  const nx = L[j + 1];
  if (DELIM.test(L[j])) return 0; // a delimiter row is never a header
  const lead = PIPE.test(L[j]);
  const hc = cells(L[j]).length;
  if (!lead && hc < 2) return 0; // one cell over dashes is a setext heading in CommonMark, not a table
  if (nx === undefined) return final || !lead ? 0 : 2; // a last line with no outer pipes is shown, only a pipe-led one waits
  const growing = !final && partial && j + 1 === n - 1; // nx is the unfinished last line
  if (delim(nx)) {
    const dn = cells(nx).length;
    if (growing) return dn > hc ? 0 : 2; // more characters can still change a line that is arriving, even one that looks complete
    return dn === hc ? 1 : 0;
  }
  return growing && prefix(nx) ? 2 : 0;
}
function interrupts(l: string, det = false, mt = false): boolean {
  if (det && (opener(l) || CLOSE.test(l))) return true;
  if (mt && mathOpen(l)) return true;
  if (fence(l) || atx(l) || HR.test(l) || BQ.test(l)) return true;
  const m = LI.exec(l);
  return !!m && !!m[4] && m[1].length < 4 && m[2].length < 4 && (!/\d/.test(m[2]) || parseInt(m[2], 10) === 1);
}

/** Does the line end with the math closer (`$$` or `\]`), not escaped by a backslash? Trailing spaces are ignored. */
function closes(l: string, close: string): boolean {
  let e = l.length;
  while (e > 0 && (l[e - 1] === ' ' || l[e - 1] === '\t')) e--;
  if (close[1] === 'e') return l.slice(0, e).endsWith(close); // `\end{env}`
  const dollar = close === '$$';
  if (dollar ? l[e - 1] !== '$' || l[e - 2] !== '$' : l[e - 1] !== ']' || l[e - 2] !== '\\') return false;
  let b = dollar ? 0 : 1; // the backslash of `\]` is part of the closer, so it counts toward the run that ends before the bracket
  for (let k = e - 3; k >= 0 && l[k] === '\\'; k--) b++;
  return dollar ? b % 2 === 0 : b % 2 === 1;
}
/**
 * The opener of the math block that line `l` starts, or null: `$$` or `\[` alone on its line, or `\begin{env}` of a math environment (which may
 * be followed by tex). A line of prose that starts with `\[` or `$$` and goes on is not an opener, so it cannot swallow the text after it.
 */
function mathOpen(l: string): string | null {
  const m = MATH_OPEN.exec(l);
  return m && (m[1][1] === 'b' || !l.slice(m[0].length).trim()) ? m[1] : null;
}
/** The closer that ends the block `op` opens. */
const closeOf = (op: string) => (op === '$$' ? '$$' : op === '\\[' ? '\\]' : op.replace('begin', 'end'));
const mathCloser = (op: string): Closer => ({ test: (l) => closes(l, closeOf(op)) });
/** The tex of a math unit: its lines without the opener and, once it has arrived, the closer, except that an environment keeps its `\begin` and `\end`. While it is open (and `part`: the last line is still arriving) it is only the body, and half a closer is left off. */
export function mathText(u: Extract<Unit, { k: 'm' }>, L: string[], part = false): string {
  const lines = L.slice(u.a, u.e);
  const env = u.op[1] === 'b';
  if (env && u.closed) return lines.join('\n').trim(); // an environment is its own tex, `\begin` and `\end` included
  lines[0] = lines[0].replace(MATH_OPEN, '');
  const last = lines.length - 1;
  const close = closeOf(u.op);
  const strip = (l: string) => l.trimEnd().slice(0, -close.length);
  if (u.closed) lines[last] = strip(lines[last]);
  else if (part) {
    const l = lines[last];
    const k = l.lastIndexOf('\\');
    if (env)
      lines[last] = k >= 0 && close.startsWith(l.slice(k).trimEnd()) ? l.slice(0, k) : l; // an `\end{env}` that is still arriving
    else lines[last] = closes(l, close) ? strip(l) : l.replace(/[$\\]$/, '');
  }
  return lines.join('\n').trim();
}

/** The math block that starts at line i. It runs to the line that ends with the closer, or to the end of input. Null if that makes it blank, which is text. */
function mathUnit(L: string[], i: number, op: string, partial: boolean, final: boolean): Extract<Unit, { k: 'm' }> | null {
  const n = L.length;
  const close = closeOf(op);
  let j = i + 1;
  let closed = false;
  if (op[1] === 'b' && closes(L[i], close) && (final || !partial || i < n - 1)) closed = true; // `\begin{env}...\end{env}` on one line
  while (!closed && j < n) {
    // A last line that is still arriving may grow past the closer (`$$x`), so it does not close the block yet, as with a fence.
    if (closes(L[j], close) && (final || !partial || j < n - 1)) {
      closed = true;
      j++;
      break;
    }
    j++;
  }
  const u: Extract<Unit, { k: 'm' }> = { k: 'm', a: i, e: j, b: j, closed, op };
  return closed && !mathText(u, L) ? null : u;
}

/** Fenced code starting at line i. Runs to the closing fence or to the end of input. */
function fenceUnit(L: string[], i: number, m: RegExpExecArray, partial: boolean, final: boolean): Unit {
  const n = L.length;
  const close = closer(m, ' {0,3}');
  let j = i + 1;
  let closed = false;
  while (j < n) {
    // An unfinished last line that looks like a closer may still grow into text (```js), so it does not close the fence yet.
    if (close.test(L[j]) && (final || !partial || j < n - 1)) {
      closed = true;
      j++;
      break;
    }
    j++;
  }
  // While a closing fence is still arriving (a backtick run on the unfinished last line), keep it out of the code.
  const hide = !closed && !final && partial && j === n && j - 1 > i && (PARTIAL_CLOSE.test(L[n - 1]) || close.test(L[n - 1]));
  return { k: 'f', a: i, e: hide ? j - 1 : j, b: j, lang: m[3].trim().split(/\s+/)[0], closed, ind: m[1].length };
}

/** Is `h` a table head with `d` as its delimiter row? Both have the prefix of their container removed. */
function headOver(h: string, d: string): boolean {
  return h.includes('|') && !DELIM.test(h) && delim(d) && (PIPE.test(h) || cells(h).length > 1) && cells(h).length === cells(d).length;
}

/**
 * What the last line of a quote or list item is. A line without the container's prefix (a lazy line) can only continue
 * paragraph text, so it ends the container after a table, a heading, or a fence. `pre` lists the containers that the
 * lines so far opened inside this one (0 for a quote, the content column for a list item), so `para`, `tbl`, and
 * `prev` always describe the innermost container, where a table two levels down (`> - | a |` over `>   |---|`) is seen.
 */
interface Last {
  para: boolean;
  tbl: boolean; // inside a table
  prev: string; // the last line, with the prefix of every container removed
  pre: number[];
  fe: Closer | null; // closing fence or math closer of a block inside one of those containers
}
// Nesting deeper than the renderer builds (MAX_DEPTH in index.ts) is text, so no more containers are tracked, which keeps `step` cheap on deep input.
const MAX_PRE = 12;
/** Does the line start with four columns of indent? A tab counts to the next multiple of four, so a line that starts with a tab is indented. */
const isCode = (l: string) => {
  for (let i = 0, col = 0; i < l.length; i++) {
    if (l[i] === ' ') col++;
    else if (l[i] === '\t') col += 4 - (col % 4);
    else return false;
    if (col >= 4) return true;
  }
  return false;
};
/** The line without its first four columns of indent. A tab that is only partly used leaves its spaces. */
export function dedent4(l: string): string {
  let col = 0;
  let i = 0;
  for (; i < l.length && col < 4 && (l[i] === ' ' || l[i] === '\t'); i++) col += l[i] === ' ' ? 1 : 4 - (col % 4);
  return ' '.repeat(Math.max(0, col - 4)) + l.slice(i);
}
const newLast = (): Last => ({ para: false, tbl: false, prev: '', pre: [], fe: null });
const dropQuote = (c: string) => c.replace(/^ {0,3}> ?/, '');
/** The column where the content of the list item that line `l` (matched by `m`) opens starts. */
const itemOff = (m: RegExpExecArray) => m[1].length + m[2].length + (!m[4] || (m[3]?.length ?? 1) > 4 ? 1 : (m[3]?.length ?? 1));
function step(s: Last, c: string, det: boolean, mt: boolean): void {
  let k = 0;
  for (; k < s.pre.length; k++) {
    const w = s.pre[k];
    if (w === 0 ? !BQ.test(c) : spaces(c) < w) break;
    c = w === 0 ? dropQuote(c) : c.slice(w);
  }
  if (k < s.pre.length) {
    if (s.para && c.trim() && !interrupts(c, det, mt)) {
      s.prev = c; // a lazy line continues the paragraph of the innermost container
      return;
    }
    s.pre.length = k; // the inner containers end here
    s.tbl = s.para = false;
    s.fe = null;
  }
  if (s.fe) {
    if (s.fe.test(c)) s.fe = null;
    return;
  }
  if (s.tbl && c.trim() && !interrupts(c, det, mt) && !isCode(c)) {
    s.prev = c; // a row
    return;
  }
  s.tbl = false;
  for (let m: RegExpExecArray | null; s.pre.length < MAX_PRE; ) {
    if (BQ.test(c)) {
      s.pre.push(0);
      c = dropQuote(c);
    } else if ((m = LI.exec(c)) && m[1].length < 4 && !HR.test(c) && (!s.para || interrupts(c, det, mt))) {
      s.pre.push(itemOff(m));
      c = c.slice(s.pre[s.pre.length - 1]);
    } else break;
    s.para = false;
  }
  const f = fence(c);
  const mo = !f && mt ? mathOpen(c) : null;
  if (f) s.fe = closer(f, ' {0,3}');
  else if (mo) s.fe = mathCloser(mo);
  s.tbl = s.para && headOver(s.prev, c);
  // An underline closes the paragraph into a heading, and a line indented four spaces that is not paragraph text is code.
  s.para = !f && !mo && !s.tbl && !!c.trim() && !atx(c) && !HR.test(c) && !(s.para && SETEXT.test(c)) && (s.para || !isCode(c));
  s.prev = c;
}

/** The indented code that starts at line i: lines indented four spaces, with blank lines between them. `e` ends its text, and `j` includes the blank lines after it. */
function indentEnd(L: string[], i: number): { e: number; j: number } {
  let e = i + 1;
  let j = i + 1;
  for (; j < L.length && (!L[j].trim() || isCode(L[j])); j++) if (L[j].trim()) e = j + 1;
  return { e, j };
}

/** End (exclusive) of the blockquote starting at line i. */
function quoteEnd(L: string[], i: number, det: boolean, mt: boolean): number {
  const n = L.length;
  // Lazy continuation (a line without `>`) is only allowed right after paragraph text.
  let j = i;
  const s = newLast();
  let fe: Closer | null = null;
  for (; j < n && L[j].trim(); j++) {
    if (!BQ.test(L[j])) {
      if (!s.para || interrupts(L[j], det, mt)) break;
      s.prev = L[j];
      continue;
    }
    const c = dropQuote(L[j]);
    const f = fe ? null : fence(c);
    const mo = fe || f || !mt ? null : mathOpen(c);
    if (fe) {
      if (fe.test(c)) fe = null;
      s.para = s.tbl = false;
    } else if (f) {
      fe = closer(f, ' {0,3}');
      s.para = s.tbl = false;
    } else if (mo) {
      fe = mathCloser(mo);
      s.para = s.tbl = false;
    } else step(s, c, det, mt);
  }
  return j;
}

/**
 * Extent of the list item starting at line i, whose content starts at column `off` and has text on its first line
 * if `text`. Returns the end of its content (`last`) and the end including trailing blank lines (`j`).
 */
function itemEnd(L: string[], i: number, off: number, text: boolean, det: boolean, mt: boolean): { last: number; j: number } {
  const n = L.length;
  let j = i + 1;
  let fe: Closer | null = null;
  let blank = false;
  let last = i + 1;
  const s = newLast();
  if (text) step(s, L[i].slice(off), det, mt);
  for (; j < n; j++) {
    const x = L[j];
    if (fe) {
      if (x.trim() && spaces(x) < off) break; // the item ended, and its fence with it
      if (fe.test(x)) {
        fe = null;
        s.para = false;
      }
      last = j + 1;
      continue;
    }
    if (!x.trim()) {
      if (!text && j === i + 1) break; // an item that starts with a blank line may have only that one, so it is empty
      blank = true;
      s.tbl = s.para = false;
      s.pre.length = 0;
      s.fe = null;
      continue;
    }
    const xi = spaces(x);
    if (xi >= off) {
      const f = fence(x.slice(off));
      const mo = f || !mt ? null : mathOpen(x.slice(off));
      if (f) {
        fe = closer(f, ' *');
        s.para = s.tbl = false;
      } else if (mo) {
        fe = mathCloser(mo);
        s.para = s.tbl = false;
      } else step(s, x.slice(off), det, mt);
    } else if ((LI.test(x) && !isCode(x)) || interrupts(x, det, mt) || blank || !s.para)
      break; // four spaces is too much for a new item, so it continues the paragraph
    else s.prev = x;
    blank = false;
    last = j + 1;
  }
  return { last, j };
}

/** An opener line waiting for its closer. */
interface Frame {
  a: number; // opener line
  u: number; // length of U when the opener was seen
  open: boolean;
  sum: string | null; // the summary, if the opener line has it (`<details><summary>T</summary>`)
}

/** Does unit `v` continue the list that item `u` is in (the same kind of list and the same bullet or delimiter)? */
export const sameList = (u: Unit, v: Unit) => u.k === 'li' && v.k === 'li' && u.ord === v.ord && u.mk === v.mk;

/**
 * Split lines into units. `tbl` is the alignment of a table that was already open before line 0 (see flush() in
 * index.ts). `partial` says the last line is still arriving, and `final` says no more input will come: both make
 * scan() hold back constructs that the next characters could still turn into something else.
 * `det` is 0 when details blocks are off, 1 while the text can still grow, and 2 once it is settled. `dh` means the
 * last line is still arriving, so a tag that could still become a details opener, closer, or summary is held back.
 * `lz[k]` says line k is a lazy line: it came without the prefix of its quote or list item, so it continues a paragraph and
 * cannot be a delimiter row.
 */
export function scan(
  L: string[],
  tbl: Al | null,
  partial: boolean,
  final: boolean,
  det = 0,
  dh = false,
  lz?: boolean[],
  mt = false,
): Unit[] {
  const lazy = (k: number) => !!lz?.[k];
  const U: Unit[] = [];
  const n = L.length;
  const fr: Frame[] = [];
  let i = 0;
  while (i < n) {
    const l = L[i];
    if (!l.trim()) {
      if (U.length > (fr.length ? fr[fr.length - 1].u : 0)) U[U.length - 1].b = i + 1;
      tbl = null;
      i++;
      continue;
    }
    if (det) {
      const dm = opener(l);
      if (dh && i === n - 1 && (dm || CLOSE.test(l) || tagPrefix(l, !!fr.length && i === fr[fr.length - 1].a + 1))) {
        i++; // a tag that is still arriving: wait for the rest of the line
        continue;
      }
      if (dm) {
        fr.push({ a: i, u: U.length, open: !!dm[1], sum: dm[2] === undefined ? null : dm[2].trim() });
        tbl = null;
        i++;
        continue;
      }
      if (fr.length && CLOSE.test(l)) {
        const f = fr.pop()!;
        tbl = null;
        if (!fr.length) {
          U.length = f.u;
          const s = body(L, f, i, false);
          U.push({ k: 'd', a: f.a, e: i + 1, b: i + 1, open: f.open, closed: true, sum: s[0], bs: s[1] });
        }
        i++;
        continue;
      }
    }
    if (mt && !final && partial && i === n - 1 && envStart(l)) {
      i++; // a `\begin{env}` that is still arriving: wait for the rest of the line
      continue;
    }
    if (tbl) {
      if (!interrupts(l, !!det, mt) && !isCode(l)) {
        U.push({ k: 'tr', a: i, e: i + 1, b: i + 1, al: tbl });
        i++;
        continue;
      }
      tbl = null;
    }
    if (!lazy(i) && isCode(l)) {
      // Here no paragraph is open (a paragraph takes every line up to a blank one or a block start), so this is indented code.
      const { e, j } = indentEnd(L, i);
      U.push({ k: 'f', a: i, e, b: j, lang: '', closed: j < n, ind: 4, ic: true });
      i = j;
      continue;
    }
    if (mt) {
      // A formula that never closes holds the rest of the text, like an open fence, and is shown as text once the message is over.
      const op = mathOpen(l);
      const u = op && mathUnit(L, i, op, partial, final);
      if (u) {
        U.push(u);
        i = u.b;
        continue;
      }
    }
    let m: RegExpExecArray | null;
    let h: [number, string] | null;
    if ((m = fence(l))) {
      const u = fenceUnit(L, i, m, partial, final);
      U.push(u);
      i = u.b;
    } else if ((h = atx(l))) {
      U.push({ k: 'h', a: i, e: i + 1, b: i + 1, lv: h[0] });
      i++;
    } else if (HR.test(l)) {
      if (!final && partial && i === n - 1 && STAR_BOLD.test(l)) {
        i++; // `* **` can still become a bullet that starts with bold text
        continue;
      }
      U.push({ k: 'hr', a: i, e: i + 1, b: i + 1 });
      i++;
    } else if (BQ.test(l)) {
      const j = quoteEnd(L, i, !!det, mt);
      U.push({ k: 'q', a: i, e: j, b: j });
      i = j;
    } else if ((m = LI.exec(l))) {
      if (m[4] === undefined && !final && partial && i === n - 1) {
        i++; // a bare marker on the unfinished last line: wait to see what it becomes
        continue;
      }
      const ord = /\d/.test(m[2]);
      const off = itemOff(m);
      const { last, j } = itemEnd(L, i, off, !!m[4], !!det, mt);
      U.push({ k: 'li', a: i, e: last, b: j, ord, num: ord ? parseInt(m[2], 10) : 0, off, mk: m[2].slice(-1) });
      i = j;
    } else {
      const nx = L[i + 1];
      const lead = PIPE.test(l);
      const hc = l.includes('|') ? cells(l).length : -2;
      const dn = nx !== undefined && delim(nx) ? cells(nx).length : -1; // cells of a delimiter row, or -1 if nx is none
      if (hc >= 0 && !lazy(i + 1) && (lead || dn === hc)) {
        if (dn === hc) {
          const al = aligns(nx);
          U.push({ k: 'th', a: i, e: i + 2, b: i + 2, al });
          tbl = al;
          i += 2;
          continue;
        }
        if (lead && !final && !DELIM.test(l) && (nx === undefined || (partial && i + 1 === n - 1 && prefix(nx) && dn < hc))) {
          U.push({ k: 'th', a: i, e: n, b: n, pend: true, al: cells(l).map(() => null) });
          break;
        }
      }
      if (!lead && !final && partial && nx !== undefined && !lazy(i + 1) && i + 1 === n - 1 && l.includes('|') && prefix(nx)) {
        // A table without outer pipes whose delimiter row is still arriving: `a | b | c` over `--|-`.
        const dashes = nx.split('-').length - 1;
        if (dashes > 0 && (dashes > 1 || /[|:]/.test(nx)) && cells(nx).length <= cells(l).length) {
          U.push({ k: 'th', a: i, e: n, b: n, pend: true, al: cells(l).map(() => null) });
          break;
        }
      }
      let j = i + 1;
      let wait = -1; // a pipe line or underline that may still turn the paragraph into something else: it stays out until it is known
      let se = 0;
      for (; j < n && L[j].trim(); j++) {
        const ul = lazy(j) ? null : SETEXT.exec(L[j]);
        if (ul) {
          // An underline still arriving may grow into text (`==x`), so it waits. A finished one turns the paragraph into a heading.
          if (!final && partial && j === n - 1) wait = j;
          else se = ul[1][0] === '=' ? 1 : 2;
          break;
        }
        const d = L[j].includes('|') && !lazy(j + 1) ? pipeHead(L, j, partial, final) : 0;
        if (d) {
          if (d === 2) wait = j;
          break;
        }
        if (interrupts(L[j], !!det, mt)) break;
      }
      if (se) {
        U.push({ k: 'h', a: i, e: j + 1, b: j + 1, lv: se, se: true });
        i = j + 1;
        continue;
      }
      if (wait >= 0) {
        U.push({ k: 'p', a: i, e: wait, b: n });
        i = n;
        continue;
      }
      const bare = !final && partial && j === n && j - 1 > i && BARE.test(L[n - 1]);
      const dbare = !!det && dh && j === n && j - 1 > i && tagPrefix(L[n - 1], false);
      const mbare = mt && !final && partial && j === n && j - 1 > i && envStart(L[n - 1]);
      U.push({ k: 'p', a: i, e: bare || dbare || mbare ? j - 1 : j, b: j });
      i = j;
    }
  }
  if (fr.length) {
    // Openers that never found a closer: the first one holds everything after it, and its inside is scanned again when built.
    const f = fr[0];
    U.length = f.u;
    const s = body(L, f, n, dh);
    let has = s[0] !== null;
    for (let k = s[1]; !has && k < n; k++) has = !!L[k].trim() && !(dh && k === n - 1 && tagPrefix(L[k], false));
    if (has) U.push({ k: 'd', a: f.a, e: n, b: n, open: f.open, closed: false, sum: s[0], bs: s[1] });
    else if (det === 2) U.push({ k: 'p', a: f.a, e: f.a + 1, b: n }); // nothing follows the opener: show it as text
  }
  for (let k = 0; k + 1 < U.length; k++) {
    const u = U[k];
    if (u.k === 'li' && u.b > u.e && sameList(u, U[k + 1])) u.sep = true;
  }
  return U;
}

/** Summary and body start of the details container whose opener is frame `f`. `pend`: the last line is still arriving. */
function body(L: string[], f: Frame, end: number, pend: boolean): [string | null, number] {
  if (f.sum !== null) return [f.sum, f.a + 1];
  const k = f.a + 1;
  if (k >= end) return [null, k];
  if (pend && k === L.length - 1 && tagPrefix(L[k], true)) return [null, k + 1];
  const m = SUMM.exec(L[k]);
  return m?.[1].trim() ? [m[1].trim(), k + 1] : [null, k];
}
