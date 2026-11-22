// The Showcase stream: one short, curated reply about limmat. It is the README GIF, so it packs in what is worth seeing in
// about half a minute: half-typed markers that stay hidden, an alert, inline and display math, a table that grows, a coloured
// code fence, task checkboxes, safe tags, and hostile input that stays inert. Pure data, so a unit test can import it.
// Rules for editing: every block starts a new paragraph or heading, no syntax limmat does not support (see the support
// table), no unclosed fence or <details>, no numbers or option names that the TSDoc in src/index.ts does not state.
// Keep it short: the GIF must stay under 5 MB, and a longer stream costs frames.

export const SHOWCASE = `## Streaming markdown, calmly

**limmat** turns text that arrives in *pieces* into a clean page. You never see a stray \`**\` or \`[link](\` on the way, and it is [named after a river](https://en.wikipedia.org/wiki/Limmat) in Zurich.

> [!TIP]
> Half-typed bold, links, tables, and formulas stay hidden until they are ready.

Math comes from your own KaTeX: \\(e^{i\\pi}+1=0\\) inline, and a display formula that shows its tex until it closes:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

| Option | Default | What it does |
|:-------|:-------:|:-------------|
| \`throttleMs\` | \`50\` | Redraw pause |
| \`renderMath\` | none | Your math library |

\`\`\`ts
import { createRenderer } from 'limmat';
import { katexMath } from 'limmat/katex';

const md = createRenderer(el, {
  renderMath: katexMath(katex),
});
for await (const chunk of stream) {
  md.write(chunk);
}
md.end();
\`\`\`

- [x] Lists, task lists, tables, and ~~plain~~ coloured code
- [x] Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy H<sub>2</sub>O and x<sup>2</sup>
- [x] Hostile input stays text: [click me](javascript:alert(1)) and <script>alert(1)</script>
`;
