# limmat

limmat renders streaming markdown into the DOM as it arrives: about 7 kB gzip, safe by default, with no framework and no dependencies.

It is built for chat UIs where an LLM streams a reply in chunks of a few characters. Finished blocks are never touched again, only the open block re-renders (throttled), and half-finished markdown never shows raw markers. Named after the river through Zurich.

- **Safe by construction.** The DOM is built with `createElement` and text nodes only. There is no `innerHTML` and no raw HTML path. Links go through a protocol allow-list, and images are never loaded.
- **Built for streaming.** Finished blocks are never re-parsed, and the open block re-renders at most every 50 ms by default. In Chromium, a 100 KB reply written in 5-character chunks with no pauses renders in about 10 ms (about 130 ms with `throttleMs: 0`, which renders on every write).
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

The message container has no live region, because announcing every chunk is noisy. If you want the finished reply announced, set `aria-busy` on your own element while streaming, or announce once after `end()`. The Copy button is labelled with the language (`Copy ts`, or `Copy code` when there is no language), the language label is hidden from screen readers, tables and code blocks are keyboard-scrollable, task checkboxes have names, and the copy result is announced through a polite status element. The Copy button is available while a fence is still open and copies what has arrived so far.

### Stability

From v0.1 these are stable, and a change to them is a breaking change: `createRenderer`, the four `Renderer` methods, the option names and meanings, the `limmat-*` class names listed above, the CSS variable names, and the ARIA attributes. Classes may be added, never removed or renamed. These are not stable and may change in a minor release: the exact set of recognized syntax (see [What is supported](#what-is-supported)), the DOM inside a code block, the `labels` keys, and what a half-finished construct looks like mid-stream. While the version is 0.x, minor releases may also break the stable parts, and the [changelog](CHANGELOG.md) will say so. Math, `[1]` citations, emoji codes, alerts, and footnotes will only become markup behind an opt-in option. Standard CommonMark syntax that is missing today (such as setext headings, reference links, and entities) may be added in any release.

## Security model

- Text always goes through text nodes. Raw HTML in the input is shown as text.
- Links must use an allowed protocol (`https`, `http`, `mailto` by default) or be a site path you approve, and must parse as a URL. `//host`, backslashes, whitespace, control, zero-width, bidi, and no-break characters, and everything else are refused, and the label renders as plain text. `javascript:`, `data:` and `vbscript:` are refused even if you list them in `allowedProtocols`.
- External links get `target="_blank"` and `rel="noopener noreferrer"`.
- Images are never created, so they cannot track or exfiltrate. `![alt](url)` renders the alt text.
- The code fence language becomes a class name only if it matches `[A-Za-z0-9_+#-]{1,20}`.
- Nesting is capped (about 12 block levels and 30 inline levels), link destinations are length-limited, and each paragraph has a work budget proportional to its length for scanning them, so hostile input cannot overflow the stack or make parsing quadratic. The optional highlighter adapter skips code blocks over 4 KB or with lines over 300 characters, because the highlighter is slow on very long lines.
- The `highlight` callback receives the `<code>` element and the raw language string from the fence (not sanitized, unlike the class name), and is trusted code. Pick a highlighter that escapes its input, as `@speed-highlight/core` does.

limmat does not protect you from your own CSS or from what your `onLinkClick` does. See [SECURITY.md](SECURITY.md) to report a problem.

## How it compares

| | limmat | streaming-markdown 0.2.15 |
|---|---|---|
| Size (gzip) | about 7 kB, including the Copy button | about 3.5 kB, parser and renderer only |
| Link and image URLs | allow-listed, images never load | not sanitized by the default renderer (`javascript:` and `//host` links pass, any image loads) |
| `snake_case_words` | stay text | become italic |
| `1)` lists, table alignment, `www.` links, bare emails | supported | not supported |
| Punctuation after a bare URL (`see https://a.com.`) | trimmed | kept in the link |
| `)` inside a URL | handled | ends the link |

A general markdown parser plus a sanitizer re-parses the whole text on every chunk and shows raw markers while a construct is open. limmat was written because neither trade-off suited a small chat widget.

## Tested

`npm run check` runs typecheck, lint, a writing-style check, unit tests, a build, a package check, a support-table check, a size check, and the browser suite in Chromium, Firefox, and WebKit. Together they cover:

- 54 XSS inputs, executed in real browsers (nothing runs, nothing loads, nothing dangerous in the DOM), plus a malicious-input fuzz and regression tests for every hostile input found in review.
- Chunk-split fuzz: rendering in any chunking gives the same DOM as rendering at once.
- Half-open snapshots for every construct.
- 331 of 471 in-scope CommonMark spec examples, with every failing example listed by number in [test/fixtures/commonmark-known-failures.json](test/fixtures/commonmark-known-failures.json), and exact-output golden files for a few documents.
- Performance budgets, a memory test over 1,000 resets, accessibility checks with axe in light, dark and forced colors, keyboard order, and clipboard behavior.

## Browser support

The browser suite runs on current Chromium, Firefox, and WebKit. From the APIs used (`replaceChildren`, `matchAll`, `?.`, `??`, Unicode property escapes, sticky regexes) the minimum should be Chrome 86, Firefox 78, and Safari 14. These floors come from compatibility data, not from tests on old browsers. The optional CSS uses `color-mix()` as an upgrade with plain fallbacks. It also uses `:where()` (Chrome 88), `:focus-visible` (Firefox 85, Safari 15.4), and flex `gap` (Safari 14.1): older browsers show their default focus outline and tighter spacing in the code header, and everything still works.

## What is supported

Unsupported syntax renders as safe literal text, never as markup: that is the contract. Anything not listed here has not been audited. The table is generated from [docs/support.json](docs/support.json) and the CommonMark 0.31.2 results, and CI fails if it drifts, if a row cites a test that does not exist, or if a row says "supported" while most of its spec examples fail.

- **Supported**: works for the cases LLM chat produces, with tests.
- **Partial**: the common cases work, the notes say what does not.
- **Not yet**: not implemented, and a candidate for the roadmap.
- **Will not**: refused on purpose, usually for safety.
- **Spec examples**: CommonMark examples that pass, out of the examples in that section (including sections we do not aim for). The full list of failures is in [test/fixtures/commonmark-known-failures.json](test/fixtures/commonmark-known-failures.json).

<!-- support:start (generated by scripts/gen-support.mjs from docs/support.json, do not edit) -->
| Feature | Status | Spec examples | Notes and proof |
|---|---|---|---|
| ATX headings (`# Title`) | Supported | 17/18 |  |
| Setext headings (`Title` over `---`) | Not yet | 12/27 | The underline renders as a rule (`---`) or as text (`===`). |
| Thematic breaks | Supported | 17/19 |  |
| Fenced code, backtick and tilde | Supported | 27/29 | Language label, Copy button, optional highlighting. Test: `tilde fences and fence lengths` in [conformance.test.ts](test/conformance.test.ts). |
| Indented code blocks | Not yet | 1/12 | Use fences. |
| Block quotes | Supported | 22/25 | Test: `lazy blockquote continuation only follows paragraph text` in [regress.test.ts](test/regress.test.ts). |
| Bullet and ordered lists, nested | Partial | 32/74 | Common chat lists work. Loose lists render tight, and many edge cases in the spec differ. Test: `list scanning` in [regress.test.ts](test/regress.test.ts). |
| Task lists (GFM) | Supported |  | Checkboxes are disabled and labelled. Test: `task lists` in [conformance.test.ts](test/conformance.test.ts). |
| Tables with alignment (GFM) | Supported |  | Keyboard-scrollable wrapper. Without a leading pipe, a header and delimiter row with different column counts is not a table. Test: `tables with alignment` in [conformance.test.ts](test/conformance.test.ts). |
| Emphasis and strong | Supported | 129/132 | `snake_case_words` stay text. |
| Strikethrough (GFM) | Supported |  | Needs two tildes on both sides. Test: `single tilde is literal` in [gaps.test.ts](test/gaps.test.ts). |
| Code spans | Supported | 20/22 |  |
| Inline links | Partial | 23/90 | Inline `[text](url)` works. Reference-style links, many title forms, and unsafe URLs render as text (most of the misses). Test: `blocked links keep the label as text` in [xss.test.ts](test/xss.test.ts). |
| Reference links and definitions | Not yet | 5/27 |  |
| Autolinks: `<url>`, bare URLs, `www.`, emails (GFM) | Partial | 9/19 | Only allowed protocols become links, so spec examples with other schemes differ by design. Test: `urls only autolink at a word boundary` in [gaps.test.ts](test/gaps.test.ts). |
| Images | Will not | 1/22 | The alt text is shown and nothing is ever loaded, so images cannot track or exfiltrate. Test: `images become plain text` in [xss.test.ts](test/xss.test.ts). |
| Raw HTML and HTML blocks | Will not | 7/64 | Shown as text. Only `<br>` is understood. Test: `unsupported things degrade to text` in [conformance.test.ts](test/conformance.test.ts). |
| HTML entities (`&amp;`) | Not yet | 5/17 | Shown literally. |
| Backslash escapes | Partial | 9/13 |  |
| Hard and soft line breaks | Supported | 14/17 | Test: `single trailing space before newline` in [gaps.test.ts](test/gaps.test.ts). |
| Tabs for indentation | Not yet | 2/11 |  |
| Half-open constructs never show raw markers while streaming | Supported |  | Test: `open fence shows code immediately` in [half-open.test.ts](test/half-open.test.ts), `streaming never shows raw markers` in [behavior.spec.ts](browser/behavior.spec.ts). |
| Any chunking gives the same DOM as one write | Supported |  | Test: `two-part splits at every index` in [chunk-fuzz.test.ts](test/chunk-fuzz.test.ts). |
| Math (`$...$`, `$$...$$`) | Not yet |  | Planned as an opt-in option. Dollar signs render literally today. |
| Footnotes | Not yet |  |  |
| Alerts and callouts (`> [!NOTE]`) | Not yet |  | Renders as a normal block quote. |
| Citation chips (`[1]`) and emoji codes | Not yet |  | Planned as opt-in options. Rendered literally today. |
<!-- support:end -->

Other limits:

- `#anchor` links and relative links without a leading slash render as plain text.
- A new list marker type does not start a new list unless it switches between bullets and numbers.
- `throttleMs: 0` re-renders the open block on every write, so one very long paragraph is quadratic in that mode. The default throttle bounds it.

What may come next, what is being considered, and what was decided against, with reasons, is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Project status

limmat is a small project with one maintainer. Only the latest minor release is supported, and no release schedule is promised. Report bugs in [issues](https://github.com/DaanRosendal/limmat/issues) and security problems as described in [SECURITY.md](SECURITY.md). Contributions are welcome: start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [roadmap](docs/ROADMAP.md).

## License

MIT, Copyright (c) 2026 Daan Rosendal.
