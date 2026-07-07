import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');

assert.ok(
  clientSource.includes('readBlobAsDataUrl'),
  'client should convert prepared upload blobs into base64 data URLs',
);
assert.ok(
  clientSource.includes('createBase64Asset'),
  'client should create uploaded assets from local base64 data',
);
assert.match(
  clientSource,
  /const uploadedAssets = await Promise\.all\(files\.map\(\(file, index\) => createBase64Asset\(type, file, index\)\)\);[\s\S]*setAssets\(\(current\) => \[\.\.\.current, \.\.\.uploadedAssets\]\);/,
  'asset upload handler should store base64 assets without starting background uploads',
);
assert.ok(
  clientSource.includes('await ensureAssetsUploaded(assets)'),
  'generation should validate local uploaded assets before calling the backend generation route',
);
assert.match(
  clientSource,
  /assets:\s*uploadedAssets\.map\(toAssetPayload\)/,
  'generation payload should use the uploaded asset snapshot with base64 local previews',
);
assert.match(
  clientSource,
  /const uploadedAssets = await ensureAssetsUploaded\(assets\);[\s\S]*\/api\/buyer-show\/regenerate-image/,
  'single-image regeneration should also validate local assets before using reference images',
);
