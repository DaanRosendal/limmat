import { type Al, atx, cells, LI, scan, spaces, type Unit } from './block';
import { type Inline, parseInline } from './inline';
import { safeUrl } from './url';

export interface Options {
  /** Called when a rendered link is clicked. Return true if you handled it: limmat then calls preventDefault. If it throws, the error reaches window.onerror and the link behaves normally. */
  // biome-ignore lint/suspicious/noConfusingVoidType: a callback that returns nothing must type-check
  onLinkClick?: (href: string, event: MouseEvent) => boolean | void;
  /** Site-relative paths ('/research/x/') become links only if this returns true. Default: every path is a link. A throw counts as false. */
  isInternalPath?: (path: string) => boolean;
  /** Protocols that may become links, with or without the colon and in any case. Default ['https', 'http', 'mailto']. Everything else renders as plain text. */
  allowedProtocols?: string[];
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
interface Entry {
  key: string;
  u: Unit;
  node: Element;
  made?: Element;
  ctx: Ctx;
  code?: HTMLElement;
  open?: boolean;
  hl?: [HTMLElement, string, string][]; // fences nested in this unit, highlighted once the unit is final
}
interface Built {
  n: Element;
  body?: Element;
  code?: HTMLElement;
}

const MAX_DEPTH = 12;

/**
 * Render streaming markdown into `container`.
 * @example
 * const r = createRenderer(el);
 * for await (const chunk of stream) r.write(chunk);
 * r.end();
 */
export function createRenderer(container: HTMLElement, options: Options = {}): Renderer {
  if (!container || typeof container.addEventListener !== 'function') throw new TypeError('limmat: container must be an element');
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

  let src = '';
  let froz = 0;
  let fctx: Ctx = null;
  let tail: Entry[] = [];
  let held = ''; // a trailing CR waits for the next chunk, in case it is the first half of CRLF
  let ended = false;
  let dead = false;
  let epoch = 0; // bumped by reset(), so a copy that finishes late can tell its message is gone
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRun = -Infinity;

  const h = (tag: string, c?: string, text?: string) => {
    const e = document.createElement(tag);
    if (c) e.className = c;
    if (text) e.textContent = text;
    return e;
  };

  function inline(parent: Element, s: string, spec: boolean) {
    const st: { nodes: Inline[]; i: number; el: Element; il: boolean }[] = [{ nodes: parseInline(s, spec), i: 0, el: parent, il: false }];
    while (st.length) {
      const f = st[st.length - 1];
      if (f.i >= f.nodes.length) {
        st.pop();
        continue;
      }
      const x = f.nodes[f.i++];
      if (x.k === 't') f.el.append(x.s);
      else if (x.k === 'c') f.el.append(h('code', '', x.s));
      else if (x.k === 'br') f.el.append(h('br'));
      else if (x.k === 'e') {
        const el = h(x.tag);
        f.el.append(el);
        st.push({ nodes: x.kids, i: 0, el, il: f.il });
      } else {
        const href = x.k === 'l' && x.img ? null : safeUrl(x.href, protocols, internal);
        if (!href || f.il) {
          if (x.k === 'a') f.el.append(x.s);
          else st.push({ nodes: x.kids, i: 0, el: f.el, il: true });
        } else {
          const a = h('a', cls('link'));
          a.setAttribute('href', href);
          if (/^https?:/i.test(href)) {
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
  function build(u: Unit, L: string[], spec: boolean, depth: number, settled: boolean, hl?: Entry['hl']): Built {
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
        );
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
        blocks(body, li, depth + 1, spec, true, hl);
        return { n: li };
      }
      case 'th': {
        const w = h('div', cls('table-wrap'));
        w.setAttribute('tabindex', '0');
        w.setAttribute('role', 'region');
        w.setAttribute('aria-label', label.table);
        const t = h('table');
        const tr = h('tr');
        cells(L[u.a]).forEach((c, i) => {
          const th = h('th');
          if (u.al[i]) th.style.textAlign = u.al[i] as string;
          inline(th, c, false);
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

  function blocks(L: string[], parent: Element, depth: number, spec: boolean, unwrap: boolean, hl?: Entry['hl']) {
    if (depth > MAX_DEPTH) {
      const p = h('p');
      inline(p, joinTrim(L), spec);
      parent.append(p);
      return;
    }
    let ctx: Ctx = null;
    const U = scan(L, null, false, true);
    U.forEach((u, i) => {
      const sp = spec && i === U.length - 1; // only the last block can still be growing
      if (unwrap && i === 0 && u.k === 'p') return inline(parent, joinTrim(L.slice(u.a, u.e)), sp);
      ctx = place(parent, ctx, u, build(u, L, sp, depth, true, hl)).ctx;
    });
  }

  function runNested(e: Entry) {
    for (const [c, t, l] of e.hl ?? []) highlight(c, t, l);
    e.hl = undefined;
  }

  /*
   * Incremental render. `src` is split into units by scan(), but only from `froz`, the offset of the first line that
   * is not yet frozen. Rules that keep chunked output identical to whole output:
   *  1. A unit is frozen (its DOM is never touched again) only when a LATER unit exists that starts on a complete
   *     line, because only then can nothing the stream adds change how that unit is parsed or rendered.
   *  2. A tail entry's `key` holds everything that affects its DOM (kind, text, speculative or open state), so an
   *     unchanged key means the existing node can stay. The first changed key tears down everything after it.
   *  3. List and table context does not live in the units: `fctx` carries the open list or table across the freeze
   *     point, and scan() gets the table alignment through its `tbl` argument. A blank line ends a table in both.
   *  4. An open fence updates its text in place, so the node, scroll position, and selection survive.
   * test/freeze.test.ts and test/chunk-fuzz.test.ts hold these rules to account.
   */
  function flush(final: boolean) {
    const text = src.slice(froz);
    const partial = !text.endsWith('\n');
    const L = text.split('\n');
    if (!partial) L.pop();
    const U = scan(L, fctx && fctx.k === 't' ? fctx.al! : null, partial, final);
    const keys = U.map((u, i) => {
      const spec = !final && i === U.length - 1;
      const t = L.slice(u.a, u.e).join('\n');
      return u.k === 'f' ? `f${u.closed ? 1 : 0}${t}` : `${u.k}${spec ? '*' : ''}${u.k === 'th' && u.pend ? '?' : ''}${t}`;
    });
    let p = 0;
    while (p < tail.length && p < U.length && tail[p].key === keys[p]) p++;
    const e = tail[p];
    const u = U[p];
    if (e?.open && e.code && p < U.length && u.k === 'f' && e.u.k === 'f' && u.lang === e.u.lang) {
      const text2 = fenceText(u, L);
      (e.code.firstChild as Text).data = text2;
      e.key = keys[p];
      e.u = u;
      if (u.closed || final) {
        e.open = false;
        highlight(e.code, text2, u.lang);
      }
      p++;
    }
    let ctx: Ctx = p > 0 ? tail[p - 1].ctx : fctx;
    for (const old of tail.splice(p)) {
      old.node.remove();
      old.made?.remove();
    }
    for (let i = p; i < U.length; i++) {
      const u = U[i];
      const hl: Entry['hl'] = [];
      const b = build(u, L, !final && i === U.length - 1, 0, final, hl);
      const r = place(container, ctx, u, b);
      ctx = r.ctx;
      tail.push({ key: keys[i], u, node: b.n, made: r.made, ctx, code: b.code, open: u.k === 'f' && !u.closed && !final, hl });
    }
    if (final)
      for (const t of tail) {
        if (t.open && t.code && t.u.k === 'f') {
          t.open = false;
          highlight(t.code, t.code.textContent ?? '', t.u.lang);
        }
        runNested(t);
      }
    let k = Math.max(U.length - 1, 0);
    if (partial && k > 0 && U[k].a === L.length - 1) k--;
    if (!final && k > 0) {
      fctx = tail[k - 1].ctx;
      if (fctx && fctx.k === 't' && U[k - 1].b > U[k - 1].e) fctx = null;
      let off = 0;
      for (let x = 0; x < U[k - 1].b; x++) off += L[x].length + 1;
      froz += off;
      for (const t of tail.splice(0, k)) runNested(t);
    }
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
      document.body.append(ta);
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
        }, 2000);
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
      if (chunk.endsWith('\r')) {
        held = '\r';
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
      if (held) src += '\n';
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
      froz = 0;
      fctx = null;
      tail = [];
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
