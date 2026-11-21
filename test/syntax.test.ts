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
    expect(wrap.getAttribute('role')).toBe('group');
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
  it('an angle-bracket autolink that is refused keeps its brackets', () => {
    expect(html(render('Run on <host:port> now'))).toBe('<p>Run on &lt;host:port&gt; now</p>');
    expect(html(render('<user:name>'))).toBe('<p>&lt;user:name&gt;</p>');
    expect(html(render('<javascript:alert(1)>'))).toBe('<p>&lt;javascript:alert(1)&gt;</p>');
    expect(html(render('<a@b.co>', 'whole', { allowedProtocols: ['https'] }))).toBe('<p>&lt;a@b.co&gt;</p>');
    expect(html(render('[x <host:port>](https://a.com)'))).toBe(
      `<p>${EXT.replace('https://x.com', 'https://a.com')}x &lt;host:port&gt;</a></p>`,
    );
    expect(html(render('<https://a.com>'))).toContain('<a href="https://a.com"');
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
  it('a task marker with no text after it still renders its checkbox', () => {
    expect(html(render('- [ ]'))).toBe('<ul><li><input type="checkbox" disabled="" aria-label="Not completed"></li></ul>');
    expect(html(render('- [x] '))).toBe('<ul><li><input type="checkbox" disabled="" checked="" aria-label="Completed"></li></ul>');
  });
  it('a line break inside image alt text becomes a space, and other tags stay text', () => {
    expect(render('![a<br>b](/x.png)').querySelector('img')!.getAttribute('alt')).toBe('a b');
    expect(render('![a<b>c](/x.png)').querySelector('img')!.getAttribute('alt')).toBe('a<b>c');
  });
  it('emphasis after an earlier match still finds its opener (the unmatched-closer cache follows the stack)', () => {
    expect(html(render('~~**`g` a** b~~ **`d`**.'))).toBe(
      '<p><del><strong><code>g</code> a</strong> b</del> <strong><code>d</code></strong>.</p>',
    );
    expect(html(render('**a** b **c**.'))).toBe('<p><strong>a</strong> b <strong>c</strong>.</p>');
    expect(html(render('*a **b** c* **d**'))).toBe('<p><em>a <strong>b</strong> c</em> <strong>d</strong></p>');
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
  const ul = (...items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const ol = (start: number, ...items: string[]) =>
    `<ol${start === 1 ? '' : ` start="${start}"`}>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
  const listCases: [string, string, string][] = [
    ['a different bullet starts a new list', '- a\n+ b\n* c', ul('a') + ul('b') + ul('c')],
    ['a different bullet after a blank line starts a new list', '- a\n\n+ b', ul('a') + ul('b')],
    ['the same bullet continues the list', '- a\n- b\n\n- c', ul('a', 'b', 'c')],
    ['a different number delimiter starts a new list at its own number', '1. a\n2. b\n3) c\n4) d', ol(1, 'a', 'b') + ol(3, 'c', 'd')],
    ['a different delimiter on the second item', '1) a\n2. b', ol(1, 'a') + ol(2, 'b')],
    ['the same delimiter continues the list', '1) a\n2) b\n3) c', ol(1, 'a', 'b', 'c')],
    [
      'a nested list may use another bullet than its parent',
      '- a\n  + b\n  + c\n- d',
      '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>',
    ],
    ['a bullet list after a numbered list is still a new list', '1. a\n- b', ol(1, 'a') + ul('b')],
    ['a number other than 1 does not interrupt a paragraph', 'text\n14. not a list', '<p>text\n14. not a list</p>'],
    [
      'a number up to 99 at the start of a wrapped line stays in the paragraph',
      'It was on page\n42. Nobody noticed.',
      '<p>It was on page\n42. Nobody noticed.</p>',
    ],
    [
      'a long number at the start of a wrapped line stays in the paragraph',
      'The war ended in\n1945. Then the peace began.',
      '<p>The war ended in\n1945. Then the peace began.</p>',
    ],
    ['2) does not interrupt a paragraph either', 'text\n2) not a list', '<p>text\n2) not a list</p>'],
    ['1. interrupts a paragraph', 'text\n1. a list', '<p>text</p>' + ol(1, 'a list')],
    ['1) interrupts a paragraph', 'text\n1) a list', '<p>text</p>' + ol(1, 'a list')],
    ['a bullet interrupts a paragraph', 'text\n- a list', '<p>text</p>' + ul('a list')],
    ['a number other than 1 starts a list after a blank line', 'text\n\n2. now a list', '<p>text</p>' + ol(2, 'now a list')],
    ['a number other than 1 right after a list item starts a new list', '- item\n5. other', ul('item') + ol(5, 'other')],
    ['a number other than 1 does not interrupt a paragraph in a quote', '> text\n> 2. x', '<blockquote><p>text\n2. x</p></blockquote>'],
    ['a number other than 1 does not interrupt a paragraph in a list item', '- a\n  2. b', '<ul><li>a\n2. b</li></ul>'],
    ['1. interrupts a paragraph in a list item', '- a\n  1. b', '<ul><li>a<ol><li>b</li></ol></li></ul>'],
  ];
  it.each(listCases)('%s', (_name, md, want) => {
    expect(html(render(md))).toBe(want);
    expect(html(render(md, 'char'))).toBe(want);
  });
  const IMG = '<img alt="b" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="https://e.com/i.png">';
  const TBL_OPEN = (head: string[]) =>
    `<div tabindex="0" role="group" aria-label="Table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
  const TBL = (head: string[], row: string[]) =>
    `<div tabindex="0" role="group" aria-label="Table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody><tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr></tbody></table></div>`;
  const gfmCases: [string, string, string][] = [
    ['a link inside link text wins and the outer brackets stay text', '[a [b](/u)](/v)', '<p>[a <a href="/u">b</a>](/v)</p>'],
    ['the inner link wins in the middle of a sentence', 'see [x [y](/a) z](/b) end', '<p>see [x <a href="/a">y</a> z](/b) end</p>'],
    ['two links side by side are both links', '[a](/u) and [b](/v)', '<p><a href="/u">a</a> and <a href="/v">b</a></p>'],
    ['a link around an image is still a link', '[a ![b](https://e.com/i.png)](/v)', `<p><a href="/v">a ${IMG}</a></p>`],
    [
      'a link inside a deeper pair stays a link and every outer pair is text',
      '[a [b [c](/u)](/v)](/w)',
      '<p>[a [b <a href="/u">c</a>](/v)](/w)</p>',
    ],
    [
      'a delimiter row with fewer cells than the header is not a table',
      '| a | b | c |\n|---|---|\n| 1 | 2 | 3 |',
      '<p>| a | b | c |\n|---|---|\n| 1 | 2 | 3 |</p>',
    ],
    [
      'a delimiter row with more cells than the header is not a table',
      '| a | b |\n|---|---|---|\n| 1 | 2 |',
      '<p>| a | b |\n|---|---|---|\n| 1 | 2 |</p>',
    ],
    ['a delimiter row with the same number of cells makes a table', '| a | b |\n|---|---|\n| 1 | 2 |', TBL(['a', 'b'], ['1', '2'])],
    ['a run of three tildes is text', 'text ~~~x~~~ text', '<p>text ~~~x~~~ text</p>'],
    ['a longer run of tildes is text', 'a ~~~~x~~~~ b', '<p>a ~~~~x~~~~ b</p>'],
    ['two tildes still strike text out', 'a ~~x~~ b', '<p>a <del>x</del> b</p>'],
    ['three tildes at the end are shown at once', 'a ~~~', '<p>a ~~~</p>'],
  ];
  it.each(gfmCases)('%s', (_name, md, want) => {
    expect(html(render(md))).toBe(want);
    expect(html(render(md, 'char'))).toBe(want);
  });
  const titleCases: [string, string, string][] = [
    ['a title with an escaped double quote still makes a link', '[a](/u "ti\\"tle")', '<p><a href="/u">a</a></p>'],
    ['a single-quoted title with an escaped quote', "[a](/u 'it\\'s')", '<p><a href="/u">a</a></p>'],
    ['a parenthesized title with an escaped parenthesis', '[a](/u (x\\)y))', '<p><a href="/u">a</a></p>'],
    ['an escaped backslash does not escape the closing quote', '[a](/u "x\\\\")', '<p><a href="/u">a</a></p>'],
    ['a title whose quote is escaped to the end never closes, so the link is text', '[a](/u "x\\")', '<p>[a](/u "x")</p>'],
    ['a plain title still makes a link', '[a](/u "title")', '<p><a href="/u">a</a></p>'],
  ];
  it.each(titleCases)('%s', (_name, md, want) => {
    expect(html(render(md))).toBe(want);
    expect(html(render(md, 'char'))).toBe(want);
  });
  const indentCases: [string, string, string][] = [
    ['two spaces under "1. " is not enough to nest', '1. a\n  - b', '<ol><li>a</li></ol><ul><li>b</li></ul>'],
    ['three spaces under "10. " is not enough to nest', '10. a\n   - b', '<ol start="10"><li>a</li></ol><ul><li>b</li></ul>'],
    ['a quote at two spaces under "1. " is not part of the item', '1. a\n  > q', '<ol><li>a</li></ol><blockquote><p>q</p></blockquote>'],
    ['text at two spaces after a blank line under "1. " is not part of the item', '1. a\n\n  more', '<ol><li>a</li></ol><p>more</p>'],
    ['three spaces under "1. " nest', '1. a\n   - b', '<ol><li>a<ul><li>b</li></ul></li></ol>'],
    ['four spaces under "10. " nest', '10. a\n    - b', '<ol start="10"><li>a<ul><li>b</li></ul></li></ol>'],
    ['five spaces under "10. " still nest', '10. a\n     - b', '<ol start="10"><li>a<ul><li>b</li></ul></li></ol>'],
    ['two spaces under "- " nest', '- a\n  - b', '<ul><li>a<ul><li>b</li></ul></li></ul>'],
    ['one space under "- " is a sibling', '- a\n - b', '<ul><li>a</li><li>b</li></ul>'],
    ['a less indented line of paragraph text continues the paragraph', '1. a\n  b', '<ol><li>a\nb</li></ol>'],
    [
      'two nested levels under numbers',
      '1. a\n   - b\n     - c\n   - d\n2. e',
      '<ol><li>a<ul><li>b<ul><li>c</li></ul></li><li>d</li></ul></li><li>e</li></ol>',
    ],
  ];
  it.each(indentCases)('%s', (_name, md, want) => {
    expect(html(render(md))).toBe(want);
    expect(html(render(md, 'char'))).toBe(want);
  });
  it('a line less indented than the item content ends a fence inside the item', () => {
    for (const split of ['whole', 'char'] as const) {
      const root = render('1. a\n   ```\n  x\n', split);
      expect(root.querySelector('ol code')?.textContent, split).toBe('');
      expect(root.querySelector(':scope > p')?.textContent, split).toBe('x');
    }
  });
  it('pipe lines without a valid delimiter row stay in one paragraph, as in GFM', () => {
    const cases: [string, string][] = [
      ['| a | b |\n| c | d |', '<p>| a | b |\n| c | d |</p>'],
      ['text\n| a | b |', '<p>text\n| a | b |</p>'],
      ['| a | b | c |\n|---|---|\n| 1 | 2 | 3 |', '<p>| a | b | c |\n|---|---|\n| 1 | 2 | 3 |</p>'],
      ['| a | b |\n|---|---|---|\n| 1 | 2 |', '<p>| a | b |\n|---|---|---|\n| 1 | 2 |</p>'],
      ['text\n| a | b |\n| c | d |\nmore', '<p>text\n| a | b |\n| c | d |\nmore</p>'],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a table right after a line of text still splits off from it', () => {
    const want = `<p>Here is the data:</p>${TBL(['a', 'b'], ['1', '2'])}`;
    for (const split of ['whole', 'char'] as const)
      expect(html(render('Here is the data:\n| a | b |\n|---|---|\n| 1 | 2 |', split)), split).toBe(want);
  });
  it('a table whose header has no outer pipes splits off from the text above it, as in GFM', () => {
    const cases: [string, string][] = [
      ['Here:\na | b\n--|--\n1 | 2', `<p>Here:</p>${TBL(['a', 'b'], ['1', '2'])}`],
      ['Here:\na | b\n-|-\n1 | 2', `<p>Here:</p>${TBL(['a', 'b'], ['1', '2'])}`],
      ['Intro\n\nHere:\na | b | c\n--|--|--\n1 | 2 | 3', `<p>Intro</p><p>Here:</p>${TBL(['a', 'b', 'c'], ['1', '2', '3'])}`],
      ['Here:\na | b | c\n--|--\n1 | 2', '<p>Here:\na | b | c\n--|--\n1 | 2</p>'],
      ['Here:\nuse a | b in prose', '<p>Here:\nuse a | b in prose</p>'],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
    expect(render('Here:\nfoo |\n---\nx').querySelector('table')).toBeNull();
  });
  it('an unindented pipe line after a list item or quote line continues its paragraph, as in GFM', () => {
    const cases: [string, string][] = [
      ['- item\n| a | b |\n|---|---|\n| 1 | 2 |', '<ul><li>item\n| a | b |\n|---|---|\n| 1 | 2 |</li></ul>'],
      ['- item\n| x |', '<ul><li>item\n| x |</li></ul>'],
      ['1. item\n| a | b |', '<ol><li>item\n| a | b |</li></ol>'],
      ['- a\n- b\n| x |\n- c', '<ul><li>a</li><li>b\n| x |</li><li>c</li></ul>'],
      ['- item\nmore\n| a | b |\n|---|---|\n| 1 | 2 |', '<ul><li>item\nmore\n| a | b |\n|---|---|\n| 1 | 2 |</li></ul>'],
      ['- item\n|---|---|', '<ul><li>item\n|---|---|</li></ul>'],
      ['- a\n  - b\n| x |', '<ul><li>a<ul><li>b\n| x |</li></ul></li></ul>'],
      ['> quote\n| a | b |\n|---|---|\n| 1 | 2 |', '<blockquote><p>quote\n| a | b |\n|---|---|\n| 1 | 2 |</p></blockquote>'],
      ['> quote\n| x |', '<blockquote><p>quote\n| x |</p></blockquote>'],
      ['> > a\n| x |', '<blockquote><blockquote><p>a\n| x |</p></blockquote></blockquote>'],
      ['> a\n| x |\n\n| a | b |\n|---|---|\n| 1 | 2 |', `<blockquote><p>a\n| x |</p></blockquote>${TBL(['a', 'b'], ['1', '2'])}`],
      ['- item\n\n| a | b |\n|---|---|\n| 1 | 2 |', `<ul><li>item</li></ul>${TBL(['a', 'b'], ['1', '2'])}`],
      ['- item\n  | a | b |\n  |---|---|\n  | 1 | 2 |', `<ul><li>item${TBL(['a', 'b'], ['1', '2'])}</li></ul>`],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a lazy line is not part of a table head or delimiter row inside an item or quote', () => {
    const cases: [string, string][] = [
      ['- | a | b |\n|---|---|\n| 1 | 2 |', '<ul><li>| a | b |\n|---|---|\n| 1 | 2 |</li></ul>'],
      ['- item\n  | a | b |\n|---|---|', '<ul><li>item\n| a | b |\n|---|---|</li></ul>'],
      ['> | a | b |\n|---|---|', '<blockquote><p>| a | b |\n|---|---|</p></blockquote>'],
      ['> a\n| b | c |\n|---|---|\n| 1 | 2 |', '<blockquote><p>a\n| b | c |\n|---|---|\n| 1 | 2 |</p></blockquote>'],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a table in an item or quote ends before a line that is not part of it, as in GFM', () => {
    const cases: [string, string][] = [
      ['> | a | b |\n> |---|---|\n> | 1 | 2 |\nlazy', `<blockquote>${TBL(['a', 'b'], ['1', '2'])}</blockquote><p>lazy</p>`],
      ['> a | b\n> --|--\nlazy', `<blockquote>${TBL_OPEN(['a', 'b'])}</blockquote><p>lazy</p>`],
      ['- | a | b |\n  |---|---|\n  | 1 | 2 |\nlazy', `<ul><li>${TBL(['a', 'b'], ['1', '2'])}</li></ul><p>lazy</p>`],
      ['> | a | b |\n> |---|---|\n| 1 | 2 |', `<blockquote>${TBL_OPEN(['a', 'b'])}</blockquote><p>| 1 | 2 |</p>`],
      ['- | a | b |\n  |---|---|\n| 1 | 2 |', `<ul><li>${TBL_OPEN(['a', 'b'])}</li></ul><p>| 1 | 2 |</p>`],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a table two containers deep ends before a lazy line, as in GFM', () => {
    const q = (x: string) => `<blockquote>${x}</blockquote>`;
    const li = (x: string) => `<ul><li>${x}</li></ul>`;
    const T = TBL_OPEN(['a', 'b']);
    const cases: [string, string][] = [
      ['> > | a | b |\n> > |---|---|\nlazy', `${q(q(T))}<p>lazy</p>`],
      ['> - | a | b |\n>   |---|---|\nlazy', `${q(li(T))}<p>lazy</p>`],
      ['- > | a | b |\n  > |---|---|\nlazy', `${li(q(T))}<p>lazy</p>`],
      ['> > | a | b |\n> > |---|---|\n> > | 1 | 2 |\nlazy', `${q(q(TBL(['a', 'b'], ['1', '2'])))}<p>lazy</p>`],
      ['> > | a | b |\n> > |---|---|\n> lazy', `${q(`${q(T)}<p>lazy</p>`)}`],
      ['> - - | a | b |\n>     |---|---|\nlazy', `${q(li(li(T)))}<p>lazy</p>`],
      ['> > a\nlazy', '<blockquote><blockquote><p>a\nlazy</p></blockquote></blockquote>'],
      ['> - a\nlazy', '<blockquote><ul><li>a\nlazy</li></ul></blockquote>'],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a delimiter row that starts with a list marker is a list item, as in GFM', () => {
    const cases: [string, string][] = [
      ['| | a | b |\n- |---|---|', '<p>| | a | b |</p><ul><li>|---|---|</li></ul>'],
      ['a | b\n- |---|', '<p>a | b</p><ul><li>|---|</li></ul>'],
      ['> | a | b |\n> - |---|---|', '<blockquote><p>| a | b |</p><ul><li>|---|---|</li></ul></blockquote>'],
      ['| a | b |\n-|-', `${TBL_OPEN(['a', 'b'])}`],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a lazy line that starts with a pipe waits for the next line like any pipe line after text, then stays text', () => {
    expect(html(renderOpen('- item\n| a | b |'))).toBe('<ul><li>item</li></ul>');
    expect(html(renderOpen('> quote\n| a'))).toBe('<blockquote><p>quote</p></blockquote>');
    expect(html(renderOpen('- item\n| a | b |\nmore'))).toBe('<ul><li>item\n| a | b |\nmore</li></ul>');
    expect(html(renderOpen('- item\n| a | b |\n|---'))).toBe('<ul><li>item\n| a | b |\n|---</li></ul>');
  });
  it('a lazy header over a delimiter row that is inside the item or quote is a table, as in GFM', () => {
    const cases: [string, string][] = [
      ['> a\n| b | c |\n> |---|---|\n> | 1 | 2 |', `<blockquote><p>a</p>${TBL(['b', 'c'], ['1', '2'])}</blockquote>`],
      ['> a\nfoo | bar\n> --|--\n> 1 | 2', `<blockquote><p>a</p>${TBL(['foo', 'bar'], ['1', '2'])}</blockquote>`],
      ['- a\n| b | c |\n  |---|---|\n  | 1 | 2 |', `<ul><li>a${TBL(['b', 'c'], ['1', '2'])}</li></ul>`],
    ];
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(html(render(md, split)), `${JSON.stringify(md)} ${split}`).toBe(want);
  });
  it('a line with a pipe stays visible while it is the last line, and is hidden only while a delimiter row is arriving', () => {
    expect(html(renderOpen('Intro\nuse a | b here'))).toBe('<p>Intro\nuse a | b here</p>');
    for (const open of ['Intro\na | b\n-', 'Intro\na | b\n--|', 'Intro\na | b\n--|--'])
      expect(html(renderOpen(open)), JSON.stringify(open)).toBe('<p>Intro</p>');
    expect(html(renderOpen('Intro\na | b\n--|--\n'))).toBe(`<p>Intro</p>${TBL_OPEN(['a', 'b'])}`);
    expect(html(renderOpen('Intro\na | b\nmore'))).toBe('<p>Intro\na | b\nmore</p>');
  });
  it('a pipe line after text waits for the next line before it is shown, and then becomes a table head or text', () => {
    for (const open of ['Intro\n| a | b |', 'Intro\n| a | b |\n|', 'Intro\n| a | b |\n|--', 'Intro\n| a | b |\n| -'])
      expect(html(renderOpen(open)), JSON.stringify(open)).toBe('<p>Intro</p>');
    expect(html(renderOpen('Intro\n| a | b |\n|---|---|'))).toBe('<p>Intro</p>');
    expect(html(renderOpen('Intro\n| a | b |\n|---|---|\n'))).toBe(`<p>Intro</p>${TBL_OPEN(['a', 'b'])}`);
    expect(html(renderOpen('Intro\n| a | b |\nmore'))).toBe('<p>Intro\n| a | b |\nmore</p>');
  });
  it('while a delimiter row is still arriving and can still grow to the header width, the table head shows', () => {
    const head =
      '<div tabindex="0" role="group" aria-label="Table"><table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody></tbody></table></div>';
    for (const row of ['|---', '|---|--', '|---|---|', '|---|---|---']) expect(html(renderOpen(`| a | b | c |\n${row}`)), row).toBe(head);
    expect(html(renderOpen('| a | b |\n|---|---|---'))).toBe('<p>| a | b |\n|---|---|---</p>');
  });
  it('a header that can no longer be a table becomes text once its delimiter row ends', () => {
    expect(html(renderOpen('| a | b | c |\n|---|---|\n'))).toBe('<p>| a | b | c |\n|---|---|</p>');
  });
  it('three tildes never strike text out, even while the text is still open', () => {
    expect(html(renderOpen('a ~~~x'))).toBe('<p>a ~~~x</p>');
  });
});

describe('alerts', () => {
  const A = (kind: string, title: string, body = '') =>
    `<blockquote class="limmat-alert limmat-alert-${kind}"><p class="limmat-alert-title">${title}</p>${body}</blockquote>`;
  const raw = (md: string, split: 'whole' | 'char' = 'whole') => render(md, split).innerHTML;
  const both = (cases: [string, string][], fn: (s: string, split: 'whole' | 'char') => string = raw) => {
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(fn(md, split), `${JSON.stringify(md)} ${split}`).toBe(want);
  };
  it('a block quote that starts with [!TYPE] on its own line is an alert, for all five types and any letter case', () => {
    both([
      ['> [!NOTE]\n> Useful', A('note', 'Note', '<p>Useful</p>')],
      ['> [!TIP]\n> Useful', A('tip', 'Tip', '<p>Useful</p>')],
      ['> [!IMPORTANT]\n> Useful', A('important', 'Important', '<p>Useful</p>')],
      ['> [!WARNING]\n> Useful', A('warning', 'Warning', '<p>Useful</p>')],
      ['> [!CAUTION]\n> Useful', A('caution', 'Caution', '<p>Useful</p>')],
      ['> [!note]\n> Useful', A('note', 'Note', '<p>Useful</p>')],
      ['> [!Warning]  \n> Useful', A('warning', 'Warning', '<p>Useful</p>')],
      ['>[!NOTE]\n>Useful', A('note', 'Note', '<p>Useful</p>')],
    ]);
  });
  it('the body can hold any blocks, and a lazy line continues its paragraph', () => {
    both([
      ['> [!WARNING]\n> - a\n> - b', A('warning', 'Warning', '<ul class="limmat-list"><li>a</li><li>b</li></ul>')],
      ['> [!NOTE]\n> a\n>\n> b', A('note', 'Note', '<p>a</p><p>b</p>')],
      ['> [!NOTE]\n> **a** and `b`', A('note', 'Note', '<p><strong>a</strong> and <code class="limmat-inline-code">b</code></p>')],
      ['> [!NOTE]\nlazy', A('note', 'Note', '<p>lazy</p>')],
      ['> [!NOTE]\n> a\n\nafter', `${A('note', 'Note', '<p>a</p>')}<p>after</p>`],
    ]);
  });
  it('a marker with no content after it is no alert, as on GitHub', () => {
    const q = (x: string) => `<blockquote>${x}</blockquote>`;
    both([
      ['> [!NOTE]', q('<p>[!NOTE]</p>')],
      ['> [!NOTE]\n', q('<p>[!NOTE]</p>')],
      ['> [!NOTE]\n>', q('<p>[!NOTE]</p>')],
      ['> [!NOTE]\n> ', q('<p>[!NOTE]</p>')],
      ['> [!NOTE]\n\nafter', `${q('<p>[!NOTE]</p>')}<p>after</p>`],
      ['> [!NOTE]\n> \n> x', A('note', 'Note', '<p>x</p>')],
    ]);
  });
  it('anything else stays a plain block quote, as before', () => {
    const q = (x: string) => `<blockquote>${x}</blockquote>`;
    both([
      ['> [!NOTE] same line', q('<p>[!NOTE] same line</p>')],
      ['> [!NOTES]\n> x', q('<p>[!NOTES]\nx</p>')],
      ['> [!INFO]\n> x', q('<p>[!INFO]\nx</p>')],
      ['> [!NOTE\n> x', q('<p>[!NOTE\nx</p>')],
      ['> [! NOTE]\n> x', q('<p>[! NOTE]\nx</p>')],
      ['> text\n> [!NOTE]', q('<p>text\n[!NOTE]</p>')],
      ['> [!NOTE', q('<p>[!NOTE</p>')],
      ['[!NOTE]\n> x', `<p>[!NOTE]</p>${q('<p>x</p>')}`],
      ['> > [!NOTE]\n> > x', q(q('<p>[!NOTE]\nx</p>'))],
      ['- > [!NOTE]\n  > x', `<ul class="limmat-list"><li>${q('<p>[!NOTE]\nx</p>')}</li></ul>`],
    ]);
  });
  it('an alert inside another quote, a list item, or a details block is a plain quote, as on GitHub', () => {
    expect(render('> a\n>\n> > [!NOTE]\n> > x').innerHTML).not.toContain('alert');
    expect(render('<details>\n\n> [!NOTE]\n> x\n\n</details>').innerHTML).not.toContain('alert');
  });
  it('the title uses labels, and a blank label keeps the English word', () => {
    const r = (labels: Record<string, string>) => {
      const root = document.createElement('div');
      const x = createRenderer(root, { throttleMs: 0, labels });
      x.write('> [!TIP]\n> a\n\n> [!CAUTION]\n> b');
      x.end();
      return Array.from(root.querySelectorAll('.limmat-alert-title')).map((e) => e.textContent);
    };
    expect(r({ tip: 'Tipp', caution: 'Achtung' })).toEqual(['Tipp', 'Achtung']);
    expect(r({ tip: '', caution: '  ' })).toEqual(['Tip', 'Caution']);
  });
  it('a title with a custom classPrefix uses it', () => {
    const root = document.createElement('div');
    const x = createRenderer(root, { throttleMs: 0, classPrefix: 'zz' });
    x.write('> [!NOTE]\n> a');
    x.end();
    expect(root.innerHTML).toBe('<blockquote class="zz-alert zz-alert-note"><p class="zz-alert-title">Note</p><p>a</p></blockquote>');
  });
  it('while the marker is still arriving or has no content yet, nothing of it shows, and the title appears with the first content', () => {
    const q = (x = '') => `<blockquote>${x}</blockquote>`;
    const open = (md: string) => renderOpen(md).innerHTML;
    for (const md of [
      '> [',
      '> [!',
      '> [!N',
      '> [!NOTE',
      '> [!NOTE]',
      '> [!NOTE]  ',
      '> [!caut',
      '> [!NOTE]\n',
      '> [!NOTE]\n>',
      '> [!NOTE]\n> ',
    ]) {
      expect(open(md), JSON.stringify(md)).toBe(q());
    }
    expect(open('> [!NOTE]\n> te')).toBe(A('note', 'Note', '<p>te</p>'));
    expect(open('> [!NOTE] t')).toBe(q('<p>[!NOTE] t</p>'));
    // An open bracket is not shown while it can still become a link, so these two lose their `[` until the reply ends.
    expect(open('> [!NOTEX')).toBe(q('<p>!NOTEX</p>'));
    expect(open('> [x')).toBe(q('<p>x</p>'));
  });
  it('a held first line is the same one-character-at-a-time as in one write, and at the end it becomes text if it is no alert', () => {
    for (const md of ['> [!NOTE', '> [!', '> [', '> [!NOTE] x\n> y', '> [!NOTE]\n> y\n']) {
      expect(raw(md, 'char'), JSON.stringify(md)).toBe(raw(md, 'whole'));
    }
  });
});

describe('entities', () => {
  // Expected output comes from cmark-gfm 0.29 (numeric references, and the names amp, lt, gt, quot, apos, nbsp).
  const raw = (md: string, split: 'whole' | 'char' = 'whole') => html(render(md, split));
  const both = (cases: [string, string][], fn: (s: string, split: 'whole' | 'char') => string = raw) => {
    for (const [md, want] of cases)
      for (const split of ['whole', 'char'] as const) expect(fn(md, split), `${JSON.stringify(md)} ${split}`).toBe(want);
  };
  it('numeric references and the names amp, lt, gt, quot, apos, and nbsp become their character', () => {
    both([
      ['&amp; &lt; &gt; &quot; &apos;', '<p>&amp; &lt; &gt; " \'</p>'],
      ['a&nbsp;b', '<p>a&nbsp;b</p>'],
      ['&#35; &#x23; &#X23; &#0000065; &#x1F600;', '<p># # # A \u{1F600}</p>'],
      ['AT&amp;T and R&#38;D', '<p>AT&amp;T and R&amp;D</p>'],
    ]);
  });
  it('a code point that does not exist becomes the replacement character', () => {
    both([
      ['&#0; &#xD800; &#x110000; &#1234567;', '<p>\uFFFD \uFFFD \uFFFD \uFFFD</p>'],
      ['&#xDFFF; &#xD7FF;', '<p>\uFFFD \uD7FF</p>'],
    ]);
  });
  it('anything that is not one of those stays literal, like the spec says for a bad reference', () => {
    both([
      [
        '&copy; &foo; &amp &AMP; &Amp; &#; &#x; &#xZ; &#abc;',
        '<p>&amp;copy; &amp;foo; &amp;amp &amp;AMP; &amp;Amp; &amp;#; &amp;#x; &amp;#xZ; &amp;#abc;</p>',
      ],
      ['&#12345678; &#x1234567;', '<p>&amp;#12345678; &amp;#x1234567;</p>'],
      ['\\&amp; \\\\&amp;', '<p>&amp;amp; \\&amp;</p>'],
    ]);
  });
  it('a decoded character is only text: it never starts markup, a block, or a tag', () => {
    both([
      ['&lt;b&gt;x&lt;/b&gt;', '<p>&lt;b&gt;x&lt;/b&gt;</p>'],
      ['&#42;foo&#42; and &#95;bar&#95;', '<p>*foo* and _bar_</p>'],
      ['&#35; not a heading', '<p># not a heading</p>'],
      ['&#45; not a list', '<p>- not a list</p>'],
      ['&gt; not a quote', '<p>&gt; not a quote</p>'],
      ['&#96;not code&#96;', '<p>`not code`</p>'],
      ['&#91;a&#93;(/p/)', '<p>[a](/p/)</p>'],
      ['&#60;script&#62;alert(1)&#60;/script&#62;', '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'],
    ]);
  });
  it('code spans and fenced code keep the text as written', () => {
    both([
      ['`&amp; &#35;`', '<p><code>&amp;amp; &amp;#35;</code></p>'],
      ['``&lt;``', '<p><code>&amp;lt;</code></p>'],
    ]);
    const code = (md: string) => render(md).querySelector('code')!.textContent;
    expect(code('```\n&amp; &#35;\n```')).toBe('&amp; &#35;');
  });
  it('they decode inside headings, emphasis, list items, quotes, tables, link text, and details', () => {
    both([
      ['# a &amp; b', '<h1>a &amp; b</h1>'],
      ['**a &lt; b**', '<p><strong>a &lt; b</strong></p>'],
      ['- a &gt; b', '<ul><li>a &gt; b</li></ul>'],
      ['> a &amp; b', '<blockquote><p>a &amp; b</p></blockquote>'],
      ['[a &amp; b](/p/)', '<p><a href="/p/">a &amp; b</a></p>'],
    ]);
    const cell = render('| a |\n|---|\n| x &amp; y |').querySelector('td')!.textContent;
    expect(cell).toBe('x & y');
    const sum = render('<details>\n<summary>a &amp; b</summary>\n\nbody\n\n</details>').querySelector('summary')!.textContent;
    expect(sum).toBe('a & b');
  });
  it('a link destination decodes them before the URL check, so a disguised javascript: is still refused', () => {
    both([
      ['[a](https://x.com/?a=1&amp;b=2)', '<p><a href="https://x.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">a</a></p>'],
      ['[a](<https://x.com/?a&#38;b>)', '<p><a href="https://x.com/?a&amp;b" target="_blank" rel="noopener noreferrer">a</a></p>'],
      ['[a](&#106;avascript:alert(1))', '<p>a</p>'],
      ['[a](&#x6A;avascript&colon;alert(1))', '<p>a</p>'],
      ['[a](java&#9;script:alert(1))', '<p>a</p>'],
      ['[a](java&#10;script:alert(1))', '<p>a</p>'],
      ['[a](&#47;&#47;evil.example)', '<p>a</p>'],
      ['![a](&#106;avascript:alert(1))', '<p><span>Image not shown: a</span></p>'],
    ]);
  });
  it('an autolink and a bare URL are not decoded', () => {
    both([
      [
        '<https://x.com/?a&amp;b>',
        '<p><a href="https://x.com/?a&amp;amp;b" target="_blank" rel="noopener noreferrer">https://x.com/?a&amp;amp;b</a></p>',
      ],
      [
        'https://x.com/?a&amp;b',
        '<p><a href="https://x.com/?a&amp;amp;b" target="_blank" rel="noopener noreferrer">https://x.com/?a&amp;amp;b</a></p>',
      ],
    ]);
  });
  it('while streaming, a reference that is still arriving is held back, and it shows as written once it cannot complete', () => {
    const open = (md: string) => html(renderOpen(md));
    for (const [md, want] of [
      ['a &', '<p>a </p>'],
      ['a &a', '<p>a </p>'],
      ['a &am', '<p>a </p>'],
      ['a &amp', '<p>a </p>'],
      ['a &amp;', '<p>a &amp;</p>'],
      ['a &#', '<p>a </p>'],
      ['a &#12', '<p>a </p>'],
      ['a &#x', '<p>a </p>'],
      ['a &#x1F60', '<p>a </p>'],
      ['a &#x1F600;', '<p>a \u{1F600}</p>'],
      ['AT&T', '<p>AT&amp;T</p>'],
      ['a &foo', '<p>a &amp;foo</p>'],
      ['a &#12345678', '<p>a &amp;#12345678</p>'],
      ['a &#xZ', '<p>a &amp;#xZ</p>'],
      ['**a &am', '<p><strong>a </strong></p>'],
      ['- a &am', '<ul><li>a </li></ul>'],
      ['> a &am', '<blockquote><p>a </p></blockquote>'],
    ] as [string, string][])
      expect(open(md), JSON.stringify(md)).toBe(want);
  });
  it('at the end of the message a half-typed reference is plain text', () => {
    expect(html(render('a &am'))).toBe('<p>a &amp;am</p>');
    expect(html(render('a &#12'))).toBe('<p>a &amp;#12</p>');
    expect(html(render('a &'))).toBe('<p>a &amp;</p>');
  });
});
