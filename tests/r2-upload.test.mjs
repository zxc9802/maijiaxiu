import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');
const generationServiceSource = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

assert.ok(
  !packageJson.dependencies['@aws-sdk/client-s3'] && !packageJson.dependencies['@aws-sdk/s3-request-presigner'],
  'package.json should not include R2/S3 dependencies when uploads stay as base64',
);
assert.ok(
  schemaSource.includes('localPreviewKey: z.string'),
  'uploaded assets should carry the browser-local data URL used as the model reference',
);
assert.ok(
  !generationServiceSource.includes('createR2ReadUrl'),
  'generation service should not require R2 read URLs for uploaded reference images',
);
assert.ok(
  generationServiceSource.includes('return asset.localPreviewKey ?? asset.temporaryObjectUrl'),
  'generation service should pass local base64 data URLs to provider calls',
);
assert.ok(
  !clientSource.includes('/api/buyer-show/assets/sign-upload'),
  'client should not request a presigned R2 PUT URL before generating',
);
assert.ok(clientSource.includes('prepareImageForUpload'), 'client should still resize/re-encode images before base64 storage');
assert.ok(clientSource.includes('readBlobAsDataUrl'), 'client should convert prepared upload blobs to data URLs');
assert.ok(clientSource.includes('localPreviewKey: dataUrl'), 'client assets should store base64 data URLs as the payload');
assert.ok(
  !clientSource.includes('pendingAssetUploadsRef'),
  'client should not keep background R2 upload state when using base64 payloads',
);
