import { describe, expect, it, vi } from 'vitest';

// Deterministic guard for the incremental design: finished blocks are frozen, so the text scanned per write
// must stay flat as the reply grows. If freezing breaks, the work per write grows with the whole reply.
const stats = { lines: 0, calls: 0 };
vi.mock('../src/block', async (orig) => {
  const m = await orig<typeof import('../src/block')>();
  return {
    ...m,
    scan: (L: string[], ...rest: [any, any, any]) => {
      stats.lines += L.length;
      stats.calls++;
      return m.scan(L, ...rest);
    },
  };
});
const { createRenderer } = await import('../src/index');

function linesPerWrite(make: (i: number) => string, n: number) {
  const r = createRenderer(document.createElement('div'), { throttleMs: 0 });
  const per: number[] = [];
  for (let i = 0; i < n; i++) {
    stats.lines = 0;
    r.write(make(i));
    per.push(stats.lines);
  }
  return per;
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe('work per write stays flat as the reply grows', () => {
  const cases: [string, (i: number) => string][] = [
    ['paragraphs', (i) => `paragraph ${i} with *some* text\n\n`],
    ['list items', (i) => `- item ${i} with *em*\n`],
    ['table rows', (i) => (i === 0 ? '| a | b |\n|--|--|\n' : `| ${i} | x |\n`)],
    ['fences', (i) => `\`\`\`js\ncode ${i}\n\`\`\`\n\n`],
  ];
  for (const [name, make] of cases) {
    it(name, () => {
      const per = linesPerWrite(make, 400);
      expect(avg(per.slice(-50))).toBeLessThan(avg(per.slice(20, 70)) * 2 + 8);
      expect(Math.max(...per.slice(-50))).toBeLessThan(60);
    });
  }
});
