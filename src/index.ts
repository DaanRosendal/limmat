import { ATX, LI, cells, scan, spaces, type Al, type Unit } from './block';
import { parseInline, type N } from './inline';
import { safeUrl } from './url';

export interface Options {
  /** Return true if you handled the click. limmat then calls preventDefault. */
  onLinkClick?: (href: string, event: MouseEvent) => boolean | void;
  /** Site-relative paths ('/research/x/') are links only if this returns true. Default: all paths are links. */
  isInternalPath?: (path: string) => boolean;
  /** Default ['https:', 'http:', 'mailto:']. Everything else renders as plain text. */
  allowedProtocols?: string[];
  /** Called once when a code fence closes. Receives the <code> element. */
  highlight?: (el: HTMLElement, code: string, lang: string) => void | Promise<void>;
  /** Minimum ms between re-renders of the open block. Default 50. 0 renders on every write. */
  throttleMs?: number;
  /** Prefix for every generated class. Default 'limmat'. */
  classPrefix?: string;
  labels?: { copy?: string; copied?: string; table?: string };
}

export interface Renderer {
  write(chunk: string): void;
  end(): void;
  reset(): void;
  destroy(): void;
}

type Ctx = { k: 'l' | 't'; el: Element; ord?: boolean; al?: Al } | null;
interface Entry { key: string; u: Unit; node: Element; made?: Element; ctx: Ctx; code?: HTMLElement; open?: boolean }
interface Built { n: Element; body?: Element; code?: HTMLElement; text?: string }

const MAX_DEPTH = 12;

export function createRenderer(container: HTMLElement, options: Options = {}): Renderer {
  const o = options;
  const protocols = o.allowedProtocols ?? ['https:', 'http:', 'mailto:'];
  const internal = o.isInternalPath ?? (() => true);
  const throttle = o.throttleMs ?? 50;
  const px = o.classPrefix ?? 'limmat';
  const label = { copy: 'Copy', copied: 'Copied', table: 'Table', ...o.labels };
  const cls = (name: string) => `${px}-${name}`;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  let src = '';
  let froz = 0;
  let fctx: Ctx = null;
  let tail: Entry[] = [];
  let ended = false;
  let dead = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRun = -Infinity;

  const h = (tag: string, c?: string, text?: string) => {
    const e = document.createElement(tag);
    if (c) e.className = c;
    if (text) e.textContent = text;
    return e;
  };

  function inline(parent: Element, s: string, spec: boolean) {
    const st: { nodes: N[]; i: number; el: Element; il: boolean }[] = [{ nodes: parseInline(s, spec), i: 0, el: parent, il: false }];
    while (st.length) {
      const f = st[st.length - 1];
      if (f.i >= f.nodes.length) { st.pop(); continue; }
      const x = f.nodes[f.i++];
      if (x.k === 't') f.el.append(x.s!);
      else if (x.k === 'c') f.el.append(h('code', '', x.s));
      else if (x.k === 'br') f.el.append(h('br'));
      else if (x.k === 'e') {
        const el = h(x.tag!);
        f.el.append(el);
        st.push({ nodes: x.kids!, i: 0, el, il: f.il });
      } else {
        const href = x.img ? null : safeUrl(x.href!, protocols, internal);
        if (!href || f.il) {
          if (x.k === 'a') f.el.append(x.s!);
          else st.push({ nodes: x.kids!, i: 0, el: f.el, il: true });
        } else {
          const a = h('a', cls('link'));
          a.setAttribute('href', href);
          if (/^https?:/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
          f.el.append(a);
          if (x.k === 'a') a.append(x.s!);
          else st.push({ nodes: x.kids!, i: 0, el: a, il: true });
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
  const joinTrim = (ls: string[]) => ls.map((x) => x.trimStart()).join('\n').trimEnd();

  function fenceText(u: Unit, L: string[]) {
    return L.slice(u.a + 1, u.closed ? u.e - 1 : u.e).map((x) => dedent(x, u.ind!)).join('\n');
  }

  function build(u: Unit, L: string[], spec: boolean, depth: number, final: boolean): Built {
    switch (u.k) {
      case 'p': {
        const el = h('p');
        inline(el, joinTrim(L.slice(u.a, u.e)), spec);
        return { n: el };
      }
      case 'h': {
        const el = h('h' + u.lv);
        inline(el, ATX.exec(L[u.a])![2] ?? '', spec);
        return { n: el };
      }
      case 'hr':
        return { n: h('hr') };
      case 'f': {
        const lang = u.lang!;
        const text = fenceText(u, L);
        const wrap = h('div', cls('code'));
        const head = h('div', cls('code-head'));
        if (lang) { const l = h('span', cls('lang'), lang); l.setAttribute('aria-hidden', 'true'); head.append(l); }
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
        if (u.closed || final) highlight(code, text, lang);
        return { n: wrap, code, text };
      }
      case 'q': {
        const el = h('blockquote');
        blocks(L.slice(u.a, u.e).map((x) => x.replace(/^ {0,3}> ?/, '')), el, depth + 1, spec, false);
        return { n: el };
      }
      case 'li': {
        const m = LI.exec(L[u.a])!;
        const body = [m[4] ?? '', ...L.slice(u.a + 1, u.e).map((x) => dedent(x, u.off!))];
        const li = h('li');
        const tk = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]);
        if (tk) {
          const box = h('input') as HTMLInputElement;
          box.type = 'checkbox';
          box.disabled = true;
          box.defaultChecked = tk[1] !== ' ';
          li.append(box);
          body[0] = body[0].slice(tk[0].length);
        }
        blocks(body, li, depth + 1, spec, true);
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
          if (u.al![i]) th.style.textAlign = u.al![i]!;
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
      default: {
        const tr = h('tr');
        const cs = cells(L[u.a]);
        u.al!.forEach((a, i) => {
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
      if (ctx && ctx.k === 'l' && ctx.ord === u.ord) { ctx.el.append(b.n); return { ctx }; }
      const l = h(u.ord ? 'ol' : 'ul', cls('list'));
      if (u.ord && u.num !== 1) l.setAttribute('start', String(u.num));
      l.append(b.n);
      root.append(l);
      return { ctx: { k: 'l', el: l, ord: u.ord }, made: l };
    }
    if (u.k === 'tr') { ctx!.el.append(b.n); return { ctx }; }
    root.append(b.n);
    return { ctx: u.k === 'th' ? { k: 't', el: b.body!, al: u.al } : null };
  }

  function blocks(L: string[], parent: Element, depth: number, spec: boolean, unwrap: boolean) {
    if (depth > MAX_DEPTH) {
      const p = h('p');
      inline(p, joinTrim(L), spec);
      parent.append(p);
      return;
    }
    let ctx: Ctx = null;
    scan(L, null, false, true).forEach((u, i) => {
      if (unwrap && i === 0 && u.k === 'p') return inline(parent, joinTrim(L.slice(u.a, u.e)), spec);
      ctx = place(parent, ctx, u, build(u, L, spec, depth, true)).ctx;
    });
  }

  function flush(final: boolean) {
    const text = src.slice(froz);
    const partial = !text.endsWith('\n');
    const L = text.split('\n');
    if (!partial) L.pop();
    const U = scan(L, fctx && fctx.k === 't' ? fctx.al! : null, partial, final);
    const keys = U.map((u, i) => {
      const spec = !final && i === U.length - 1;
      const t = L.slice(u.a, u.e).join('\n');
      return u.k === 'f' ? `f${u.closed ? 1 : 0}${t}` : `${u.k}${spec ? '*' : ''}${u.pend ? '?' : ''}${t}`;
    });
    let p = 0;
    while (p < tail.length && p < U.length && tail[p].key === keys[p]) p++;
    const e = tail[p];
    if (e && p < U.length && e.open && e.code && U[p].k === 'f' && U[p].lang === e.u.lang) {
      const u = U[p];
      const text2 = fenceText(u, L);
      (e.code.firstChild as Text).data = text2;
      e.key = keys[p];
      e.u = u;
      if (u.closed || final) { e.open = false; highlight(e.code, text2, u.lang!); }
      p++;
    }
    let ctx: Ctx = p > 0 ? tail[p - 1].ctx : fctx;
    for (const old of tail.splice(p)) { old.node.remove(); old.made?.remove(); }
    for (let i = p; i < U.length; i++) {
      const u = U[i];
      const b = build(u, L, !final && i === U.length - 1, 0, final);
      const r = place(container, ctx, u, b);
      ctx = r.ctx;
      tail.push({ key: keys[i], u, node: b.n, made: r.made, ctx, code: b.code, open: u.k === 'f' && !u.closed && !final });
    }
    if (final) for (const t of tail) if (t.open && t.code) { t.open = false; highlight(t.code, t.code.textContent ?? '', t.u.lang!); }
    let k = Math.max(U.length - 1, 0);
    if (partial && k > 0 && U[k].a === L.length - 1) k--;
    if (!final && k > 0) {
      fctx = tail[k - 1].ctx;
      if (fctx && fctx.k === 't' && U[k - 1].b > U[k - 1].e) fctx = null;
      let off = 0;
      for (let x = 0; x < U[k - 1].b; x++) off += L[x].length + 1;
      froz += off;
      tail.splice(0, k);
    }
  }

  function schedule() {
    if (throttle <= 0) return flush(false);
    if (timer !== undefined) return;
    const wait = lastRun + throttle - Date.now();
    if (wait <= 0) { lastRun = Date.now(); flush(false); }
    else timer = setTimeout(() => { timer = undefined; lastRun = Date.now(); flush(false); }, wait);
  }

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    timers.forEach(clearTimeout);
    timers.clear();
  };

  function onClick(ev: MouseEvent) {
    const t = (ev.target as Element | null)?.closest?.('a,button');
    if (!t || !container.contains(t)) return;
    if (t.tagName === 'A') {
      if (o.onLinkClick?.(t.getAttribute('href') ?? '', ev) === true) ev.preventDefault();
    } else if (t.classList.contains(cls('copy'))) {
      const code = t.closest('.' + cls('code'))?.querySelector('code');
      const status = t.parentElement?.querySelector('.' + cls('status'));
      Promise.resolve(navigator.clipboard?.writeText(code?.textContent ?? '')).then(
        () => {
          t.textContent = label.copied;
          if (status) status.textContent = label.copied;
          const id = setTimeout(() => {
            timers.delete(id);
            t.textContent = label.copy;
            if (status) status.textContent = '';
          }, 2000);
          timers.add(id);
        },
        () => {},
      );
    }
  }
  container.addEventListener('click', onClick);

  return {
    write(chunk) {
      if (dead || ended || !chunk) return;
      src += chunk;
      schedule();
    },
    end() {
      if (dead || ended) return;
      ended = true;
      stop();
      flush(true);
    },
    reset() {
      if (dead) return;
      stop();
      container.replaceChildren();
      src = '';
      froz = 0;
      fctx = null;
      tail = [];
      ended = false;
      lastRun = -Infinity;
    },
    destroy() {
      if (dead) return;
      stop();
      dead = true;
      container.removeEventListener('click', onClick);
    },
  };
}
