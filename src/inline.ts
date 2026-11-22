// Inline markdown to a small tree. Tokenizing is one pass, emphasis uses the CommonMark delimiter stack (linear),
// and `spec` closes unfinished constructs speculatively so a half-streamed reply never shows raw markers.

/** The HTML tags that become elements, only when written without attributes. An `html` option can narrow this list but never extend it. */
export const HTML_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'kbd', 'sub', 'sup'] as const;
const DEFAULT_TAGS: ReadonlySet<string> = new Set(HTML_TAGS);

/** What parseInline returns: a finished tree, ready to turn into DOM. Only these shapes ever leave this module. */
export type Inline =
  | { k: 't'; s: string } // text
  | { k: 'c'; s: string } // inline code
  | { k: 'br' }
  | { k: 'e'; tag: 'em' | 'strong' | 'del' | (typeof HTML_TAGS)[number]; kids: Inline[] }
  | { k: 'l'; href: string; img: boolean; kids: Inline[] } // link, or image (img: rendered as its alt text)
  | { k: 'a'; s: string; href: string; ang?: true } // autolink, the text is the URL or email (`ang`: written in angle brackets)
  | { k: 'm'; s: string; disp: boolean; open?: true }; // math: the tex (`open`: its closing delimiter has not arrived yet, so the tex shows as plain text)

/** Which math syntax parseInline looks for, when the `renderMath` option is on. The backslash and double dollar forms are always on. */
export interface MathOpts {
  dollar: boolean; // single `$...$`
}

/**
 * Working node used while parsing. One loose shape (rather than a union) because delimiter nodes are rewritten in
 * place as the CommonMark delimiter stack resolves, and esbuild does not mangle property names, so keep them short.
 */
interface N {
  k: 't' | 'c' | 'br' | 'e' | 'l' | 'a' | 'd' | '[' | 'h' | 'g' | 'm'; // text, code, break, emphasis, link, autolink, delimiter run, open bracket, list head, HTML tag token, math
  s?: string; // text, code, or autolink text, or the source text of an HTML tag token
  tag?: string; // emphasis or HTML element name
  kids?: N[]; // children of emphasis and links
  href?: string; // link or autolink target, not yet checked by safeUrl
  ang?: true; // autolink written in angle brackets
  disp?: boolean; // display math
  open?: true; // math that is still open
  img?: boolean; // image rather than link
  d?: number; // nesting depth of this node's subtree, capped at MAXDEPTH
  ch?: string; // delimiter character (* _ ~)
  n?: number; // delimiter run length still unmatched
  o?: boolean; // delimiter can open emphasis, or the HTML tag token is an opening tag
  c?: boolean; // delimiter can close emphasis
  orig?: number; // delimiter run length when first seen (rule of 3)
  p?: N | null; // previous node in the delimiter list
  x?: N | null; // next node in the delimiter list
}

const PUNCT = /[\p{P}\p{S}]/u;
const WS = /\s/;
const ESC = /[!-/:-@[-`{-~]/;
const WORD = /[A-Za-z0-9_]/;
const BR = /<br\s*\/?>/iy;
const TAG = /<(\/?)([A-Za-z]+)>/y;
const AUTO = /<([A-Za-z][A-Za-z0-9+.-]*:[^\s<>]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)>/y;
// A `<` to the end of the text that is already an autolink in the making (a scheme and colon, or a name and @), held back while streaming.
const PARTIAL_AUTO = /<(?:[A-Za-z][\w.+-]*:[^\s<>]*|[\w.+-]+@[\w.-]*)$/y;
const URLRE = /(?:https?:\/\/|www\.)[^\s<\]]+/iy;
const DOMAIN = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/y;
// A numeric reference (1 to 7 digits, or x and 1 to 6 hex digits) or one of six names. The full HTML name table is too big to ship.
const ENT = /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/y;
const NAMES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
// The same references and the backslash escapes, decoded in a link destination.
const DEST_ESC = /\\([!-/:-@[-`{-~])|&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/g;
// The text from a `&` to the end that could still become a reference, held back while streaming.
const PARTIAL_ENT = /^&(?:#(?:[0-9]{0,7}|[xX][0-9a-fA-F]{0,6})|[a-z]{0,4})$/;
const DIGIT = /[0-9]/;
const MAXDEST = 8192; // most servers refuse longer request lines (Apache 8190, nginx 8 KB), so a longer link would be dead anyway
const MAXDEPTH = 30;

/** The character a reference stands for. A code point that does not exist (zero, a surrogate, past U+10FFFF) is U+FFFD. */
const entChar = (dec?: string, hex?: string, name?: string): string => {
  if (name) return NAMES[name];
  const cp = dec ? +dec : parseInt(hex!, 16);
  return cp && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : '\uFFFD';
};

const lastCp = (s: string, i: number) => {
  const c = s.charCodeAt(i - 1);
  return i > 1 && c >= 0xdc00 && c <= 0xdfff ? s.slice(i - 2, i) : s[i - 1];
};
const firstCp = (s: string, i: number) => String.fromCodePoint(s.codePointAt(i)!);

function merge(t: N[]): N[] {
  const o: N[] = [];
  for (const x of t) {
    const l = o[o.length - 1];
    if (x.k === 't' && l && l.k === 't') l.s = l.s! + x.s!;
    else o.push(x);
  }
  return o;
}

// `w` is a work budget shared by one parseInline call, so hostile input cannot make destination scans quadratic.
function parseDest(s: string, j: number, w: { n: number }): { end: number; href: string } | 'p' | null {
  const n = s.length;
  if (w.n <= 0) return null;
  j++;
  while (s[j] === ' ' || s[j] === '\t') j++;
  if (j >= n) return 'p';
  let dest: string;
  if (s[j] === '<') {
    let k = j + 1;
    while (k < n && s[k] !== '>' && s[k] !== '\n' && s[k] !== '<' && k - j < MAXDEST) k++;
    w.n -= k - j;
    if (k >= n) return 'p';
    if (s[k] !== '>') return null;
    dest = s.slice(j + 1, k);
    j = k + 1;
  } else {
    let depth = 0;
    let k = j;
    while (k < n) {
      const c = s.charCodeAt(k);
      if (c <= 32 || c === 127) break;
      if (c === 92 && k + 1 < n) {
        k += 2;
        continue;
      }
      if (c === 40) depth++;
      else if (c === 41 && !depth--) break;
      if (++k - j > MAXDEST) {
        w.n -= k - j;
        return null;
      }
    }
    w.n -= k - j;
    if (k >= n) return 'p';
    dest = s.slice(j, k);
    j = k;
  }
  const skip = () => {
    while (s[j] === ' ' || s[j] === '\t' || s[j] === '\n') j++;
  };
  const href = () => dest.replace(DEST_ESC, (_m, e, d, h, nm) => e ?? entChar(d, h, nm));
  skip();
  if (j >= n) return 'p';
  if (s[j] === ')') return { end: j + 1, href: href() };
  const q = s[j];
  if (q === '"' || q === "'" || q === '(') {
    const close = q === '(' ? ')' : q;
    const lim = Math.min(n, j + 501); // a title longer than 500 characters is not a title
    let k = j + 1;
    while (k < lim && s[k] !== close) k += s[k] === '\\' && ESC.test(s[k + 1] ?? '') ? 2 : 1;
    w.n -= k - j;
    if (k >= lim) return k >= n ? 'p' : null;
    j = k + 1;
    skip();
    if (j >= n) return 'p';
    if (s[j] === ')') return { end: j + 1, href: href() };
  }
  return null;
}

function trimUrl(u: string): string {
  let o = 0,
    c = 0;
  for (const ch of u) ch === '(' ? o++ : ch === ')' && c++;
  for (;;) {
    const l = u[u.length - 1];
    if (/[?!.,:;*_~'"]/.test(l)) u = u.slice(0, -1);
    else if (l === ')' && c > o) {
      u = u.slice(0, -1);
      c--;
    } else return u;
  }
}

/**
 * Match HTML tag tokens into elements. A closing tag matches the nearest open tag of the same name, and open tags
 * between them are left as text. At most MAXDEPTH tags can be open at once, which also bounds the work. While
 * streaming (`spec`), tags still open at the end are closed so the raw tag never shows. At the end of the message
 * they stay text. Each element's content is resolved on its own, so emphasis never crosses a tag boundary.
 */
function pairTags(t: N[], spec: boolean): N[] {
  if (!t.some((x) => x.k === 'g')) return t;
  const out: N[] = [];
  const open: number[] = []; // positions in `out` of opening tags that have not found their closing tag
  const text = (x: N): N => ({ k: 't', s: x.s });
  const wrap = (at: number, sp: boolean) => {
    const kids = resolve(out.slice(at + 1), sp);
    let md = 0;
    for (const z of kids) md = Math.max(md, z.d ?? 0);
    const tag = out[at].tag;
    out.length = at;
    out.push({ k: 'e', tag, kids, d: md + 1 });
  };
  for (const x of t) {
    if (x.k !== 'g') out.push(x);
    else if (x.o) {
      if (open.length < MAXDEPTH) {
        open.push(out.length);
        out.push(x);
      } else out.push(text(x));
    } else {
      let j = open.length - 1;
      while (j >= 0 && out[open[j]].tag !== x.tag) j--;
      if (j < 0) out.push(text(x));
      else {
        const at = open[j];
        open.length = j;
        wrap(at, false);
      }
    }
  }
  if (spec) while (open.length) wrap(open.pop()!, true);
  return out.map((z) => (z.k === 'g' ? text(z) : z));
}

/** Resolve emphasis among tokens (delimiter stack, linear). Returns final nodes. */
function resolve(t: N[], spec: boolean): N[] {
  t = pairTags(t, spec);
  if (!t.some((x) => x.k === 'd')) return merge(t);
  const head: N = { k: 'h', x: null };
  let prev = head;
  for (const x of t) {
    prev.x = x;
    x.p = prev;
    x.x = null;
    prev = x;
  }
  const stack: N[] = [];
  const bottom: Record<string, number> = {};
  const lit = (z: N): N => ({ k: 't', s: z.ch!.repeat(z.n!) });
  // The nodes from `from` up to (not including) `to`, with unmatched delimiter runs turned back into text.
  const between = (from: N | null | undefined, to: N | null) => {
    const kids: N[] = [];
    let md = 0;
    for (let z = from; z && z !== to; z = z.x!) {
      kids.push(z.k === 'd' ? lit(z) : z);
      md = Math.max(md, z.d ?? 0);
    }
    return { kids, md };
  };
  const emphasis = (ch: string, use: number, kids: N[], md: number): N => ({
    k: 'e',
    tag: use === 2 ? (ch === '~' ? 'del' : 'strong') : 'em',
    kids,
    d: md + 1,
  });
  for (let cur = head.x; cur; ) {
    if (cur.k !== 'd') {
      cur = cur.x!;
      continue;
    }
    const cl = cur;
    if (cl.c) {
      const key = cl.ch! + (cl.o ? 1 : 0) + (cl.orig! % 3);
      while (cl.n! > 0) {
        let f = -1;
        for (let j = stack.length - 1, lo = Math.min(bottom[key] ?? 0, stack.length); j >= lo; j--) {
          const op = stack[j];
          if (op.ch !== cl.ch || (cl.ch === '~' && (op.n! < 2 || cl.n! < 2))) continue;
          if ((op.c || cl.o) && (op.orig! + cl.orig!) % 3 === 0 && !(op.orig! % 3 === 0 && cl.orig! % 3 === 0)) continue;
          f = j;
          break;
        }
        if (f < 0) {
          bottom[key] = stack.length;
          break;
        }
        const op = stack[f];
        const { kids, md } = between(op.x, cl);
        if (md >= MAXDEPTH) {
          bottom[key] = stack.length;
          break;
        }
        const use = op.n! >= 2 && cl.n! >= 2 ? 2 : 1;
        const node = emphasis(cl.ch!, use, kids, md);
        stack.length = f + 1;
        op.n! -= use;
        cl.n! -= use;
        node.p = op;
        node.x = cl;
        op.x = node;
        cl.p = node;
        if (op.n === 0) {
          op.p!.x = node;
          node.p = op.p;
          stack.pop();
        }
        if (cl.n === 0) {
          node.x = cl.x;
          if (cl.x) cl.x.p = node;
        }
        for (const k in bottom) bottom[k] = Math.min(bottom[k], stack.length); // the stack shrank: openers pushed later sit below the old mark
      }
      if (cl.n! > 0 && cl.o) stack.push(cl);
    } else stack.push(cl);
    cur = cl.x!;
  }
  if (spec) {
    let last = head;
    while (last.x) last = last.x;
    while (last.k === 'd' && last !== head) {
      last = last.p!;
      last.x = null;
    }
    closing: for (let j = stack.length - 1; j >= 0; j--) {
      const op = stack[j];
      while (op.n! > 0 && op.x && !(op.ch === '~' && op.n! < 2)) {
        const { kids, md } = between(op.x, null);
        if (md >= MAXDEPTH) break closing;
        const use = op.n! >= 2 ? 2 : 1;
        const node = emphasis(op.ch!, use, kids, md);
        node.p = op;
        node.x = null;
        op.x = node;
        op.n! -= use;
      }
    }
  }
  const out: N[] = [];
  for (let z = head.x; z; z = z.x) {
    if (z.k !== 'd') out.push(z);
    else if (z.n! > 0) out.push(lit(z));
  }
  return merge(out);
}

/** True if `r` (the text from a `<` to the end) could still become one of the tags, so it is held back while streaming. */
function partialTag(r: string, tags: ReadonlySet<string>): boolean {
  r = r.toLowerCase();
  const full = ['<br>', '<br/>', '<br />', '<http:', '<https:', '<mailto:']; // the last three start an autolink
  for (const t of tags) full.push(`<${t}>`, `</${t}>`);
  return full.some((f) => f.length > r.length && f.startsWith(r));
}

/** True if `r` (the text from a `&` to the end) is a numeric reference or the start of one of the names. */
function partialEnt(r: string): boolean {
  return r[1] === '#' || Object.keys(NAMES).some((k) => k.startsWith(r.slice(1)));
}

function partialAuto(s: string, i: number): boolean {
  PARTIAL_AUTO.lastIndex = i;
  return PARTIAL_AUTO.test(s);
}

/** Is the last character of `t` escaped, that is, does an odd number of backslashes end it? */
function escapedEnd(t: string): boolean {
  let k = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === '\\'; i--) k++;
  return k % 2 === 1;
}

/**
 * The `$` that closes the single-dollar span opened at `i` (whose next character is not a space), or -1. As in Pandoc, the
 * closer has no space before it, and when the opener is followed by a digit it is not followed by one either, so `$5-$10`
 * stays text. A `$` that cannot close but starts something (no space after it) ends the search, so one price cannot
 * swallow the math after it and every opener scans only up to the next dollar. The span stays on one line. A closer on the
 * last character of text that is still streaming waits when the digit rule applies, because the next character decides it.
 * Returns -2 when the line ends the text with no closer and nothing that rules the span out: it may still close.
 */
function dollarClose(s: string, i: number, spec: boolean): number {
  const n = s.length;
  const dig = DIGIT.test(s[i + 1]);
  for (let j = i + 1; j < n; j++) {
    const d = s[j];
    if (d === '\n') return -1;
    if (d === '\\') {
      if (s[j + 1] === '\n') return -1;
      j++;
      continue;
    }
    if (d !== '$') continue;
    const next = s[j + 1];
    if (!WS.test(s[j - 1]) && (!dig || (next === undefined ? !spec : !DIGIT.test(next)))) return j;
    if (next !== undefined && !WS.test(next)) return -1;
  }
  return -2;
}

export function parseInline(s: string, spec: boolean, tags: ReadonlySet<string> = DEFAULT_TAGS, math?: MathOpts): Inline[] {
  const out: N[] = [];
  const brk: number[] = [];
  const n = s.length;
  let ts = 0;
  let i = 0;
  let runs: Map<number, number[]> | undefined;
  const ptr = new Map<number, number>();
  const work = { n: 8 * n + 8192 }; // work budget for link destinations, see parseDest
  const text = (to: number) => {
    if (to > ts) out.push({ k: 't', s: s.slice(ts, to) });
  };
  // Where each closing delimiter is, found once and walked with a pointer like the backtick runs, so a delimiter with no closer is not searched for again.
  let mc: { p: number[]; b: number[]; d: number[] } | undefined;
  const mp = { p: 0, b: 0, d: 0 };
  /**
   * Math opened at `i` by a delimiter `len` characters long (`\(`, `\[`, or `$$`, whose closers are `\)`, `\]`, and `$$`). Returns where
   * parsing goes on, or -1 when it is not math: the formula is blank, or it never closes and the text is final. Then the opener is
   * what it was without math (`\(` and `\[` are escapes, `$$` is text), so math changes the output only where a formula closes.
   * While streaming, a formula with no closer yet is an open node that shows its tex (without a half-typed closer) as plain text.
   */
  const mathAt = (i: number, len: number, key: 'p' | 'b' | 'd', disp: boolean): number => {
    if (!mc) {
      mc = { p: [], b: [], d: [] };
      for (let k = 0; k < n; k++) {
        if (s[k] === '\\') {
          if (s[k + 1] === ')') mc.p.push(k);
          else if (s[k + 1] === ']') mc.b.push(k);
          k++;
        } else if (s[k] === '$' && s[k + 1] === '$') {
          mc.d.push(k);
          k++;
        }
      }
    }
    const list = mc[key];
    let q = mp[key];
    while (q < list.length && list[q] < i + len) q++;
    mp[key] = q;
    if (q < list.length) {
      const tex = s.slice(i + len, list[q]).trim();
      if (!tex) return -1;
      text(i);
      out.push({ k: 'm', s: tex, disp });
      return (ts = list[q] + 2);
    }
    if (!spec) return -1;
    let body = s.slice(i + len);
    if (key === 'd' ? body.endsWith('$') && !escapedEnd(body.slice(0, -1)) : escapedEnd(body)) body = body.slice(0, -1);
    text(i);
    const tex = body.trim();
    if (tex) out.push({ k: 'm', s: tex, disp, open: true });
    return (ts = n);
  };

  while (i < n) {
    const c = s[i];
    if (c === '\\') {
      const nx = s[i + 1];
      if (nx === '\n') {
        text(i);
        out.push({ k: 'br' });
        i += 2;
        ts = i;
        continue;
      }
      if (math && (nx === '(' || nx === '[')) {
        const r = mathAt(i, 2, nx === '(' ? 'p' : 'b', nx === '[');
        if (r >= 0) {
          i = r;
          continue;
        }
      }
      if (nx && ESC.test(nx)) {
        text(i);
        out.push({ k: 't', s: nx });
        i += 2;
        ts = i;
        continue;
      }
      if (spec && nx === undefined) {
        text(i); // a backslash at the end may still escape the next character
        i++;
        ts = i;
        continue;
      }
      i++;
    } else if (c === '`') {
      let e = i;
      while (s[e] === '`') e++;
      const len = e - i;
      if (!runs) {
        runs = new Map();
        for (const m of s.matchAll(/`+/g)) {
          const l = runs.get(m[0].length);
          l ? l.push(m.index!) : runs.set(m[0].length, [m.index!]);
        }
      }
      const list = runs.get(len) ?? [];
      let p = ptr.get(len) ?? 0;
      while (p < list.length && list[p] <= i) p++;
      ptr.set(len, p);
      const close = p < list.length ? list[p] : spec ? n : -1;
      if (close >= 0) {
        text(i);
        let code = s.slice(e, close).replace(/\n/g, ' ');
        if (code.length > 1 && code[0] === ' ' && code[code.length - 1] === ' ' && code.trim()) code = code.slice(1, -1);
        // A span that is still open and has no text yet would show as an empty box, so it waits for its first character.
        if (!(spec && close === n && !code.trim())) out.push({ k: 'c', s: code });
        i = close < n ? close + len : n;
        ts = i;
      } else i = e;
    } else if (c === '*' || c === '_' || c === '~') {
      let e = i;
      while (s[e] === c) e++;
      const len = e - i;
      if (c === '~' && len > 2) {
        i = e; // a run of three or more tildes is text, only a pair strikes
        continue;
      }
      if (c === '~' && len < 2) {
        // A lone ~ at the very end may be half of a ~~, so it waits (like a trailing * does) until the next character.
        if (spec && e === n) {
          text(i);
          ts = e;
        }
        i = e;
        continue;
      }
      const before = i ? lastCp(s, i) : ' ';
      const after = e < n ? firstCp(s, e) : ' ';
      const bw = WS.test(before),
        aw = WS.test(after),
        bp = PUNCT.test(before),
        ap = PUNCT.test(after);
      const lf = !aw && (!ap || bw || bp);
      const rf = !bw && (!bp || aw || ap);
      const o = c === '_' ? lf && (!rf || bp) : lf;
      const cl = c === '_' ? rf && (!lf || ap) : rf;
      if (o || cl) {
        text(i);
        out.push({ k: 'd', ch: c, n: len, orig: len, o, c: cl });
        ts = e;
      } else if (spec && e === n) {
        text(i);
        ts = e;
      }
      i = e;
    } else if (c === '[' || (c === '!' && s[i + 1] === '[')) {
      text(i);
      brk.push(out.length);
      out.push({ k: '[', img: c === '!' });
      i += c === '!' ? 2 : 1;
      ts = i;
    } else if (c === ']') {
      const bi = brk.pop();
      if (bi === undefined) {
        i++;
        continue;
      }
      const open = out[bi];
      if (open.k === 't') {
        i++; // the opener already turned into text, so this bracket is text too
        continue;
      }
      const r = s[i + 1] === '(' ? parseDest(s, i + 1, work) : null;
      if (r && r !== 'p') {
        text(i);
        const kids = resolve(out.splice(bi + 1), false);
        out.length = bi;
        let md = 0;
        for (const z of kids) md = Math.max(md, z.d ?? 0);
        if (md >= MAXDEPTH) for (const z of kids) out.push(z);
        else {
          out.push({ k: 'l', href: r.href, img: open.img, kids, d: md + 1 });
          // A link cannot contain a link: the open link brackets before this one stay text (an image may still contain it).
          if (!open.img)
            for (const bj of brk)
              if (!out[bj].img) {
                out[bj].k = 't';
                out[bj].s = '[';
              }
        }
        i = r.end;
        ts = i;
      } else if (spec && (r === 'p' || i + 1 === n)) {
        text(i);
        const kids = resolve(out.splice(bi + 1), spec);
        out.length = bi;
        for (const z of kids) out.push(z);
        i = n;
        ts = n;
      } else {
        open.k = 't';
        open.s = open.img ? '![' : '[';
        i++;
      }
    } else if (c === '<') {
      BR.lastIndex = i;
      AUTO.lastIndex = i;
      let m: RegExpExecArray | null;
      if (BR.test(s)) {
        text(i);
        out.push({ k: 'br' });
        i = BR.lastIndex;
        ts = i;
      } else if ((m = AUTO.exec(s))) {
        text(i);
        const u = m[1];
        out.push({ k: 'a', s: u, href: !u.includes(':') ? 'mailto:' + u : u, ang: true });
        i += m[0].length;
        ts = i;
      } else if (tags.size && (TAG.lastIndex = i) >= 0 && (m = TAG.exec(s)) && tags.has(m[2].toLowerCase())) {
        text(i);
        out.push({ k: 'g', tag: m[2].toLowerCase(), o: !m[1], s: m[0] });
        i += m[0].length;
        ts = i;
      } else if (spec && ((n - i <= 9 && partialTag(s.slice(i), tags)) || partialAuto(s, i))) {
        text(i);
        i = n;
        ts = n;
      } else i++;
    } else if (c === '&') {
      ENT.lastIndex = i;
      const m = ENT.exec(s);
      if (m) {
        text(i);
        out.push({ k: 't', s: entChar(m[1], m[2], m[3]) });
        i += m[0].length;
        ts = i;
      } else if (spec && n - i <= 9 && PARTIAL_ENT.test(s.slice(i)) && partialEnt(s.slice(i))) {
        text(i);
        i = n;
        ts = n;
      } else i++;
    } else if (c === '\n') {
      if (s[i - 1] === ' ' && s[i - 2] === ' ') {
        let t = i;
        while (t > ts && s[t - 1] === ' ') t--;
        text(t);
        out.push({ k: 'br' });
        ts = i + 1;
      }
      i++;
    } else if ((c === 'h' || c === 'H' || c === 'w' || c === 'W') && (i === 0 || !WORD.test(s[i - 1]))) {
      URLRE.lastIndex = i;
      const m = URLRE.exec(s);
      const u = m ? trimUrl(m[0]) : '';
      if (u.replace(/^(?:https?:\/\/|www\.)/i, '')) {
        text(i);
        out.push({ k: 'a', s: u, href: /^www\./i.test(u) ? 'https://' + u : u });
        i += u.length;
        ts = i;
      } else i++;
    } else if (c === '@') {
      const lm = /[A-Za-z0-9._+-]+$/.exec(s.slice(Math.max(ts, i - 64), i));
      DOMAIN.lastIndex = i + 1;
      const dm = DOMAIN.exec(s);
      if (lm && dm) {
        const dom = dm[0].replace(/[-_.]+$/, '');
        text(i - lm[0].length);
        out.push({ k: 'a', s: lm[0] + '@' + dom, href: 'mailto:' + lm[0] + '@' + dom });
        i += 1 + dom.length;
        ts = i;
      } else i++;
    } else if (math && c === '$') {
      if (s[i + 1] === '$') {
        const r = mathAt(i, 2, 'd', true);
        i = r >= 0 ? r : i + 2;
      } else if (math.dollar && i + 1 < n && !WS.test(s[i + 1])) {
        const j = dollarClose(s, i, spec);
        if (j > 0) {
          text(i);
          out.push({ k: 'm', s: s.slice(i + 1, j), disp: false });
          ts = i = j + 1;
        } else if (j === -2 && spec && s[i + 1] === '\\') {
          // A price never starts with a backslash, so this one is math that has not closed yet and hides its dollar like \( does.
          text(i);
          const body = escapedEnd(s) ? s.slice(i + 1, -1) : s.slice(i + 1);
          if (body) out.push({ k: 'm', s: body, disp: false, open: true });
          ts = i = n;
        } else i++;
      } else i++;
    } else i++;
  }
  text(n);
  const fin: N[] = [];
  for (const x of out) {
    if (x.k !== '[') fin.push(x);
    else if (!spec) fin.push({ k: 't', s: x.img ? '![' : '[' });
  }
  return resolve(fin, spec) as unknown as Inline[]; // no delimiter or bracket nodes survive resolve()
}
