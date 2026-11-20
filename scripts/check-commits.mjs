// Fails if a commit subject in base..head is not a Conventional Commit. Usage: node scripts/check-commits.mjs <base> <head>
import { execFileSync } from 'node:child_process';
import { isConventional, TYPES } from './commit-subject.mjs';

const [base, head] = process.argv.slice(2);
if (!base || !head || /^0+$/.test(base)) {
  console.log('no commit range to check');
  process.exit(0);
}
const log = execFileSync('git', ['log', '--format=%h%x09%s', `${base}..${head}`], { encoding: 'utf8' });
const bad = log
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t'))
  .filter(([, subject]) => !isConventional(subject));
if (bad.length) {
  console.error(`These commits do not follow Conventional Commits (${TYPES.join(', ')}):`);
  for (const [sha, subject] of bad) console.error(`  ${sha} ${subject}`);
  process.exit(1);
}
console.log(`commit subjects ok: ${log.split('\n').filter(Boolean).length} commits`);
