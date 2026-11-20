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
    | { k: 'h'; lv: number } // ATX heading, level 1 to 6
    | { k: 'f'; lang: string; closed: boolean; ind: number } // fenced code, `ind` is the opening fence indent to strip
    | { k: 'li'; ord: boolean; num: number; off: number; mk: string } // list item, `off` is the content column, `num` the start number, `mk` the bullet or the number delimiter
    | { k: 'th'; al: Al; pend?: boolean } // table header, `pend` while the delimiter row is still arriving
    | { k: 'tr'; al: Al } // table body row
    | { k: 'd'; open: boolean; closed: boolean; sum: string | null; bs: number } // details container, inner lines are scanned again when built
  );

// `[^\n]` instead of `.`: a dot stops at \r, \u2028 and \u2029, which made some of these regexes backtrack badly.
const ATXRE = /^ {0,3}(#{1,6})(?:[ \t]([^\n]*))?$/;
export const LI = /^( *)([-*+]|\d{1,9}[.)])(?:( +)([^\n]*)|$)/;
const FENCE = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/;
const STAR_BOLD = /^ {0,3}\*[ \t]+\*{2,}$/;
const BARE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BQ = /^ {0,3}>/;
const PIPE = /^ {0,3}\|/;
const DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*(?:\|[ \t]*)?$/;
const PREFIX = /^[ \t|:-]*$/;
// `<details>` or `<details open>`, alone on its line or followed by `<summary>text</summary>`. No other attribute, spacing, or text.
const OPEN = /^ {0,3}<details( open)?>(?:<summary>((?:(?!<\/summary>)[^\n])*)<\/summary>)?[ \t]*$/i;
const CLOSE = /^ {0,3}<\/details>[ \t]*$/i;
const SUMM = /^ {0,3}<summary>((?:(?!<\/summary>)[^\n])*)<\/summary>[ \t]*$/i;
const TAGS = ['<details>', '<details open>', '</details>'];
const PARTIAL_CLOSE = /^ {0,3}(?:`+|~+)$/;

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
  if (DELIM.test(nx)) {
    const dn = cells(nx).length;
    if (growing) return dn > hc ? 0 : 2; // more characters can still change a line that is arriving, even one that looks complete
    return dn === hc ? 1 : 0;
  }
  return growing && PREFIX.test(nx) ? 2 : 0;
}
function interrupts(l: string, inTable: boolean, det = false): boolean {
  if (det && (opener(l) || CLOSE.test(l))) return true;
  if (fence(l) || atx(l) || HR.test(l) || BQ.test(l)) return true;
  if (!inTable && PIPE.test(l)) return true;
  const m = LI.exec(l);
  return !!m && !!m[4] && m[1].length < 4 && m[2].length < 4 && (!/\d/.test(m[2]) || parseInt(m[2], 10) === 1);
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

/** End (exclusive) of the blockquote starting at line i. */
function quoteEnd(L: string[], i: number, det: boolean): number {
  const n = L.length;
  // Lazy continuation (a line without `>`) is only allowed right after paragraph text.
  let j = i;
  let para = false;
  let fe: RegExp | null = null;
  for (; j < n && L[j].trim(); j++) {
    if (!BQ.test(L[j])) {
      if (!para || interrupts(L[j], false, det)) break;
      continue;
    }
    const c = L[j].replace(/^ {0,3}> ?/, '');
    const f = fe ? null : fence(c);
    if (fe) {
      if (fe.test(c)) fe = null;
      para = false;
    } else if (f) {
      fe = closer(f, ' {0,3}');
      para = false;
    } else para = !!c.trim() && !atx(c) && !HR.test(c);
  }
  return j;
}

/**
 * Extent of the list item starting at line i, whose content starts at column `off` and has text on its first line
 * if `text`. Returns the end of its content (`last`) and the end including trailing blank lines (`j`).
 */
function itemEnd(L: string[], i: number, off: number, text: boolean, det: boolean): { last: number; j: number } {
  const n = L.length;
  let j = i + 1;
  let fe: RegExp | null = null;
  let blank = false;
  let last = i + 1;
  for (; j < n; j++) {
    const x = L[j];
    if (fe) {
      if (x.trim() && spaces(x) < off) break; // the item ended, and its fence with it
      if (fe.test(x)) {
        fe = null;
        text = false;
      }
      last = j + 1;
      continue;
    }
    if (!x.trim()) {
      blank = true;
      continue;
    }
    const xi = spaces(x);
    if (xi >= off) {
      const f = fence(x.slice(off));
      if (f) fe = closer(f, ' *');
    } else if (LI.test(x) || interrupts(x, false, det) || blank || !text) break;
    blank = false;
    text = !fe;
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

/**
 * Split lines into units. `tbl` is the alignment of a table that was already open before line 0 (see flush() in
 * index.ts). `partial` says the last line is still arriving, and `final` says no more input will come: both make
 * scan() hold back constructs that the next characters could still turn into something else.
 * `det` is 0 when details blocks are off, 1 while the text can still grow, and 2 once it is settled. `dh` means the
 * last line is still arriving, so a tag that could still become a details opener, closer, or summary is held back.
 */
export function scan(L: string[], tbl: Al | null, partial: boolean, final: boolean, det = 0, dh = false): Unit[] {
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
    if (tbl) {
      if (!interrupts(l, true, !!det)) {
        U.push({ k: 'tr', a: i, e: i + 1, b: i + 1, al: tbl });
        i++;
        continue;
      }
      tbl = null;
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
      const j = quoteEnd(L, i, !!det);
      U.push({ k: 'q', a: i, e: j, b: j });
      i = j;
    } else if ((m = LI.exec(l))) {
      if (m[4] === undefined && !final && partial && i === n - 1) {
        i++; // a bare marker on the unfinished last line: wait to see what it becomes
        continue;
      }
      const ind = m[1].length;
      const ord = /\d/.test(m[2]);
      const sp = m[3]?.length ?? 1;
      const off = ind + m[2].length + (!m[4] || sp > 4 ? 1 : sp);
      const { last, j } = itemEnd(L, i, off, !!m[4], !!det);
      U.push({ k: 'li', a: i, e: last, b: j, ord, num: ord ? parseInt(m[2], 10) : 0, off, mk: m[2].slice(-1) });
      i = j;
    } else {
      const nx = L[i + 1];
      const lead = PIPE.test(l);
      const hc = l.includes('|') ? cells(l).length : -2;
      const dn = nx !== undefined && DELIM.test(nx) ? cells(nx).length : -1; // cells of a delimiter row, or -1 if nx is none
      if (hc >= 0 && (lead || dn === hc)) {
        if (dn === hc) {
          const al = aligns(nx);
          U.push({ k: 'th', a: i, e: i + 2, b: i + 2, al });
          tbl = al;
          i += 2;
          continue;
        }
        if (lead && !final && !DELIM.test(l) && (nx === undefined || (partial && i + 1 === n - 1 && PREFIX.test(nx) && dn < hc))) {
          U.push({ k: 'th', a: i, e: n, b: n, pend: true, al: cells(l).map(() => null) });
          break;
        }
      }
      if (!lead && !final && partial && nx !== undefined && i + 1 === n - 1 && l.includes('|') && PREFIX.test(nx)) {
        // A table without outer pipes whose delimiter row is still arriving: `a | b | c` over `--|-`.
        const dashes = nx.split('-').length - 1;
        if (dashes > 0 && (dashes > 1 || /[|:]/.test(nx)) && cells(nx).length <= cells(l).length) {
          U.push({ k: 'th', a: i, e: n, b: n, pend: true, al: cells(l).map(() => null) });
          break;
        }
      }
      let j = i + 1;
      let wait = -1; // a pipe line that may still turn into a table head: it stays out of the paragraph until it is known
      for (; j < n && L[j].trim(); j++) {
        const d = L[j].includes('|') ? pipeHead(L, j, partial, final) : 0;
        if (d) {
          if (d === 2) wait = j;
          break;
        }
        if (interrupts(L[j], true, !!det)) break;
      }
      if (wait >= 0) {
        U.push({ k: 'p', a: i, e: wait, b: n });
        i = n;
        continue;
      }
      const bare = !final && partial && j === n && j - 1 > i && BARE.test(L[n - 1]);
      const dbare = !!det && dh && j === n && j - 1 > i && tagPrefix(L[n - 1], false);
      U.push({ k: 'p', a: i, e: bare || dbare ? j - 1 : j, b: j });
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
