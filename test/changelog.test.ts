import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CHANGELOG.md is also the text of each GitHub release, so a bullet is a short note, not a spec (see AGENTS.md).
const MAX = 300;
const bullets = readFileSync('CHANGELOG.md', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('- '));

describe('changelog', () => {
  it('has bullets', () => {
    expect(bullets.length).toBeGreaterThan(20);
  });

  it(`keeps every bullet under ${MAX} characters`, () => {
    const long = bullets.filter((b) => b.length > MAX).map((b) => `${b.length}: ${b.slice(0, 70)}...`);
    expect(long).toEqual([]);
  });
});
