import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const downloadRoutePath = resolve('app/api/buyer-show/images/download/route.ts');

assert.ok(existsSync(downloadRoutePath), 'image download route should exist');

const downloadRouteSource = readFileSync(downloadRoutePath, 'utf8');

assert.ok(
  clientSource.includes('/api/buyer-show/images/download'),
  'HTTP image downloads should go through the same-origin download route',
);
assert.ok(
  downloadRouteSource.includes('Content-Disposition'),
  'image download route should force attachment download disposition',
);
assert.ok(
  downloadRouteSource.includes('fetch('),
  'image download route should fetch the remote generated image server-side',
);
