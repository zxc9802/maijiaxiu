import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cancelRoutePath = resolve('app/api/buyer-show/generate/[jobId]/cancel/route.ts');
const cancelRouteSource = existsSync(cancelRoutePath) ? readFileSync(cancelRoutePath, 'utf8') : '';
const generateJobRouteSource = readFileSync(resolve('app/api/buyer-show/generate/[jobId]/route.ts'), 'utf8');
const generationServiceSource = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');
const jobStoreSource = readFileSync(resolve('lib/buyer-show/generation-job-store.ts'), 'utf8');
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');

assert.ok(existsSync(cancelRoutePath), 'generation jobs should expose a cancel route');
assert.match(cancelRouteSource, /export async function POST/, 'cancel route should use POST');
assert.match(cancelRouteSource, /cancelBuyerShowGenerationJob/, 'cancel route should call the job-store cancel API');

assert.match(jobStoreSource, /'canceled'/, 'job status should include a canceled state');
assert.match(jobStoreSource, /cancelBuyerShowGenerationJob/, 'job store should export a cancel function');
assert.match(jobStoreSource, /persistPartialGenerationResults/, 'job store should persist partial generated results');
assert.match(jobStoreSource, /shouldCancelGenerationJob/, 'running jobs should check cancellation before starting more work');

assert.match(generationServiceSource, /GenerateBuyerShowResultsOptions/, 'generation service should accept incremental generation options');
assert.match(generationServiceSource, /onPartialResults/, 'generation service should report partial results as items finish');
assert.match(generationServiceSource, /shouldStop/, 'generation service should stop before starting additional items when canceled');

assert.match(generateJobRouteSource, /job\.status === 'queued'/, 'poll route should only reschedule queued jobs');
assert.doesNotMatch(generateJobRouteSource, /job\.status === 'canceled'[\s\S]*scheduleBuyerShowGenerationJob/, 'canceled jobs should not be rescheduled');

assert.match(clientSource, /stopGeneration/, 'client should expose a stop generation handler');
assert.match(clientSource, /currentGenerationJobIdRef/, 'client should remember the active generation job id');
assert.match(clientSource, /data-action="stop-generation"/, 'UI should render a stop generation button');
assert.match(clientSource, /job\.status === 'canceled'/, 'client polling should handle canceled jobs');
assert.match(clientSource, /canceledJob\.results/, 'client should display partial results returned by a canceled job');
