import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');
const generationService = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');

assert.ok(schemaSource.includes('generationStatusSchema'), 'schemas should expose per-item generation status');
assert.ok(schemaSource.includes('generationError'), 'schemas should preserve per-item generation failure reasons');

assert.ok(generationService.includes('generateImageWithFallback'), 'image generation should isolate failures per image');
assert.ok(generationService.includes('createFailedImagePlaceholder'), 'failed images should return placeholders');
assert.ok(generationService.includes('generateCommentWithFallback'), 'comment generation should isolate failures per language');
assert.ok(generationService.includes('createFailedCommentPlaceholder'), 'failed comments should return placeholders');
assert.ok(generationService.includes("generationStatus: 'failed'"), 'failed generated items should be explicitly marked');
assert.ok(
  generationService.includes('Product info inference failed'),
  'product-info text inference failures should not fail the whole generation job',
);

assert.ok(clientSource.includes("generationStatus: 'completed'"), 'single regeneration should clear failed placeholder state');
assert.ok(clientSource.includes("image.generationStatus === 'failed'"), 'failed image placeholders should render failure-aware copy');
