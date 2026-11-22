# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `limmat/react`, `limmat/vue`, and `limmat/svelte`: a `Markdown` component for React and for Vue, and a `limmat` action for Svelte (`use:limmat={{ text, done }}`), each a few lines around `createRenderer`. They take the whole text so far and a `done` flag. Text that only grows is written as chunks, and any other text starts the message over, so a message held in component state works as it is. `options` is read when the component mounts. React and Vue are optional peer dependencies, the Svelte action imports nothing, and the core size does not change. They run in the browser only: on a server React and Vue render an empty `div`, and `limmat/server` gives the HTML. Tested with the real frameworks in jsdom, in Chromium, Firefox, and WebKit (React in StrictMode, a compiled `.svelte` component), and through the packed tarball.

### Fixed

- A backtick that is still open and has no text after it yet (`use `` ` ``, or only spaces) used to show an empty inline code box while streaming. It now shows nothing until the first character of the code arrives, as a lone `**` already did. The final output is unchanged: an unclosed backtick is literal text.

## [0.3.0] - 2026-11-22

### Added

- GitHub-style alerts: a top-level block quote that starts with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` alone on its line (any letter case), followed by text, is a `blockquote.limmat-alert.limmat-alert-note` (and so on) with a `p.limmat-alert-title` first. While the marker is arriving, or before any text follows it, nothing of it shows, and a marker that never gets text stays plain text, as on GitHub. The titles are the new `labels.note`, `tip`, `important`, `warning`, and `caution`, and the optional `style.css` colors each type.

- HTML entities: numeric references (`&#35;`, `&#x23;`) and the names `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, and `&nbsp;` now show as their character, in text and in a link destination (checked after decoding, so `&#106;avascript:` is still refused). The result is always plain text, so `&lt;b&gt;` never becomes a tag and `&#42;` never becomes emphasis. Code, autolinks, and bare URLs keep the text as written. Other names, like `&copy;`, still show literally. While one is arriving (`&`, `&am`, `&#12`) it is held back.

- Underlined headings: a paragraph over a line of `=` is an `h1`, and over a line of `-` is an `h2`, as in CommonMark. The heading holds every line of the paragraph, the underline may be indented up to three spaces, and a lazy line in a quote or list item is never an underline. While the underline is still arriving it is held back, so no `=` or `-` shows. A line of `---` right under a paragraph used to be a rule and is now an underline, so `Text` over `---` is a heading, not text and a rule.

- Indented code blocks: a line indented four spaces or more, after a blank line, at the start, or after a heading, rule, fence, or table, is a code block with the Copy button, as in CommonMark. Blank lines inside it are kept and the ones around it are dropped. The text is shown as written (no markup, no entities), and the indent is removed from each line. It works in a quote and in a list item (four columns past the item text). An indented line still continues a paragraph, and 4-space nesting in lists is unchanged. A tab counts to the next multiple of four columns when it decides whether a line is indented, so `\tcode` is a code block. Tabs are not expanded after a list marker or in a nested item, and tabs inside code are never changed. **This changes output:** text that was a paragraph or a list after a blank line and indented four spaces (for example `    - a` right after a paragraph and a blank line) is now code, as on GitHub. A table row indented four spaces ends the table.

- `limmat/server`: `renderToString(markdown, options)` returns the HTML of a whole text, with no DOM and no globals, so a server can render a reply. It runs the same parser and builder as `write` followed by `end()` (a small in-memory DOM stands in for the page), so the string is exactly what the DOM path serializes to for every test document. Text and attribute values are escaped, and `highlight`, `onLinkClick`, and `throttleMs` are left out because they need a page. It is a separate entry, so the core size does not change.
- limmat creates its elements with `container.ownerDocument` instead of the global `document`, so it renders into an element of jsdom, linkedom, or happy-dom with no globals set. All three are tested, and `end()` leaves the final output in place with no timer pending, so `innerHTML` can be read right after it.
- Task list checkboxes and `<details>` toggles are written as attributes (`type`, `disabled`, `checked`, `open`) instead of properties. A browser reads them as the same state, and linkedom serializes them.

### Fixed

- A lazy line in a list item that is indented four spaces or more and looks like a block (`    - x`, `    # x`, `    ---`, `    >`) now continues the item's paragraph, as in CommonMark. It used to turn into a nested block.
- A lazy line after a table that sits two containers deep (`> > | a |` over `> > |---|`, or `> - | a |` over `>   |---|`) now ends the outer quote or item too, as in GFM. It used to stay in the outer container.
- A line such as `- |---|---|` under a pipe line is a list item, not a table delimiter row, as in GFM. The line above stays a paragraph. It used to become a table with an empty first header cell.

## [0.2.0] - 2026-11-21

### Added

- An image that is not shown (`images: false`, an origin that is not in your list, or a refused URL) now renders `Image not shown: alt text` in a `limmat-image-blocked` span, so a reader can tell that an image was removed. It used to leave the bare alt text. The words are the new `labels.imageNotShown`. An image inside a link label still shows only its alt text.
- An `<img>` gets the class `limmat-image-loaded` when it has loaded and `limmat-image-failed` when it fails. The optional `style.css` uses them: an image holds a placeholder box until it loads, so the text below does not jump, and a failed image shows its alt text in a soft pill.

### Changed

- `[call](tel:+31201234567)`, `irc:`, `ircs:`, and `xmpp:` links are now links by default, the same list as Streamdown. To keep the old default, pass `allowedProtocols: ['https', 'http', 'mailto']`.

### Fixed

- A `classPrefix` with a space, quote, dot, or bracket, or an empty one, no longer breaks the Copy button or gives classes such as `-link`. A prefix that is not a plain class name uses `limmat`.
- An empty or blank entry in `labels` keeps its default, so the Copy button and the table always have a name. The Copy button's name used to be ` js`.
- `allowedProtocols` that is not an array uses the default list. It used to throw a `TypeError` from `createRenderer`.
- The language label in a code header drops bidi, control, and zero-width characters. A right-to-left override in the language could reorder the text next to it.
- A line without the item's indent or the quote's `>` (a lazy line) stays text in the item or quote, as in GFM. A pipe line right after `- item` or `> quote` used to end it and start a table or paragraph below. A lazy line after a table inside an item or quote used to become a table row, and now ends the item or quote. A table inside an item or quote that is nested two containers deep (`> - | a |` over `>   |---|`) still lets a lazy line after it stay in the outer quote.
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

[Unreleased]: https://github.com/DaanRosendal/limmat/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/DaanRosendal/limmat/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/DaanRosendal/limmat/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/DaanRosendal/limmat/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DaanRosendal/limmat/releases/tag/v0.1.0
