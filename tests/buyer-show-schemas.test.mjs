import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');

const expectedTexts = [
  'zh-CN',
  'en-US',
  'th-TH',
  'ms-MY',
  'texture_on_hand',
  'bathroom_vanity',
  'handheld_product_closeup',
  'selfie_holding_product',
  'comment_only',
  'image_with_comment',
  'checking',
  'manual',
  'ai_inferred',
  'mixed',
  'personEthnicity',
  'yellow',
  'white',
  'black',
];

for (const text of expectedTexts) {
  assert.ok(schemaSource.includes(text), `schemas.ts should include ${text}`);
}

assert.match(schemaSource, /export const supportedLanguages/, 'schemas.ts should export supportedLanguages');
assert.match(schemaSource, /export const personEthnicitySchema/, 'schemas.ts should export personEthnicitySchema');
assert.match(schemaSource, /export type PersonEthnicity/, 'schemas.ts should export PersonEthnicity');
assert.match(schemaSource, /export const defaultGenerationSets/, 'schemas.ts should export defaultGenerationSets');
assert.match(schemaSource, /personEthnicity:\s*personEthnicitySchema\.default\('yellow'\)/, 'generation sets should default person ethnicity to yellow');
assert.match(schemaSource, /imageTypeCounts/, 'generation sets should store counts per image type');
assert.ok(!schemaSource.includes('imageCount: z.number'), 'generation sets should not use a single suite-level image count');
assert.ok(!schemaSource.includes('imageTypes: z.array'), 'generation sets should not use selected image types without per-type counts');
assert.match(
  schemaSource,
  /export const productCategorySchema[\s\S]*z\.string\(\)[\s\S]*default\('unknown'\)/,
  'productCategorySchema should accept custom category text',
);
assert.ok(
  !schemaSource.includes("z.enum(['skincare', 'beauty', 'unknown'])"),
  'productCategorySchema should not be limited to fixed category options',
);

for (const name of ['套件1', '套件2', '套件3']) {
  assert.ok(schemaSource.includes(`name: '${name}'`), `default generation sets should use simple name ${name}`);
}

const defaultSetBlocks = schemaSource.match(/id: 'set-[abc]'[\s\S]*?commentCount: \d,/g) ?? [];
assert.equal(defaultSetBlocks.length, 3, 'default generation sets should include three set blocks');
for (const block of defaultSetBlocks) {
  assert.ok(block.includes("personEthnicity: 'yellow'"), 'each default generation set should default to yellow ethnicity');
}

for (const oldName of ['真实素人', '只评论结果', '自拍持产品']) {
  assert.ok(!schemaSource.includes(`name: '${oldName}'`), `default generation sets should not use descriptive name ${oldName}`);
}
