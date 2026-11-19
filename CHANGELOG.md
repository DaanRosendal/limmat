# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## Stability

These parts are the public contract: `createRenderer` and the four `Renderer` methods, the option names and their meanings, the `limmat-*` class names (classes may be added, never removed or renamed), the CSS variable names, and the ARIA attributes. Before 1.0, a change to any of them can ship in a minor release and is listed in this file under **Breaking**. From 1.0, it needs a major release. The exact set of recognized syntax, the DOM inside a code block, the `labels` keys, and what a half-finished construct looks like mid-stream may change in any minor release.

## [Unreleased]

## [0.1.0] - 2026-11-19

### Added

- First release: `createRenderer(container, options)` with `write`, `end`, `reset`, and `destroy`.
- Safe-by-construction rendering of headings, emphasis, strikethrough, inline code, fenced code with a language label and Copy button, blockquotes, nested bullet and numbered lists, task lists, tables with column alignment and a keyboard-scrollable wrapper, horizontal rules, links, autolinked URLs and emails, and hard line breaks.
- Link policy: protocol allow-list, site-path approval, and `onLinkClick`.
- HTML tags: attribute-free `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, and `sup` become elements, and the `html` option narrows the list or turns it off. Tags with attributes and all other tags stay text.
- Collapsible sections: `<details>` (or `<details open>`), an optional `<summary>` line, markdown content, and `</details>` render native `details` and `summary` elements, nested up to 12 levels. A block that never closes opens when the message ends. The `html` option controls it with the name `details`. The reader's toggle survives while streaming.
- `externalLinksNewTab` option (default `true`): `false` leaves `http` and `https` links without `target` and `rel`.
- Images: `![alt](url)` renders an `<img>` by default, with the link URL checks, `loading="lazy"`, and `referrerpolicy="no-referrer"`. The `images` option takes an origin list or `false`. Images load without a click, so see "What limmat does not guarantee by default" in SECURITY.md.
- `limmat/highlight` adapter for `@speed-highlight/core` and optional `limmat/style.css`.
- Test suite: unit tests, chunk-split fuzz, XSS battery, CommonMark examples, and a Chromium, Firefox, and WebKit suite for security, performance, accessibility, and behavior.
