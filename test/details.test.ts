import { describe, expect, it, vi } from 'vitest';
import type { Options } from '../src/index';
import { audit, html, mk, render, renderOpen } from './helpers/util';

const M = '<details>\n<summary>S</summary>\nB\n</details>';
const OPEN_ATTR = '<details open=""><summary>S</summary><p>B</p></details>';
const WELL = '<details><summary>S</summary><p>B</p></details>';
const details = (root: Element) => Array.from(root.querySelectorAll('details'));

describe('details blocks', () => {
  it('a well-formed block becomes details and summary, with or without blank lines inside', () => {
    expect(html(render(M))).toBe(WELL);
    expect(html(render('<details>\n<summary>S</summary>\n\nB\n\n</details>'))).toBe(WELL);
    expect(html(renderOpen(M))).toBe(WELL);
  });

  it('open and uppercase', () => {
    expect(html(render('<details open>\n<summary>S</summary>\nB\n</details>'))).toBe(OPEN_ATTR);
    expect(html(render('<DETAILS OPEN>\n<SUMMARY>S</SUMMARY>\nB\n</DETAILS>'))).toBe(OPEN_ATTR);
  });

  it('the element has only the class and, if authored, open', () => {
    const d = details(render('<details open>\n<summary>S</summary>\nB\n</details>'))[0];
    expect(
      Array.from(d.attributes)
        .map((a) => a.name)
        .sort(),
    ).toEqual(['class', 'open']);
    expect(d.querySelector('summary')!.attributes.length).toBe(1);
    expect(d.firstElementChild!.tagName).toBe('SUMMARY');
  });

  for (const opener of [
    '<details class=x>',
    '<details open onclick=alert(1)>',
    '<details  open>',
    '<details open >',
    '<details open="">',
    '<details open=open>',
    '<details/>',
    '<details />',
    '< details>',
    '<details >',
    '<details\nopen>',
    '<details>x',
    '<detailſ>',
    '<DETAİLS>',
    '<details​>',
  ])
    it(`the opener ${JSON.stringify(opener)} stays text`, () => {
      const md = `${opener}\nB\n</details>`;
      const root = render(md);
      expect(details(root).length).toBe(0);
      const expected = md
        .split('\n')
        .map((l) => l.trimStart())
        .join('\n')
        .replace(/\n(?=[^\n]*$)/, '');
      expect(root.textContent).toBe(expected);
    });

  describe('the summary', () => {
    it('no summary line is fine', () => {
      expect(html(render('<details>\nB\n</details>'))).toBe('<details><p>B</p></details>');
    });
    it('is parsed as inline markdown, with the usual link and image checks', () => {
      expect(html(render('<details>\n<summary>T *e* **s** `c` <kbd>k</kbd></summary>\nB\n</details>'))).toBe(
        '<details><summary>T <em>e</em> <strong>s</strong> <code>c</code> <kbd>k</kbd></summary><p>B</p></details>',
      );
      const s = render(
        '<details>\n<summary>[l](https://e.com) [x](javascript:alert(1)) ![i](/a.png)</summary>\nB\n</details>',
      ).querySelector('summary')!;
      expect(s.querySelector('a')!.getAttribute('href')).toBe('https://e.com');
      expect(s.querySelectorAll('a').length).toBe(1);
      expect(s.querySelector('img')!.getAttribute('src')).toBe('/a.png');
    });
    it('the one-line opener with a summary works', () => {
      expect(html(render('<details><summary>S</summary>\nB\n</details>'))).toBe(WELL);
      expect(html(render('<details open><summary>S</summary>\nB\n</details>'))).toBe(OPEN_ATTR);
      expect(html(render('<DETAILS><SUMMARY>S</SUMMARY>\nB\n</DETAILS>'))).toBe(WELL);
    });
    for (const [name, md] of [
      ['an empty summary', '<details>\n<summary></summary>\nB\n</details>'],
      ['a blank summary', '<details>\n<summary>  </summary>\nB\n</details>'],
      ['text after the closing tag', '<details>\n<summary>S</summary> t\nB\n</details>'],
      ['text before the opening tag', '<details>\nx<summary>S</summary>\nB\n</details>'],
      ['an attribute', '<details>\n<summary onclick=alert(1)>S</summary>\nB\n</details>'],
      ['a blank line before it', '<details>\n\n<summary>S</summary>\nB\n</details>'],
      ['not first', '<details>\nintro\n<summary>S</summary>\nB\n</details>'],
      ['two lines', '<details>\n<summary>L1\nL2</summary>\nB\n</details>'],
      ['the one-line form with trailing text', '<details><summary>S</summary> t\nB\n</details>'],
    ] as const)
      it(`${name} is not a summary: it stays text and no summary element exists`, () => {
        const root = render(md);
        expect(root.querySelector('summary')).toBeNull();
        expect(root.textContent).toContain('<summary');
      });
  });

  describe('the body', () => {
    it('holds lists, tables, fences, and nested details', () => {
      expect(html(render('<details>\n- a\n- b\n</details>'))).toBe('<details><ul><li>a</li><li>b</li></ul></details>');
      expect(render('<details>\n| a |\n|---|\n| 1 |\n</details>').querySelector('details td')!.textContent).toBe('1');
      const f = render('<details>\n```js\nlet x;\n```\n</details>');
      expect(f.querySelector('details pre code')!.textContent).toBe('let x;');
      expect(html(render('<details>\n<summary>A</summary>\n<details>\n<summary>B</summary>\nx\n</details>\n</details>'))).toBe(
        '<details><summary>A</summary><details><summary>B</summary><p>x</p></details></details>',
      );
    });
    it('a closer inside a fence does not close the block', () => {
      const root = render('<details>\n```\n</details>\n```\nafter\n</details>');
      expect(details(root).length).toBe(1);
      expect(root.querySelector('details code')!.textContent).toBe('</details>');
      expect(root.querySelector('details p')!.textContent).toBe('after');
    });
    it('blank lines inside are just content', () => {
      expect(html(render('<details>\nA\n\n\nB\n</details>'))).toBe('<details><p>A</p><p>B</p></details>');
    });
    it('an empty block is an empty details element', () => {
      expect(html(render('<details>\n</details>'))).toBe('<details></details>');
      expect(html(render('<details>\n<summary>S</summary>\n</details>'))).toBe('<details><summary>S</summary></details>');
    });
    it('works inside a list item and a blockquote', () => {
      expect(html(render('- item\n  <details>\n  <summary>S</summary>\n  B\n  </details>\n- next'))).toBe(
        `<ul><li>item${WELL}</li><li>next</li></ul>`,
      );
      expect(html(render('> <details>\n> <summary>S</summary>\n>\n> B\n> </details>'))).toBe(`<blockquote>${WELL}</blockquote>`);
    });
    it('a block between paragraphs splits them, and two blocks in a row are siblings', () => {
      expect(html(render('Intro:\n<details>\nB\n</details>\nOutro'))).toBe('<p>Intro:</p><details><p>B</p></details><p>Outro</p>');
      expect(details(render(`${M}\n${M}`)).length).toBe(2);
      expect(details(render(`${M}\n\n${M}`)).length).toBe(2);
    });
    it('depth is capped like blockquotes: 13 levels render, the rest is text', () => {
      const md = `${'<details>\n'.repeat(14)}x\n${'</details>\n'.repeat(14)}`;
      const root = render(md);
      expect(details(root).length).toBe(13);
      expect(root.textContent).toContain('x');
    });
  });

  describe('closers', () => {
    it('a closer may be indented up to 3 spaces and have trailing blanks', () => {
      expect(html(render('<details>\nB\n   </details>'))).toBe('<details><p>B</p></details>');
      expect(html(render('<details>\nB\n</details>  \t'))).toBe('<details><p>B</p></details>');
    });
    it('a closer indented 4 or followed by text is not a closer', () => {
      for (const c of ['    </details>', '</details> x', '</details>x']) {
        const root = render(`<details>\nB\n${c}`);
        expect(html(root)).toBe(`<details open=""><p>B\n${c.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p></details>`);
      }
    });
    it('an unmatched closer is a literal paragraph, and it ends the paragraph before it', () => {
      expect(html(render('</details>'))).toBe('<p>&lt;/details&gt;</p>');
      expect(html(render('a\n</details>\nb'))).toBe('<p>a</p><p>&lt;/details&gt;\nb</p>');
      expect(html(render(`${M}\n</details>`))).toBe(`${WELL}<p>&lt;/details&gt;</p>`);
      expect(html(render(`</details>\n${M}`))).toBe(`<p>&lt;/details&gt;</p>${WELL}`);
    });
  });

  describe('an opener that never closes', () => {
    it('while streaming it is a collapsed details with what has arrived', () => {
      expect(html(renderOpen('<details>\n<summary>S</summary>\nB'))).toBe(WELL);
      expect(html(renderOpen('<details open>\n<summary>S</summary>\nB'))).toBe(OPEN_ATTR);
    });
    it('at the end of the message it still renders, and opens, so nothing stays hidden', () => {
      expect(html(render('<details>\n<summary>S</summary>\nB'))).toBe(OPEN_ATTR);
      expect(html(render('<details>\nB'))).toBe('<details open=""><p>B</p></details>');
    });
    it('the inside is final at the end: unmatched markers are text and code is complete', () => {
      expect(html(render('<details>\n**x'))).toBe('<details open=""><p>**x</p></details>');
      expect(html(renderOpen('<details>\n**x'))).toBe('<details><p><strong>x</strong></p></details>');
      expect(render('<details>\n```js\nlet x;').querySelector('details code')!.textContent).toBe('let x;');
    });
    it('a summary alone is enough content', () => {
      expect(html(render('<details>\n<summary>S</summary>'))).toBe('<details open=""><summary>S</summary></details>');
    });
    it('an opener indented four spaces is indented code, so no details element appears', () => {
      const root = render('    <details>\nB\n</details>');
      expect(details(root).length).toBe(0);
      expect(root.querySelector('code')!.textContent).toBe('<details>');
      expect(Array.from(root.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['B', '</details>']);
    });
    it('a lone opener with nothing after it stays text at the end, and shows nothing while streaming', () => {
      expect(html(render('<details>'))).toBe('<p>&lt;details&gt;</p>');
      expect(html(render('text\n<details>\n\n'))).toBe('<p>text</p><p>&lt;details&gt;</p>');
      expect(html(renderOpen('text\n<details>'))).toBe('<p>text</p>');
      expect(html(renderOpen('text\n<details>\n'))).toBe('<p>text</p>');
    });
    it('an unclosed outer block around a closed inner one', () => {
      expect(html(render('<details>\n<details>\nx\n</details>'))).toBe('<details open=""><details><p>x</p></details></details>');
      expect(html(renderOpen('<details>\n<details>\nx\n</details>'))).toBe('<details><details><p>x</p></details></details>');
    });
    it('an unclosed block in a blockquote runs to the end of the quote', () => {
      expect(html(render('> <details>\n> x\n\nafter'))).toBe('<blockquote><details open=""><p>x</p></details></blockquote><p>after</p>');
    });
  });

  describe('the html option', () => {
    const literal = '<p>&lt;details&gt;\n&lt;summary&gt;S&lt;/summary&gt;\nB\n&lt;/details&gt;</p>';
    const off: [string, Options['html']][] = [
      ['false', false],
      ["['kbd']", ['kbd']],
      ["['summary']", ['summary']],
      ['[]', []],
    ];
    for (const [name, o] of off)
      it(`${name} leaves the lines as text and they do not split paragraphs`, () => {
        expect(html(render(M, 'whole', { html: o }))).toBe(literal);
        expect(html(render('a\n<details>\nb', 'whole', { html: o }))).toBe('<p>a\n&lt;details&gt;\nb</p>');
      });
    it("['details'] enables the block but no inline tag, and the name is case-insensitive", () => {
      expect(html(render(M, 'whole', { html: ['DETAILS'] }))).toBe(WELL);
      expect(html(render('<details>\n<summary><b>x</b></summary>\n</details>', 'whole', { html: ['details'] }))).toBe(
        '<details><summary>&lt;b&gt;x&lt;/b&gt;</summary></details>',
      );
    });
    it('true and the default enable it', () => {
      expect(html(render(M, 'whole', { html: true }))).toBe(WELL);
    });
  });

  describe('it is only a block', () => {
    it('stays text mid-paragraph, in headings, table cells, and code', () => {
      expect(html(render('a <details>x</details> b'))).toBe('<p>a &lt;details&gt;x&lt;/details&gt; b</p>');
      expect(html(render('# <details>'))).toBe('<h1>&lt;details&gt;</h1>');
      expect(details(render('| a |\n|---|\n| <details> |')).length).toBe(0);
      expect(render('`<details>`').querySelector('code')!.textContent).toBe('<details>');
      const fence = render('```\n<details>\nx\n</details>\n```');
      expect(details(fence).length).toBe(0);
      expect(fence.querySelector('code')!.textContent).toBe('<details>\nx\n</details>');
    });
  });

  describe('streaming', () => {
    const docs = [
      M,
      '<details open>\n<summary>S *x*</summary>\n\nB\n\n- a\n- b\n\n</details>\nafter',
      '<details><summary>S</summary>\nB\n</details>',
      '<DETAILS>\n<SUMMARY>S</SUMMARY>\nB\n</DETAILS>',
      '> <details>\n> <summary>S</summary>\n> B\n> </details>',
      '- a\n  <details>\n  <summary>S</summary>\n  B\n  </details>',
      '<details>\n<summary>A</summary>\n<details>\n<summary>B</summary>\nx\n</details>\ny\n</details>',
      '<details>\n```\n</details>\n```\nz\n</details>',
      'a\n</details>\nb\n<details>\nunclosed *x',
      '<details>\n<details>\nx\n</details>',
      '<details>\r\n<summary>S</summary>\r\nB\r\n</details>\r\n',
    ];
    it('every chunking gives the same final DOM and the same midstream DOM as one write', () => {
      for (const md of docs) {
        const whole = html(render(md));
        const open = html(renderOpen(md));
        for (const split of ['char', 'random', 2, 5] as const) {
          expect(html(render(md, split)), `${split} final ${JSON.stringify(md)}`).toBe(whole);
          expect(html(renderOpen(md, {}, split)), `${split} midstream ${JSON.stringify(md)}`).toBe(open);
        }
      }
    });
    it('no raw tag is visible at any prefix of a well-formed document', () => {
      for (const md of docs.slice(0, 7)) {
        for (let i = 0; i <= md.length; i++) {
          const t = renderOpen(md.slice(0, i)).textContent ?? '';
          expect(t, `${JSON.stringify(md.slice(0, i))}`).not.toMatch(/<\/?(details|summary)/i);
        }
      }
    });
    it('table of prefixes', () => {
      const doc = '<details>\n<summary>Title</summary>\n\nBody text\n\n</details>';
      const empty = [
        '',
        '<',
        '<d',
        '<details',
        '<details ',
        '<details>',
        '<details>\n',
        '<details>\n<',
        '<details>\n<summary>',
        '<details>\n<summary>Ti',
        '<details>\n<summary>Title</summary>',
      ];
      for (const p of empty) expect(html(renderOpen(p)), JSON.stringify(p)).toBe('');
      const withSummary = '<details><summary>Title</summary></details>';
      for (const p of ['<details>\n<summary>Title</summary>\n', '<details>\n<summary>Title</summary>\n\n'])
        expect(html(renderOpen(p))).toBe(withSummary);
      const body = '<details><summary>Title</summary><p>Body text</p></details>';
      for (const p of [
        '\n\nBody text',
        '\n\nBody text\n\n',
        '\n\nBody text\n\n<',
        '\n\nBody text\n\n</de',
        '\n\nBody text\n\n</details>',
        '\n\nBody text\n\n</details>\n',
      ])
        expect(html(renderOpen(`<details>\n<summary>Title</summary>${p}`)), JSON.stringify(p)).toBe(body);
      expect(doc.length).toBeGreaterThan(0);
    });
    it('in a quote or list item a half-typed tag shows nothing', () => {
      expect(renderOpen('> <det').textContent).toBe('');
      expect(renderOpen('> <details>').textContent).toBe('');
      expect(renderOpen('- <details ').textContent).toBe('');
      expect(renderOpen('> <details>\n> x\n> </deta').textContent).toBe('x');
    });
    it('a half-typed tag becomes literal text once the message ends', () => {
      expect(html(render('<det'))).toBe('<p>&lt;det</p>');
      expect(html(render('a\n</deta'))).toBe('<p>a\n&lt;/deta</p>');
    });
  });

  describe('the reader toggle', () => {
    it('survives later writes, the closer, and end()', () => {
      const { root, r } = mk();
      r.write('<details>\n<summary>S</summary>\nB');
      const d = root.querySelector('details')!;
      expect(d.open).toBe(false);
      d.open = true;
      r.write(' more\n\n- item');
      expect(root.querySelector('details')).toBe(d);
      expect(d.open).toBe(true);
      r.write('\n</details>\nafter');
      expect(root.querySelector('details')!.open).toBe(true);
      r.end();
      expect(root.querySelector('details')!.open).toBe(true);
    });
    it('a reader who closed an authored open block keeps it closed', () => {
      const { root, r } = mk();
      r.write('<details open>\n<summary>S</summary>\nB\n');
      root.querySelector('details')!.open = false;
      r.write('C\n');
      expect(root.querySelector('details')!.open).toBe(false);
      r.write('</details>');
      r.end();
      expect(root.querySelector('details')!.open).toBe(false);
    });
    it('a nested block keeps the reader state too', () => {
      const { root, r } = mk();
      r.write('<details>\n<summary>A</summary>\n<details>\n<summary>B</summary>\nx\n</details>\ny');
      const inner = root.querySelectorAll('details')[1];
      inner.open = true;
      r.write('\nmore');
      expect(root.querySelectorAll('details')[1].open).toBe(true);
    });
    it('end() opens a block that never closed', () => {
      const { root, r } = mk();
      r.write('<details>\nB');
      r.end();
      expect(root.querySelector('details')!.open).toBe(true);
    });
  });

  describe('code inside a block', () => {
    it('is highlighted once, at the end of the message or when the block closes', () => {
      const hl = vi.fn();
      const { r } = mk({ highlight: hl });
      r.write('<details>\n```js\nlet x;\n```\nmore');
      expect(hl).not.toHaveBeenCalled();
      r.write('\n</details>\nnext\n\nlast');
      r.end();
      expect(hl).toHaveBeenCalledTimes(1);
      const unclosed = vi.fn();
      const b = mk({ highlight: unclosed });
      b.r.write('<details>\n```js\nlet y;\n```\nmore');
      b.r.end();
      expect(unclosed).toHaveBeenCalledTimes(1);
    });
  });

  describe('performance while streaming', () => {
    it('a long body inside an unclosed block is not rebuilt on every write', () => {
      const body = Array.from(
        { length: 120 },
        (_, i) => `## Part ${i}\n\nSome *text* and a [link](https://e.com/${i}).\n\n- a\n- b\n\n\`\`\`js\nlet x${i} = 1;\n\`\`\`\n`,
      ).join('\n');
      const created = (md: string) => {
        const spy = vi.spyOn(document, 'createElement');
        const r = mk().r;
        for (let i = 0; i < md.length; i += 50) r.write(md.slice(i, i + 50));
        r.end();
        const n = spy.mock.calls.length;
        spy.mockRestore();
        return n;
      };
      const plain = created(body);
      const wrapped = created(`<details>\n<summary>S</summary>\n${body}`);
      // Rebuilding the whole section on each write would make this far larger. The finished blocks stay frozen.
      expect(wrapped).toBeLessThan(plain * 3);
    });
  });

  describe('safety', () => {
    it('passes the DOM audit, including the nested and unclosed shapes', () => {
      for (const md of [
        M,
        '<details open>\n<summary>[x](https://e.com) ![i](/a.png)</summary>\n- a\n\n```js\nx\n```\n</details>',
        '<details>\n<details>\nx',
        '> <details>\n> x',
      ]) {
        expect(audit(render(md)), md).toEqual([]);
        expect(audit(renderOpen(md)), md).toEqual([]);
      }
    });
    it('no attribute or element beyond the documented DOM can come from the input', () => {
      for (const md of [
        '<details onclick=alert(1)>\nx\n</details>',
        '<details open ontoggle=alert(1)>\nx\n</details>',
        '<details ontoggle=alert(1) open>\nx\n</details>',
        '<details open>\n<summary onclick=alert(1)>S</summary>\nx\n</details>',
        '<details>\n<summary><script>alert(1)</script></summary>\n</details>',
        '<details><summary><img src=x onerror=alert(1)></summary>\n</details>',
      ]) {
        const root = render(md);
        expect(audit(root), md).toEqual([]);
        expect(root.querySelector('script,iframe,svg,style,form,[onclick],[ontoggle],[onerror]')).toBeNull();
      }
    });
    it('big and hostile inputs stay fast and keep all the text', () => {
      const t = (md: string) => {
        const start = performance.now();
        const root = render(md);
        renderOpen(md);
        expect(performance.now() - start).toBeLessThan(8000);
        return root;
      };
      t('<details>\n'.repeat(50000));
      t('</details>\n'.repeat(50000));
      t('<details>\n</details>\n'.repeat(25000));
      t('<details>\n</details>\n</details>\n'.repeat(15000));
      t('</details>\n<details>\n'.repeat(25000));
      t('<details>\n<summary>s</summary>\n'.repeat(5000) + 'x');
      const deep = t('<details>\n'.repeat(5000) + 'x\n' + '</details>\n'.repeat(5000));
      expect(deep.textContent).toContain('x');
    });
  });
});
