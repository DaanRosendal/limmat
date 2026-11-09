# limmat

limmat renders streaming markdown into the DOM as it arrives: about 6 kB, safe by default, with no framework.

It is built for chat UIs where an LLM streams a reply in chunks of a few characters. Finished blocks are never touched again, only the open block re-renders (throttled), and half-finished markdown never shows raw markers. Named after the river through Zurich.

- **Safe by construction.** The DOM is built with `createElement` and text nodes only. There is no `innerHTML` and no raw HTML path. Links go through a protocol allow-list, and images are never loaded.
- **Built for streaming.** Linear time overall. In Chromium, a 100 KB reply streamed in 5-character chunks renders in about 12 ms in total.
- **Rich enough for LLM output.** Headings, emphasis, strikethrough, code with a language label and Copy button, lists (nested, task lists), blockquotes, tables with alignment, links, autolinked URLs and emails, hard breaks.
- **Small and dependency-free.** About 6 kB gzip, ESM only, zero runtime dependencies. Optional CSS and a lazy code highlighter adapter.

## Install

```sh
npm install limmat
```

Or copy `dist/limmat.min.js` (and optionally `dist/style.css`) into your project.

## Use

```ts
import { createRenderer } from 'limmat';
import 'limmat/style.css'; // optional

const md = createRenderer(document.querySelector('#answer')!, {
  isInternalPath: (path) => knownPages.has(path),
  onLinkClick: (href, event) => {
    if (href.startsWith('/')) { navigate(href); return true; } // handled
  },
});

for await (const chunk of stream) md.write(chunk);
md.end();
```

Use one renderer per message. `write` takes the new text, not the full text so far.

### Options

| Option | Default | |
|---|---|---|
| `onLinkClick(href, event)` | none | Return `true` if you handled the click. limmat then calls `preventDefault()`. |
| `isInternalPath(path)` | all paths | Site-relative paths (`/research/x/`) become links only if this returns `true`. Others render as plain text. It gets the raw path including any query and hash, may be called more than once per link while the reply streams, and a throw counts as `false`. Check the whole path, not just a prefix: `/research/../admin` starts with `/research/`. |
| `allowedProtocols` | `['https:', 'http:', 'mailto:']` | Anything else renders as plain text. |
| `highlight(el, code, lang)` | none | Called once when a fence closes (or at `end()`). Errors are swallowed and the plain text stays. |
| `throttleMs` | `50` | Minimum time between re-renders of the open block. `0` renders on every write. |
| `classPrefix` | `'limmat'` | Prefix of every generated class. |
| `labels` | English | `copy`, `copied`, `table`, `done`, `todo`. |

### Methods

- `write(chunk)`: add text. The first write renders at once, later writes at most once per `throttleMs`.
- `end()`: render the final state synchronously. Further writes are ignored until `reset()`.
- `reset()`: empty the container and start over, keeping the options.
- `destroy()`: remove the click listener and stop timers. Every later call is a no-op.

### Code highlighting

```ts
import { speedHighlight } from 'limmat/highlight';
createRenderer(el, { highlight: speedHighlight() });
```

This adapter uses [`@speed-highlight/core`](https://github.com/speed-highlight/core), an optional peer dependency you install yourself. Each language loads as its own small chunk the first time it is needed, so a reply without code downloads nothing extra.

### Styling

`limmat/style.css` is optional. It uses CSS variables (`--limmat-link`, `--limmat-border`, ...), follows `prefers-color-scheme`, and supports forced colors and reduced motion. The generated structure is stable:

```
p, h1-h6, hr, blockquote, ul.limmat-list, ol.limmat-list, li
div.limmat-code
  div.limmat-code-head > span.limmat-lang[aria-hidden], button.limmat-copy, span.limmat-status[role=status]
  pre[tabindex=0] > code.limmat-lang-ts
div.limmat-table-wrap[tabindex=0][role=region] > table
a.limmat-link
```

## Security model

- Text always goes through text nodes. Raw HTML in the input is shown as text.
- Links must use an allowed protocol (`https`, `http`, `mailto` by default) or be a site path you approve, and must parse as a URL. `//host`, backslashes, whitespace, control, zero-width, bidi and no-break characters, and everything else are refused, and the label renders as plain text. `javascript:`, `data:` and `vbscript:` are refused even if you list them in `allowedProtocols`.
- External links get `target="_blank"` and `rel="noopener noreferrer"`.
- Images are never created, so they cannot track or exfiltrate. `![alt](url)` renders the alt text.
- The code fence language becomes a class name only if it matches `[A-Za-z0-9_+#-]{1,20}`.
- Nesting is capped (12 block levels, 30 inline levels), link destinations are length-limited, and each reply has a fixed work budget for scanning them, so hostile input cannot overflow the stack or make parsing quadratic. The optional highlighter adapter skips code blocks over 4 KB or with lines over 300 characters, because the highlighter itself is slow on them.
- The `highlight` callback receives the `<code>` element and is trusted code. Pick a highlighter that escapes its input, as `@speed-highlight/core` does.

limmat does not protect you from your own CSS or from what your `onLinkClick` does. See [SECURITY.md](SECURITY.md) to report a problem.

## How it compares

| | limmat | streaming-markdown 0.2.15 |
|---|---|---|
| Size (gzip) | about 6 kB | 3.5 kB |
| Link and image URLs | allow-listed, images never load | not sanitized by the default renderer (`javascript:` and `//host` links pass, any image loads) |
| `snake_case_words` | stay text | become italic |
| `1)` lists, table alignment, bare URLs and emails | supported | not supported |
| `)` inside a URL | handled | ends the link |

A general markdown parser plus a sanitizer re-parses the whole text on every chunk and shows raw markers while a construct is open. limmat was written because neither trade-off suited a small chat widget.

## Tested

`npm run check` runs typecheck, lint, unit tests, a build, a size check, and the browser suite in Chromium, Firefox, and WebKit. Together they cover:

- 56 XSS inputs, executed in real browsers (nothing runs, nothing loads, nothing dangerous in the DOM), plus a malicious-input fuzz and regression tests for every hostile input found in review.
- Chunk-split fuzz: rendering in any chunking gives the same DOM as rendering at once.
- Half-open snapshots for every construct.
- 331 of 471 in-scope CommonMark spec examples, with every known deviation listed, and exact-output golden files for a few documents.
- Performance budgets, a memory test over 1,000 resets, accessibility checks with axe in light, dark and forced colors, keyboard order, and clipboard behavior.

## Browser support

The browser suite runs on current Chromium, Firefox, and WebKit. From the APIs used (`replaceChildren`, `matchAll`, `?.`, `??`, Unicode property escapes, sticky regexes) the minimum should be Chrome 86, Firefox 78, and Safari 14. These floors come from compatibility data, not from tests on old browsers. The optional CSS uses `:has()` and `color-mix()` as upgrades with plain fallbacks: without `:has()` a task-list item shows a bullet next to its checkbox.

## Known gaps

Not supported in v0.1, and shown as plain text or simplified instead:

- Setext headings (`Title` over `---`: the `---` renders a rule).
- Reference links and link reference definitions.
- Raw HTML (except `<br>`), HTML entities (shown literally, which is safe), and math.
- Indented code blocks (use fences), tabs for indentation, footnotes.
- Loose lists render tight. A new list marker type does not start a new list unless it switches between bullets and numbers.
- `#anchor` links and relative links without a leading slash render as plain text.
- `throttleMs: 0` re-renders the open block on every write, so one very long paragraph is quadratic in that mode. The default throttle bounds it.

## License

MIT, Copyright (c) 2026 Daan Rosendal.
