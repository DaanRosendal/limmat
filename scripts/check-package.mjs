// Packaging guard: the tarball holds exactly the intended files, a strict NodeNext consumer type-checks against it, and the
// packed code renders a document, both as dist/index.js and as the minified bundle. Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }))[0];
const files = pack.files.map((f) => f.path).sort();
const want = [
  'LICENSE',
  'README.md',
  'package.json',
  ...[
    'highlight.d.ts',
    'highlight.js',
    'index.d.ts',
    'index.js',
    'limmat.min.js',
    'react.d.ts',
    'react.js',
    'server.d.ts',
    'server.js',
    'svelte.d.ts',
    'svelte.js',
    'style.css',
    'style.css.d.ts',
    'vue.d.ts',
    'vue.js',
  ].map((f) => `dist/${f}`),
];
const bad = files.filter((f) => !want.includes(f));
const missing = want.filter((f) => !files.includes(f));
if (bad.length || missing.length) {
  console.error('unexpected files:', bad, 'missing files:', missing);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'limmat-consumer-'));
try {
  const pkg = join(dir, 'node_modules/limmat');
  mkdirSync(pkg, { recursive: true });
  // The real tarball, unpacked where a consumer's node_modules would hold it.
  const packed = join(dir, 'packed');
  mkdirSync(packed);
  // `npm publish --dry-run` exports npm_config_dry_run, which would make this nested pack write nothing.
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', packed], {
    stdio: 'ignore',
    env: { ...process.env, npm_config_dry_run: 'false' },
  });
  execFileSync('tar', ['-xzf', join(packed, readdirSync(packed)[0]), '-C', pkg, '--strip-components=1']);
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  // The frameworks a consumer of the wrappers has installed, taken from this repo's dev dependencies.
  for (const name of ['react', 'react-dom', 'vue', '@vue', '@types', 'csstype', 'svelte', 'scheduler']) {
    if (existsSync(join(process.cwd(), 'node_modules', name)))
      symlinkSync(join(process.cwd(), 'node_modules', name), join(dir, 'node_modules', name));
  }
  writeFileSync(
    join(dir, 'consumer.ts'),
    `import { createRenderer, type Highlighter, type Options, type Renderer } from 'limmat';
import 'limmat/style.css';
import { speedHighlight } from 'limmat/highlight';
import { renderToString, type ServerOptions } from 'limmat/server';
import { Markdown as ReactMarkdown, type MarkdownProps } from 'limmat/react';
import { Markdown as VueMarkdown } from 'limmat/vue';
import { limmat, type LimmatParams } from 'limmat/svelte';
import { createElement } from 'react';
import { h } from 'vue';
import type { Action } from 'svelte/action';
const rp: MarkdownProps = { text: 'x', done: true, options: { images: false }, className: 'c' };
createElement(ReactMarkdown, rp);
// @ts-expect-error text is required
createElement(ReactMarkdown, {});
h(VueMarkdown, { text: 'x', done: true, options: { images: false }, class: 'c' });
// @ts-expect-error text is a string
h(VueMarkdown, { text: 1 });
const sp: LimmatParams = { text: 'x', done: false };
const action: Action<HTMLElement, LimmatParams> = limmat;
limmat(null as unknown as HTMLElement, sp).update(sp);
void action;
const so: ServerOptions = { images: false, classPrefix: 'x' };
const html: string = renderToString('# x', so);
// @ts-expect-error a page is needed for highlight, so the server options leave it out
const noHl: ServerOptions = { highlight: speedHighlight() };
const el = null as unknown as HTMLElement;
const hl: Highlighter = speedHighlight();
const opts: Options = { highlight: hl, onLinkClick: () => {}, throttleMs: 0 };
const r: Renderer = createRenderer(el, opts);
r.write('x');
// @ts-expect-error speedHighlight() must be typed, not any
const notAny: number = speedHighlight();
`,
  );
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ['ES2022', 'DOM'],
        types: [],
      },
      files: ['consumer.ts'],
    }),
  );
  execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], { stdio: 'inherit', cwd: process.cwd() });

  // Run the packed code: stream one document through the package entry and through the minified bundle, with jsdom as the DOM.
  const jsdom = pathToFileURL(join(process.cwd(), 'node_modules/jsdom/lib/api.js')).href;
  writeFileSync(
    join(dir, 'run.mjs'),
    `import { JSDOM } from ${JSON.stringify(jsdom)};
const dom = new JSDOM('<div id="a"></div><div id="b"></div>');
Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node });
const { createRenderer } = await import('limmat');
const min = await import('limmat/limmat.min.js'); // the package's own export, as a bundler or a vendoring script would resolve it
const md = '# Hi\\n\\nSome **bold** and a [link](https://example.com).\\n\\n- a\\n- b\\n\\n| x | y |\\n|---|---|\\n| 1 | 2 |\\n';
const run = (create, id) => {
  const el = document.getElementById(id);
  const r = create(el, { throttleMs: 0 });
  for (const ch of md) r.write(ch);
  r.end();
  return el.innerHTML;
};
const a = run(createRenderer, 'a');
const b = run(min.createRenderer, 'b');
for (const want of ['<h1', '<strong>bold</strong>', 'href="https://example.com"', '<li>a</li>', '<table']) {
  if (!a.includes(want)) throw new Error('the packed renderer output lacks ' + want + ': ' + a);
}
if (a !== b) throw new Error('dist/index.js and dist/limmat.min.js render differently:\\n' + a + '\\n' + b);
`,
  );
  execFileSync(process.execPath, ['run.mjs'], { stdio: 'inherit', cwd: dir });

  // The server entry in a fresh process with no DOM at all, and the same output as the DOM path above.
  writeFileSync(
    join(dir, 'server.mjs'),
    `import { renderToString } from 'limmat/server';
if (typeof document !== 'undefined' || typeof window !== 'undefined') throw new Error('a DOM global exists, so this proves nothing');
const md = '# Hi\\n\\nSome **bold** and a [link](https://example.com).\\n\\n- a\\n- b\\n\\n| x | y |\\n|---|---|\\n| 1 | 2 |\\n';
const out = renderToString(md);
for (const want of ['<h1', '<strong>bold</strong>', 'href="https://example.com"', '<li>a</li>', '<table']) {
  if (!out.includes(want)) throw new Error('the packed server output lacks ' + want + ': ' + out);
}
`,
  );
  execFileSync(process.execPath, ['server.mjs'], { stdio: 'inherit', cwd: dir });

  // The wrappers with the real frameworks. First loaded and server-rendered with no DOM. Then, in a fresh process (Vue reads
  // `document` when it loads), mounted and streamed in jsdom.
  writeFileSync(
    join(dir, 'frameworks-ssr.mjs'),
    `import { createElement } from 'react';
import { renderToString as reactToString } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as vueToString } from 'vue/server-renderer';
import { Markdown as ReactMarkdown } from 'limmat/react';
import { Markdown as VueMarkdown } from 'limmat/vue';
import { limmat } from 'limmat/svelte';
if (typeof document !== 'undefined') throw new Error('a DOM global exists, so this proves nothing');
const empty = '<div></div>';
if (reactToString(createElement(ReactMarkdown, { text: '# x' })) !== empty) throw new Error('the React wrapper does not render an empty div on the server');
const vueHtml = await vueToString(createSSRApp({ render: () => h(VueMarkdown, { text: '# x' }) }));
if (vueHtml !== empty) throw new Error('the Vue wrapper does not render an empty div on the server: ' + vueHtml);
if (typeof limmat !== 'function') throw new Error('the Svelte action is missing');
`,
  );
  execFileSync(process.execPath, ['frameworks-ssr.mjs'], { stdio: 'inherit', cwd: dir });
  writeFileSync(
    join(dir, 'frameworks.mjs'),
    `import { JSDOM } from ${JSON.stringify(jsdom)};
const dom = new JSDOM('<div id="r"></div><div id="v"></div><div id="s"></div>');
Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement, Node: dom.window.Node });
const { createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const { createApp, h, nextTick, reactive } = await import('vue');
const { Markdown: ReactMarkdown } = await import('limmat/react');
const { Markdown: VueMarkdown } = await import('limmat/vue');
const { limmat } = await import('limmat/svelte');
const doc = '# Hi\\n\\nSome **bold** and a [link](https://example.com).\\n\\n- a\\n- b\\n';
const opts = { throttleMs: 0 };
const check = (name, html) => {
  for (const want of ['<h1', '<strong>bold</strong>', 'href="https://example.com"', '<li>a</li>']) if (!html.includes(want)) throw new Error(name + ' output lacks ' + want + ': ' + html);
};
const root = createRoot(document.getElementById('r'));
for (let i = 3; i < doc.length + 3; i += 3) flushSync(() => root.render(createElement(ReactMarkdown, { text: doc.slice(0, i), done: i >= doc.length, options: opts })));
await new Promise((r) => setTimeout(r, 20));
check('react', document.getElementById('r').firstElementChild.innerHTML);
const props = reactive({ text: '' });
createApp({ render: () => h(VueMarkdown, { text: props.text, done: props.text === doc, options: opts }) }).mount('#v');
for (let i = 3; i < doc.length + 3; i += 3) { props.text = doc.slice(0, i); await nextTick(); }
check('vue', document.getElementById('v').firstElementChild.innerHTML);
const box = document.getElementById('s');
const a = limmat(box, { text: '', options: opts });
for (let i = 3; i < doc.length + 3; i += 3) a.update({ text: doc.slice(0, i), done: i >= doc.length });
check('svelte', box.innerHTML);
const same = document.getElementById('r').firstElementChild.innerHTML;
if (same !== box.innerHTML || same !== document.getElementById('v').firstElementChild.innerHTML) throw new Error('the three wrappers render differently');
process.exit(0);
`,
  );
  execFileSync(process.execPath, ['frameworks.mjs'], { stdio: 'inherit', cwd: dir });

  // There is no CommonJS build: Node 22.12 and newer load an ES module from require(), which this checks.
  writeFileSync(
    join(dir, 'require.cjs'),
    `const { renderToString } = require('limmat/server');
const { createRenderer } = require('limmat');
if (typeof createRenderer !== 'function' || renderToString('# x') !== '<h1>x</h1>') throw new Error('require() does not load the package');
`,
  );
  execFileSync(process.execPath, ['require.cjs'], { stdio: 'inherit', cwd: dir });
  console.log(
    `package ok: ${files.length} files, NodeNext consumer type-checks, packed code renders, server entry renders with no DOM, the React, Vue, and Svelte wrappers type-check, server-render, and stream, and require() loads both entries`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
