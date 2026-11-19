`commonmark-spec.json` is the example list of the CommonMark spec, version 0.31.2, from https://spec.commonmark.org/0.31.2/spec.json.
Copyright (c) John MacFarlane, licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
It is used only as test data, is not part of the npm package, and was not changed.

Provenance and regeneration:

- `commonmark-spec.json` is the unmodified download named above (version 0.31.2). Replace it only to move to a newer spec version, then regenerate the two files below and review the diff.
- `commonmark-known-failures.json` lists the example numbers that fail today. `UPDATE_CONFORMANCE=1 npx vitest run test/commonmark.test.ts` rewrites it, and the test fails on both new failures and stale entries.
- `commonmark-sections.json` holds the per-section pass counts that `npm run support` checks the support rows against, and that the demo's support panel shows. The same command rewrites it.
- `golden.json` holds exact output for a few documents: `UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts`.
