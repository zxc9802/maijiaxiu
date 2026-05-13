import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const prismaSchema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
const generateRouteSource = readFileSync(resolve('app/api/buyer-show/generate/route.ts'), 'utf8');
const generateJobRouteSource = readFileSync(resolve('app/api/buyer-show/generate/[jobId]/route.ts'), 'utf8');
const jobStoreSource = readFileSync(resolve('lib/buyer-show/generation-job-store.ts'), 'utf8');
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');

assert.match(prismaSchema, /model BuyerShowGenerationJob/);
assert.match(prismaSchema, /@@map\("buyer_show_generation_jobs"\)/);
assert.match(prismaSchema, /status\s+String\s+@default\("queued"\)/);

assert.match(jobStoreSource, /createBuyerShowGenerationJob/);
assert.match(jobStoreSource, /scheduleBuyerShowGenerationJob/);
assert.match(jobStoreSource, /runBuyerShowGenerationJob/);
assert.match(jobStoreSource, /completeMissingProductInfo/);
assert.match(jobStoreSource, /generateBuyerShowResults/);
assert.doesNotMatch(jobStoreSource, /upsertBuyerShowHistory/);

assert.match(generateRouteSource, /scheduleBuyerShowGenerationJob/);
assert.match(generateRouteSource, /status:\s*202/);
assert.match(generateRouteSource, /jobId/);
assert.doesNotMatch(generateRouteSource, /await\s+generateBuyerShowResults/);

assert.match(generateJobRouteSource, /export async function GET/);
assert.match(generateJobRouteSource, /getBuyerShowGenerationJob/);
assert.match(generateJobRouteSource, /scheduleBuyerShowGenerationJob/);

assert.match(clientSource, /pollGenerationJob/);
assert.match(clientSource, /\/api\/buyer-show\/generate\/\$\{encodeURIComponent\(jobId\)\}/);
assert.match(clientSource, /生成任务已提交/);
