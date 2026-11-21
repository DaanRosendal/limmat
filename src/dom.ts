// A tiny DOM and its HTML serializer, just enough for createRenderer to build into on a server (see server.ts), so the
// string path shares the parser and the builder with the browser path. Only the calls src/index.ts makes are here.
// This is the one place in limmat that writes HTML text, so it escapes every character of text and of attribute values.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const NAME = /^[A-Za-z][\w-]*$/; // a tag or attribute name is written as is, so it may only be a plain name
const text = (s: string) => s.replace(/[& <>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;'));
const attr = (s: string) =>
  s.replace(/[& "<>]/g, (c) => (c === '&' ? '&amp;' : c === '"' ? '&quot;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;'));

export class Tx {
  nodeType = 3;
  parentElement: El | null = null;
  constructor(public data: string) {}
  get textContent() {
    return this.data;
  }
  appendData(s: string) {
    this.data += s;
  }
  remove() {
    unlink(this);
  }
}

type Kid = El | Tx;
const unlink = (n: Kid) => {
  const p = n.parentElement;
  if (p) p.kids.splice(p.kids.indexOf(n), 1);
  n.parentElement = null;
};

export class El {
  nodeType = 1;
  parentElement: El | null = null;
  kids: Kid[] = [];
  attrs = new Map<string, string>();
  constructor(public localName: string) {
    if (!NAME.test(localName)) throw new TypeError('limmat: bad tag name');
  }
  get tagName() {
    return this.localName.toUpperCase();
  }
  get firstChild() {
    return this.kids[0] ?? null;
  }
  get className() {
    return this.attrs.get('class') ?? '';
  }
  set className(v: string) {
    this.setAttribute('class', v);
  }
  get classList() {
    return {
      add: (c: string) => {
        const t = this.className.split(' ').filter(Boolean);
        if (!t.includes(c)) this.setAttribute('class', [...t, c].join(' '));
      },
      contains: (c: string) => this.className.split(' ').includes(c),
    };
  }
  // Only the table alignment is set through the CSSOM. In a string it can only be a style attribute (see SECURITY.md).
  get style() {
    const self = this;
    return {
      set textAlign(v: string) {
        self.attrs.set('style', `text-align: ${v};`);
      },
    };
  }
  get textContent(): string {
    return this.kids.map((k) => k.textContent).join('');
  }
  set textContent(v: string) {
    this.replaceChildren(...(v ? [v] : []));
  }
  setAttribute(k: string, v: string) {
    if (!NAME.test(k)) throw new TypeError('limmat: bad attribute name');
    this.attrs.set(k, `${v}`);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  append(...ns: (Kid | string)[]) {
    for (const n of ns) {
      const k = typeof n === 'string' ? new Tx(n) : n;
      unlink(k);
      k.parentElement = this;
      this.kids.push(k);
    }
  }
  replaceChildren(...ns: (Kid | string)[]) {
    for (const k of this.kids) k.parentElement = null;
    this.kids = [];
    this.append(...ns);
  }
  remove() {
    unlink(this);
  }
  contains(n: Kid) {
    for (let p: El | null = n as El; p; p = p.parentElement) if (p === this) return true;
    return false;
  }
  // A tag name is the only selector the renderer uses while it builds.
  querySelectorAll(tag: string): El[] {
    const out: El[] = [];
    for (const k of this.kids)
      if (k instanceof El) {
        if (k.localName === tag) out.push(k);
        out.push(...k.querySelectorAll(tag));
      }
    return out;
  }
  /** The element as HTML. */
  html(): string {
    const a = [...this.attrs].map(([k, v]) => ` ${k}="${attr(v)}"`).join('');
    return VOID.has(this.localName) ? `<${this.localName}${a}>` : `<${this.localName}${a}>${this.inner()}</${this.localName}>`;
  }
  inner(): string {
    return this.kids.map((k) => (k instanceof Tx ? text(k.data) : k.html())).join('');
  }
}

/** A container to render into, and a function that gives what it holds as HTML. */
export function createDom(): { root: El; html: () => string } {
  const root = new El('div') as El & { ownerDocument?: unknown; addEventListener?: () => void; removeEventListener?: () => void };
  root.ownerDocument = { createElement: (t: string) => new El(t), createTextNode: (s: string) => new Tx(s) };
  root.addEventListener = root.removeEventListener = () => {}; // there is no one to click
  return { root, html: () => root.inner() };
}
