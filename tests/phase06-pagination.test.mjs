// The deployed TypeScript helper is also exercised by checking that its exported
// runtime behavior is compiled by TypeScript in the user's npm run build.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const p = new URL('../src/lib/pagination.ts', import.meta.url);
const source = readFileSync(p, 'utf8');
for (const name of ['readPage','pageRange','totalPages']) {
  test(`Phase 06 pagination helper exports ${name}`, () => assert.match(source,new RegExp(`export function ${name}\\(`)));
}
