import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/index';
import { audit, html, render, renderOpen } from './helpers/util';

const EXT = '<a href="https://x.com" target="_blank" rel="noopener noreferrer">';
const cases: [string, string][] = [
  ['*a*', '<p><em>a</em></p>'],
  ['_a_', '<p><em>a</em></p>'],
  ['**a**', '<p><strong>a</strong></p>'],
  ['__a__', '<p><strong>a</strong></p>'],
  ['***a***', '<p><em><strong>a</strong></em></p>'],
  ['~~a~~', '<p><del>a</del></p>'],
  ['**a *b* c**', '<p><strong>a <em>b</em> c</strong></p>'],
  ['*a **b** c*', '<p><em>a <strong>b</strong> c</em></p>'],
  ['snake_case_name and my_var', '<p>snake_case_name and my_var</p>'],
  ['__init__.py is a file', '<p><strong>init</strong>.py is a file</p>'],
  ['a * b * c', '<p>a * b * c</p>'],
  ['2 * 3 = 6', '<p>2 * 3 = 6</p>'],
  ['~100 ms and ~5', '<p>~100 ms and ~5</p>'],
  ['`a`', '<p><code>a</code></p>'],
  ['`` a`b ``', '<p><code>a`b</code></p>'],
  ['`*not em*`', '<p><code>*not em*</code></p>'],
  ['\\*a\\*', '<p>*a*</p>'],
  ['a \\# b', '<p>a # b</p>'],
  ['[a](https://x.com)', `<p>${EXT}a</a></p>`],
  ['[a](https://x.com "title")', `<p>${EXT}a</a></p>`],
  ['[a](<https://x.com>)', `<p>${EXT}a</a></p>`],
  ['[a](https://x.com/a_(b))', '<p><a href="https://x.com/a_(b)" target="_blank" rel="noopener noreferrer">a</a></p>'],
  ['[a](https://x.com/a_(b)) and more', '<p><a href="https://x.com/a_(b)" target="_blank" rel="noopener noreferrer">a</a> and more</p>'],
  ['([a](https://x.com))', `<p>(${EXT}a</a>)</p>`],
  ['[a](/p/)', '<p><a href="/p/">a</a></p>'],
  ['[*a*](https://x.com)', `<p>${EXT}<em>a</em></a></p>`],
  ['[1] and [2]', '<p>[1] and [2]</p>'],
  ['[a] (b)', '<p>[a] (b)</p>'],
  ['[a](b c', '<p>[a](b c</p>'],
  ['<https://x.com>', `<p>${EXT}https://x.com</a></p>`],
  ['see https://x.com.', `<p>see ${EXT}https://x.com</a>.</p>`],
  ['(https://x.com)', `<p>(${EXT}https://x.com</a>)</p>`],
  ['https://x.com/a_b_c now', '<p><a href="https://x.com/a_b_c" target="_blank" rel="noopener noreferrer">https://x.com/a_b_c</a> now</p>'],
  ['**https://x.com**', `<p><strong>${EXT}https://x.com</a></strong></p>`],
  ['www.example.com', '<p><a href="https://www.example.com" target="_blank" rel="noopener noreferrer">www.example.com</a></p>'],
  ['mail me a.b+c@ex-ample.co.uk.', '<p>mail me <a href="mailto:a.b+c@ex-ample.co.uk">a.b+c@ex-ample.co.uk</a>.</p>'],
  ['not@email', '<p>not@email</p>'],
  ['a  \nb', '<p>a<br>b</p>'],
  ['a\\\nb', '<p>a<br>b</p>'],
  ['a<br>b<br/>c', '<p>a<br>b<br>c</p>'],
  ['a\nb', '<p>a\nb</p>'],
  ['<div>x</div>', '<p>&lt;div&gt;x&lt;/div&gt;</p>'],
  ['a < b && c > d', '<p>a &lt; b &amp;&amp; c &gt; d</p>'],
  ['# H', '<h1>H</h1>'],
  ['###### H', '<h6>H</h6>'],
  ['####### x', '<p>####### x</p>'],
  ['# H #', '<h1>H</h1>'],
  ['## *a* `b`', '<h2><em>a</em> <code>b</code></h2>'],
  ['---', '<hr>'],
  ['***', '<hr>'],
  ['a\n\nb', '<p>a</p><p>b</p>'],
  ['- a\n- b', '<ul><li>a</li><li>b</li></ul>'],
  ['* a\n* b', '<ul><li>a</li><li>b</li></ul>'],
  ['+ a', '<ul><li>a</li></ul>'],
  ['1. a\n2. b', '<ol><li>a</li><li>b</li></ol>'],
  ['1) a\n2) b', '<ol><li>a</li><li>b</li></ol>'],
  ['3. a\n4. b', '<ol start="3"><li>a</li><li>b</li></ol>'],
  ['- a\n\n- b', '<ul><li>a</li><li>b</li></ul>'],
  ['- a\n- b\n\npara', '<ul><li>a</li><li>b</li></ul><p>para</p>'],
  ['text\n- a\n- b', '<p>text</p><ul><li>a</li><li>b</li></ul>'],
  ['- a\n  - b', '<ul><li>a<ul><li>b</li></ul></li></ul>'],
  ['1. a\n   - b\n2. c', '<ol><li>a<ul><li>b</li></ul></li><li>c</li></ol>'],
  ['- a\n    - b\n        - c', '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>'],
  ['- a\n  b', '<ul><li>a\nb</li></ul>'],
  ['- a\n\n  second', '<ul><li>a<p>second</p></li></ul>'],
  ['1. a\n- b', '<ol><li>a</li></ol><ul><li>b</li></ul>'],
  ['> a\n> b', '<blockquote><p>a\nb</p></blockquote>'],
  ['> a\n\n> b', '<blockquote><p>a</p></blockquote><blockquote><p>b</p></blockquote>'],
  ['> # h\n> - x', '<blockquote><h1>h</h1><ul><li>x</li></ul></blockquote>'],
  ['> a\n> > b', '<blockquote><p>a</p><blockquote><p>b</p></blockquote></blockquote>'],
  ['', ''],
  ['   \n\n  ', ''],
];

describe('conformance, own cases for the supported subset', () => {
  for (const [md, expected] of cases) {
    it(JSON.stringify(md), () => {
      expect(html(render(md))).toBe(expected);
      expect(html(render(md, 'char'))).toBe(expected);
    });
  }

  it('task lists', () => {
    const li = render('- [x] done\n- [ ] todo').querySelectorAll('li');
    const boxes = Array.from(li).map((l) => l.querySelector('input') as HTMLInputElement);
    expect(boxes.map((b) => [b.type, b.disabled, b.defaultChecked])).toEqual([
      ['checkbox', true, true],
      ['checkbox', true, false],
    ]);
    expect(li[0].textContent).toBe('done');
  });

  it('fenced code', () => {
    const root = render('```ts\nlet a = 1;\n  b\n```\nafter');
    const code = root.querySelector('pre code')!;
    expect(code.textContent).toBe('let a = 1;\n  b');
    expect(root.querySelector('button')!.getAttribute('aria-label')).toBe('Copy ts');
    expect(root.querySelector('button')!.textContent).toBe('Copy');
    expect(root.querySelector('pre')!.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('[aria-hidden="true"]')!.textContent).toBe('ts');
    expect(root.lastElementChild!.tagName).toBe('P');
  });
  it('tilde fences and fence lengths', () => {
    expect(render('~~~\na\n~~~').querySelector('code')!.textContent).toBe('a');
    const longer = render('```\na\n````\nb');
    expect(longer.querySelector('code')!.textContent).toBe('a');
    expect(longer.lastElementChild!.textContent).toBe('b');
    expect(render('````\na\n```\nb\n````').querySelector('code')!.textContent).toBe('a\n```\nb');
  });
  it('fence inside a list item stays in the item', () => {
    const root = render('1. Step:\n   ```js\n   x()\n   ```\n2. Next');
    expect(root.querySelectorAll('ol').length).toBe(1);
    expect(root.querySelector('li pre code')!.textContent).toBe('x()');
    expect(root.querySelectorAll('li').length).toBe(2);
  });
  it('tables with alignment and a keyboard-scrollable wrapper', () => {
    const root = render('| A | B | C |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n| x | y |');
    const wrap = root.firstElementChild!;
    expect(wrap.getAttribute('tabindex')).toBe('0');
    expect(wrap.getAttribute('role')).toBe('region');
    const al = (e: Element) => (e as HTMLElement).style.textAlign;
    expect(Array.from(root.querySelectorAll('th')).map(al)).toEqual(['left', 'center', 'right']);
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
    expect(Array.from(root.querySelectorAll('tbody tr')[1].children).map((c) => c.textContent)).toEqual(['x', 'y', '']);
    expect(root.querySelectorAll('thead')[0].textContent).toBe('ABC');
  });
  it('tables without leading pipes and with inline markup and escaped pipes', () => {
    const root = render('a | b\n--|--\n*x* | `y\\|z`');
    expect(root.querySelectorAll('td')[0].innerHTML).toBe('<em>x</em>');
    expect(root.querySelectorAll('td')[1].textContent).toBe('y|z');
  });
  it('a lone pipe line is not a table once finished', () => {
    expect(html(render('| just text'))).toBe('<p>| just text</p>');
    expect(html(render('| a |\nnot a delimiter'))).toBe('<p>| a |\nnot a delimiter</p>');
  });
  it('table ends at a blank line or other block', () => {
    const root = render('| A |\n|---|\n| 1 |\n\npara\n\n| B |\n|---|\n# h');
    expect(root.querySelectorAll('table').length).toBe(2);
    expect(root.querySelector('h1')).not.toBeNull();
  });
  it('unsupported things degrade to text', () => {
    expect(html(render('Setext\n===')).startsWith('<p>')).toBe(true);
    const root = render('[ref]: http://x.com\n\n[ref]');
    expect(root.children.length).toBe(2);
    expect(root.children[0].textContent).toBe('[ref]: http://x.com');
    expect(root.children[1].innerHTML).toBe('[ref]');
  });
});

describe('tables and nesting', () => {
  const al = (md: string) => Array.from(render(md).querySelectorAll('th')).map((e) => (e as HTMLElement).style.textAlign);
  it('alignment edge cases', () => {
    expect(al('| a |\n|:-:|')).toEqual(['center']);
    expect(al('| a | b |\n| :- | -: |')).toEqual(['left', 'right']);
    expect(al('a | b\n:-:|--')).toEqual(['center', '']);
    expect(al('| a | b |\n|---|---|')).toEqual(['', '']);
    expect(al('| a |\n|:|')).toEqual([]); // not a delimiter row
  });
  it('rows with extra cells drop them, header with escaped pipe', () => {
    const root = render('| a \\| b | c |\n|--|--|\n| 1 | 2 | 3 |');
    expect(root.querySelectorAll('th')[0].textContent).toBe('a | b');
    expect(root.querySelectorAll('tbody tr')[0].children.length).toBe(2);
  });
  it('a table right after a blank line is a new table with its own alignment (ctx reset)', () => {
    const root = render('| a |\n|:-:|\n| 1 |\n\n| b |\n|---|\n| 2 |');
    const tds = root.querySelectorAll('td');
    expect((tds[0] as HTMLElement).style.textAlign).toBe('center');
    expect((tds[1] as HTMLElement).style.textAlign).toBe('');
  });
  it('a pipe row after a blank line is a paragraph, not a table row, even when streamed', () => {
    const md = '| a |\n|---|\n| 1 |\n\n| not a row |\n\nend';
    expect(render(md, 'char').innerHTML).toBe(render(md).innerHTML);
    expect(render(md).querySelectorAll('tbody tr').length).toBe(1);
  });
  it('nested blockquote plus list plus code', () => {
    expect(html(render('> - a\n>   - b\n> > c'))).toBe(
      '<blockquote><ul><li>a<ul><li>b</li></ul></li></ul><blockquote><p>c</p></blockquote></blockquote>',
    );
    const r2 = render('- a\n  > q1\n  > q2\n- b');
    expect(r2.querySelectorAll('li').length).toBe(2);
    expect(r2.querySelector('li blockquote')).not.toBeNull();
    expect(render('> ```js\n> x\n> ```').querySelector('blockquote pre code')!.textContent).toBe('x');
  });
  it('depth caps: 13+ nested lists and quotes stay safe and keep text', () => {
    const q = render('> '.repeat(40) + 'deep');
    expect(audit(q)).toEqual([]);
    expect(q.textContent).toContain('deep');
    expect(q.querySelectorAll('blockquote').length).toBeLessThanOrEqual(13);
    const l = render(Array.from({ length: 40 }, (_, i) => ' '.repeat(i * 2) + '- x' + i).join('\n'));
    expect(l.textContent).toContain('x39');
    expect(l.querySelectorAll('ul').length).toBeLessThanOrEqual(13);
  });
  it('inline depth cap keeps text and stays safe', () => {
    const s = '*a '.repeat(80) + 'z' + ' b*'.repeat(80);
    const root = render(s);
    expect(root.textContent).toContain('z');
    let d = 0;
    for (let e: Element | null = root.querySelector('em'); e; e = e.querySelector('em')) d++;
    expect(d).toBeLessThanOrEqual(31);
  });
  it('td cells get the column alignment', () => {
    const tds = Array.from(render('| a | b |\n|:-:|--:|\n| 1 | 2 |').querySelectorAll('td')).map((e) => (e as HTMLElement).style.textAlign);
    expect(tds).toEqual(['center', 'right']);
  });
  it('header and delimiter column counts must match for a table without leading pipe', () => {
    expect(render('a | b\n--|--|--\nc | d').querySelector('table')).toBeNull();
  });
});

describe('edge cases', () => {
  it('a partial closing fence marker is not shown as code while streaming', () => {
    expect(renderOpen('```\nx\n``').querySelector('code')!.textContent).toBe('x');
    expect(renderOpen('~~~\nx\n~~').querySelector('code')!.textContent).toBe('x');
  });
  it('a link inside a link label is not nested', () => {
    expect(render('[a [b](https://b.com) c](https://a.com)').querySelectorAll('a a').length).toBe(0);
  });
  it('uppercase [X] task checkbox', () => {
    expect((render('- [X] a').querySelector('input') as HTMLInputElement).defaultChecked).toBe(true);
  });
  it('single trailing space before newline is not a hard break; two are', () => {
    expect(html(render('a \nb'))).toBe('<p>a \nb</p>');
    expect(html(render('a  \nb'))).toBe('<p>a<br>b</p>');
  });
  it('urls only autolink at a word boundary', () => {
    expect(render('xhttp://a.com and Xwww.a.com').querySelectorAll('a').length).toBe(0);
  });
  it('emphasis next to an astral emoji', () => {
    expect(html(render('\u{1F600}**a**'))).toBe('<p>\u{1F600}<strong>a</strong></p>');
    expect(html(render('**a**\u{1F600}'))).toBe('<p><strong>a</strong>\u{1F600}</p>');
  });
  it('email local part is capped, quote strip keeps extra indent', () => {
    expect(render('a'.repeat(200) + '@b.com').querySelector('a')!.textContent!.length).toBeLessThan(100);
    expect(html(render('>  a'))).toBe('<blockquote><p>a</p></blockquote>');
  });
  it('single tilde is literal inside text and strikethrough needs two on both sides', () => {
    expect(html(render('a ~b~ c'))).toBe('<p>a ~b~ c</p>');
    expect(html(render('a ~~b~ c'))).toBe('<p>a ~~b~ c</p>');
  });
  it('list item content with 5+ spaces after marker', () => {
    expect(html(render('-     a'))).toBe('<ul><li>a</li></ul>');
    expect(html(render('1.      a\n        b'))).toBe('<ol><li>a\nb</li></ol>');
  });
  it('very long language and trailing-pipe escape', () => {
    expect(render('```' + 'a'.repeat(21) + '\nx\n```').querySelector('code')!.className).toBe('');
    expect(render('| a \\|\n|--|\n| b \\|').querySelectorAll('th')[0].textContent).toBe('a |');
  });
});

describe('line endings', () => {
  const lf = '# H\n\n```js\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y\n';
  it('CRLF and CR render like LF, whole and split anywhere, including between CR and LF', () => {
    const want = render(lf).innerHTML;
    expect(render(lf.replace(/\n/g, '\r\n')).innerHTML).toBe(want);
    expect(render(lf.replace(/\n/g, '\r')).innerHTML).toBe(want);
    const crlf = lf.replace(/\n/g, '\r\n');
    for (let i = 1; i < crlf.length; i++) {
      const root = document.createElement('div');
      const r = createRenderer(root, { throttleMs: 0 });
      r.write(crlf.slice(0, i));
      r.write(crlf.slice(i));
      r.end();
      expect(root.innerHTML).toBe(want);
    }
  });
  it('a lone CR at the very end becomes a newline when the stream ends', () => {
    expect(html(render('a\r'))).toBe('<p>a</p>');
    expect(html(render('a\rb'))).toBe('<p>a\nb</p>');
  });
});

describe('block structure while streaming', () => {
  it('lazy blockquote continuation only follows paragraph text', () => {
    expect(html(render('> ```\n> a\n> ```\nafter'))).toBe(
      '<blockquote><pre><code>a</code></pre></blockquote><p>after</p>'.replace(/<pre><code>a<\/code><\/pre>/, html(render('```\na\n```'))),
    );
    expect(html(render('> # h\ntext'))).toBe('<blockquote><h1>h</h1></blockquote><p>text</p>');
    expect(html(render('> a\nb'))).toBe('<blockquote><p>a\nb</p></blockquote>');
    expect(html(render('> bar\n>\nbaz'))).toBe('<blockquote><p>bar</p></blockquote><p>baz</p>');
  });
  it('speculative styling applies only to the last nested block', () => {
    expect(html(renderOpen('> **a\n>\n> b'))).not.toContain('<strong>');
    expect(html(renderOpen('- a **x\n  - b'))).not.toContain('<strong>');
    expect(html(renderOpen('> a\n>\n> **b'))).toContain('<strong>b</strong>');
  });
  it('a bare list marker at the end of the text is withheld until it is known', () => {
    for (const m of ['*', '-', '+', '1.', '1)', 'text\n-']) {
      const root = renderOpen(m);
      expect(root.querySelector('ul,ol'), JSON.stringify(m)).toBeNull();
    }
    expect(renderOpen('- a\n-').querySelectorAll('li').length).toBe(1);
    expect(html(render('-'))).toBe('<ul><li></li></ul>');
  });
  it('list scanning: indent decides interruption, and an unclosed fence does not swallow the next item', () => {
    expect(html(render('para\n        - x'))).toBe('<p>para\n- x</p>');
    const root = render('- a\n  ```\n  code\n- b');
    expect(root.querySelectorAll('li').length).toBe(2);
    expect(root.querySelectorAll('code').length).toBe(1);
    expect(root.querySelectorAll('li')[1].textContent).toBe('b');
  });
});
