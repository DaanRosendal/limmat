# Contributing

Thanks for helping. limmat stays small on purpose, so features need a clear use for streaming markdown from LLMs.

## Setup

Use Node 24 (see `.nvmrc`). The dev tools need Node 22.22.2 or newer on 22, 24.15 or newer on 24, or 26 and up (jsdom 31 and vitest 5 skip odd-numbered releases such as 25). CI runs the checks on 22, 24, and 26.

```sh
npm ci --ignore-scripts
npx playwright install chromium firefox webkit
npm run check   # typecheck, lint, style, unit tests, builds, package and support checks, size, browser tests
```

Run `npm run format` before committing. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the scanner or the freeze logic.

## Rules

- The DOM is built with `createElement` and text nodes. Never use `innerHTML`, `insertAdjacentHTML`, or `outerHTML` in `src/`.
- Every fix starts with a failing test. Streaming changes need a case in `test/helpers/cases.ts`, which feeds the chunk-split fuzz and the half-open snapshots, and security-relevant input goes into the XSS list in the same file.
- `npm run size` fails if the core grows by more than 3%. If the growth is worth it, run `npm run size -- --update` and say why in the commit message.
- `test/commonmark.test.ts` fails on a new CommonMark failure and on a stale entry in `test/fixtures/commonmark-known-failures.json`. Regenerate with `UPDATE_CONFORMANCE=1 npx vitest run test/commonmark.test.ts` after an intentional change, and review the diff.
- The README support table is generated: edit `docs/support.json`, then run `npm run support`. New syntax must say what it shows while it is still open. It must be opt-in unless it is safe by construction (no network request, no attribute from the input that is not checked), and a risk that cannot be removed, like images loading without a click, must be documented in `SECURITY.md` next to the option that limits it.
- One logical change per pull request, and no drive-by reformatting.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`).
- Use hyphens, commas, and colons, not em or en dashes, and the Oxford comma.
- No runtime dependencies. Write the renderer from your own code, and do not copy source from other markdown libraries, so the MIT license stays clean.
