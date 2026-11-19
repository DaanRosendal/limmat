import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The README's Options table is written by hand, so this keeps it in step with `Options` in src/index.ts:
// every option has exactly one row, and no row names an option that no longer exists.
const src = readFileSync('src/index.ts', 'utf8');
const readme = readFileSync('README.md', 'utf8');

const body = src.slice(src.indexOf('export interface Options {'));
const options = [...body.slice(0, body.indexOf('\n}\n')).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);

const section = readme.slice(readme.indexOf('## Options'));
const rows = [...section.slice(0, section.indexOf('\n## ', 1)).matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]);

describe('README Options table', () => {
  it('reads the option names from the source (self-test)', () => {
    expect(options).toContain('throttleMs');
    expect(options).toContain('labels');
    expect(options.length).toBeGreaterThan(5);
  });

  it('has one row per option, and no others', () => {
    expect([...rows].sort()).toEqual([...options].sort());
  });
});
