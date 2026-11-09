# Security policy

limmat renders untrusted text (LLM output) into the DOM, so security reports are welcome and taken seriously.

## Reporting

Please report a vulnerability privately, not in a public issue:

- Use GitHub's private vulnerability reporting on the repository (Security tab, "Report a vulnerability"), or
- email contact@daanrosendal.com with steps to reproduce.

You can expect an answer within a few days. Fixes ship as a patch release with a CHANGELOG entry and credit if you want it.

## Scope

In scope: any input that makes limmat create an element or attribute outside its documented DOM, run script, load a resource, navigate to a disallowed URL, throw, or hang the page.

Out of scope: styling issues in your own CSS, what your `onLinkClick` or `highlight` callbacks do, and the contents of third-party highlighters.

## Supported versions

The latest minor release.
