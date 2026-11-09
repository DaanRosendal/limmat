# limmat

limmat renders streaming markdown into the DOM as it arrives: about 7 kB gzip, safe by default, with no framework and no dependencies.

It is built for chat UIs where an LLM streams a reply in chunks of a few characters. Finished blocks are never touched again, only the open block re-renders (throttled), and half-finished markdown never shows raw markers. Named after the river through Zurich.

- **Safe by construction.** The DOM is built with `createElement` and text nodes only. There is no `innerHTML` and no raw HTML path. Links go through a protocol allow-list, and images are never loaded.
- **Built for streaming.** Linear time overall. In Chromium, a 100 KB reply streamed in 5-character chunks renders in about 12 ms in total.
- **Rich enough for LLM output.** Headings, emphasis, strikethrough, code with a language label and Copy button, lists (nested, task lists), blockquotes, tables with alignment, links, autolinked URLs and emails, hard breaks.
- **Small and dependency-free.** About 7 kB gzip, ESM only, zero runtime dependencies. Optional CSS and a lazy code highlighter adapter.

## Install

```sh
npm install limmat
```

No bundler? Copy `dist/limmat.min.js` (and optionally `dist/style.css`) into your project and import it as a module:

```html
<script type="module">
  import { createRenderer } from './limmat.min.js';
  const r = createRenderer(document.querySelector('#answer'));
  r.write('Hello **world**');
  r.end();
</script>
```

## Use

```ts
import { createRenderer } from 'limmat';
import 'limmat/style.css'; // optional

const md = createRenderer(document.querySelector('#answer')!);
md.write('# Hello\n\nSome **streamed** text');
md.end();
```

Use one renderer per message. `write` takes the new text, not the full text so far. Chunks can split anywhere, even inside a word or a marker. Rendering a finished string is the same three calls: `createRenderer(el)`, `write(text)`, `end()`.

Streaming a `fetch` response:

```ts
const res = await fetch('/api/chat', { method: 'POST', body });
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
const md = createRenderer(el);
for (let r = await reader.read(); !r.done; r = await reader.read()) md.write(r.value);
md.end();
```

With an LLM SDK, call `md.write(delta)` for each text delta and `md.end()` when the stream finishes.

With every option:

```ts
import { createRenderer } from 'limmat';
import { speedHighlight } from 'limmat/highlight';

const el = document.querySelector<HTMLElement>('#answer')!;
const knownPages = new Set(['/research/', '/about/']);
const md = createRenderer(el, {
  isInternalPath: (path) => knownPages.has(path),
  onLinkClick: (href, event) => {
    if (href.startsWith('/')) { history.pushState({}, '', href); return true; } // handled: limmat calls preventDefault
  },
  highlight: speedHighlight(),
  labels: { copy: 'Kopieren', copied: 'Kopiert' },
});
```

### Options

| Option | Default | |
|---|---|---|
| `onLinkClick(href, event)` | none | Return `true` if you handled the click. limmat then calls `preventDefault()`. If it throws, the error reaches `window.onerror` and the link behaves normally. |
| `isInternalPath(path)` | all paths | Site-relative paths (`/research/x/`) become links only if this returns `true`. Others render as plain text. It gets the raw path including any query and hash, may be called more than once per link while the reply streams, and a throw counts as `false`. Check the whole path, not just a prefix: `/research/../admin` starts with `/research/`. |
| `allowedProtocols` | `['https', 'http', 'mailto']` | Protocols that may become links, with or without the colon and in any case. Anything else renders as plain text. |
| `highlight(el, code, lang)` | none | Called once when a fence closes (or at `end()`), with the `<code>` element. A throw or rejection is ignored and the plain text stays. |
| `throttleMs` | `50` | Minimum time between re-renders of the open block. `0` renders on every write. A non-finite value uses the default. |
| `classPrefix` | `'limmat'` | Prefix of every generated class. The bundled `style.css` only styles the default prefix. |
| `labels` | English | `copy` (`Copy`), `copied` (`Copied`), `table` (`Table`), `done` (`Completed`), `todo` (`Not completed`). |

### Methods

- `write(chunk)`: add text. The first write renders at once, later writes at most once per `throttleMs`. Ignored after `end()` until `reset()`, and after `destroy()`.
- `end()`: render the final state synchronously: unfinished constructs become literal text and code is highlighted. Calling it twice is safe.
- `reset()`: empty the container and start a new message, keeping the options.
- `destroy()`: remove the click listener and stop timers. The rendered DOM stays, and a render still waiting on the throttle is dropped (call `end()` first to keep it). Every later call is a no-op.

`createRenderer` throws a `TypeError` if the container is not an element. Importing limmat is safe on the server, but rendering needs a DOM (for SSR use jsdom or happy-dom).

### Code highlighting

```ts
import { speedHighlight } from 'limmat/highlight';
import '@speed-highlight/core/themes/default.css'; // pick any theme, the highlighter only adds classes
createRenderer(el, { highlight: speedHighlight() });
```

This adapter uses [`@speed-highlight/core`](https://github.com/speed-highlight/core), an optional peer dependency you install yourself. Each language loads as its own small chunk the first time it is needed, so a reply without code downloads nothing extra. Without a theme stylesheet the code stays uncolored. Choose a theme that matches your page (light or dark), because it sets the token colors. With `limmat/style.css` loaded, limmat keeps its own frame and the theme only supplies colors. Code over 4 KB or with lines over 300 characters is left as plain text (the highlighter is slow on those); tune it with `speedHighlight({ maxChars, maxLine })`.

### Styling

`limmat/style.css` is optional. It uses CSS variables (`--limmat-link`, `--limmat-border`, `--limmat-code-bg`, `--limmat-radius`, `--limmat-font-mono`, `--limmat-muted`, `--limmat-focus`), follows `prefers-color-scheme`, and supports forced colors. The generated structure is:

```
p, h1-h6, hr, blockquote, ul.limmat-list, ol.limmat-list, li, li.limmat-task (task items)
div.limmat-code
  div.limmat-code-head > span.limmat-lang[aria-hidden], button.limmat-copy, span.limmat-status[role=status]
  pre[tabindex=0] > code.limmat-lang-ts
div.limmat-table-wrap[tabindex=0][role=region] > table
a.limmat-link
```

### Accessibility

The message container has no live region, because announcing every chunk is noisy. If you want the finished reply announced, set `aria-busy` on your own element while streaming, or announce once after `end()`. The Copy button is labelled with the language (`Copy ts code`), the language label is hidden from screen readers, tables and code blocks are keyboard-scrollable, task checkboxes have names, and the copy result is announced through a polite status element. The Copy button is available while a fence is still open and copies what has arrived so far.

### Stability

From v0.1 these are stable, and a change to them is a breaking change: `createRenderer`, the four `Renderer` methods, the option names and meanings, the `limmat-*` class names listed above, the CSS variable names, and the ARIA attributes. Classes may be added, never removed or renamed. These are not stable and may change in a minor release: the exact set of recognized syntax (see Known gaps), the DOM inside a code block, the `labels` keys, and what a half-finished construct looks like mid-stream. While the version is 0.x, minor releases may also break the stable parts, and the [changelog](CHANGELOG.md) will say so. Text that renders literally today (math, `[1]` citations, emoji codes) will only become markup behind an opt-in option.

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
| Size (gzip) | about 7 kB | 3.5 kB |
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

The browser suite runs on current Chromium, Firefox, and WebKit. From the APIs used (`replaceChildren`, `matchAll`, `?.`, `??`, Unicode property escapes, sticky regexes) the minimum should be Chrome 86, Firefox 78, and Safari 14. These floors come from compatibility data, not from tests on old browsers. The optional CSS uses `color-mix()` as an upgrade with plain fallbacks.

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
