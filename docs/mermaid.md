# Mermaid diagrams

limmat does not draw diagrams, but the `highlight` option can turn a `mermaid` code block into one. The hook runs once per block, when its closing fence arrives (or at `end()` for a block that never closes), also inside quotes and lists. Until then the reader sees the code.

```ts
import mermaid from 'mermaid';
import { createRenderer } from 'limmat';

// Labels as SVG text, not HTML: with HTML labels a diagram can load remote images, which bypasses the `images` option.
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false } });

let n = 0;
const md = createRenderer(el, {
  highlight: async (code, text, lang) => {
    if (lang !== 'mermaid') return;
    const { svg } = await mermaid.render(`diagram-${n++}`, text);
    const out = document.createElement('div');
    out.append(document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true));
    code.parentElement!.hidden = true; // the <pre>, which stays so the Copy button still copies the source
    code.parentElement!.after(out);
  },
});
```

- **Invalid diagrams:** `mermaid.render` throws, limmat ignores the rejection, and the code stays visible. Set `suppressErrorRendering: true` in `mermaid.initialize` so mermaid adds no error graphic to the page.
- **Safety:** mermaid output comes from model text. Keep `securityLevel: 'strict'` (the default) and `htmlLabels: false`, and set a CSP `img-src` if you also need to block remote images.
- **Checked with** mermaid 12.3 in Chromium: flowchart and sequence diagrams, streamed one character at a time, in a block quote and in a list item.
