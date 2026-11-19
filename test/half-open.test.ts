import { describe, expect, it } from 'vitest';
import { html, renderOpen } from './helpers/util';

// What a table whose delimiter row is still arriving shows: the header cells and no rows.
const TABLE_HEAD =
  '<div tabindex="0" role="region" aria-label="Table"><table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody></tbody></table></div>';

const cases: [string, string, string][] = [
  ['open bold', 'wrote a **federated lear', '<p>wrote a <strong>federated lear</strong></p>'],
  ['open italic', 'a *b c', '<p>a <em>b c</em></p>'],
  ['open strike', 'a ~~b', '<p>a <del>b</del></p>'],
  ['open strike with one closing tilde', 'a ~~struck~', '<p>a <del>struck</del></p>'],
  ['a lone trailing tilde waits for a possible second one', 'about ~', '<p>about </p>'],
  ['a tilde followed by text is text', 'about ~5', '<p>about ~5</p>'],
  ['open autolink', 'see <https://exa', '<p>see </p>'],
  ['open autolink, scheme not finished', 'see <http', '<p>see </p>'],
  ['open email autolink', 'mail <me@ex', '<p>mail </p>'],
  ['a less-than sign before a space is text', 'a < b', '<p>a &lt; b</p>'],
  ['open nested', 'a **b *c', '<p>a <strong>b <em>c</em></strong></p>'],
  ['trailing delimiter hidden', 'a **', '<p>a </p>'],
  ['two delimiter runs at the end are hidden', 'a **~~', '<p>a </p>'],
  ['bold opener then an underscore run is hidden', 'a **_', '<p>a </p>'],
  ['italic opener then an underscore run is hidden', 'a *_', '<p>a </p>'],
  ['strike opener then a bold run is hidden', 'a ~~**', '<p>a </p>'],
  ['underscore opener then a bold run is hidden', 'a _**', '<p>a </p>'],
  ['three delimiter runs at the end are hidden', 'a **~~_', '<p>a </p>'],
  ['a delimiter run after text still closes the open span', 'a **b *', '<p>a <strong>b </strong></p>'],
  ['a lone high surrogate waits for its other half', 'hi \ud83d', '<p>hi</p>'],
  ['a whole emoji is kept', 'hi \ud83d\ude00', '<p>hi \ud83d\ude00</p>'],
  ['open inline code', 'use `fo', '<p>use <code>fo</code></p>'],
  ['open link text', 'see [the pap', '<p>see the pap</p>'],
  ['label closed, no paren yet', 'see [the paper]', '<p>see the paper</p>'],
  ['open link destination', 'see [the paper](/research/fed', '<p>see the paper</p>'],
  ['open link title', 'see [p](https://x.com "ti', '<p>see p</p>'],
  ['open image', 'x ![alt te', '<p>x alt te</p>'],
  ['open image destination', 'x ![alt](https://e.com/a.p', '<p>x alt</p>'],
  ['bare url while typing', 'go https://exa', '<p>go <a href="https://exa" target="_blank" rel="noopener noreferrer">https://exa</a></p>'],
  ['lone bracket pair stays literal after more text', 'a [1] b', '<p>a [1] b</p>'],
  ['heading', '## Titl', '<h2>Titl</h2>'],
  ['hash without space is text', '#hashtag', '<p>#hashtag</p>'],
  ['pipeless table, delimiter row half typed', 'a | b | c\n--|---', TABLE_HEAD],
  ['pipeless table, delimiter row only dashes so far', 'a | b | c\n--', TABLE_HEAD],
  ['pipeless table, delimiter row with a colon', 'a | b | c\n:--|', TABLE_HEAD],
  ['pipeless table, delimiter row with a colon and one dash', 'a | b | c\n:-', TABLE_HEAD],
  ['a pipe in prose before a list stays a paragraph', 'a | b\n- i', '<p>a | b</p><ul><li>i</li></ul>'],
  ['a pipe in prose before a lone dash stays a paragraph', 'a | b\n-', '<p>a | b</p>'],
  [
    'an open bold in a header cell that is still arriving',
    '| a | **b',
    '<div tabindex="0" role="region" aria-label="Table"><table><thead><tr><th>a</th><th><strong>b</strong></th></tr></thead><tbody></tbody></table></div>',
  ],
  [
    'a lone marker in a header cell that is still arriving',
    '| a | *',
    '<div tabindex="0" role="region" aria-label="Table"><table><thead><tr><th>a</th><th></th></tr></thead><tbody></tbody></table></div>',
  ],
  ['open list item', '- one\n- tw', '<ul><li>one</li><li>tw</li></ul>'],
  ['open nested list', '- a\n  - b\n  - c', '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>'],
  ['open blockquote', '> quote *it', '<blockquote><p>quote <em>it</em></p></blockquote>'],
];

describe('half-open constructs show no raw markers', () => {
  for (const [name, md, expected] of cases) it(name, () => expect(html(renderOpen(md))).toBe(expected));

  it('typing a table one character at a time never shows a pipe', () => {
    const table = '| A | B |\n|---|---|\n| 1 | 2 |';
    for (let i = 1; i <= table.length; i++) expect(renderOpen(table.slice(0, i)).textContent, table.slice(0, i)).not.toContain('|');
  });

  it('a closing asterisk after an open bold never shows a raw asterisk', () => {
    expect(renderOpen('**bold*').textContent).toBe('bold');
  });

  it('typing a table without outer pipes one character at a time never shows the delimiter row', () => {
    const table = 'a | b | c\n--|---|---\n1 | 2 | 3\n';
    for (let i = 1; i <= table.length; i++) expect(renderOpen(table.slice(0, i)).textContent, table.slice(0, i)).not.toContain('--');
  });

  it('typing a strike and an autolink one character at a time never shows a stray tilde or angle bracket', () => {
    const strike = 'It was ~~struck out~~ here.';
    for (let i = 1; i <= strike.length; i++) expect(renderOpen(strike.slice(0, i)).textContent, strike.slice(0, i)).not.toContain('~');
    const link = 'Go to <https://example.com/a> now.';
    for (let i = 1; i <= link.length; i++) expect(renderOpen(link.slice(0, i)).textContent, link.slice(0, i)).not.toContain('<');
    // Before its @ an email address is a name after a <, which looks like any other text, so it shows from the @ on.
    const mail = 'Write <hi@example.com> now.';
    for (let i = mail.indexOf('@') + 1; i <= mail.length; i++)
      expect(renderOpen(mail.slice(0, i)).textContent, mail.slice(0, i)).not.toContain('<');
  });
  it('open fence shows code immediately', () => {
    const root = renderOpen('```ts\nfunction add(a: number, b');
    expect(root.querySelector('code')!.textContent).toBe('function add(a: number, b');
    expect(root.querySelector('pre')).not.toBeNull();
  });
  it('open table shows header cells, then rows', () => {
    expect(renderOpen('| Project | Role |\n|---').querySelectorAll('th').length).toBe(2);
    const t = renderOpen('| A | B |\n|:--|--:|\n| 1 | 2 |\n| 3');
    expect(t.querySelectorAll('tbody tr').length).toBe(2);
    expect(t.querySelectorAll('td')[1].textContent).toBe('2');
  });
  it('closed blocks are frozen: nodes are never replaced', () => {
    const root = document.createElement('div');
    return import('../src/index').then(({ createRenderer }) => {
      const r = createRenderer(root, { throttleMs: 0 });
      r.write('# Head\n\nfirst paragraph\n\nsecond par');
      const first = root.children[0],
        second = root.children[1];
      r.write('agraph continues\n\nthird');
      expect(root.children[0]).toBe(first);
      expect(root.children[1]).toBe(second);
      expect(root.children.length).toBe(4);
    });
  });
});
