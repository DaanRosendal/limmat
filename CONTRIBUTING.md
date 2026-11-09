# Contributing

Thanks for helping. limmat stays small on purpose, so features need a clear use in chat UIs for LLM output.

## Setup

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check   # typecheck, lint, unit tests, build, size, Chromium tests
```

Run `npm run format` before committing.

## Rules

- **Safety first.** The DOM is built with `createElement` and text nodes. Never use `innerHTML`, `insertAdjacentHTML` or `outerHTML` in `src/`.
- **Tests first.** Every fix starts with a failing test. Streaming changes need a case in the chunk-split fuzz corpus (`test/helpers/cases.ts`), and security-relevant input goes into the XSS list in the same file.
- **Size ratchet.** `npm run size` fails if the core grows by more than 3%. If the growth is worth it, run `npm run size -- --update` and say why in the commit message.
- **Conformance ratchet.** `test/commonmark.test.ts` fails on a new CommonMark failure and on a stale entry in `test/fixtures/commonmark-known-failures.json`. Regenerate with `UPDATE_CONFORMANCE=1 npx vitest run test/commonmark.test.ts` after an intentional change, and review the diff.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`).
- **Writing.** Use hyphens, commas, and colons, not em or en dashes. Use the Oxford comma.
- **No runtime dependencies.** Dev dependencies should stay few and well known.
- Write the renderer from your own code. Do not copy source from other markdown libraries, so the MIT license stays clean.
