import { describe, expect, it } from 'vitest';
import { html, render } from './helpers/util';

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
  ['<b>x</b>', '<p>&lt;b&gt;x&lt;/b&gt;</p>'],
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
    expect(boxes.map((b) => [b.type, b.disabled, b.defaultChecked])).toEqual([['checkbox', true, true], ['checkbox', true, false]]);
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
