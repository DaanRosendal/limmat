# API reference

The quick start is in the [README](../README.md). Types and defaults are also in the TSDoc that editors show.

## Options

| Option | Default | |
|---|---|---|
| `onLinkClick(href, event)` | none | Return `true` if you handled the click. limmat then calls `preventDefault()`. If it throws, the error reaches `window.onerror` and the link behaves normally. |
| `isInternalPath(path)` | all paths | Site-relative paths (`/research/x/`) become links only if this returns `true`. Others render as plain text. It gets the raw path including any query and hash, may be called more than once per link while the reply streams, and a throw counts as `false`. Check the whole path, not just a prefix: `/research/../admin` starts with `/research/`. |
| `allowedProtocols` | `['https', 'http', 'mailto']` | Protocols that may become links, with or without the colon and in any case. Anything else renders as plain text. |
| `highlight(el, code, lang)` | none | Called once when a fence closes (or at `end()`), with the `<code>` element. A throw or rejection is ignored and the plain text stays. |
| `throttleMs` | `50` | Minimum time between re-renders of the open block. `0` renders on every write. A non-finite value uses the default. |
| `classPrefix` | `'limmat'` | Prefix of every generated class. The bundled `style.css` only styles the default prefix. |
| `labels` | English | `copy` (`Copy`), `copied` (`Copied`), `table` (`Table`), `done` (`Completed`), `todo` (`Not completed`). |

## Methods

- `write(chunk)`: add text. The first write renders at once, later writes at most once per `throttleMs`. Ignored after `end()` until `reset()`, and after `destroy()`.
- `end()`: render the final state synchronously: unfinished constructs become literal text and code is highlighted. Calling it twice is safe.
- `reset()`: empty the container and start a new message, keeping the options.
- `destroy()`: remove the click listener and stop timers. The rendered DOM stays, and a render still waiting on the throttle is dropped (call `end()` first to keep it). Every later call is a no-op.

`createRenderer` throws a `TypeError` if the container is not an element. Importing limmat is safe on the server, but rendering needs a DOM (for SSR use jsdom or happy-dom).

## Code highlighting

```ts
import { speedHighlight } from 'limmat/highlight';
import '@speed-highlight/core/themes/default.css'; // pick any theme, the highlighter only adds classes
createRenderer(el, { highlight: speedHighlight() });
```

This adapter uses [`@speed-highlight/core`](https://github.com/speed-highlight/core), an optional peer dependency you install yourself. Each language loads as its own small chunk the first time it is needed, so a reply without code downloads nothing extra. Without a theme stylesheet the code stays uncolored. Choose a theme that matches your page (light or dark), because it sets the token colors. With `limmat/style.css` loaded, limmat keeps its own frame and the theme only supplies colors. Code over 4 KB or with lines over 300 characters is left as plain text (the highlighter is slow on those); tune it with `speedHighlight({ maxChars, maxLine })`.

## Styling

`limmat/style.css` is optional. It uses CSS variables (`--limmat-link`, `--limmat-border`, `--limmat-code-bg`, `--limmat-radius`, `--limmat-font-mono`, `--limmat-muted`, `--limmat-focus`), follows `prefers-color-scheme`, and supports forced colors. The generated structure is:

```
p, h1-h6, hr, blockquote, ul.limmat-list, ol.limmat-list, li, li.limmat-task (task items)
div.limmat-code
  div.limmat-code-head > span.limmat-lang[aria-hidden], button.limmat-copy, span.limmat-status[role=status]
  pre[tabindex=0] > code.limmat-lang-ts
div.limmat-table-wrap[tabindex=0][role=region] > table
a.limmat-link
```

## Accessibility

The message container has no live region, because announcing every chunk is noisy. To have the finished reply announced, set `aria-busy` on your own element while streaming, or announce once after `end()`.

What limmat labels for you:

- The Copy button says the language (`Copy ts`, or `Copy code` when there is none), and the language label is hidden from screen readers.
- Tables and code blocks are keyboard-scrollable, and task checkboxes have names.
- The copy result is announced through a polite status element.
- The Copy button is available while a fence is still open and copies what has arrived so far.

## Stability

From v0.1, a change to any of these is a breaking change:

- `createRenderer` and the four `Renderer` methods.
- The option names and their meanings.
- The `limmat-*` class names listed under Styling (classes may be added, never removed or renamed), the CSS variable names, and the ARIA attributes.

These may change in a minor release:

- The exact set of recognized syntax (see [What is supported](../README.md#what-is-supported)).
- The DOM inside a code block, the `labels` keys, and what a half-finished construct looks like mid-stream.

While the version is 0.x, minor releases may also break the stable parts, and the [changelog](../CHANGELOG.md) will say so. Math, `[1]` citations, emoji codes, alerts, and footnotes will only become markup behind an opt-in option. Standard CommonMark syntax that is missing today (such as setext headings, reference links, and entities) may be added in any release.

## Browser support

The browser suite runs on current Chromium, Firefox, and WebKit. From the APIs used (`replaceChildren`, `matchAll`, `?.`, `??`, Unicode property escapes, sticky regexes) the minimum should be Chrome 86, Firefox 78, and Safari 14. These floors come from compatibility data, not from tests on old browsers. The optional CSS uses `color-mix()` as an upgrade with plain fallbacks. It also uses `:where()` (Chrome 88), `:focus-visible` (Firefox 85, Safari 15.4), and flex `gap` (Safari 14.1): older browsers show their default focus outline and tighter spacing in the code header, and everything still works.

## Content-Security-Policy

limmat works under a strict policy such as `default-src 'none'; script-src 'self'; style-src 'self'`. It never uses inline scripts, `eval`, or a `style` attribute written as a string. Table alignment and the Copy fallback use the CSSOM, which `style-src` does not block. A test guards this.

## Known limits

- `throttleMs: 0` re-renders the open block on every write, so one very long paragraph is quadratic in that mode. The default throttle bounds it.
- `[1]` shows as "1" while its closing bracket is in flight, then as "[1]" once it is clear that no link follows.
- `~~x~` stays literal, and `#anchor` links and relative links without a leading slash render as plain text.
- Loose lists render tight, and a list marker change inside one list does not start a new list unless it switches between bullets and numbers.
