// Size ratchet: no fixed target, but a jump of more than 10% over the recorded baseline fails the build.
// After an intentional change, run `npm run size -- --update` and say why in the commit message.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const r = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: ['chrome86', 'firefox78', 'safari14.1'],
  minify: true,
  write: false,
  legalComments: 'none',
});
const gz = gzipSync(r.outputFiles[0].contents, { level: 9 }).length;
const file = '.size-baseline.json';
if (process.argv.includes('--update')) {
  writeFileSync(file, `{ "core": ${gz} }\n`);
  console.log(`baseline set to ${gz} B gzip`);
} else {
  // The README states the size, so the figure has to stay near the real one.
  const claim = /([\d.]+) kB gzip/.exec(readFileSync('README.md', 'utf8'));
  if (!claim) {
    console.error('README.md has no "N kB gzip" figure');
    process.exit(1);
  }
  if (Math.abs(Number(claim[1]) * 1000 - gz) > gz * 0.05) {
    console.error(`README.md says ${claim[1]} kB gzip but the core is ${(gz / 1000).toFixed(1)} kB: update the README`);
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(file, 'utf8')).core;
  const pct = (((gz - base) / base) * 100).toFixed(1);
  console.log(`core: ${gz} B gzip (baseline ${base} B, ${pct}%)`);
  if (gz > base * 1.1) {
    console.error('core grew by more than 10%: justify it, then run `npm run size -- --update`');
    process.exit(1);
  }
}
