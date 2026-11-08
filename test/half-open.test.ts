import { describe, expect, it } from 'vitest';
import { html, renderOpen } from './helpers/util';

const cases: [string, string, string][] = [
  ['open bold', 'wrote a **federated lear', '<p>wrote a <strong>federated lear</strong></p>'],
  ['open italic', 'a *b c', '<p>a <em>b c</em></p>'],
  ['open strike', 'a ~~b', '<p>a <del>b</del></p>'],
  ['open nested', 'a **b *c', '<p>a <strong>b <em>c</em></strong></p>'],
  ['trailing delimiter hidden', 'a **', '<p>a </p>'],
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
  ['open list item', '- one\n- tw', '<ul><li>one</li><li>tw</li></ul>'],
  ['open nested list', '- a\n  - b\n  - c', '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>'],
  ['open blockquote', '> quote *it', '<blockquote><p>quote <em>it</em></p></blockquote>'],
];

describe('half-open constructs show no raw markers', () => {
  for (const [name, md, expected] of cases) it(name, () => expect(html(renderOpen(md))).toBe(expected));

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
      const first = root.children[0], second = root.children[1];
      r.write('agraph continues\n\nthird');
      expect(root.children[0]).toBe(first);
      expect(root.children[1]).toBe(second);
      expect(root.children.length).toBe(3);
    });
  });
});
