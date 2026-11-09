// Fails on a relative link in a tracked Markdown file whose target file or heading does not exist.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const files = execFileSync('git', ['ls-files', '-z', '*.md'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const slug = (h) =>
  h
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
const anchors = (file) => new Set([...readFileSync(file, 'utf8').matchAll(/^#{1,6} +(.+)$/gm)].map((m) => slug(m[1])));
const bad = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = m[1];
    if (/^(https?:|mailto:)/.test(link)) continue;
    const [path, frag] = link.split('#');
    const target = path ? join(dirname(f), path) : f;
    if (!existsSync(target)) bad.push(`${f}: missing file ${link}`);
    else if (frag && target.endsWith('.md') && !anchors(target).has(frag)) bad.push(`${f}: missing heading #${frag} in ${target}`);
  }
}
if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(1);
}
console.log(`links ok: ${files.length} Markdown files`);
