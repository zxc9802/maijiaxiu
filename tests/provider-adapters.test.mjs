import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const textProvider = readFileSync(resolve('lib/buyer-show/text-provider.ts'), 'utf8');
const imageProvider = readFileSync(resolve('lib/buyer-show/image-provider.ts'), 'utf8');
const generationService = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');
const regenerateImageRoute = readFileSync(resolve('app/api/buyer-show/regenerate-image/route.ts'), 'utf8');

assert.ok(textProvider.includes('/chat/completions'));
assert.ok(textProvider.includes('gemini-3.1-pro-preview'));
assert.ok(textProvider.includes('JSON'));
assert.ok(textProvider.includes('requestJsonOverHttp1'), 'text provider should include an HTTP/1.1 fallback');
assert.ok(textProvider.includes('node:https'), 'text provider should use Node HTTPS for the HTTP/1.1 fallback');
assert.ok(textProvider.includes('Text provider connection failed'), 'text provider should wrap low-level connection errors with provider context');
assert.ok(textProvider.includes('extractJsonObjectText'), 'text provider should robustly extract JSON from fenced model output');
assert.ok(imageProvider.includes('/images/generations'));
assert.ok(imageProvider.includes('gpt-image-2-all'));
assert.ok(imageProvider.includes('fetch'));
assert.ok(imageProvider.includes('requestJsonOverHttp1'), 'image provider should include an HTTP/1.1 fallback');
assert.ok(imageProvider.includes('node:https'), 'image provider should use Node HTTPS for the HTTP/1.1 fallback');
assert.ok(imageProvider.includes('Image provider connection failed'), 'image provider should wrap low-level connection errors with provider context');
assert.ok(imageProvider.includes('const maxImageProviderAttempts = 5'), 'image provider should try each image provider 5 times');
assert.ok(imageProvider.includes('buildAlternatingImageProviderAttempts'), 'image provider should alternate Yunwu and XAI attempts');
assert.ok(imageProvider.includes("name: 'yunwu'"), 'image provider should include Yunwu as the primary image provider');
assert.ok(imageProvider.includes("name: 'xai'"), 'image provider should include XAI as the fallback image provider');
assert.ok(imageProvider.includes('requestXaiImageGeneration'), 'image provider should call the XAI image provider');
assert.ok(imageProvider.includes('stream: true'), 'XAI text-to-image generation should use streaming to avoid gateway disconnects');
assert.ok(imageProvider.includes('readStreamedImageB64Json'), 'image provider should parse streamed XAI image responses');
assert.ok(imageProvider.includes('/images/edits'), 'XAI reference-image generation should use the edits endpoint');
assert.ok(imageProvider.includes('FormData'), 'XAI reference-image generation should send multipart form data');
assert.ok(imageProvider.includes('图片生成失败，请稍后重试'), 'image provider should return a user-safe final failure message');
assert.ok(imageProvider.includes('shouldRetryImageProviderResponse'), 'image provider should retry transient HTTP provider failures');
assert.ok(generationService.includes('generateBuyerShowResults'));
assert.ok(generationService.includes('compliance'));
assert.ok(generationService.includes('readCommentText'), 'generation service should tolerate non-JSON comment model output');
assert.ok(generationService.includes('合规模型返回格式异常'), 'generation service should not fail the whole request on malformed compliance JSON');
assert.ok(generationService.includes("complianceStatus: 'checking'"), 'generated comments should return before compliance checks finish');
const commentGeneratorBlock = generationService.match(/export async function generateCommentForLanguage[\s\S]*?satisfies GeneratedComment;/)?.[0] ?? '';
assert.ok(
  !commentGeneratorBlock.includes('checkCommentCompliance'),
  'comment generation should not wait for compliance checks before returning generated text',
);
assert.ok(generationService.includes('completeMissingProductInfo'), 'generation service should complete missing product info');
assert.ok(generationService.includes('mergeInferredProductInfo'), 'generation service should merge inferred info without overwriting manual fields');
assert.ok(
  generationService.includes('const [images, comments] = await Promise.all'),
  'generation service should start image and comment provider calls in parallel while returning one combined result',
);
assert.ok(
  generationService.includes('const imageGenerationLimiter = createConcurrencyLimiter(2)'),
  'generation service should cap image generation concurrency at 2',
);
assert.ok(
  generationService.includes('imageGenerationLimiter(() => generateBuyerShowImage'),
  'generation service should run image provider calls through the shared limiter',
);
assert.ok(
  generationService.includes('const imageUrls = await resolveUploadedAssetImageUrls(request.assets)'),
  'image generation should pass uploaded R2/object-key reference images to the image provider',
);
assert.ok(
  !generationService.includes('request.assets.map((asset) => asset.temporaryObjectUrl)'),
  'image generation should not ignore browser-local uploaded reference images',
);
assert.ok(
  generationService.includes('createR2ReadUrl(asset.objectKey)'),
  'image generation should turn uploaded R2 object keys into temporary read URLs',
);
assert.ok(generationService.includes('amateur smartphone photo'), 'image prompts should target authentic phone-shot buyer show photos');
assert.ok(generationService.includes('Use uploaded reference images'), 'image prompts should explicitly preserve the uploaded product reference');
assert.ok(generationService.includes('realistic contact shadows'), 'image prompts should include realistic light and contact-shadow guidance');
assert.ok(generationService.includes('subtle jpeg compression'), 'image prompts should preserve everyday phone-camera artifacts');
assert.ok(generationService.includes('Negative prompt'), 'image prompts should explicitly suppress common AI-rendered artifacts');
assert.ok(generationService.includes('warm ceiling lamp light'), 'image prompts should include scene-specific lighting templates');
assert.ok(generationService.includes('buildPersonProfilePromptGuidance'), 'image prompts should include suite person profile guidance');
assert.ok(generationService.includes('buildSeasonClimatePromptGuidance'), 'image prompts should include suite season climate guidance');
assert.ok(generationService.includes('buildPromptFusionGuidance'), 'image prompts should fuse person profile, season, scene, and image type guidance');
assert.ok(generationService.includes('Black Muslim customer'), 'Muslim Black profile should guide visible customer appearance and modest styling');
assert.ok(generationService.includes('Asian Muslim customer'), 'Muslim Asian profile should guide visible customer appearance and modest styling');
assert.ok(generationService.includes('East Asian customer'), 'Asian profile should guide East Asian visible customer appearance');
assert.ok(generationService.includes('Chinese, Korean, or Japanese appearance range'), 'Asian profile should narrow appearance toward China, Korea, and Japan');
assert.ok(generationService.includes('Southeast Asian customer with deep tan to brown skin'), 'Southeast Asian deep-skin profile should avoid defaulting to African appearance');
assert.ok(generationService.includes('Southeast Asian Malay, Indonesian, Thai, Vietnamese, or Filipino customer'), 'Southeast Asian Asian profile should guide regional appearance');
assert.ok(generationService.includes('white/Caucasian customer'), 'white profile should guide visible skin and customer appearance');
assert.ok(regenerateImageRoute.includes('buildImagePrompt'), 'single-image regeneration should reuse the main buyer-show image prompt builder');
assert.ok(regenerateImageRoute.includes('personProfile'), 'single-image regeneration should accept suite person profile');
assert.ok(regenerateImageRoute.includes('seasonClimate'), 'single-image regeneration should accept suite season climate');
