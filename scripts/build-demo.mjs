// Builds the demo page into demo/out/. The page runs the exact dist build of limmat, so run `npm run build` first.
// No bundler for the page itself: only copies, a bundle of the optional highlighter with its language chunks,
// a merged support.json for the table, and release.json (version plus hash) so the page can prove what it runs.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { rows, specCounts } from './support-data.mjs';

const out = 'demo/out';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const f of ['index.html', '_headers']) copyFileSync(`demo/${f}`, `${out}/${f}`);
for (const dir of ['css', 'js']) cpSync(`demo/${dir}`, `${out}/${dir}`, { recursive: true });
cpSync('demo/assets', out, { recursive: true });
copyFileSync('dist/limmat.min.js', `${out}/limmat.min.js`);
copyFileSync('dist/style.css', `${out}/limmat.css`);

// The highlighter adapter plus @speed-highlight/core, split so each language loads on demand (no import map needed).
await build({
  entryPoints: ['src/highlight.ts'],
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  outdir: `${out}/hl`,
  entryNames: 'highlight',
  chunkNames: 'chunk-[hash]',
  legalComments: 'none',
  logLevel: 'error',
});

// The optional math: KaTeX behind limmat/katex as one file, with its stylesheet and the fonts that current browsers load (woff2).
// KaTeX's own license comment stays at the end of the file.
await build({
  stdin: {
    contents: "import katex from 'katex'; import { katexMath } from './src/katex.ts'; export const math = katexMath(katex);",
    resolveDir: process.cwd(),
    sourcefile: 'math-entry.js',
  },
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  outfile: `${out}/math/math.js`,
  legalComments: 'eof',
  logLevel: 'error',
});
copyFileSync('node_modules/katex/dist/katex.min.css', `${out}/math/katex.css`);
mkdirSync(`${out}/math/fonts`);
for (const f of readdirSync('node_modules/katex/dist/fonts'))
  if (f.endsWith('.woff2')) copyFileSync(`node_modules/katex/dist/fonts/${f}`, `${out}/math/fonts/${f}`);

const support = rows.map((r) => {
  const spec = specCounts(r);
  return { feature: r.feature, status: r.status, note: r.note ?? '', spec: spec?.total ? `${spec.pass}/${spec.total}` : '' };
});
writeFileSync(`${out}/support.json`, JSON.stringify(support));

const min = readFileSync(`${out}/limmat.min.js`);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const release = {
  version: pkg.version,
  sha256: createHash('sha256').update(min).digest('hex'),
  bytes: min.length,
  gzip: gzipSync(min, { level: 9 }).length,
};
writeFileSync(`${out}/release.json`, JSON.stringify(release));
console.log(`demo built: limmat ${release.version}, ${release.sha256.slice(0, 12)}`);
