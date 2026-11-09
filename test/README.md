# Tests

`npm test` runs the unit tests (vitest and jsdom). `npm run test:browser` runs the browser suite (Playwright on Chromium, Firefox, and WebKit) against the built `dist`. `npm run check` runs everything.

## Unit tests (`test/`)

| File                          | What it guards                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `xss.test.ts`                 | The XSS battery from `helpers/cases.ts`: nothing dangerous reaches the DOM.          |
| `fuzz-malicious.test.ts`      | Generated hostile input: no throw, bounded time, a safe DOM.                         |
| `chunk-fuzz.test.ts`          | Any chunking renders the same DOM as one write.                                      |
| `half-open.test.ts`           | A cut-off construct never shows raw markers.                                         |
| `freeze.test.ts`              | Frozen units are never touched again (deterministic).                                |
| `golden.test.ts`              | Exact output for a few documents (`fixtures/golden.json`).                           |
| `conformance.test.ts`         | Hand-written CommonMark-style cases.                                                 |
| `commonmark.test.ts`          | The CommonMark 0.31.2 examples, with a ratchet for known failures.                   |
| `api.test.ts`, `gaps.test.ts` | Options, lifecycle, accessibility, clipboard, and review-found gaps.                 |
| `regress.test.ts`             | One test per bug found in review.                                                    |
| `perf.test.ts`                | Functional checks that big inputs finish (timing budgets live in the browser suite). |

`helpers/cases.ts` holds the shared corpus: add a case there and several suites pick it up. `helpers/util.ts` has `render`, `renderOpen`, `mk`, and the chunk splitters.

## Browser tests (`browser/`)

Run on the built `dist` through route fulfilment on `https://limmat.test`, so no server is needed.

| File               | What it guards                                                                |
| ------------------ | ----------------------------------------------------------------------------- |
| `xss.spec.ts`      | The XSS list executed in real browsers: nothing runs, nothing loads.          |
| `behavior.spec.ts` | Streaming stability, copy, focus, keyboard order, and accessibility with axe. |
| `demo.spec.ts` | The demo page: strict CSP with no violations, only same-origin requests, every stream equal for every chunking, the hostile gallery runs and loads nothing, share links (including bad ones), and axe in three color modes. |
| `bench.spec.ts`    | Performance budgets and the memory test.                                      |

## Updating fixtures

- Golden output: `UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts`, then review the diff.
- CommonMark ratchet: `UPDATE_CONFORMANCE=1 npx vitest run test/commonmark.test.ts`, then review the diff.
