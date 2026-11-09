# Roadmap

limmat stays small on purpose. This page is honest about what is missing. The [support table](../README.md#what-is-supported) lists every syntax feature with its status, and this page covers everything else. Open an issue before starting work on anything under "Ideas", so the design can be discussed first.

## Known issues

- `[1]` shows as "1" while its closing bracket is still in flight, then as "[1]" once it is clear that no link follows. Accepted until citation chips exist.
- `~~x~` stays literal text.
- Loose lists render tight, and a list marker change inside one list does not start a new list unless it switches between bullets and numbers.
- `throttleMs: 0` makes one very long paragraph quadratic. The default throttle bounds it.
- Whole CommonMark sections are lower than they could be, mostly lists and links. The failures are listed in [test/fixtures/commonmark-known-failures.json](../test/fixtures/commonmark-known-failures.json) and are good first fixes: each one is a failing example waiting for a test to go green.

## Ideas (discuss first)

- Opt-in options for syntax that changes how text renders today: math, `[1]` citation chips, emoji codes, alerts (`> [!NOTE]`), footnotes. New syntax never changes existing output without an opt-in.
- Render hooks as additive options: a custom code-block renderer (for diagrams), a text transform (for mentions), and opt-in images through an allow-list function that reuses the link policy.
- Setext headings, reference links, and HTML entity decoding, if real LLM output needs them.
- A one-shot `render(el, markdown)` helper and a `text()` getter. Three calls cover static rendering today, and every public method is permanent, so this waits for demand.
- A weekly fuzz run in CI with a higher iteration count, a pinned-by-SHA actions policy, and an OpenSSF Best Practices badge.

## Decided against

- **Raw HTML.** Rendering it safely needs a sanitizer, which is larger than limmat and a standing source of bypasses. Shown as text.
- **Loading images by default.** An image URL chosen by a model is a tracking and exfiltration channel. Alt text only.
- **A plugin system with a node visitor.** The parser and the DOM builder are separate on purpose, but a public AST would freeze internals. Specific hooks come first.
- **`noUncheckedIndexedAccess` across `src/`.** It adds noise (`!` or `?? ''` in hundreds of places) for a codebase of this size.
- **A dual IIFE build.** `dist/limmat.min.js` is an ES module that works in a `<script type="module">`.
- **Disabling the Copy button while a fence is open.** Copying what has arrived is useful, and it is documented.
