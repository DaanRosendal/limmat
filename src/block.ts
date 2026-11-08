// Block scanner: lines to units. Forward-only, so a unit followed by a unit that starts on a complete line is final.
export type Al = (string | null)[];
export interface Unit {
  k: 'p' | 'h' | 'hr' | 'f' | 'q' | 'li' | 'th' | 'tr';
  a: number; // first line
  e: number; // end of content (exclusive)
  b: number; // end including trailing blank lines (exclusive)
  lv?: number;
  lang?: string;
  closed?: boolean;
  ind?: number;
  ord?: boolean;
  num?: number;
  off?: number;
  al?: Al;
  pend?: boolean;
}

export const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
export const LI = /^( *)([-*+]|\d{1,9}[.)])(?:( +)(.*)|$)/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BQ = /^ {0,3}>/;
const PIPE = /^ {0,3}\|/;
const DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const PREFIX = /^[ \t|:-]*$/;
const PARTIAL_CLOSE = /^ {0,3}(?:`+|~+)$/;

export const spaces = (l: string) => l.length - l.trimStart().length;
export function cells(l: string): string[] {
  l = l.trim();
  if (l[0] === '|') l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}
const aligns = (l: string): Al => cells(l).map((c) => (c[0] === ':' ? (c.endsWith(':') ? 'center' : 'left') : c.endsWith(':') ? 'right' : null));

const fence = (l: string) => {
  const m = FENCE.exec(l);
  return m && !(m[2][0] === '`' && m[3].includes('`')) ? m : null;
};
function interrupts(l: string, inTable: boolean): boolean {
  if (fence(l) || ATX.test(l) || HR.test(l) || BQ.test(l)) return true;
  if (!inTable && PIPE.test(l)) return true;
  const m = LI.exec(l);
  return !!m && !!m[4] && m[2].length < 4;
}

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
      if (!interrupts(l, true)) { U.push({ k: 'tr', a: i, e: i + 1, b: i + 1, al: tbl }); i++; continue; }
      tbl = null;
    }
    let m: RegExpExecArray | null;
    if ((m = fence(l))) {
      const ch = m[2][0], len = m[2].length;
      const close = new RegExp(`^ {0,3}${ch}{${len},}[ \\t]*$`);
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (close.test(L[j])) { closed = true; j++; break; }
        j++;
      }
      const hide = !closed && !final && partial && j === n && j - 1 > i && PARTIAL_CLOSE.test(L[n - 1]);
      U.push({ k: 'f', a: i, e: hide ? j - 1 : j, b: j, lang: m[3].trim().split(/\s+/)[0], closed, ind: m[1].length });
      i = j;
    } else if ((m = ATX.exec(l))) {
      U.push({ k: 'h', a: i, e: i + 1, b: i + 1, lv: m[1].length });
      i++;
    } else if (HR.test(l)) {
      U.push({ k: 'hr', a: i, e: i + 1, b: i + 1 });
      i++;
    } else if (BQ.test(l)) {
      let j = i + 1;
      while (j < n && L[j].trim() && (BQ.test(L[j]) || !interrupts(L[j], false))) j++;
      U.push({ k: 'q', a: i, e: j, b: j });
      i = j;
    } else if ((m = LI.exec(l))) {
      const ind = m[1].length;
      const ord = /\d/.test(m[2]);
      const sp = m[3]?.length ?? 1;
      const off = ind + m[2].length + (m[4] === undefined || sp > 4 ? 1 : sp);
      let j = i + 1;
      let fe: RegExp | null = null;
      let blank = false;
      let text = !!m[4];
      let last = i + 1;
      for (; j < n; j++) {
        const x = L[j];
        if (fe) {
          if (fe.test(x)) { fe = null; text = false; }
          last = j + 1;
          continue;
        }
        if (!x.trim()) { blank = true; continue; }
        const xi = spaces(x);
        if (xi >= 2) {
          const f = fence(x.slice(Math.min(xi, off)));
          if (f) fe = new RegExp(`^ *${f[2][0]}{${f[2].length},}[ \\t]*$`);
        } else if (LI.test(x) || interrupts(x, false) || blank || !text) break;
        blank = false;
        text = !fe;
        last = j + 1;
      }
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
      U.push({ k: 'p', a: i, e: j, b: j });
      i = j;
    }
  }
  return U;
}
