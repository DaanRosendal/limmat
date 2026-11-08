// @ts-expect-error plain JS data file from the prototype
import { REPLY as PROTO_REPLY, XSS as PROTO_XSS } from './proto-data.mjs';

export const REPLY: string = PROTO_REPLY;

const EXTRA_XSS: [string, string][] = [
  ['zero-width in js:', '[x](java\u200bscript:alert(1))'],
  ['line separator in js:', '[x](java\u2028script:alert(1))'],
  ['newline entity js:', '[x](java&NewLine;script:alert(1))'],
  ['uppercase data:', '[x](DATA:text/html;base64,PHNjcmlwdD4=)'],
  ['file: link', '[x](file:///etc/passwd)'],
  ['blob: link', '[x](blob:https://evil.com/x)'],
  ['mailto header injection', '[x](mailto:a@b.c?bcc=evil@x.com)'],
  ['nested brackets js:', '[[x](javascript:alert(1))](javascript:alert(2))'],
  ['label is url', '[javascript:alert(1)](javascript:alert(1))'],
  ['class breakout lang', '```a b" onclick="alert(1)\ncode\n```'],
  ['lang with angle', '```<img>\ncode\n```'],
  ['bare javascript autolink', 'see javascript:alert(1) now'],
  ['www autolink js', 'www.evil.com"onmouseover="alert(1)'],
  ['email breakout', 'a"onmouseover="alert(1)@b.com'],
  ['backslash escaped quote', '[a](http://x.com/\\" onmouseover=\\"alert(1))'],
  ['image in link', '[![x](https://evil.com/p.png)](https://ok.com)'],
  ['table align injection', '| a |\n|:"onclick=x:|\n| b |'],
  ['task checkbox html', '- [x] <input type=text onfocus=alert(1)>'],
  ['unclosed everything', '<script>alert(1) **x [y](javascript:z `c'],
];

export const XSS: [string, string][] = [...(PROTO_XSS as [string, string][]), ...EXTRA_XSS];

/** Realistic replies, one per feature area, for the chunk-split fuzz. */
export const CORPUS: string[] = [
  REPLY,
  'Sure! Here is a quick plan:\n\n1. Install the tool with `npm i limmat`\n2. Import `createRenderer`\n3. Call `write()` for each chunk\n\nThat is it, see https://example.com/docs. Questions? Email me at hi@example.com!',
  '## Steps\n\n1) First\n2) Second\n   - nested a\n   - nested b\n3) Third\n\n```bash\nnpm run build\n```\n\nDone.',
  'Use snake_case_names and my_var_2 in code, not *italic* by accident. Also [1] is a citation, not a link, and a (parenthetical) remark.',
  '[Wikipedia](https://en.wikipedia.org/wiki/Foo_(bar)) and [site](/research/x/) and ![img](https://x.com/a.png) and <https://auto.link/x>.',
  '| Name | Qty | Price |\n|:-----|:---:|------:|\n| Apple | 3 | 1.50 |\n| Pear | 10 | 22.00 |\n\nAfter the table.',
  '> Quoted *text* that continues\n> on a second line\n\n> - quoted list\n> - second\n\nPlain again.',
  'Line one  \nline two\\\nline three<br>line four\n\n***bold italic*** and ~~gone~~ and **bold *nested* bold** and *a **b** c*.',
  '- [x] done\n- [ ] todo\n  continuation line\n\n* star list\n* second\n\n---\n\n+ plus list',
  'Unicode: \u{1F600} caf\u00e9 \u4e2d\u6587 \u05e9\u05dc\u05d5\u05dd e\u0301 zero\u200bwidth. **\u00e9motion** and `\u{1F600}`.',
  '```python\ndef f(x):\n    return x * 2  # *not* emphasis\n\n    \n```\nText right after the fence\n- list right after',
  '1. Step one:\n   ```js\n   console.log(1);\n   ```\n2. Step two with `code`\n3. Step three\n\n10. Tenth',
];
