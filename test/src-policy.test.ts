import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The safety rules from AGENTS.md that no linter enforces for us: src/ builds DOM only through
// createElement and text nodes, and never needs anything that a strict Content-Security-Policy would block.
const FORBIDDEN: [RegExp, string][] = [
  [/\.(?:innerHTML|outerHTML)\b/, 'innerHTML or outerHTML'],
  [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/\bdocument\.write(?:ln)?\b/, 'document.write'],
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\bsetAttribute\(\s*['"]style['"]/i, 'a string style attribute (blocked by a strict style-src)'],
  [/\bsetAttribute\(\s*['"]on\w+['"]/i, 'an event-handler attribute'],
  [/\bsrcdoc\b/, 'srcdoc'],
];

const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const violations = (code: string) => FORBIDDEN.filter(([re]) => re.test(strip(code))).map(([, name]) => name);

describe('src/ safety policy', () => {
  it('the scanner flags each forbidden construct (self-test)', () => {
    for (const bad of [
      'el.innerHTML = x',
      'el.outerHTML = x',
      'el.insertAdjacentHTML("beforeend", x)',
      'document.write(x)',
      'eval(x)',
      'new Function(x)',
      "el.setAttribute('style', 'a:b')",
      "el.setAttribute('onclick', 'x()')",
      'f.srcdoc = x',
    ])
      expect(violations(bad), bad).not.toEqual([]);
    expect(violations('// el.innerHTML = x is forbidden\nel.textContent = x')).toEqual([]);
  });

  for (const file of readdirSync('src').filter((f) => f.endsWith('.ts'))) {
    it(`src/${file} uses none of them`, () => {
      expect(violations(readFileSync(join('src', file), 'utf8'))).toEqual([]);
    });
  }
});

describe('browser support guards', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
  it('no regex lookbehind in the source: Safari before 16.4 cannot even parse it', () => {
    for (const f of ['src/block.ts', 'src/inline.ts', 'src/index.ts', 'src/url.ts']) expect(src(f), f).not.toMatch(/\(\?<[!=]/);
  });
  it('the stylesheet has plain fallbacks before the color-mix upgrade', () => {
    const css = src('src/style.css');
    expect(css).toMatch(/--limmat-border:\s*rgba?\(/);
    expect(css).toMatch(/@supports \(color: color-mix/);
  });
});
