// Packaging guard: the tarball holds exactly the intended files, and a strict NodeNext consumer type-checks against it.
// Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }))[0];
const files = pack.files.map((f) => f.path).sort();
const bad = files.filter((f) => !/^(dist\/[\w.-]+|package\.json|README\.md|LICENSE|CHANGELOG\.md)$/.test(f));
const need = ['dist/index.js', 'dist/index.d.ts', 'dist/highlight.js', 'dist/highlight.d.ts', 'dist/style.css', 'dist/limmat.min.js'];
const missing = need.filter((f) => !files.includes(f));
if (bad.length || missing.length) {
  console.error('unexpected files:', bad, 'missing files:', missing);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'limmat-consumer-'));
try {
  const pkg = join(dir, 'node_modules/limmat');
  mkdirSync(pkg, { recursive: true });
  cpSync('dist', join(pkg, 'dist'), { recursive: true });
  cpSync('package.json', join(pkg, 'package.json'));
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
      compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext', strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM'], types: [] },
      files: ['consumer.ts'],
    }),
  );
  execFileSync('npx', ['tsc', '-p', join(dir, 'tsconfig.json')], { stdio: 'inherit', cwd: process.cwd() });
  console.log(`package ok: ${files.length} files, NodeNext consumer type-checks`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
