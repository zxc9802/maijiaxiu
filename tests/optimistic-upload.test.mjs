import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');

assert.ok(
  clientSource.includes('pendingAssetUploadsRef'),
  'client should keep in-flight R2 uploads outside serializable UI state',
);
assert.ok(
  clientSource.includes('createOptimisticAsset'),
  'client should create a preview asset before the R2 PUT finishes',
);
assert.match(
  clientSource,
  /setAssets\(\(current\) => \[\.\.\.current, \.\.\.optimisticAssets\]\);[\s\S]*startAssetUpload/,
  'asset upload handler should render optimistic previews before starting background uploads',
);
assert.ok(
  clientSource.includes('await ensureAssetsUploaded(assets)'),
  'generation should wait for pending R2 uploads before calling the backend generation route',
);
assert.match(
  clientSource,
  /assets:\s*uploadedAssets\.map\(toAssetPayload\)/,
  'generation payload should use the uploaded asset snapshot with resolved R2 object keys',
);
assert.match(
  clientSource,
  /const uploadedAssets = await ensureAssetsUploaded\(assets\);[\s\S]*\/api\/buyer-show\/regenerate-image/,
  'single-image regeneration should also wait for pending R2 uploads before using reference images',
);
