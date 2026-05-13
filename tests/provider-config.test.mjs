import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('lib/buyer-show/provider-config.ts'), 'utf8');

assert.ok(source.includes('SHANBAOB_API_KEY'));
assert.ok(source.includes('SHANBAOB_BASE_URL'));
assert.ok(source.includes('BUYER_SHOW_TEXT_MODEL'));
assert.ok(source.includes('gemini-3.1-pro-preview'));
assert.ok(source.includes('YUNWU_IMAGE_API_KEY'));
assert.ok(source.includes('YUNWU_IMAGE_MODEL'));
assert.ok(source.includes('gpt-image-2-all'));
assert.ok(source.includes('XAI_IMAGE_BASE_URL'));
assert.ok(source.includes('XAI_IMAGE_API_KEY'));
assert.ok(source.includes('XAI_IMAGE_MODEL'));
assert.ok(source.includes('XAI_IMAGE_SIZE'));
assert.ok(source.includes('XAI_IMAGE_QUALITY'));
assert.ok(source.includes('api-xai.ainaibahub.com'));
assert.ok(source.includes('gpt-image-2'));
assert.ok(source.includes('1024x1024'));
assert.ok(!source.includes('sk-'), 'provider config must not hardcode API keys');
