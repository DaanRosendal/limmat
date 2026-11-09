// The one reader of docs/support.json, shared by the README generator and the demo build.
// Rows are shown best first (supported, partial, not yet, will not). Inside a status they keep the file's order.
import { readFileSync } from 'node:fs';

export const LABEL = { supported: 'Supported', partial: 'Partial', 'not-yet': 'Not yet', wont: 'Will not' };
const ORDER = Object.keys(LABEL);

export const sections = JSON.parse(readFileSync('test/fixtures/commonmark-sections.json', 'utf8'));

export const rows = JSON.parse(readFileSync('docs/support.json', 'utf8'))
  .map((r, i) => ({ r, i }))
  .sort((a, b) => ORDER.indexOf(a.r.status) - ORDER.indexOf(b.r.status) || a.i - b.i)
  .map(({ r }) => r);

/** Passing and total CommonMark examples for a row, or null when the row cites no sections. A missing section counts as 0. */
export function specCounts(r) {
  if (!r.cm?.length) return null;
  let pass = 0;
  let total = 0;
  for (const name of r.cm) {
    pass += sections[name]?.pass ?? 0;
    total += sections[name]?.total ?? 0;
  }
  return { pass, total };
}
