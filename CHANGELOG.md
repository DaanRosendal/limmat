# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project follows [Semantic Versioning](https://semver.org/).

While the version is 0.x, a minor release may change behavior and say so here. The DOM contract (the `limmat-*` classes and ARIA attributes), the option names, and the `createRenderer` and `Renderer` API follow the stability rules in the README. New syntax that would change how text renders today (for example math or citations) ships behind an opt-in option.

Entries start with the effect on users. Mark breaking changes with **Breaking:** at the start of the line, start fixes with "Fixed", and list a change to a row of the support table. Every user-visible pull request adds a line.

## [Unreleased]

### Added

- First release: `createRenderer(container, options)` with `write`, `end`, `reset`, and `destroy`.
- Safe-by-construction rendering of headings, emphasis, strikethrough, inline code, fenced code with a language label and Copy button, blockquotes, nested bullet and numbered lists, task lists, tables with column alignment and a keyboard-scrollable wrapper, horizontal rules, links, autolinked URLs and emails, and hard line breaks.
- Link policy: protocol allow-list, site-path approval, and `onLinkClick`. Images are never loaded.
- `limmat/highlight` adapter for `@speed-highlight/core` and optional `limmat/style.css`.
- Test suite: unit tests, chunk-split fuzz, XSS battery, CommonMark examples, and a Chromium suite for security, performance, accessibility, and behavior.
