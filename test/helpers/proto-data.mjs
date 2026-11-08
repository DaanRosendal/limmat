export const REPLY = `## Daan's research

Daan wrote a **federated learning** paper, see [the paper](/research/federated-learning-paper/) and [Wikipedia](https://en.wikipedia.org/wiki/Federated_learning). It used \`FedAvg\` with *non-IID* data.

### What he built

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

That is **all** for now, see https://daanrosendal.com for more.
`;
export const MOMENTS = {
  'half-open fence': 'function add(a: number, b',
  'half-open table': '| Project | Role | Year |\n|---',
  'half-open bold': 'wrote a **federated lear',
  'half-open link': '[the paper](/research/fed',
};
export const XSS = [
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
  ['image tag (policy)', '![x](https://evil.com/track.png)'],
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
];
