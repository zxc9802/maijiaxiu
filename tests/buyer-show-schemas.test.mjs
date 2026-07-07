import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const schemaSource = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');
const { productInfoSchema } = loadSchemasForTests();

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
  'personProfile',
  'personGender',
  'muslim_black',
  'muslim_asian',
  'asian',
  'southeast_asia_deep',
  'southeast_asia_asian',
  'white',
  'female',
  'male',
  'seasonClimate',
  'spring_autumn',
  'summer',
  'winter',
  'tropical_humid',
  'rainy_season',
  'sceneElements',
  'unboxing',
  'living_room',
  'sofa',
  'dressing_table',
  'southeast_asia_seaside',
  'southeast_asia_city',
  'objectKey',
];

for (const text of expectedTexts) {
  assert.ok(schemaSource.includes(text), `schemas.ts should include ${text}`);
}

assert.match(schemaSource, /export const supportedLanguages/, 'schemas.ts should export supportedLanguages');
assert.match(schemaSource, /export const personProfileSchema/, 'schemas.ts should export personProfileSchema');
assert.match(schemaSource, /personProfileSchema\s*=\s*z\.enum\(\[[^\]]*'asian'/, 'personProfileSchema should include the standalone Asian profile');
assert.match(schemaSource, /export type PersonProfile/, 'schemas.ts should export PersonProfile');
assert.match(schemaSource, /export const personGenderSchema/, 'schemas.ts should export personGenderSchema');
assert.match(schemaSource, /personGenderSchema\s*=\s*z\.enum\(\['female',\s*'male'\]\)/, 'personGenderSchema should support female and male');
assert.match(schemaSource, /export type PersonGender/, 'schemas.ts should export PersonGender');
assert.match(schemaSource, /legacyPersonEthnicityToProfile/, 'schemas.ts should map legacy ethnicity values into person profiles');
assert.match(schemaSource, /export const seasonClimateSchema/, 'schemas.ts should export seasonClimateSchema');
assert.match(schemaSource, /export type SeasonClimate/, 'schemas.ts should export SeasonClimate');
assert.match(schemaSource, /export const sceneElementSchema/, 'schemas.ts should export sceneElementSchema');
assert.match(schemaSource, /export type SceneElement/, 'schemas.ts should export SceneElement');
assert.match(schemaSource, /export const defaultGenerationSets/, 'schemas.ts should export defaultGenerationSets');
assert.match(
  schemaSource,
  /personProfile:\s*personProfileSchema\.default\('southeast_asia_asian'\)/,
  'generation sets should default person profile to Southeast Asian Asian',
);
assert.match(
  schemaSource,
  /personGender:\s*personGenderSchema\.default\('female'\)/,
  'generation sets should default person gender to female',
);
assert.match(
  schemaSource,
  /seasonClimate:\s*seasonClimateSchema\.default\('spring_autumn'\)/,
  'generation sets should default season climate to spring/autumn',
);
assert.match(schemaSource, /imageTypeCounts/, 'generation sets should store counts per image type');
assert.match(schemaSource, /sceneElements:\s*z\.array\(sceneElementSchema\)\.default/, 'generation sets should store reusable scene elements');
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

for (const name of ['套件1']) {
  assert.ok(schemaSource.includes(`name: '${name}'`), `default generation sets should use simple name ${name}`);
}

assert.ok(!schemaSource.includes("name: '套件2'"), 'default generation sets should not include suite 2');
assert.ok(!schemaSource.includes("name: '套件3'"), 'default generation sets should not include suite 3');

const nullableProductInfo = productInfoSchema.parse({
  productName: null,
  usageFeel: null,
  category: '',
  productClaims: [],
  skinTypes: [],
  avoidTerms: [],
});
assert.equal(nullableProductInfo.productName, undefined, 'nullable product name should be treated as missing');
assert.equal(nullableProductInfo.usageFeel, undefined, 'nullable usage feel should be treated as missing');
assert.equal(nullableProductInfo.category, 'unknown', 'empty category should still fall back to unknown');

const defaultSetBlocks = schemaSource.match(/id: 'set-[a]'[\s\S]*?commentCount: \d,/g) ?? [];
assert.equal(defaultSetBlocks.length, 1, 'default generation sets should include one set block');
for (const block of defaultSetBlocks) {
  assert.ok(block.includes("personProfile: 'southeast_asia_asian'"), 'each default generation set should default to Southeast Asian Asian profile');
  assert.ok(block.includes("personGender: 'female'"), 'each default generation set should default to female gender');
  assert.ok(block.includes("seasonClimate: 'spring_autumn'"), 'each default generation set should default to spring/autumn climate');
  assert.ok(block.includes("sceneElements: ['dressing_table']"), 'each default generation set should default to dressing table scene');
}

for (const oldName of ['真实素人', '只评论结果', '自拍持产品']) {
  assert.ok(!schemaSource.includes(`name: '${oldName}'`), `default generation sets should not use descriptive name ${oldName}`);
}

function loadSchemasForTests() {
  const tempDir = mkdtempSync(resolve('tests/.schema-test-'));
  writeFileSync(join(tempDir, 'package.json'), '{"type":"commonjs"}');
  const source = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  writeFileSync(join(tempDir, 'schemas.js'), transpiled.outputText);

  const require = createRequire(import.meta.url);
  const schemas = require(join(tempDir, 'schemas.js'));
  process.once('exit', () => rmSync(tempDir, { force: true, recursive: true }));
  return schemas;
}
