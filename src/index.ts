import { type Al, atx, cells, LI, scan, spaces, type Unit } from './block';
import { HTML_TAGS, type Inline, parseInline } from './inline';
import { safeUrl } from './url';

export interface Options {
  /** Called when a rendered link is clicked. Return true if you handled it: limmat then calls preventDefault. If it throws, the error reaches window.onerror and the link behaves normally. */
  // biome-ignore lint/suspicious/noConfusingVoidType: a callback that returns nothing must type-check
  onLinkClick?: (href: string, event: MouseEvent) => boolean | void;
  /** Site-relative paths ('/research/x/') become links only if this returns true. Default: every path is a link. A throw counts as false. It gets the raw path including any query and hash, and may be called more than once per link while the reply streams. Check the whole path, not just a prefix: '/research/../admin' starts with '/research/'. */
  isInternalPath?: (path: string) => boolean;
  /** Protocols that may become links, with or without the colon and in any case. Default ['https', 'http', 'mailto']. Everything else renders as plain text. */
  allowedProtocols?: string[];
  /** Open http and https links in a new tab with rel="noopener noreferrer". Default true. false adds neither attribute, so links open in the same tab. */
  externalLinksNewTab?: boolean;
  /**
   * Safe HTML tags written without attributes (b, strong, i, em, u, s, del, ins, mark, small, kbd, sub, sup) become elements. Default true.
   * false shows them as text. An array narrows the list, and names outside the built-in list are ignored. A tag with any attribute, and every other tag, stays text. <br> always works.
   * The list also holds `details`, which turns on collapsible blocks (<details>, an optional <summary> line, content, </details>, each tag alone on its line). Leave it out of an array to turn them off.
   */
  html?: boolean | string[];
  /**
   * Images. Default true: `![alt](url)` becomes an <img> when the URL passes the same checks as a link, limited to http, https, and site paths.
   * An array of origins ('https://cdn.example.com') loads only from those, and site paths still work. false renders the alt text only.
   * An image loads as soon as it renders, with no click, so a hostile reply can use one to send data to a server it controls. If that matters, pass an origin list or false, or set a CSP img-src.
   */
  images?: boolean | string[];
  /** Called once when a code fence closes (or at end()). Receives the <code> element, its text, and the language. A throw or rejection is ignored and the plain text stays. */
  highlight?: (el: HTMLElement, code: string, lang: string) => void | Promise<void>;
  /** Minimum ms between re-renders of the open block. Default 50. 0 renders on every write. Non-finite values use the default. */
  throttleMs?: number;
  /** Prefix for every generated class. Default 'limmat'. The bundled style.css only styles the default prefix. */
  classPrefix?: string;
  /** Visible and accessible text, for translation. Defaults: copy 'Copy', copied 'Copied', table 'Table', done 'Completed', todo 'Not completed'. */
  labels?: { copy?: string; copied?: string; table?: string; done?: string; todo?: string };
}

/** The type of the `highlight` option, for adapters. */
export type Highlighter = NonNullable<Options['highlight']>;

export interface Renderer {
  /** Append markdown. Chunks may split anywhere. Ignored after end() until reset(), and after destroy(). */
  write(chunk: string): void;
  /** Finish the message: unfinished constructs become literal text, code blocks are highlighted. Safe to call twice. */
  end(): void;
  /** Clear the container and start a new message with the same options. */
  reset(): void;
  /** Stop timers and remove the click listener. The rendered DOM stays. A pending throttled render is dropped. */
  destroy(): void;
}

type Ctx = { k: 'l' | 't'; el: Element; ord?: boolean; al?: Al } | null;
interface St {
  tail: Entry[];
  fctx: Ctx;
  fl: number; // lines frozen so far, used only by the nested state of an open <details>
}
interface Entry {
  key: string;
  u: Unit;
  node: Element;
  made?: Element;
  ctx: Ctx;
  code?: HTMLElement;
  open?: boolean;
  hl?: [HTMLElement, string, string][]; // fences nested in this unit, highlighted once the unit is final
  sub?: St; // an open <details>: the incremental state of its inside
  hk?: string; // what the open <details> was opened with (opener, summary), a change rebuilds it
}
interface Built {
  n: Element;
  body?: Element;
  code?: HTMLElement;
}

const MAX_DEPTH = 12;

/**
 * Render streaming markdown into `container`, which is emptied first. Use one renderer per message and per container (two renderers on one container mix their output), and call `destroy()` when the element goes away.
 * The container has no live region, because announcing every chunk is noisy: to have the finished reply announced, set
 * `aria-busy` on your own element while streaming, or announce once after `end()`. The Copy button names the language,
 * tables and code blocks are keyboard-scrollable, task checkboxes have names, and the copy result goes to a polite status element.
 * @example
 * const r = createRenderer(el);
 * for await (const chunk of stream) r.write(chunk);
 * r.end();
 */
export function createRenderer(container: HTMLElement, options: Options = {}): Renderer {
  if (!container || typeof container.addEventListener !== 'function') throw new TypeError('limmat: container must be an element');
  container.replaceChildren(); // a remount (React StrictMode runs effects twice) would otherwise append to the last render
  const o = options;
  const protocols = (o.allowedProtocols ?? ['https', 'http', 'mailto']).map((p) => `${p}`.toLowerCase().replace(/:?$/, ':'));
  const internal = o.isInternalPath
    ? (p: string) => {
        try {
          return !!o.isInternalPath!(p);
        } catch {
          return false;
        }
      }
    : () => true;
  const originOf = (u: string) => {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.origin : '';
    } catch {
      return '';
    }
  };
  const imgProtocols = protocols.filter((p) => p === 'https:' || p === 'http:');
  const imgOrigins = Array.isArray(o.images) ? new Set(o.images.map((x) => originOf(`${x}`)).filter(Boolean)) : null;
  // Same gate as links (so hostile schemes and look-alike separators are refused), narrowed to http(s) and site paths, then the optional origin list.
  const imageSrc = (href: string) => {
    if (o.images === false) return null;
    const s = safeUrl(href, imgProtocols, internal);
    return s && (!imgOrigins || s[0] === '/' || imgOrigins.has(originOf(s))) ? s : null;
  };
  const newTab = o.externalLinksNewTab !== false;
  const tags: ReadonlySet<string> = new Set(
    o.html === false
      ? []
      : Array.isArray(o.html)
        ? o.html.map((x) => `${x}`.toLowerCase()).filter((x) => (HTML_TAGS as readonly string[]).includes(x))
        : HTML_TAGS,
  );
  const details =
    o.html === undefined || o.html === true || (Array.isArray(o.html) && o.html.some((x) => `${x}`.toLowerCase() === 'details'));
  const throttle = Number.isFinite(o.throttleMs) ? (o.throttleMs as number) : 50;
  const px = o.classPrefix ?? 'limmat';
  const lb = o.labels ?? {};
  const label = {
    copy: lb.copy ?? 'Copy',
    copied: lb.copied ?? 'Copied',
    table: lb.table ?? 'Table',
    done: lb.done ?? 'Completed',
    todo: lb.todo ?? 'Not completed',
  };
  const cls = (name: string) => `${px}-${name}`;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const opened = new WeakSet<Element>(); // <details> elements limmat opened itself: the author wrote `open`, or the block never closed
  let src = ''; // the text from the first line that is not frozen yet
  let held = ''; // a trailing CR or high surrogate waits for the next chunk, in case it is the first half of CRLF or of an emoji
  let ended = false;
  let dead = false;
  let epoch = 0; // bumped by reset(), so a copy that finishes late can tell its message is gone
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRun = -Infinity;

  // The <img> elements of the blocks that sync() is rebuilding, so a rebuilt open block keeps the images it already loaded.
  let imgPool: Map<string, HTMLElement[]> | null = null;
  const imgKey = (e: Element) => `${e.getAttribute('src')}\n${e.getAttribute('alt')}`;

  const h = (tag: string, c?: string, text?: string) => {
    const e = document.createElement(tag);
    if (c) e.className = c;
    if (text) e.textContent = text;
    return e;
  };

  const plain = (ns: Inline[]): string =>
    ns.map((n) => (n.k === 't' || n.k === 'c' || n.k === 'a' ? n.s : n.k === 'br' ? ' ' : plain(n.kids))).join('');

  function inline(parent: Element, s: string, spec: boolean) {
    const st: { nodes: Inline[]; i: number; el: Element; il: boolean }[] = [
      { nodes: parseInline(s, spec, tags), i: 0, el: parent, il: false },
    ];
    while (st.length) {
      const f = st[st.length - 1];
      if (f.i >= f.nodes.length) {
        st.pop();
        continue;
      }
      const x = f.nodes[f.i++];
      if (x.k === 't') f.el.append(x.s);
      else if (x.k === 'c') f.el.append(h('code', cls('inline-code'), x.s));
      else if (x.k === 'br') f.el.append(h('br'));
      else if (x.k === 'e') {
        const el = h(x.tag, x.tag === 'kbd' ? cls('kbd') : undefined);
        f.el.append(el);
        st.push({ nodes: x.kids, i: 0, el, il: f.il });
      } else {
        const isImg = x.k === 'l' && x.img;
        const src = x.k === 'l' && isImg ? imageSrc(x.href) : null;
        if (x.k === 'l' && src) {
          const alt = plain(x.kids);
          const kept = imgPool?.get(`${src}\n${alt}`)?.shift();
          if (kept) {
            f.el.append(kept);
            continue;
          }
          const im = h('img', cls('image'));
          for (const [k, v] of [
            ['alt', alt],
            ['loading', 'lazy'],
            ['decoding', 'async'],
            ['referrerpolicy', 'no-referrer'],
            ['src', src],
          ])
            im.setAttribute(k, v); // src last, so the other attributes are in place when the request starts
          f.el.append(im);
          continue;
        }
        const href = isImg ? null : safeUrl(x.href, protocols, internal);
        if (!href || f.il) {
          if (x.k === 'a') f.el.append(x.ang && !href ? `<${x.s}>` : x.s);
          else st.push({ nodes: x.kids, i: 0, el: f.el, il: true });
        } else {
          const a = h('a', cls('link'));
          a.setAttribute('href', href);
          if (newTab && /^https?:/i.test(href)) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          }
          f.el.append(a);
          if (x.k === 'a') a.append(x.s);
          else st.push({ nodes: x.kids, i: 0, el: a, il: true });
        }
      }
    }
  }

  function highlight(code: HTMLElement, text: string, lang: string) {
    if (!o.highlight) return;
    try {
      const r = o.highlight(code, text, lang);
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* the plain text stays */
    }
  }

  const dedent = (x: string, k: number) => x.slice(Math.min(spaces(x), k));
  const joinTrim = (ls: string[]) =>
    ls
      .map((x) => x.trimStart())
      .join('\n')
      .trimEnd();

  function fenceText(u: Extract<Unit, { k: 'f' }>, L: string[]) {
    return L.slice(u.a + 1, u.closed ? u.e - 1 : u.e)
      .map((x) => dedent(x, u.ind))
      .join('\n');
  }

  /**
   * Turn one unit into DOM. `spec` means the unit may still grow, so unfinished markup is closed speculatively.
   * `settled` means no more input can change it, so code is highlighted now. Fences nested in a quote or list item
   * are queued on `hl` instead, because their parent unit can still change until it is frozen.
   */
  function build(u: Unit, L: string[], spec: boolean, depth: number, settled: boolean, hl?: Entry['hl'], part = false): Built {
    switch (u.k) {
      case 'p': {
        const el = h('p');
        inline(el, joinTrim(L.slice(u.a, u.e)), spec);
        return { n: el };
      }
      case 'h': {
        const el = h('h' + u.lv);
        inline(el, atx(L[u.a])![1], spec);
        return { n: el };
      }
      case 'hr':
        return { n: h('hr') };
      case 'f': {
        const lang = u.lang;
        const text = fenceText(u, L);
        const wrap = h('div', cls('code'));
        const head = h('div', cls('code-head'));
        if (lang) {
          const l = h('span', cls('lang'), lang);
          l.setAttribute('aria-hidden', 'true');
          head.append(l);
        }
        const btn = h('button', cls('copy'), label.copy);
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-label', `${label.copy} ${lang || 'code'}`);
        const status = h('span', cls('status'));
        status.setAttribute('role', 'status');
        head.append(btn, status);
        const pre = h('pre');
        pre.setAttribute('tabindex', '0');
        // A language name that is longer than 20 characters or has other characters than these gets no class.
        const code = h('code', /^[\w+#-]{1,20}$/.test(lang) ? cls('lang-' + lang.toLowerCase()) : '');
        code.append(document.createTextNode(text));
        pre.append(code);
        wrap.append(head, pre);
        if (depth > 0) hl?.push([code, text, lang]);
        else if (u.closed || settled) highlight(code, text, lang);
        return { n: wrap, code };
      }
      case 'q': {
        const el = h('blockquote');
        blocks(
          L.slice(u.a, u.e).map((x) => x.replace(/^ {0,3}> ?/, '')),
          el,
          depth + 1,
          spec,
          false,
          hl,
          part,
        );
        return { n: el };
      }
      case 'd': {
        const el = h('details', cls('details'));
        if (u.open || (!u.closed && !spec)) {
          el.setAttribute('open', ''); // an unclosed block that is settled opens, so nothing stays hidden behind a click
          opened.add(el);
        }
        if (u.sum !== null) {
          const sm = h('summary', cls('summary'));
          inline(sm, u.sum, false);
          el.append(sm);
        }
        blocks(L.slice(u.bs, u.closed ? u.e - 1 : u.e), el, depth + 1, spec && !u.closed, false, hl, part);
        return { n: el };
      }
      case 'li': {
        const m = LI.exec(L[u.a])!;
        const body = [m[4] ?? '', ...L.slice(u.a + 1, u.e).map((x) => dedent(x, u.off))];
        const li = h('li');
        const tk = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]);
        if (tk) {
          li.className = cls('task');
          const box = h('input') as HTMLInputElement;
          box.type = 'checkbox';
          box.disabled = true;
          box.defaultChecked = tk[1] !== ' ';
          box.setAttribute('aria-label', tk[1] === ' ' ? label.todo : label.done);
          li.append(box);
          body[0] = body[0].slice(tk[0].length);
        }
        blocks(body, li, depth + 1, spec, true, hl, part);
        return { n: li };
      }
      case 'th': {
        const w = h('div', cls('table-wrap'));
        w.setAttribute('tabindex', '0');
        w.setAttribute('role', 'group');
        w.setAttribute('aria-label', label.table);
        const t = h('table');
        const tr = h('tr');
        cells(L[u.a]).forEach((c, i) => {
          const th = h('th');
          if (u.al[i]) th.style.textAlign = u.al[i] as string;
          inline(th, c, !!u.pend);
          tr.append(th);
        });
        const thead = h('thead');
        const body = h('tbody');
        thead.append(tr);
        t.append(thead, body);
        w.append(t);
        return { n: w, body };
      }
      case 'tr': {
        const tr = h('tr');
        const cs = cells(L[u.a]);
        u.al.forEach((a, i) => {
          const td = h('td');
          if (a) td.style.textAlign = a;
          inline(td, cs[i] ?? '', spec);
          tr.append(td);
        });
        return { n: tr };
      }
    }
  }

  function place(root: Element, ctx: Ctx, u: Unit, b: Built): { ctx: Ctx; made?: Element } {
    if (u.k === 'li') {
      if (ctx && ctx.k === 'l' && ctx.ord === u.ord) {
        ctx.el.append(b.n);
        return { ctx };
      }
      const l = h(u.ord ? 'ol' : 'ul', cls('list'));
      if (u.ord && u.num !== 1) l.setAttribute('start', String(u.num));
      l.append(b.n);
      root.append(l);
      return { ctx: { k: 'l', el: l, ord: u.ord }, made: l };
    }
    if (u.k === 'tr') {
      ctx!.el.append(b.n);
      return { ctx };
    }
    root.append(b.n);
    return { ctx: u.k === 'th' ? { k: 't', el: b.body!, al: u.al } : null };
  }

  function blocks(L: string[], parent: Element, depth: number, spec: boolean, unwrap: boolean, hl?: Entry['hl'], part = false) {
    if (depth > MAX_DEPTH) {
      const p = h('p');
      inline(p, joinTrim(L), spec);
      parent.append(p);
      return;
    }
    let ctx: Ctx = null;
    const U = scan(L, null, part, !part, details ? (spec ? 1 : 2) : 0, part);
    U.forEach((u, i) => {
      const sp = spec && i === U.length - 1; // only the last block can still be growing
      if (unwrap && i === 0 && u.k === 'p') return inline(parent, joinTrim(L.slice(u.a, u.e)), sp);
      ctx = place(parent, ctx, u, build(u, L, sp, depth, true, hl, part && u.b === L.length)).ctx;
    });
  }

  function runNested(e: Entry) {
    for (const [c, t, l] of e.hl ?? []) highlight(c, t, l);
    e.hl = undefined;
  }

  const mkSt = (): St => ({ tail: [], fctx: null, fl: 0 });
  let top = mkSt();

  const hkey = (u: Extract<Unit, { k: 'd' }>, L: string[]) => `${L[u.a]}\n${u.sum}\n${u.bs - u.a}`;

  /**
   * Diff and freeze for one level: the document, or the inside of an open <details> (its own St, so only its newest
   * blocks are rebuilt). A unit freezes, and its DOM is never touched again, only when a later unit starts on a
   * complete line. List and table context crosses the freeze point in `fctx`, and scan() gets the table alignment
   * through `tbl`. Returns how many lines of L became frozen. `q` collects the fences of a level below the top,
   * which are highlighted only once the outermost container is settled.
   */
  function sync(S: St, parent: Element, L: string[], partial: boolean, final: boolean, depth: number, q: Entry['hl'] | null): number {
    const tail = S.tail;
    const U = scan(L, S.fctx && S.fctx.k === 't' ? S.fctx.al! : null, partial, final, details ? (final ? 2 : 1) : 0, partial && !final);
    const hi = (c: HTMLElement, t: string, l: string) => (q ? q.push([c, t, l]) : highlight(c, t, l));
    const keys = U.map((u, i) => {
      const spec = !final && i === U.length - 1;
      const t = L.slice(u.a, u.e).join('\n');
      const pt = partial && !final && u.b === L.length && (u.k === 'q' || u.k === 'li' || u.k === 'd');
      return u.k === 'f'
        ? `f${u.closed ? 1 : 0}${t}`
        : `${u.k}${u.k === 'd' && u.closed ? 1 : ''}${spec ? '*' : ''}${pt ? '~' : ''}${u.k === 'th' && u.pend ? '?' : ''}${t}`;
    });
    let p = 0;
    while (p < tail.length && p < U.length && tail[p].key === keys[p]) p++;
    const e = tail[p];
    const u = U[p];
    if (e?.open && e.code && p < U.length && u.k === 'f' && e.u.k === 'f' && u.lang === e.u.lang) {
      const text2 = fenceText(u, L);
      const node = e.code.firstChild as Text;
      // appendData keeps a selection in the text, assigning to `data` collapses it.
      if (text2.startsWith(node.data)) node.appendData(text2.slice(node.data.length));
      else node.data = text2;
      e.key = keys[p];
      e.u = u;
      if (u.closed || final) {
        e.open = false;
        hi(e.code, text2, u.lang);
      }
      p++;
    } else if (e?.sub && p === U.length - 1 && u.k === 'd' && !u.closed && e.u.k === 'd' && hkey(u, L) === e.hk) {
      // An open <details> keeps its node (and the reader's toggle, focus, and selection): only its inside is synced.
      const inner = L.slice(u.bs, u.e);
      e.sub.fl += sync(e.sub, e.node, inner.slice(e.sub.fl), partial, final, depth + 1, e.hl!);
      if (final && !e.node.hasAttribute('open') && !opened.has(e.node)) {
        e.node.setAttribute('open', ''); // untouched by the reader: open it, as a settled unclosed block is
        opened.add(e.node);
      }
      e.key = keys[p];
      e.u = u;
      p++;
    }
    let ctx: Ctx = p > 0 ? tail[p - 1].ctx : S.fctx;
    const toggled: (boolean | null)[] = []; // per removed <details>, the state the reader left it in, or null if untouched
    const pool = new Map<string, HTMLElement[]>();
    for (const old of tail.splice(p)) {
      for (const im of old.node.querySelectorAll('img')) {
        const k = imgKey(im);
        pool.set(k, [...(pool.get(k) ?? []), im]);
      }
      for (const d of old.node.tagName === 'DETAILS' ? [old.node] : Array.from(old.node.querySelectorAll('details')))
        toggled.push((d as HTMLDetailsElement).open !== opened.has(d) ? (d as HTMLDetailsElement).open : null);
      old.node.remove();
      old.made?.remove();
    }
    const outerPool = imgPool;
    imgPool = pool;
    for (let i = p; i < U.length; i++) {
      const u = U[i];
      const hl: Entry['hl'] = [];
      const last = !final && i === U.length - 1;
      let b: Built;
      let sub: St | undefined;
      if (u.k === 'd' && !u.closed && depth < MAX_DEPTH) {
        // Open <details>: its own St, so the next flush syncs only what changed inside instead of rebuilding it all.
        b = build({ ...u, bs: u.e }, L, last, depth, final, hl);
        sub = mkSt();
        sub.fl += sync(sub, b.n, L.slice(u.bs, u.e), partial, final, depth + 1, hl);
      } else b = build(u, L, last, depth, final, hl, partial && !final && u.b === L.length);
      const r = place(parent, ctx, u, b);
      ctx = r.ctx;
      tail.push({
        key: keys[i],
        u,
        node: b.n,
        made: r.made,
        ctx,
        code: b.code,
        open: u.k === 'f' && !u.closed && !final,
        hl,
        sub,
        hk: u.k === 'd' ? hkey(u, L) : undefined,
      });
    }
    imgPool = outerPool;
    if (toggled.some((x) => x !== null)) {
      let k = 0;
      for (const t of tail.slice(p))
        for (const d of t.node.tagName === 'DETAILS' ? [t.node] : Array.from(t.node.querySelectorAll('details'))) {
          const was = toggled[k++];
          if (was !== null && was !== undefined) (d as HTMLDetailsElement).open = was;
        }
    }
    if (final)
      for (const t of tail) {
        if (t.open && t.code && t.u.k === 'f') {
          t.open = false;
          hi(t.code, t.code.textContent ?? '', t.u.lang);
        }
        if (q) q.push(...(t.hl ?? []));
        else runNested(t);
      }
    let k = Math.max(U.length - 1, 0);
    if (partial && k > 0 && U[k].a === L.length - 1) k--;
    if (!final && k > 0) {
      S.fctx = tail[k - 1].ctx;
      if (S.fctx && S.fctx.k === 't' && U[k - 1].b > U[k - 1].e) S.fctx = null;
      for (const t of tail.splice(0, k)) {
        if (q) q.push(...(t.hl ?? []));
        else runNested(t);
      }
      return U[k - 1].b;
    }
    return 0;
  }

  function flush(final: boolean) {
    const partial = !src.endsWith('\n');
    const L = src.split('\n');
    if (!partial) L.pop();
    const drop = sync(top, container, L, partial, final, 0, null);
    let cut = 0;
    for (let x = 0; x < drop; x++) cut += L[x].length + 1;
    src = src.slice(cut);
  }

  function schedule() {
    if (throttle <= 0) return flush(false);
    if (timer !== undefined) return;
    const wait = lastRun + throttle - Date.now();
    if (wait <= 0) {
      lastRun = Date.now();
      flush(false);
    } else
      timer = setTimeout(() => {
        timer = undefined;
        lastRun = Date.now();
        flush(false);
      }, wait);
  }

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const stopCopy = () => {
    timers.forEach(clearTimeout);
    timers.clear();
  };

  // The async Clipboard API needs a secure context, so fall back to execCommand on plain http.
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = h('textarea') as HTMLTextAreaElement;
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0'; // CSSOM, so a strict style-src policy allows it
      const prev = document.activeElement as HTMLElement | null;
      container.append(ta); // not document.body: behind a modal dialog the body is inert and the copy fails
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        /* not allowed */
      }
      ta.remove();
      prev?.focus?.(); // selecting the textarea moved focus
      return ok;
    }
  }

  function onClick(ev: MouseEvent) {
    const t = (ev.target as Element | null)?.closest?.('a,button');
    if (!t || !container.contains(t)) return;
    if (t.tagName === 'A') {
      if (o.onLinkClick?.(t.getAttribute('href') ?? '', ev) === true) ev.preventDefault();
    } else if (t.classList.contains(cls('copy'))) {
      const code = t.closest('.' + cls('code'))?.querySelector('code');
      const status = t.parentElement?.querySelector('.' + cls('status'));
      const ep = epoch;
      copy(code?.textContent ?? '').then((ok) => {
        if (!ok || dead || ep !== epoch) return;
        t.textContent = label.copied;
        if (status) status.textContent = label.copied;
        const id = setTimeout(() => {
          timers.delete(id);
          t.textContent = label.copy;
          if (status) status.textContent = '';
        }, 2000); // the Copied label shows for 2 seconds
        timers.add(id);
      });
    }
  }
  container.addEventListener('click', onClick);

  return {
    write(chunk) {
      if (dead || ended || !chunk) return;
      chunk = held + chunk;
      held = '';
      const c = chunk.charCodeAt(chunk.length - 1);
      if (c === 13 || (c >= 0xd800 && c < 0xdc00)) {
        held = chunk[chunk.length - 1];
        chunk = chunk.slice(0, -1);
      }
      chunk = chunk.replace(/\r\n?/g, '\n');
      if (!chunk) return;
      src += chunk;
      schedule();
    },
    end() {
      if (dead || ended) return;
      ended = true;
      stop();
      if (held) src += held === '\r' ? '\n' : held;
      held = '';
      flush(true);
    },
    reset() {
      if (dead) return;
      stop();
      stopCopy();
      epoch++;
      container.replaceChildren();
      src = '';
      held = '';
      top = mkSt();
      ended = false;
      lastRun = -Infinity;
    },
    destroy() {
      if (dead) return;
      stop();
      stopCopy();
      dead = true;
      container.removeEventListener('click', onClick);
    },
  };
}
