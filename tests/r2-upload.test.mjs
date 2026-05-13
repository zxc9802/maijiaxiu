import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');
const generationServiceSource = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

assert.ok(existsSync(resolve('lib/buyer-show/r2-storage.ts')), 'R2 storage helper should exist');
assert.ok(
  existsSync(resolve('app/api/buyer-show/assets/sign-upload/route.ts')),
  'asset upload signing route should exist',
);

assert.ok(packageJson.dependencies['@aws-sdk/client-s3'], 'package.json should include the S3 client');
assert.ok(
  packageJson.dependencies['@aws-sdk/s3-request-presigner'],
  'package.json should include the S3 presigner',
);

assert.ok(schemaSource.includes('objectKey: z.string'), 'uploaded assets should carry a compact R2 object key');
assert.ok(
  generationServiceSource.includes('createR2ReadUrl'),
  'generation service should sign R2 object keys into temporary readable URLs for model calls',
);
assert.ok(
  generationServiceSource.includes('await resolveUploadedAssetImageUrls(request.assets)'),
  'generation service should resolve uploaded assets asynchronously before provider calls',
);
assert.ok(
  clientSource.includes('/api/buyer-show/assets/sign-upload'),
  'client should request a presigned R2 PUT URL before uploading assets',
);
assert.ok(clientSource.includes('prepareImageForUpload'), 'client should resize/re-encode images before R2 upload');
assert.ok(clientSource.includes('objectKey: uploaded.key'), 'client assets should store the returned R2 object key');
assert.ok(
  !clientSource.includes('localPreviewKey: await readFileAsDataUrl(file)'),
  'new uploads should not store full base64 images as the model-bound asset payload',
);
