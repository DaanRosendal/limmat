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
    | { k: 'li'; ord: boolean; num: number; off: number } // list item, `off` is the content column, `num` the start number
    | { k: 'th'; al: Al; pend?: boolean } // table header, `pend` while the delimiter row is still arriving
    | { k: 'tr'; al: Al } // table body row
  );

// `[^\n]` instead of `.`: a dot stops at \r, \u2028 and \u2029, which made some of these regexes backtrack badly.
const ATXRE = /^ {0,3}(#{1,6})(?:[ \t]([^\n]*))?$/;
export const LI = /^( *)([-*+]|\d{1,9}[.)])(?:( +)([^\n]*)|$)/;
const FENCE = /^( {0,3})(`{3,}|~{3,})([^\n]*)$/;
const BARE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BQ = /^ {0,3}>/;
const PIPE = /^ {0,3}\|/;
const DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const PREFIX = /^[ \t|:-]*$/;
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
/** Regex for the line that closes the fence opened by match `m`. */
const closer = (m: RegExpExecArray, indent: string) => new RegExp(`^${indent}${m[2][0]}{${m[2].length},}[ \\t]*$`);
function interrupts(l: string, inTable: boolean): boolean {
  if (fence(l) || atx(l) || HR.test(l) || BQ.test(l)) return true;
  if (!inTable && PIPE.test(l)) return true;
  const m = LI.exec(l);
  return !!m && !!m[4] && m[1].length < 4 && m[2].length < 4;
}

/** Fenced code starting at line i. Runs to the closing fence or to the end of input. */
function fenceUnit(L: string[], i: number, m: RegExpExecArray, partial: boolean, final: boolean): Unit {
  const n = L.length;
  const close = closer(m, ' {0,3}');
  let j = i + 1;
  let closed = false;
  while (j < n) {
    if (close.test(L[j])) {
      closed = true;
      j++;
      break;
    }
    j++;
  }
  // While a closing fence is still arriving (a lone backtick run on the unfinished last line), keep it out of the code.
  const hide = !closed && !final && partial && j === n && j - 1 > i && PARTIAL_CLOSE.test(L[n - 1]);
  return { k: 'f', a: i, e: hide ? j - 1 : j, b: j, lang: m[3].trim().split(/\s+/)[0], closed, ind: m[1].length };
}

/** End (exclusive) of the blockquote starting at line i. */
function quoteEnd(L: string[], i: number): number {
  const n = L.length;
  // Lazy continuation (a line without `>`) is only allowed right after paragraph text.
  let j = i;
  let para = false;
  let fe: RegExp | null = null;
  for (; j < n && L[j].trim(); j++) {
    if (!BQ.test(L[j])) {
      if (!para || interrupts(L[j], false)) break;
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
function itemEnd(L: string[], i: number, off: number, text: boolean): { last: number; j: number } {
  const n = L.length;
  let j = i + 1;
  let fe: RegExp | null = null;
  let blank = false;
  let last = i + 1;
  for (; j < n; j++) {
    const x = L[j];
    if (fe) {
      if (x.trim() && spaces(x) < 2) break; // the item ended, and its fence with it
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
    if (xi >= 2) {
      const f = fence(x.slice(Math.min(xi, off)));
      if (f) fe = closer(f, ' *');
    } else if (LI.test(x) || interrupts(x, false) || blank || !text) break;
    blank = false;
    text = !fe;
    last = j + 1;
  }
  return { last, j };
}

/**
 * Split lines into units. `tbl` is the alignment of a table that was already open before line 0 (see flush() in
 * index.ts). `partial` says the last line is still arriving, and `final` says no more input will come: both make
 * scan() hold back constructs that the next characters could still turn into something else.
 * One branch per block kind, tried in priority order. Each pushes a unit and advances `i` past it.
 */
export function scan(L: string[], tbl: Al | null, partial: boolean, final: boolean): Unit[] {
  const U: Unit[] = [];
  const n = L.length;
  let i = 0;
  while (i < n) {
    const l = L[i];
    if (!l.trim()) {
      if (U.length) U[U.length - 1].b = i + 1;
      tbl = null;
      i++;
      continue;
    }
    if (tbl) {
      if (!interrupts(l, true)) {
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
      U.push({ k: 'hr', a: i, e: i + 1, b: i + 1 });
      i++;
    } else if (BQ.test(l)) {
      const j = quoteEnd(L, i);
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
      const off = ind + m[2].length + (m[4] === undefined || sp > 4 ? 1 : sp);
      const { last, j } = itemEnd(L, i, off, !!m[4]);
      U.push({ k: 'li', a: i, e: last, b: j, ord, num: ord ? parseInt(m[2], 10) : 0, off });
      i = j;
    } else {
      const nx = L[i + 1];
      const lead = PIPE.test(l);
      if (l.includes('|') && (lead || (nx !== undefined && DELIM.test(nx) && cells(l).length === cells(nx).length))) {
        if (nx !== undefined && DELIM.test(nx)) {
          const al = aligns(nx);
          U.push({ k: 'th', a: i, e: i + 2, b: i + 2, al });
          tbl = al;
          i += 2;
          continue;
        }
        if (lead && !final && (nx === undefined || (partial && i + 1 === n - 1 && PREFIX.test(nx)))) {
          U.push({ k: 'th', a: i, e: n, b: n, pend: true, al: cells(l).map(() => null) });
          break;
        }
      }
      let j = i + 1;
      while (j < n && L[j].trim() && !interrupts(L[j], false)) j++;
      const bare = !final && partial && j === n && j - 1 > i && BARE.test(L[n - 1]);
      U.push({ k: 'p', a: i, e: bare ? j - 1 : j, b: j });
      i = j;
    }
  }
  return U;
}
