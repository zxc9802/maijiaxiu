import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const route of ['generate', 'regenerate-comment', 'regenerate-image', 'compliance-check']) {
  const source = readFileSync(resolve(`app/api/buyer-show/${route}/route.ts`), 'utf8');
  assert.ok(source.includes('export async function POST'), `${route} should export POST`);
  assert.ok(source.includes('NextResponse'), `${route} should use NextResponse`);
}
