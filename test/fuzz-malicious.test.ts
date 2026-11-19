import { describe, expect, it } from 'vitest';
import { audit, render, rng } from './helpers/util';

const budget = (name: string, md: string, split: 'whole' | number = 'whole') =>
  it(name, () => {
    const t = performance.now();
    const root = render(md, split, { throttleMs: split === 'whole' ? 0 : 50 });
    expect(performance.now() - t).toBeLessThan(30_000); // only catches a real hang: precise budgets live in the Chromium suite
    expect(audit(root)).toEqual([]);
  });

describe('malicious input never throws or hangs', () => {
  for (const [name, unit] of [
    ['*', '*'],
    ['_', '_'],
    ['`', '`'],
    ['~', '~~'],
    ['[', '['],
    ['](', ']('],
    ['![', '!['],
    ['*_', '*_'],
    ['[a](', '[a]('],
    ['<', '<'],
    ['<b>', '<b>'],
    ['</b>', '</b>'],
    ['<b>*', '<b>*'],
    ['<b></i>', '<b></i>'],
    ['<b>x</b>', '<b>x</b>'],
    ['|', '|\n'],
    ['>', '>'],
    ['- ', '- '],
    ['  - ', '  - '],
    ['1. ', '1. '],
    ['# ', '# '],
    ['```', '```\n'],
    ['\\', '\\'],
    ['\n', '\n'],
    ['@', 'a@'],
  ] as const) {
    budget(`100k of ${JSON.stringify(name)}`, unit.repeat(Math.ceil(100_000 / unit.length)));
  }
  budget('deep blockquote', '> '.repeat(5000) + 'x');
  budget('deep list', Array.from({ length: 3000 }, (_, i) => ' '.repeat(i * 2) + '- x').join('\n'));
  budget('deep emphasis', '*a _b '.repeat(5000));
  budget('deep matched emphasis', '*a _b '.repeat(2000) + '_ a*'.repeat(2000));
  budget('100 KB url', '[x](https://a.com/' + 'a'.repeat(100_000) + ')');
  budget('100 KB unclosed url', '[x](https://a.com/' + 'a'.repeat(100_000));
  budget('long unclosed url, char chunks', '[x](http://a.com/' + 'a'.repeat(100_000), 1);
  budget('wide table', '|' + 'a|'.repeat(5000) + '\n|' + '-|'.repeat(5000) + '\n|' + 'b|'.repeat(5000));
  budget('1 MB text', 'word '.repeat(200_000));
  budget('1 MB text in 5 char chunks', 'word '.repeat(200_000), 5);

  it('random bytes and random markdown tokens', () => {
    const r = rng(42);
    const toks = [
      '*',
      '**',
      '_',
      '`',
      '```',
      '[',
      ']',
      '(',
      ')',
      '![',
      '|',
      '\n',
      '\n\n',
      '> ',
      '- ',
      '1. ',
      '# ',
      ' ',
      '  ',
      '<',
      '>',
      '&',
      '\\',
      '~~',
      '://',
      'http',
      'www.',
      '@',
      'a',
      'b',
      '\u0000',
      '\u200b',
      '\u{1F600}',
      '\ud800',
    ];
    for (let n = 0; n < 400; n++) {
      let s = '';
      const len = 1 + Math.floor(r() * 80);
      for (let i = 0; i < len; i++) s += r() < 0.15 ? String.fromCharCode(Math.floor(r() * 65536)) : toks[Math.floor(r() * toks.length)];
      const whole = render(s);
      expect(audit(whole)).toEqual([]);
      expect(render(s, 'random', {}, n).innerHTML).toBe(whole.innerHTML);
    }
  });
});
