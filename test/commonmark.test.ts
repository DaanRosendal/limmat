import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from './helpers/util';

interface Example {
  example: number;
  section: string;
  markdown: string;
  html: string;
}
const spec: Example[] = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/commonmark-spec.json'), 'utf8'));
const FAILS = join(process.cwd(), 'test/fixtures/commonmark-known-failures.json');
const SECTIONS = join(process.cwd(), 'test/fixtures/commonmark-sections.json');

// Sections that are out of scope for v0.1 (listed in the README table as not yet or partial).
const OUT_OF_SCOPE: Record<string, string> = {
  Tabs: 'tabs are not expanded',
  'Entity and numeric character references': 'entities are shown literally',
  'Setext headings': 'setext headings are not supported',
  'Indented code blocks': 'indented code blocks are not supported',
  'HTML blocks': 'raw HTML is shown as text',
  'Raw HTML': 'raw HTML is shown as text',
  'Link reference definitions': 'reference links are not supported',
  Inlines: 'precedence example uses reference-style input',
};
const BLOCKS = 'p|ul|ol|li|blockquote|h[1-6]|pre|hr|div';

/** Canonical HTML: our DOM and the expected HTML are both reduced to the same shape. */
function canon(root: Element): string {
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return (n.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const e = n as Element;
    const tag = e.tagName.toLowerCase();
    const kids = () => Array.from(e.childNodes).map(walk).join('');
    if (tag === 'div' && e.className.includes('-code')) {
      const code = e.querySelector('code')!;
      return `<pre><code>${walk(code.firstChild ?? document.createTextNode(''))}</code></pre>`;
    }
    if (tag === 'input' || tag === 'span' || tag === 'button') return '';
    let attrs = '';
    if (tag === 'a') attrs = ` href="${e.getAttribute('href')}"`;
    if (tag === 'ol' && e.getAttribute('start')) attrs = ` start="${e.getAttribute('start')}"`;
    if (tag === 'img') return `<img src="${e.getAttribute('src')}" alt="${e.getAttribute('alt')}">`;
    if (tag === 'br' || tag === 'hr') return `<${tag}>`;
    return `<${tag}${attrs}>${kids()}</${tag}>`;
  };
  let s = Array.from(root.childNodes).map(walk).join('');
  const pres: string[] = [];
  s = s.replace(
    /<pre>[\s\S]*?<\/pre>/g,
    (m) => `§PRE${pres.push(m.replace(/\n(<\/code><\/pre>)$/, '$1').replace(/\n<\/code>/, '</code>')) - 1}§`,
  );
  s = s.replace(new RegExp(`\\s*(</?(?:${BLOCKS})(?: [^>]*)?>)\\s*`, 'g'), '$1').replace(/\s*<br>\s*/g, '<br>');
  s = s.replace(/<li><p>/g, '<li>').replace(/<\/p><\/li>/g, '</li>');
  return s.replace(/§PRE(\d+)§/g, (_, i) => pres[+i]).trim();
}

function run(ex: Example): boolean {
  try {
    const exp = document.createElement('div');
    exp.innerHTML = ex.html;
    return canon(render(ex.markdown)) === canon(exp);
  } catch {
    return false;
  }
}

describe('CommonMark spec examples for the supported subset', () => {
  const inScope = spec.filter((e) => !OUT_OF_SCOPE[e.section]);
  const results = new Map(inScope.map((e) => [e.example, run(e)]));
  const failing = [...results].filter(([, ok]) => !ok).map(([n]) => n);

  it('reports the pass rate', () => {
    expect(inScope.length).toBeGreaterThan(400);
    expect(inScope.length - failing.length).toBeGreaterThan(300);
    if (process.env.SHOW && process.env.OUT) {
      for (const ex of inScope.filter((e) => failing.includes(e.example) && process.env.SHOW!.split(',').includes(e.section))) {
        const exp = document.createElement('div');
        exp.innerHTML = ex.html;
        appendFileSync(
          process.env.OUT!,
          `#${ex.example} ${JSON.stringify(ex.markdown)}\n  want ${canon(exp)}\n  got  ${canon(render(ex.markdown))}\n`,
        );
      }
    }
    process.stdout.write(
      `CommonMark in-scope examples: ${inScope.length - failing.length} of ${inScope.length} pass (${spec.length - inScope.length} out of scope)\n`,
    );
    if (process.env.UPDATE_CONFORMANCE) writeFileSync(FAILS, `${JSON.stringify(failing)}\n`);
  });

  const known: number[] = JSON.parse(readFileSync(FAILS, 'utf8'));
  // Honest per-section numbers for the README, including the sections we do not aim for (what passes there is by accident).
  const sectionStats = () => {
    const out: Record<string, { pass: number; total: number; scope: 'in' | 'out' }> = {};
    for (const e of spec) {
      const row = (out[e.section] ??= { pass: 0, total: 0, scope: OUT_OF_SCOPE[e.section] ? 'out' : 'in' });
      row.total++;
      if (results.get(e.example) ?? run(e)) row.pass++;
    }
    return out;
  };
  it('keeps the per-section pass counts in the fixture current (UPDATE_CONFORMANCE=1 refreshes them)', () => {
    const stats = sectionStats();
    if (process.env.UPDATE_CONFORMANCE) writeFileSync(SECTIONS, `${JSON.stringify(stats, null, 1)}\n`);
    expect(stats).toEqual(JSON.parse(readFileSync(SECTIONS, 'utf8')));
  });
  it('has no new failures', () => {
    expect(failing.filter((n) => !known.includes(n))).toEqual([]);
  });
  it('has no stale entries in the known failures list (run with UPDATE_CONFORMANCE=1 to prune)', () => {
    expect(known.filter((n) => results.get(n) === true)).toEqual([]);
  });
});

describe('CommonMark examples written in chunks', () => {
  // The spec is only checked whole above. Streaming must give the same DOM for every example, passing or not.
  it('render the same when streamed one character, a few characters, or at random sizes at a time', () => {
    const bad: string[] = [];
    for (const ex of spec) {
      const whole = render(ex.markdown).innerHTML;
      for (const split of ['char', 3, 'random'] as const) {
        const got = render(ex.markdown, split, {}, ex.example).innerHTML;
        if (got !== whole) {
          bad.push(`example ${ex.example} (${split}): ${JSON.stringify(ex.markdown)}`);
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
