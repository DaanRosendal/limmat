# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- A table whose header has no outer pipes now splits off from the paragraph above it (`Here:` then `a | b` over `--|--`), as in GFM. It used to stay one paragraph.
- A line that starts with a pipe stays in the paragraph above it unless it starts a table (the next line is a delimiter row with as many cells), as in GFM. Pipe lines that are not a table used to become one paragraph each. While a pipe line is the last line and might still start a table, it is not shown until the next line arrives.
- A line continues a list item only if it is indented to the item's content column, as in CommonMark (3 spaces under `1. `, 4 under `10. `, 2 under `- `). Two spaces under `1. ` used to nest a list, a quote, or a paragraph inside the item.
- A link title that contains an escaped quote (`[a](/u "say \"hi\"")`) is a link again. The whole link used to turn into text.
- A `highlight` function that calls `write` no longer re-enters the renderer. Its text is added after the current update, and the block it was called for is highlighted once.
- A link inside link text is now the link, and the outer brackets stay text, as in CommonMark. The outer link used to win and the inner one was flattened.
- A table whose delimiter row has a different number of cells than the header is text, as in GFM. It used to render as a table with ragged rows.
- A run of three or more tildes is text, as in GFM. `~~~x~~~` inside a paragraph used to show `~` around struck-out text.
- A different bullet (`-`, `+`, `*`) or number delimiter (`.`, `)`) now starts a new list, as in CommonMark. A list that switched markers used to render as one list.
- Only `1.` or `1)` can interrupt a paragraph, as in CommonMark. A line such as `42. Nobody noticed.` inside a paragraph used to start a numbered list.
- An `<img>` in a block that is still open keeps its element while more text arrives, instead of being replaced on every update. Images no longer blink in Safari when they cannot be cached.
- `highlight` is called once, with the whole code, for a fence that contains a line starting like a closing fence (a ```` ```md ```` fence with a ```` ```js ```` line inside). Streaming it one character at a time used to close the fence at the partial ```` ``` ````, highlight the truncated code, and reopen it. A closing fence on a line that is still arriving now waits for the end of the line (or `end()`) before the fence counts as closed.
- `import 'limmat/style.css'` no longer fails with TS2882 under TypeScript 7, because the stylesheet export now ships a type declaration.

## [0.1.1] - 2026-11-20

### Changed

- The package description and keywords match the GitHub About text and topics.
- The README demo GIF is recorded at 1080p, one character per chunk, and served from the demo site.

## [0.1.0] - 2026-11-20

### Added

- First release: `createRenderer(container, options)` with `write`, `end`, `reset`, and `destroy`.
- Safe-by-construction rendering of headings, emphasis, strikethrough, inline code, fenced code with a language label and Copy button, blockquotes, nested bullet and numbered lists, task lists, tables with column alignment and a keyboard-scrollable wrapper, horizontal rules, links, autolinked URLs and emails, and hard line breaks.
- Link policy: protocol allow-list, site-path approval, and `onLinkClick`.
- HTML tags: attribute-free `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, and `sup` become elements, and the `html` option narrows the list or turns it off. Tags with attributes and all other tags stay text.
- Collapsible sections: `<details>` (or `<details open>`), an optional `<summary>` line, markdown content, and `</details>` render native `details` and `summary` elements, nested up to 12 levels. A block that never closes opens when the message ends. The `html` option controls it with the name `details`. The reader's toggle survives while streaming.
- `externalLinksNewTab` option (default `true`): `false` leaves `http` and `https` links without `target` and `rel`.
- Images: `![alt](url)` renders an `<img>` by default, with the link URL checks, `loading="lazy"`, and `referrerpolicy="no-referrer"`. The `images` option takes an origin list or `false`. Images load without a click, so see "What limmat does not guarantee by default" in SECURITY.md.
- `limmat/highlight` adapter for `@speed-highlight/core` and optional `limmat/style.css`, which also styles a renderer inside a shadow root.
- `createRenderer` empties its container, so a remount (React StrictMode) does not duplicate a finished message.
- Tables are wrapped in `role="group"` with a label, so many tables on a page do not repeat one landmark.

[Unreleased]: https://github.com/DaanRosendal/limmat/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/DaanRosendal/limmat/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DaanRosendal/limmat/releases/tag/v0.1.0
