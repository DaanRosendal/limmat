# Security policy

limmat renders untrusted text (LLM output) into the DOM, so security reports are welcome. It has one maintainer, so the times below are targets, not a promise.

## Reporting

Report a vulnerability privately, not in a public issue:

- Use GitHub's private vulnerability reporting on the repository (Security tab, "Report a vulnerability"), or
- email contact@daanrosendal.com.

Include a reproduction we can run: the markdown input, how it was split into chunks (or "one write"), the browser and version, and what you expected versus what happened. A report without a reproduction, or one that only says a scanner or an AI tool flagged something, will be closed with a request for one.

## What to expect

- An acknowledgement within 7 days.
- A decision with reasons (confirmed, not a vulnerability, or need more information), and a fix or a plan within 30 days.
- A fix that makes script execution, a disallowed navigation, or a resource load possible ships as a patch release as soon as it is ready, with a GitHub security advisory and credit if you want it. Lower-severity bugs may be fixed in the open.
- Please keep the details private until the fix is released. There is no bounty.

## In scope

Any input (any chunking, any options within the documented ones) that makes limmat:

- create an element or attribute outside the documented DOM,
- run script, load a resource, or navigate to a disallowed URL,
- throw, or hang or freeze the page beyond the documented caps.

## Not a vulnerability

These are bugs at most, and fine for a public issue:

- Wrong rendering that is still inert text, such as a misread emphasis or a CommonMark deviation (see [the known failures](test/fixtures/commonmark-known-failures.json) and the [support table](README.md#what-is-supported)).
- Slow input when the documented caps and default throttle hold. `throttleMs: 0` on one huge paragraph is a documented limit.
- Misuse of documented options, such as allowing unsafe protocols or passing an untrusted `highlight` function.
- Anything that needs the attacker to already control your page, your CSS, or your callbacks (`onLinkClick`, `isInternalPath`, `highlight`), and the contents of third-party highlighters.
- Findings in tests, scripts, or dev dependencies that do not reach the published package.

## Supported versions

The latest minor release.
