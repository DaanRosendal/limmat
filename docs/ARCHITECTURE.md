# Architecture

limmat is five small modules and one stylesheet. Read this page first if you want to fix a bug or add syntax.

```
write(chunk) --> src (string) --> flush() --> scan() --> units --> build() --> DOM
                                      |                              ^
                                      +-- key diff against `tail` ---+
```

| File | Job |
|---|---|
| `src/block.ts` | `scan(lines, ...)` splits lines into `Unit`s (paragraph, heading, fence, quote, list item, table header, table row). Forward-only: a unit followed by a unit that starts on a complete line is final. |
| `src/inline.ts` | `parseInline(text, spec)` turns one block's text into an `Inline` tree. CommonMark's delimiter-stack algorithm for emphasis, a bracket stack for links, linear time, depth and work caps. |
| `src/url.ts` | `safeUrl()`: the only gate between parsed link text and an `href`. |
| `src/index.ts` | `createRenderer()`: the buffer, throttle, `flush()` (diff and freeze), `build()` and `place()` (DOM), the Copy button, and the click listener. |
| `src/highlight.ts` | Optional adapter for `@speed-highlight/core`, shipped as `limmat/highlight`. |
| `src/style.css` | Optional styles, shipped as `limmat/style.css`. |

## The streaming model

`src` holds everything written so far. `flush()` re-scans only the text from `froz`, the offset of the first line that is not frozen yet, and compares the new units with the `tail` of live DOM entries by `key`. Unchanged units keep their node. The first changed unit and everything after it is rebuilt. Units that can no longer change are frozen: their DOM is never touched again and `froz` moves past them.

Rules that must hold (they are also written above `flush()`):

1. **Chunked output equals whole output.** Rendering in any chunking gives the same DOM as rendering at once. `test/chunk-fuzz.test.ts` enforces this on a corpus.
2. **Freeze only behind a complete line.** A unit is frozen only if a later unit starts on a complete line. `test/freeze.test.ts` checks this deterministically.
3. **`spec` vs `final`.** While streaming, the last unit renders with `spec` (speculative): unfinished emphasis, links, and code are closed so raw markers never show. At `end()`, `final` is true: unmatched markers become literal text, and every code block is highlighted.
4. **List and table context** crosses the freeze point in `fctx`, because a list item or table row is its own unit but belongs to a parent element. A blank line ends a table both in `scan()` and in `flush()`.
5. **Open fences update in place**, so the node, scroll position, and text selection survive each chunk.
6. **Hostile input stays linear.** Depth caps, a work budget per paragraph for link destinations, and no regex that backtracks on user text.

## Safety invariants

- No `innerHTML`, `insertAdjacentHTML`, or `outerHTML` in `src/`. Only `createElement`, `textContent`, and text nodes.
- Every `href` comes from `safeUrl()`. Images never create an element.
- Classes and attributes that come from the input (the fence language) are checked against a strict pattern first.

## Adding a block type

1. Add a member to the `Unit` union and a regex or check in `src/block.ts`.
2. Add a branch to `scan()` (keep the priority order in mind) and, if it can interrupt a paragraph, to `interrupts()`.
3. Add a `case` to `build()` in `src/index.ts`, and to `place()` if it needs a parent (as list items and table rows do).
4. If the DOM depends on more than the unit's text, extend the `key` in `flush()`.
5. Tests: a case in `test/helpers/cases.ts` (chunk fuzz and half-open snapshots), a golden entry if the DOM shape matters, and a CommonMark ratchet update if conformance changes.

## Adding an inline construct

1. Tokenize it in `parseInline()` (`src/inline.ts`). If it needs matching, use a delimiter node like emphasis does and resolve it in `resolve()`.
2. Add the shape to the `Inline` union and handle it in `inline()` in `src/index.ts`.
3. Decide what `spec` shows while the construct is open.
4. Tests: the same as for a block, plus a hostile-input case in `test/helpers/cases.ts` if it can produce a link, class, or attribute.

## Stability

See "Stability" in the README. In short: `createRenderer`, the `Renderer` methods, the option names, the `limmat-*` classes, the CSS variables, and the ARIA attributes are stable. The exact set of recognized syntax is not.
