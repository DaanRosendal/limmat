import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script with no declaration
import { isConventional } from '../scripts/commit-subject.mjs';

describe('commit subject rule', () => {
  it('accepts Conventional Commits', () => {
    for (const s of [
      'feat: add alerts',
      'fix(block): keep a lazy line in its item',
      'docs: say when a deviation is allowed',
      'chore(deps): bump esbuild',
      'refactor!: rename an option',
      'style(demo): flat page background',
      'Merge branch "x" into master',
    ])
      expect(isConventional(s), s).toBe(true);
  });
  it('rejects everything else', () => {
    for (const s of [
      'Add alerts',
      'fix:no space',
      'fix: ',
      'Fix: capital',
      'feature: unknown type',
      'fix(Scope): upper case scope',
      'wip',
      '',
      'Bump esbuild from 1 to 2',
    ])
      expect(isConventional(s), s).toBe(false);
  });
  it('the whole history of this repository passes', async () => {
    const { execFileSync } = await import('node:child_process');
    let log = '';
    try {
      log = execFileSync('git', ['log', '--format=%s', '-200'], { encoding: 'utf8' });
    } catch {
      return; // not a git checkout (a source tarball)
    }
    const bad = log.split('\n').filter((s) => s && !isConventional(s));
    expect(bad).toEqual([]);
  });
});
