# Math

limmat draws no formulas itself. With the `renderMath` option set, each finished formula goes to your function, so you pick the library (KaTeX, Temml, MathJax). Without it, math stays plain text.

```ts
import katex from 'katex';
import { createRenderer } from 'limmat';
import { katexMath } from 'limmat/katex';
import 'katex/dist/katex.min.css'; // also brings the fonts

createRenderer(el, { renderMath: katexMath(katex) });
```

## What counts as a formula

| You write | It is |
|---|---|
| `\(x^2\)` | inline math |
| `$x^2$` | inline math, with no space just inside the dollars. A closing `$` after a number is not followed by a digit, so `$5 and $10` and `$5-$10` stay text. `singleDollarMath: false` turns this form off. |
| `\[x^2\]` and `$$x^2$$` in a sentence | display math |
| a line with only `$$` (or `\[`), the tex, and a line that ends with `$$` (or `\]`) | display math as a block. The tex can hold blank lines and lines that start like markdown (`- x`, `---`). |
| a `\begin{aligned}` (or `cases`, `matrix`, `pmatrix`, and so on) line, through its `\end{...}` line | display math as a block, with no delimiters around it |

A formula inside a code span or fence is code. A `\$` is a dollar sign. While a formula is still arriving, the reader sees its tex as plain text without the delimiters, and a single `$` that has not closed yet shows as a `$`. A formula that never closes is text when the message ends: `\(` and `\[` keep their usual markdown meaning (`(` and `[`), and a block that never closes shows its lines as a paragraph. An unclosed block holds the rest of the message until it closes, like an open code fence.

Known limits:

- A block needs `$$` or `\[` alone on its line. `$$ x` followed by lines and a closing `$$` is a paragraph, not a block.
- In a table cell, `|` ends the cell before the formula is read, so write `\|` (which becomes a single `|`) or keep absolute values out of tables.
- `\[1\]` is a display formula, not a citation. Say `[1]` for a citation.
- Shell variables outside backticks can read as a formula: `echo "$HOME" and "$PATH"`. Backticks, or `singleDollarMath: false`, avoid it.

## What your function gets

`renderMath(el, tex, { display })` is called once per finished formula. `el` is a box that is on the page and holds the tex as text: replace its content. The function may return a promise, and the box stays while the message grows, so a library that loads late fills the right box. If it throws or rejects, the box shows the tex as text.

It is not called for a formula that is still open, over 2000 characters, or past the 200th formula or 20000 characters of tex in one message (those stay text). limmat does not check what your function builds (see [SECURITY.md](https://github.com/DaanRosendal/limmat/blob/master/SECURITY.md)), and `limmat/server` does not call it.

## KaTeX

`katexMath(katex, options)` is the adapter above. It renders through KaTeX's DOM path, so it works under a strict `style-src` and Trusted Types, and it keeps these settings (`options` can change the other KaTeX options but not these three):

- `trust: false`, so a formula cannot make a link, load an image, or set an id or a class.
- `throwOnError: true`, so a formula KaTeX cannot parse shows as its tex, not as a red error.
- `displayMode` from the formula.

It also sets `strict: 'ignore'`, `maxExpand: 200` (macro expansions), and `maxSize: 10` (em), which `options` can override. KaTeX does not render in quirks mode, so the page needs `<!doctype html>`.

Checked with KaTeX 0.19 in jsdom, Chromium, Firefox, and WebKit, streamed one character at a time, under a strict CSP.

## Temml

Temml draws with the browser's own MathML (Chrome 109 and newer, Firefox, Safari). It has no fonts to load.

```ts
import temml from 'temml';

createRenderer(el, {
  renderMath: (el, tex, { display }) => temml.render(tex, el, { displayMode: display, throwOnError: true }),
});
```

`throwOnError: true` makes an unparseable formula show as its tex. Checked with Temml 0.14 in Chromium, Firefox, and WebKit.

## MathJax

```ts
createRenderer(el, {
  renderMath: async (el, tex, { display }) => {
    await MathJax.startup.promise;
    el.replaceChildren(await MathJax.tex2svgPromise(tex, { display }));
  },
});
```

Not part of limmat's tests. MathJax can turn `\href{...}` into a link, which skips `allowedProtocols`, so load its `safe` extension, and make it throw on an error (its default shows the error in the page, where limmat cannot see it).
