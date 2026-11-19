export const REPLY = `## Ada's research

Ada wrote a **federated learning** paper, see [the paper](/research/federated-learning-paper/) and [Wikipedia](https://en.wikipedia.org/wiki/Federated_learning). It used \`FedAvg\` with *non-IID* data.

### What was built

- A VS Code extension with \`fast\` startup
- *Cloud* tooling at **Acme**
  - nested bullet one
  - nested bullet two
- A chat assistant

1. Read the paper
2. Run the code
3. Ask questions

| Project | Role | Year |
|---|---|---|
| Federated paper | Author | 2024 |
| VS Code extension | Maintainer | 2023 |
| Chat | Builder | 2026 |

Here is a snippet:

\`\`\`ts
function add(a: number, b: number): number {
  // a < b && c > d
  return a + b;
}
\`\`\`

- [x] Ship the chat
- [ ] Write more tests

> Federated learning keeps data on device.

That is **all** for now, see https://example.com for more.
`;

export const XSS: [string, string][] = [
  ['script tag', '<script>alert(1)</script>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['js: link', '[x](javascript:alert(1))'],
  ['JaVaScRiPt: link', '[x](JaVaScRiPt:alert(1))'],
  ['entity js: link', '[x](java&#115;cript:alert(1))'],
  ['hex entity js:', '[x](&#x6A;avascript:alert(1))'],
  ['tab in js:', '[x](java\tscript:alert(1))'],
  ['leading space js:', '[x](  javascript:alert(1))'],
  ['angle js: dest', '[x](<javascript:alert(1)>)'],
  ['data: link', '[x](data:text/html,<script>alert(1)</script>)'],
  ['vbscript: link', '[x](vbscript:msgbox(1))'],
  ['protocol-rel //evil', '[x](//evil.com)'],
  ['backslash /\\evil', '[x](/\\evil.com)'],
  ['html in table cell', '| a |\n|---|\n| <img src=x onerror=alert(1)> |'],
  ['svg onload', '<svg onload=alert(1)>'],
  ['math/mtext script', '<math><mtext><script>alert(1)</script></mtext></math>'],
  ['onclick attr', '<a href="x" onclick="alert(1)">hi</a>'],
  ['title quote breakout', '[a](http://x.com "t\\" onmouseover=\\"alert(1)")'],
  ['url quote breakout', '[a](http://x.com/" onmouseover="alert(1))'],
  ['nested malformed', '<div><p><b><script>alert(1)</p></b>'],
  ['html in link text', '[<img src=x onerror=alert(1)>](https://ok.com)'],
  ['image js:', '![x](javascript:alert(1))'],
  ['iframe js:', '<iframe src="javascript:alert(1)"></iframe>'],
  ['autolink quote', '<https://x.com/"onmouseover="alert(1)>'],
  ['autolink js:', '<javascript:alert(1)>'],
  ['fence lang breakout', '```"><script>alert(1)</script>\ncode\n```'],
  ['form action js:', '<form action=javascript:alert(1)><button>x</button></form>'],
  ['style tag', '<style>*{background:url(javascript:alert(1))}</style>'],
  ['ref link js:', '[x]: javascript:alert(1)\n\n[x]'],
  ['html comment + script', '<!-- --><script>alert(1)</script>'],
  ['details ontoggle', '<details open ontoggle=alert(1)>x</details>'],
  ['link title onclick', '[a](https://ok.com "x" onclick=alert(1))'],
  ['table cell js: link', '| a |\n|---|\n| [x](javascript:alert(1)) |'],
  ['bare www/js autolink', 'javascript:alert(1) and www.evil.com'],
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
  ['image in link, both js:', '[![x](javascript:alert(1))](javascript:alert(2))'],
  ['image data: svg', '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)'],
  ['image data: html', '![x](data:text/html,<script>alert(1)</script>)'],
  ['image protocol-relative', '![x](//evil.com/track.png)'],
  ['image backslash host', '![x](/\\evil.com/track.png)'],
  ['image vbscript:', '![x](vbscript:msgbox(1))'],
  ['image blob:', '![x](blob:https://evil.com/x)'],
  ['image file:', '![x](file:///etc/passwd)'],
  ['image zero-width in js:', '![x](java\u200bscript:alert(1))'],
  ['image newline entity js:', '![x](java&NewLine;script:alert(1))'],
  ['image alt attribute breakout', '![x" onerror="alert(1)](javascript:alert(1))'],
  ['image title breakout', '![x](javascript:alert(1) "t\\" onerror=\\"alert(1)")'],
  ['image src quote breakout', '![x](javascript:/" onerror="alert(1))'],
  ['image nested in image alt', '![![x](javascript:a)](javascript:b)'],
  ['allowed tag with an event handler', '<b onclick=alert(1)>x</b>'],
  ['allowed tag with slash and handler', '<kbd/onclick=alert(1)>k</kbd>'],
  ['allowed tag with newline and handler', '<b\nonclick=alert(1)>x</b>'],
  ['allowed tag with style', '<mark style="background:url(javascript:alert(1))">m</mark>'],
  ['script inside an allowed tag', '<sup><script>alert(1)</script></sup>'],
  ['uppercase img inside an allowed tag', '<KBD><IMG SRC=x onerror=alert(1)></KBD>'],
  ['unclosed allowed tag with script', '<b><script>alert(1)'],
  ['bad link inside an allowed tag', '<u>[x](javascript:alert(1))</u>'],
  ['allowed tag split across a link label', '[<b>x](javascript:alert(1))</b>'],
  ['allowed tag in an image alt', '![<b onerror=alert(1)>x](javascript:alert(1))'],
  ['details with an event handler', '<details onclick=alert(1)>\nx\n</details>'],
  ['details open with ontoggle', '<details open ontoggle=alert(1)>\nx\n</details>'],
  ['details ontoggle before open', '<details ontoggle=alert(1) open>\nx\n</details>'],
  ['details empty open value with handler', '<details open="" ontoggle=alert(1)>\nx\n</details>'],
  ['details uppercase with newline attribute', '<DETAILS OPEN\nonclick=alert(1)>\nx\n</DETAILS>'],
  ['details with name id and style', '<details name=x id=y style="x:y">\nx\n</details>'],
  ['details slash open', '<details/open>\nx\n</details>'],
  ['one-line details with a handler', '<details onclick=alert(1)><summary>S</summary>\nx\n</details>'],
  ['summary with a handler', '<details>\n<summary onclick=alert(1)>S</summary>\nx\n</details>'],
  ['one-line summary with a handler', '<details><summary onclick=alert(1)>S</summary>\nx\n</details>'],
  ['script inside a summary', '<details>\n<summary><script>alert(1)</script></summary>\nx\n</details>'],
  ['bad link in a summary', '<details>\n<summary>[x](javascript:alert(1))</summary>\nx\n</details>'],
  ['script after the closer', '</details><script>alert(1)</script>'],
  ['closer with an attribute', '<details>\nx\n</details open onclick=alert(1)>'],
  ['nested details with ontoggle', '<details>\n<details open ontoggle=alert(1)>\nx\n</details>\n</details>'],
  ['lookalike letters in details', '<detailſ>\nx\n</detailſ>\n<DETAİLS>\nx\n</DETAİLS>'],
  ['details with invisible characters', '<details\u200b>\nx\n</details\u200b>\n<details\u0000>\nx'],
  ['fence language breakout inside details', '<details>\n```a b" onclick="alert(1)\ncode\n```\n</details>'],
  ['form and style inside details', '<details>\n<form action=javascript:alert(1)>\n<style>*{x:y}</style>\n</details>'],
  ['details in a table cell', '| a |\n|---|\n| <details open ontoggle=alert(1)> |'],
  ['details in a list item with an iframe', '- <details>\n  <iframe src=javascript:alert(1)>\n  </details>'],
  ['table align injection', '| a |\n|:"onclick=x:|\n| b |'],
  ['task checkbox html', '- [x] <input type=text onfocus=alert(1)>'],
  ['unclosed everything', '<script>alert(1) **x [y](javascript:z `c'],
];

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
  '<details>\n<summary>Why *this* works</summary>\n\nIt has **markdown**, a list:\n\n- one\n- two\n\n```js\nlet x = 1;\n```\n\n</details>\n\nAfter the section.',
  '<details open><summary>Open by default</summary>\n\n> a quote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<details>\n<summary>Nested</summary>\ninner text\n</details>\n\n</details>',
  '<details><summary>One line summary</summary>\nbody\n</details>\nplain\n\n</details>\n\n<details>\nnever closed, with *open emphasis',
  '- item\n  <details>\n  <summary>In a list</summary>\n  text\n  </details>\n\n> <details>\n> <summary>In a quote</summary>\n> text\n> </details>',
  'Press <KBD>Ctrl</KBD>+<kbd>C</kbd> to copy, H<sub>2</sub>O and x<sup>2</sup>, <mark>this</mark> and <b>bold *nested* <u>under</u></b>, then a stray </i> or a <kb or a < b.',
  'Struck ~~out~~ and ~~half~ and ~one~ tilde, <https://auto.link/x> and <me@example.com> and <ftp://x.example/y> and a < b.',
  'Nesting: **bold ~~and _all_~~** then **~~_x_~~** and *_y_*, and an emoji \ud83d\ude00 right here.',
  'Name | Role | Team\n--|---|:-:\nAda | Engineer | Core\nLin | Writer | Docs\n\nA pipe | in prose\n- stays a list\n\nx | y\n---\n\nDone.',
];
