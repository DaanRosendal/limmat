# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- First release: `createRenderer(container, options)` with `write`, `end`, `reset`, and `destroy`.
- Safe-by-construction rendering of headings, emphasis, strikethrough, inline code, fenced code with a language label and Copy button, blockquotes, nested bullet and numbered lists, task lists, tables with column alignment and a keyboard-scrollable wrapper, horizontal rules, links, autolinked URLs and emails, and hard line breaks.
- Link policy: protocol allow-list, site-path approval, and `onLinkClick`.
- Images: `![alt](url)` renders an `<img>` by default, with the link URL checks, `loading="lazy"`, and `referrerpolicy="no-referrer"`. The `images` option takes an origin list or `false`. Images load without a click, so see "Images and privacy" in docs/API.md.
- `limmat/highlight` adapter for `@speed-highlight/core` and optional `limmat/style.css`.
- Test suite: unit tests, chunk-split fuzz, XSS battery, CommonMark examples, and a Chromium, Firefox, and WebKit suite for security, performance, accessibility, and behavior.
