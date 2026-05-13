import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const promptSource = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');

for (const text of [
  'handheld_product_closeup',
  'tight close-up',
  'one hand naturally holding the product',
  'front label facing the camera',
  'not a selfie',
  'no full person',
  'no face',
]) {
  assert.ok(promptSource.includes(text), `handheld product closeup prompt should include "${text}"`);
}

for (const text of ['product-only', 'no visible people', 'no hands', 'no faces', 'no arms', 'no body parts', 'no mirror reflection of a person']) {
  assert.ok(promptSource.includes(text), `bathroom vanity prompt should exclude people with "${text}"`);
}
