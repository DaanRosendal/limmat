// @vitest-environment node
// Runs with no `document` or `window` global, like a server: the renderer must use only the container's own document.
import { Window } from 'happy-dom';
import { JSDOM } from 'jsdom';
import { parseHTML } from 'linkedom';
import { describe, expect, it, vi } from 'vitest';
import { createRenderer, type Options } from '../src/index';
import { CORPUS, REPLY, XSS } from './helpers/cases';
import { chunks } from './helpers/util';

type Mount = () => HTMLElement;
const libs: Record<string, Mount> = {
  jsdom: () => new JSDOM('<body><div id="r"></div></body>').window.document.getElementById('r') as HTMLElement,
  linkedom: () => parseHTML('<!doctype html><body><div id="r"></div></body>').document.getElementById('r') as unknown as HTMLElement,
  'happy-dom': () => {
    const w = new Window();
    w.document.body.innerHTML = '<div id="r"></div>';
    return w.document.getElementById('r') as unknown as HTMLElement;
  },
};

// The tree as tag, sorted attributes, and text. Attribute order, quoting, and escaping belong to each library's serializer.
type N = {
  nodeType: number;
  data?: string;
  textContent: string | null;
  localName?: string;
  attributes?: ArrayLike<{ name: string; value: string }>;
  childNodes: ArrayLike<N>;
};
const norm = (n: N): string => {
  if (n.nodeType === 3) return JSON.stringify(n.data ?? n.textContent);
  const a = Array.from(
    n.attributes ?? [],
    (x) => `${x.name}=${JSON.stringify(x.name === 'style' ? x.value.replace(/[\s;]/g, '') : x.value)}`,
  ).sort();
  return `<${n.localName} ${a.join(' ')}>${Array.from(n.childNodes, norm).join('')}</${n.localName}>`;
};
const run = (mount: Mount, md: string, options: Options = {}, split: 'whole' | 'random' = 'whole') => {
  const el = mount();
  const r = createRenderer(el, { throttleMs: 0, ...options });
  for (const c of chunks(md, split)) r.write(c);
  r.end();
  return norm(el as unknown as N);
};

const docs: [string, string][] = [['reply', REPLY], ...CORPUS.map((c, i) => [`corpus ${i}`, c] as [string, string]), ...XSS];

describe('on a server, with no global document', () => {
  it('there is no global document or window here', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
  for (const lib of ['linkedom', 'happy-dom']) {
    describe(lib, () => {
      it('renders every test document to the same tree as jsdom, whole and in chunks', () => {
        const bad: string[] = [];
        for (const [name, md] of docs)
          for (const split of ['whole', 'random'] as const) {
            const want = run(libs.jsdom, md, {}, split);
            let got: string;
            try {
              got = run(libs[lib], md, {}, split);
            } catch (e) {
              got = `threw ${(e as Error).message}`;
            }
            if (got !== want) bad.push(`${name} (${split})`);
          }
        expect(bad).toEqual([]);
      });
      it('honors the options', () => {
        const o: Options = { images: false, classPrefix: 'x', html: ['kbd'], externalLinksNewTab: false };
        for (const [name, md] of docs.slice(0, 40)) expect(run(libs[lib], md, o), name).toBe(run(libs.jsdom, md, o));
      });
    });
  }
  it('end() leaves the final output in place with no timer pending, so it can be read right away', () => {
    vi.useFakeTimers();
    try {
      for (const mount of Object.values(libs)) {
        const el = mount();
        const before = vi.getTimerCount(); // a library may start timers of its own
        const r = createRenderer(el); // the default throttle: later writes wait for a timer
        for (let i = 0; i < REPLY.length; i += 9) r.write(REPLY.slice(i, i + 9));
        r.end();
        expect(vi.getTimerCount()).toBe(before);
        expect(el.querySelector('h2')?.textContent).toBe("Ada's research");
        expect(el.querySelectorAll('table').length).toBe(1);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
