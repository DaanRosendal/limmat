// Packaging guard: the tarball holds exactly the intended files, a strict NodeNext consumer type-checks against it, and the
// packed code renders a document, both as dist/index.js and as the minified bundle. Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }))[0];
const files = pack.files.map((f) => f.path).sort();
const want = [
  'LICENSE',
  'README.md',
  'package.json',
  ...['highlight.d.ts', 'highlight.js', 'index.d.ts', 'index.js', 'limmat.min.js', 'style.css'].map((f) => `dist/${f}`),
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
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', packed], { stdio: 'ignore' });
  execFileSync('tar', ['-xzf', join(packed, readdirSync(packed)[0]), '-C', pkg, '--strip-components=1']);
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(
    join(dir, 'consumer.ts'),
    `import { createRenderer, type Highlighter, type Options, type Renderer } from 'limmat';
import { speedHighlight } from 'limmat/highlight';
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
const min = await import('./node_modules/limmat/dist/limmat.min.js');
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
  console.log(`package ok: ${files.length} files, NodeNext consumer type-checks, packed code renders`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
