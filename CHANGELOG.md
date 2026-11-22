# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-22

### Changed

- **This changes output:** a list item with a blank line after it or between its blocks now wraps its text in a paragraph, as in CommonMark's loose lists. Items before the first blank line stay tight, because they are already on the page.
- `style.css`: paragraphs inside list items have a smaller margin, so loose lists stay compact.

### Fixed

- A single space at the end of a line is dropped before the line break, as in CommonMark.
- A tight list item shows every paragraph without `<p>` (one after a heading or a code block too), and an empty `-` item ends at the blank line after it.

## [0.4.0] - 2026-11-22

### Added

- `limmat/react`, `limmat/vue`, and `limmat/solid`: a `Markdown` component that takes `text` (the whole message so far) and `done`. Solid 1 and 2 both work, and the frameworks are optional peer dependencies.
- `limmat/svelte`: a `limmat` action, `use:limmat={{ text, done }}`.
- Preact needs no wrapper: use `limmat/react` with `preact/compat`.
- Math, opt-in: pass `renderMath` and `\(x\)`, `\[x\]`, `$x$`, and `$$x$$` (also alone on their own lines) become formulas that your function (KaTeX, MathJax, Temml) fills in. Prices like `$5 and $10` stay text.
- `limmat/katex`: `renderMath: katexMath(katex)` draws formulas with KaTeX, keeps `trust` off, and shows the tex as text when KaTeX cannot parse it.
- `singleDollarMath: false` turns off `$x$` and keeps the other forms.

### Fixed

- A backtick with no text after it yet no longer shows an empty code box while streaming.

## [0.3.0] - 2026-11-22

### Added

- GitHub-style alerts: a block quote starting with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` becomes a titled alert, with new `labels` for the titles and colors in `style.css`.
- HTML entities like `&amp;` and `&#35;` now show as their character, always as plain text and never as markup.
- Underlined headings: a paragraph over `===` is an `h1`, and over `---` an `h2`. `Text` over `---` used to be text and a rule.
- Indented code blocks (four spaces or a tab) render as code with the Copy button. **This changes output:** text indented four spaces after a blank line used to be a paragraph or list and is now code, as on GitHub.
- `limmat/server`: `renderToString(markdown, options)` returns the HTML of a text with no DOM, for a server.
- limmat uses `container.ownerDocument` instead of the global `document`, so it works in jsdom, linkedom, and happy-dom with no globals set.
- Task list checkboxes and `<details>` toggles are set as attributes, so linkedom serializes them.

### Fixed

- A lazy line in a list item indented four spaces or more now continues the item's paragraph instead of turning into a nested block, as in CommonMark.
- A lazy line after a table two containers deep (`> > | a |` over `> > |---|`) now ends the outer quote or item, as in GFM.
- `- |---|---|` under a pipe line is a list item, not a table delimiter row, as in GFM.

## [0.2.0] - 2026-11-21

### Added

- An image that is not shown now renders `Image not shown: alt text` in a `limmat-image-blocked` span (new `labels.imageNotShown`). It used to leave the bare alt text.
- An `<img>` gets `limmat-image-loaded` or `limmat-image-failed` once it settles. `style.css` uses them for a placeholder box and a failed-image pill.

### Changed

- `tel:`, `irc:`, `ircs:`, and `xmpp:` links are now links by default. To keep the old default, pass `allowedProtocols: ['https', 'http', 'mailto']`.

### Fixed

- A `classPrefix` that is empty or not a plain class name no longer breaks the Copy button. It falls back to `limmat`.
- An empty or blank entry in `labels` keeps its default.
- `allowedProtocols` that is not an array uses the default list instead of throwing.
- The language label in a code header drops bidi, control, and zero-width characters.
- A lazy line (no item indent, no `>`) stays text in its item or quote, and a lazy line after a table inside one ends the item or quote, as in GFM.
- A table with no outer pipes now splits off the paragraph above it, as in GFM.
- A pipe line stays in the paragraph above unless it starts a table, as in GFM. A last line that might start a table waits for the next line.
- A line continues a list item only if it is indented to the item's content column, as in CommonMark.
- A link title with an escaped quote (`[a](/u "say \"hi\"")`) is a link again.
- A `highlight` function that calls `write` no longer re-enters the renderer.
- A link inside link text is the link, and the outer brackets stay text, as in CommonMark.
- A table whose delimiter row has a different cell count than the header is text, as in GFM.
- A run of three or more tildes is text, as in GFM.
- A different bullet or number delimiter now starts a new list, as in CommonMark.
- Only `1.` or `1)` can interrupt a paragraph, as in CommonMark. `42. Nobody noticed.` used to start a list.
- An `<img>` in an open block keeps its element while text arrives, so images no longer blink in Safari.
- `highlight` is called once with the whole code for a fence that contains a line starting like a closing fence.
- `import 'limmat/style.css'` no longer fails with TS2882 under TypeScript 7.

## [0.1.1] - 2026-11-20

### Changed

- The package description and keywords match the GitHub About text and topics.
- The README demo GIF is recorded at 1080p, one character per chunk, and served from the demo site.

## [0.1.0] - 2026-11-20

### Added

- First release: `createRenderer(container, options)` with `write`, `end`, `reset`, and `destroy`.
- Safe rendering of headings, emphasis, strikethrough, inline code, fenced code with a language label and Copy button, block quotes, nested and task lists, aligned tables, rules, links, autolinks, and hard line breaks.
- Link policy: protocol allow-list, site-path approval, and `onLinkClick`.
- Attribute-free `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, and `sup` become elements. The `html` option narrows or turns off the list.
- `<details>` (with an optional `<summary>`) renders native collapsible sections, nested up to 12 levels. The reader's toggle survives while streaming.
- `externalLinksNewTab` option (default `true`).
- Images: `![alt](url)` renders an `<img>` by default, and the `images` option takes an origin list or `false`. Images load without a click, see SECURITY.md.
- `limmat/highlight` adapter for `@speed-highlight/core` and optional `limmat/style.css`, which also works in a shadow root.
- `createRenderer` empties its container, so a remount (React StrictMode) does not duplicate a finished message.
- Tables are wrapped in a labelled `role="group"`.

[Unreleased]: https://github.com/DaanRosendal/limmat/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/DaanRosendal/limmat/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/DaanRosendal/limmat/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/DaanRosendal/limmat/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DaanRosendal/limmat/releases/tag/v0.1.0
