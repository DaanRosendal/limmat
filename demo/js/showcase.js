// The Showcase stream: one curated reply, about limmat, that uses everything the renderer supports and the hard cases
// that streaming makes hard (half-typed markers, a link cut open, a table that grows, a fence that fills in, nested
// sections, and hostile input that stays inert). Pure data, so a unit test can import it.
// Rules for editing: every block starts a new paragraph or heading, no syntax limmat does not support (see the support
// table), no unclosed fence or <details>, no numbers or option names that the TSDoc in src/index.ts does not state.

export const SHOWCASE = `## Streaming markdown, calmly

**limmat** turns text that arrives in *pieces* into a clean page, one chunk at a time. It is named after the [Limmat](https://en.wikipedia.org/wiki/Limmat), the river through Zurich, because the text arrives as a stream.

### Half-typed markers stay invisible

You never see a stray \`**\` or \`[link](\`. Bold, *italic*, ***both***, ~~strikethrough~~, and \`inline code\` appear only once there is something to show. A link such as [Rust](https://en.wikipedia.org/wiki/Rust_(programming_language)) shows just its label until the closing parenthesis arrives.

Bare addresses like https://example.com/docs, www.example.com, and hi@example.com become links too.

### The same result, however it is cut

1. Text arrives in chunks of any size.
   - A chunk can end inside a word, a marker, or a URL.
   - Only the open block is re-rendered.
2. Once a later block has started on a complete line, the block before it is **frozen**.

### Options that matter

| Option | Default | What it does |
|:-------|:-------:|:-------------|
| \`throttleMs\` | \`50\` | Redraw pause |
| \`images\` | \`true\` | Origin list or \`false\` |
| \`html\` | \`true\` | Which safe tags |

### Using it

\`\`\`sh
npm install limmat
\`\`\`

\`\`\`ts
import { createRenderer } from 'limmat';

const md = createRenderer(
  document.querySelector('#answer')!,
);
for await (const chunk of stream) {
  md.write(chunk);
}
md.end();
\`\`\`

### What it renders today

- [x] Headings, lists, quotes, alerts, and tables with alignment
- [x] Task lists and fenced code with a Copy button
- [x] Collapsible sections and safe tags like <kbd>Ctrl</kbd>
- [ ] Setext headings and indented code
- [ ] Math and footnotes

> Unsupported syntax renders as literal text, never as markup.

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy H<sub>2</sub>O and x<sup>2</sup>, with <mark>highlights</mark>, <ins>additions</ins>, and <del>removals</del>. Images load from this site and from any origin you allow: ![The limmat mark](/limmat-mark.svg)

<details open>
<summary>Is it safe?</summary>

- The page is built with \`createElement\` and text nodes, never HTML strings.
- Every link goes through an allow-list.
- Raw HTML is text, apart from a few attribute-free tags.

<details>
<summary>What about a hostile reply?</summary>

It stays inert. Watch the next section.

</details>

</details>

### Attack replay (inert on purpose)

- [click me](javascript:alert(1))
- [or me](//evil.example)

<script>alert(1)</script>

![tracker](https://evil.example/track.png)

Every payload above stayed plain text, and the tracker image was blocked by the \`images\` allow-list.
`;
