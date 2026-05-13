import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import ts from 'typescript';

const promptSource = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');
const { buildImagePrompt } = loadGenerationServiceForTests();

const productInfo = {
  productName: '焕颜修护晚霜',
  category: '护肤 > 保湿 > 面霜',
  productInfoSource: 'mixed',
  productClaims: ['补水保湿'],
  skinTypes: ['混合性'],
  usageFeel: '水润乳霜感',
  avoidTerms: ['医疗级治愈'],
};

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

for (const text of [
  'sceneElementInstruction',
  'unboxing',
  'living_room',
  'sofa',
  'dressing_table',
  'southeast_asia_seaside',
  'southeast_asia_city',
  'opened cardboard shipping box',
  'real dressing table or vanity counter',
  'Southeast Asian seaside outdoor selfie',
  'Southeast Asian seaside hand-held close-up',
  'product-only Southeast Asian seaside customer photo',
  'long-tail boat',
  'colorful shophouses',
  'covered five-foot-way walkway',
]) {
  assert.ok(promptSource.includes(text), `scene element prompt should include "${text}"`);
}

for (const text of [
  'buildSeasonClimatePromptGuidance',
  'buildPersonGenderPromptGuidance',
  'buildPromptFusionGuidance',
  'spring_autumn',
  'summer',
  'winter',
  'tropical_humid',
  'rainy_season',
  'mild spring or autumn weather',
  'hot summer weather',
  'cold winter weather',
  'tropical humid weather',
  'rainy season weather',
  'Prompt fusion rule',
  'Image exposure rule: product-only placement images use scene, season, weather, light, and surface details only; do not apply person clothing or facial guidance.',
  'Selected customer gender: adult woman',
  'Selected customer gender: adult man',
  'For Muslim profiles in summer or tropical humidity, use modest lightweight breathable long-sleeve clothing',
  'thin everyday hijab or tudung when a woman is visible',
  'For winter, use heavier everyday layers',
  'For rainy season, add overcast low-contrast light',
  'wet pavement or wet window cues',
  'avoid forced umbrella props indoors',
  'Tropical-scene consistency',
  'instead of borrowing temperate cold-weather styling',
]) {
  assert.ok(promptSource.includes(text), `season climate prompt should include "${text}"`);
}

const seasideSelfiePrompt = buildImagePrompt(
  productInfo,
  'selfie_holding_product',
  'southeast_asia_asian',
  'southeast_asia_seaside',
  'summer',
);
assertIncludesAll(seasideSelfiePrompt, ['selfie', 'Southeast Asian seaside']);
assertExcludesAll(seasideSelfiePrompt, ['bedroom mirror selfie', 'ordinary bedroom background', 'near the face or chest']);

const seasideSelfieVariantPrompt = buildImagePrompt(
  productInfo,
  'selfie_holding_product',
  'southeast_asia_asian',
  'southeast_asia_seaside',
  'summer',
  1,
);
assertIncludesAll(seasideSelfieVariantPrompt, ['Pose variant', 'product visible as proof-of-use']);
assertExcludesAll(seasideSelfieVariantPrompt, ['near the face or chest', 'product pressed against cheek']);
assert.notEqual(
  seasideSelfiePrompt,
  seasideSelfieVariantPrompt,
  'selfie prompts should vary pose guidance across generated image index',
);

const tropicalWinterPrompt = buildImagePrompt(
  productInfo,
  'selfie_holding_product',
  'muslim_asian',
  'southeast_asia_city',
  'winter',
);
assertIncludesAll(tropicalWinterPrompt, ['tropical city', 'breathable']);
assertExcludesAll(tropicalWinterPrompt, ['cold winter weather', 'heavier everyday layers', 'knitwear', 'jacket', 'scarf', 'thicker hijab']);

const productOnlySofaPrompt = buildImagePrompt(
  productInfo,
  'bathroom_vanity',
  'southeast_asia_asian',
  'sofa',
  'spring_autumn',
);
assertIncludesAll(productOnlySofaPrompt, ['product-only', 'no visible people', 'no hands']);
assertExcludesAll(productOnlySofaPrompt, ['casually held', 'real skin texture', 'natural body proportions', 'clothing folds']);

const handheldDressingTablePrompt = buildImagePrompt(
  productInfo,
  'handheld_product_closeup',
  'southeast_asia_asian',
  'dressing_table',
  'spring_autumn',
);
assertIncludesAll(handheldDressingTablePrompt, ['one hand naturally holding the product', 'real dressing table']);
assertExcludesAll(handheldDressingTablePrompt, ['product standing naturally on the table']);

const indoorWinterPrompt = buildImagePrompt(
  productInfo,
  'selfie_holding_product',
  'white',
  'living_room',
  'winter',
);
assertIncludesAll(indoorWinterPrompt, ['cold winter weather', 'heavier everyday layers']);

const asianProfilePrompt = buildImagePrompt(
  productInfo,
  'selfie_holding_product',
  'asian',
  'living_room',
  'spring_autumn',
);
assertIncludesAll(asianProfilePrompt, ['East Asian customer', 'Chinese, Korean, or Japanese appearance range', 'dark eyes', 'black or dark brown hair']);

const femaleSelfiePrompt = buildImagePrompt(
  productInfo,
  'selfie_holding_product',
  'southeast_asia_asian',
  'living_room',
  'spring_autumn',
  0,
  'female',
);
assertIncludesAll(femaleSelfiePrompt, ['Selected customer gender: adult woman', 'visible hands, face, body shape, hair, and clothing should read naturally feminine']);

const maleHandheldPrompt = buildImagePrompt(
  productInfo,
  'handheld_product_closeup',
  'muslim_asian',
  'living_room',
  'summer',
  0,
  'male',
);
assertIncludesAll(maleHandheldPrompt, ['Selected customer gender: adult man', 'visible hands, wrist, arms, face, body shape, hair, and clothing should read naturally masculine']);
assertExcludesAll(maleHandheldPrompt, ['thin everyday hijab or tudung when a woman is visible']);

const productOnlyGenderPrompt = buildImagePrompt(
  productInfo,
  'bathroom_vanity',
  'southeast_asia_asian',
  'living_room',
  'summer',
  0,
  'male',
);
assertExcludesAll(productOnlyGenderPrompt, ['Selected customer gender', 'adult man', 'adult woman', 'naturally masculine', 'naturally feminine']);

for (const sceneElement of ['unboxing', 'living_room', 'sofa', 'dressing_table', 'southeast_asia_seaside', 'southeast_asia_city']) {
  const productOnlyPrompt = buildImagePrompt(productInfo, 'bathroom_vanity', 'southeast_asia_asian', sceneElement, 'summer');
  assertExcludesAll(productOnlyPrompt, [
    'one hand holds',
    'hand-held',
    'casually held',
    'product texture on hand',
    'selfie',
    'person seated',
    'face appears',
    'real skin texture',
    'natural body proportions',
    'clothing folds',
    'breathable everyday fabrics',
    'warm-climate styling',
  ]);
}

for (const imageType of ['texture_on_hand', 'bathroom_vanity', 'handheld_product_closeup', 'selfie_holding_product']) {
  for (const sceneElement of ['southeast_asia_seaside', 'southeast_asia_city']) {
    const prompt = buildImagePrompt(productInfo, imageType, 'muslim_asian', sceneElement, 'winter');
    assertIncludesAll(prompt, imageType === 'bathroom_vanity' ? ['Southeast Asian', 'humid daylight'] : ['Southeast Asian', 'breathable']);
    assertExcludesAll(prompt, ['cold winter weather', 'heavier everyday layers', 'knitwear', 'jacket', 'scarf', 'thicker hijab']);
  }
}

function assertIncludesAll(value, needles) {
  for (const needle of needles) {
    assert.ok(value.includes(needle), `prompt should include "${needle}"`);
  }
}

function assertExcludesAll(value, needles) {
  for (const needle of needles) {
    assert.ok(!value.includes(needle), `prompt should not include "${needle}"`);
  }
}

function loadGenerationServiceForTests() {
  const tempDir = mkdtempSync(resolve('tests/.prompt-test-'));
  writeFileSync(join(tempDir, 'package.json'), '{"type":"commonjs"}');

  for (const filename of readdirSync(resolve('lib/buyer-show')).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(resolve('lib/buyer-show', filename), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    });
    writeFileSync(join(tempDir, `${basename(filename, '.ts')}.js`), transpiled.outputText);
  }

  const require = createRequire(import.meta.url);
  const generationService = require(join(tempDir, 'generation-service.js'));
  process.once('exit', () => rmSync(tempDir, { force: true, recursive: true }));
  return generationService;
}
