import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const generateRouteSource = readFileSync(resolve('app/api/buyer-show/generate/route.ts'), 'utf8');
const jobStoreSource = readFileSync(resolve('lib/buyer-show/generation-job-store.ts'), 'utf8');

assert.doesNotMatch(jobStoreSource, /upsertBuyerShowHistory/, 'generation jobs should not auto-save cloud history');
assert.doesNotMatch(generateRouteSource, /historyId/, 'generate route should not accept a history id for automatic updates');
assert.doesNotMatch(
  clientSource,
  /historyId,\s*\n\s*productInfo:\s*currentProductInfo/,
  'generate requests should not include historyId for automatic cloud history updates',
);

assert.doesNotMatch(
  clientSource,
  /persistCurrentHistory\(nextResults\)/,
  'result updates should not auto-save cloud history',
);

assert.match(clientSource, /data-action="save-cloud-history"/, 'cloud history should expose an explicit save button');
assert.match(clientSource, /onClick=\{\(\) => void persistCurrentHistory\(\)\}/, 'manual save button should invoke cloud history persistence');
