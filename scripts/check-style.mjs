// Writing rule: no em dashes or en dashes in any tracked file (the repo uses hyphens, commas, and colons).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
// Built from char codes so this file does not contain the characters it forbids.
const DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
const bad = [];
for (const f of files) {
  if (/\.(png|jpg|gif|ico|woff2?)$/.test(f) || f.startsWith('test/fixtures/commonmark-spec')) continue;
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (DASH.test(line)) bad.push(`${f}:${i + 1}`);
    });
}
if (bad.length) {
  console.error(`em or en dash found (use hyphens, commas, or colons):\n${bad.join('\n')}`);
  process.exit(1);
}
console.log(`style ok: ${files.length} files without em or en dashes`);
