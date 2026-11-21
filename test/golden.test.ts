import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORPUS, REPLY } from './helpers/cases';
import { render } from './helpers/util';

// Exact output (classes, attributes, structure) for a few documents, so a change that the other suites
// would not notice still shows up in review. After an intended change: UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts
const FILE = join(process.cwd(), 'test/fixtures/golden.json');
const docs: Record<string, string> = {
  reply: REPLY,
  lists: CORPUS[2],
  links: CORPUS[4],
  table: CORPUS[5],
  quotes: CORPUS[6],
  inline: CORPUS[7],
  tasks: CORPUS[8],
  alerts: CORPUS[CORPUS.length - 1],
};

describe('golden output', () => {
  const got = Object.fromEntries(Object.entries(docs).map(([k, md]) => [k, render(md).innerHTML]));
  if (process.env.UPDATE_GOLDEN) writeFileSync(FILE, `${JSON.stringify(got, null, 2)}\n`);
  const want: Record<string, string> = JSON.parse(readFileSync(FILE, 'utf8'));
  for (const k of Object.keys(docs)) it(k, () => expect(got[k]).toBe(want[k]));
  it('covers the same documents', () => expect(Object.keys(want)).toEqual(Object.keys(docs)));
});
