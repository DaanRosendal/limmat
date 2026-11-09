# Security policy

limmat renders untrusted text (LLM output) into the DOM, so security reports are welcome.

## Reporting

Report a vulnerability privately, not in a public issue:

- Use GitHub's private vulnerability reporting on the repository (Security tab, "Report a vulnerability"), or
- email contact@daanrosendal.com.

Include the markdown input, how it was split into chunks (or "one write"), the browser, and what you expected versus what happened.

## In scope

Any input that makes limmat create an element or attribute outside its documented DOM, run script, load a resource, navigate to a disallowed URL, throw, or hang the page. Wrong rendering that is still inert text is a normal bug, not a vulnerability.

## What limmat guarantees

- Text always goes through text nodes. Raw HTML in the input is shown as text.
- Links must use an allowed protocol (`https`, `http`, `mailto` by default) or be a site path you approve, and must parse as a URL. Anything else is refused, including `//host`, backslashes, and whitespace, control, zero-width, bidi, and no-break characters, and the label renders as plain text. `javascript:`, `data:`, and `vbscript:` are refused even if you list them in `allowedProtocols`.
- External links get `target="_blank"` and `rel="noopener noreferrer"`.
- Images are never created, so they cannot track or exfiltrate. `![alt](url)` renders the alt text.
- The code fence language becomes a class name only if it matches `[A-Za-z0-9_+#-]{1,20}`.
- Nesting is capped (about 12 block levels and 30 inline levels), link destinations are length-limited, and each paragraph has a work budget proportional to its length for scanning them, so hostile input cannot overflow the stack or make parsing quadratic.
- The `highlight` callback receives the `<code>` element and the raw language string from the fence (not sanitized, unlike the class name), and is trusted code. Pick a highlighter that escapes its input, as `@speed-highlight/core` does.

limmat does not protect you from your own CSS or from what your `onLinkClick` does.

## Supported versions

The latest minor release.
