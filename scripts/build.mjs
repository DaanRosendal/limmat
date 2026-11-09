import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
const common = { bundle: true, format: 'esm', target: 'es2022', logLevel: 'error', legalComments: 'none' };
// Readable ESM for npm, plus a minified single file that can be vendored as is.
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/limmat.min.js', minify: true });
await build({ ...common, entryPoints: ['src/highlight.ts'], outfile: 'dist/highlight.js', external: ['@speed-highlight/core'] });
copyFileSync('src/style.css', 'dist/style.css');
execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
writeFileSync('dist/limmat.min.js', '// limmat, MIT, Copyright (c) 2026 Daan Rosendal\n' + readFileSync('dist/limmat.min.js', 'utf8'));
const min = readFileSync('dist/limmat.min.js');
console.log(`dist/limmat.min.js ${min.length} B, ${gzipSync(min, { level: 9 }).length} B gzip, ${brotliCompressSync(min).length} B brotli`);
