# Contributing

Thanks for helping. limmat stays small on purpose, so features need a clear use in chat UIs for LLM output.

## Setup

```sh
npm ci --ignore-scripts
npx playwright install chromium firefox webkit
npm run check   # typecheck, lint, unit tests, build, package check, size, browser tests
```

Run `npm run format` before committing. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the scanner or the freeze logic, and [test/README.md](test/README.md) to see which suite guards what.

## Where to start

- Pick a failing example from [test/fixtures/commonmark-known-failures.json](test/fixtures/commonmark-known-failures.json) that real chat output would hit, write the test, and fix it.
- Add a missing test case to `test/helpers/cases.ts`. A new case runs through the chunk-split fuzz and the half-open snapshots for free.
- Improve a note in the [support table](README.md#what-is-supported): edit `docs/support.json`, then run `npm run support`.
- For anything bigger, open an issue first. [docs/ROADMAP.md](docs/ROADMAP.md) lists what is wanted and what was decided against.

## Rules

- **Safety first.** The DOM is built with `createElement` and text nodes. Never use `innerHTML`, `insertAdjacentHTML` or `outerHTML` in `src/`.
- **Tests first.** Every fix starts with a failing test. Streaming changes need a case in the chunk-split fuzz corpus (`test/helpers/cases.ts`), and security-relevant input goes into the XSS list in the same file.
- **Size ratchet.** `npm run size` fails if the core grows by more than 3%. Size matters, but useful features and clearer code are worth a few percent: if the growth is worth it, run `npm run size -- --update` and say why in the commit message.
- **Package check.** `npm run check:package` (after a build) verifies the tarball contents and that a strict NodeNext TypeScript consumer compiles.
- **Conformance ratchet.** `test/commonmark.test.ts` fails on a new CommonMark failure and on a stale entry in `test/fixtures/commonmark-known-failures.json`. Regenerate with `UPDATE_CONFORMANCE=1 npx vitest run test/commonmark.test.ts` after an intentional change, and review the diff.
- **One logical change per pull request.** No drive-by reformatting: Biome formats the code, and `npm run format` is the only formatter. If you cannot write an automated test, say how you checked the change.
- **New syntax** must say what it shows while it is still open (the speculative render), and must be opt-in if it changes how any text renders today. Add or update its row in `docs/support.json`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`).
- **Writing.** Use hyphens, commas, and colons, not em or en dashes. Use the Oxford comma.
- **No runtime dependencies.** Dev dependencies should stay few and well known.
- Write the renderer from your own code. Do not copy source from other markdown libraries, so the MIT license stays clean.

## AI-assisted contributions

Using an AI tool is fine. Submitting something you cannot explain is not: you are responsible for every line, you should be able to say why it is correct, and you must have run the checks yourself. Do not paste tool output as a bug report or a security report: include a reproduction we can run. Add an `Assisted-by:` line to the commit message when a tool wrote a meaningful part. Generated code must be original, not copied from another markdown library. Pull requests that look unreviewed will be closed.

## Releasing (maintainer)

1. `npm run check` is green on `main`, and `CHANGELOG.md` has the version and date.
2. Remove `"private": true` and set the version in `package.json`.
3. `npm publish --access public` from an interactive terminal (npm asks for browser approval and 2FA).
4. Tag the release and publish the GitHub release with the changelog entry.

A stable API is deprecated for at least one minor release, with a "Deprecated" entry in the changelog, before it is removed. From 1.0 on, removals happen only in a major version.
