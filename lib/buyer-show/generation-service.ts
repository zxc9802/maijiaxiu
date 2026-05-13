import { buildCompliancePrompt, buildHumanizedCommentPrompt } from './humanizer-rules';
import { generateBuyerShowImage } from './image-provider';
import {
  generateRequestSchema,
  getLanguageLabel,
  type GeneratedComment,
  type GeneratedImage,
  type GeneratedResult,
  type GenerateRequest,
  type ImageType,
  type LanguageCode,
  type PersonEthnicity,
  type ProductInfo,
  type ComplianceStatus,
  type UploadedAsset,
} from './schemas';
import { createChatCompletion, parseJsonObject } from './text-provider';

type CommentJson = {
  comment?: string;
};

type ComplianceJson = {
  status?: 'passed' | 'needs_review';
  reasons?: string[];
  rewriteSuggestion?: string;
};

type InferredProductInfoJson = {
  productName?: string;
  category?: ProductInfo['category'];
  productClaims?: string[];
  skinTypes?: string[];
  usageFeel?: string;
  avoidTerms?: string[];
};

export async function generateBuyerShowResults(input: GenerateRequest): Promise<GeneratedResult[]> {
  const request = generateRequestSchema.parse(input);
  const productInfo = await completeMissingProductInfo(request.productInfo, request.assets);
  const imageUrls = getInferenceImageUrls(request.assets);

  return Promise.all(
    request.generationSets.map(async (set) => {
      const imageTypesToGenerate = expandImageTypes(set.imageTypeCounts);
      const imageGenerationPromise: Promise<GeneratedImage[]> =
        set.mode === 'image_with_comment'
          ? Promise.all(
              imageTypesToGenerate.map(async (type, index) => {
                const prompt = buildImagePrompt(productInfo, type, set.personEthnicity);
                const generated = await generateBuyerShowImage({ prompt, imageUrls, imageType: type });
                return {
                  id: `${set.id}-image-${index + 1}`,
                  type,
                  url: generated.url,
                  localImageKey: generated.b64Json ? `data:image/png;base64,${generated.b64Json}` : undefined,
                  promptSnapshot: prompt,
                };
              }),
            )
          : Promise.resolve([]);
      const commentGenerationPromise = Promise.all(
        set.languages.map((language) => generateCommentForLanguage(productInfo, language, set.id)),
      );
      const [images, comments] = await Promise.all([imageGenerationPromise, commentGenerationPromise]);

      return {
        id: `result-${set.id}`,
        setId: set.id,
        setName: set.name,
        mode: set.mode,
        images,
        comments,
        createdAt: new Date().toISOString(),
      };
    }),
  );
}

function expandImageTypes(imageTypeCounts: Record<ImageType, number>) {
  return (Object.entries(imageTypeCounts) as Array<[ImageType, number]>).flatMap(([type, count]) =>
    Array.from({ length: count }, () => type),
  );
}

export async function completeMissingProductInfo(productInfo: ProductInfo, assets: UploadedAsset[]) {
  if (!hasMissingProductInfo(productInfo)) return productInfo;

  const imageUrls = getInferenceImageUrls(assets);
  if (!imageUrls.length) return productInfo;

  const prompt = [
    'Analyze the uploaded product images and infer only missing product information.',
    'Never override fields that the user already provided.',
    'Return valid JSON only with this shape:',
    '{"productName":"optional","category":"specific category text or unknown","productClaims":["..."],"skinTypes":["..."],"usageFeel":"optional","avoidTerms":["..."]}',
    'Use modest, platform-safe wording. Do not invent medical efficacy claims.',
  ].join('\n');

  const response = await createChatCompletion(
    [
      { role: 'system', content: 'You are a strict product information JSON API. Return valid JSON only.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
      },
    ],
    { maxTokens: 1200, temperature: 0.1 },
  );

  try {
    return mergeInferredProductInfo(productInfo, parseJsonObject<InferredProductInfoJson>(response));
  } catch {
    return productInfo;
  }
}

export async function generateCommentForLanguage(productInfo: ProductInfo, language: LanguageCode, setId = 'comment') {
  const prompt = buildHumanizedCommentPrompt(productInfo, language);
  const response = await createChatCompletion(
    [
      { role: 'system', content: 'You are a strict JSON API. Return valid JSON only, without markdown fences or explanations.' },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 1600 },
  );
  const text = readCommentText(response);

  if (!text) {
    throw new Error(`No ${getLanguageLabel(language)} comment returned`);
  }

  return {
    id: `${setId}-${language}`,
    language,
    text,
    tone: 'real_user',
    complianceStatus: 'checking',
    complianceReasons: ['审核中，评论已先显示，稍后自动更新。'],
    promptSnapshot: prompt,
  } satisfies GeneratedComment;
}

export async function checkCommentCompliance(
  comment: string,
  language: LanguageCode,
): Promise<{ status: ComplianceStatus; reasons: string[]; rewriteSuggestion?: string }> {
  const prompt = buildCompliancePrompt(comment, language);
  const response = await createChatCompletion(
    [
      { role: 'system', content: 'You are a strict JSON API. Return valid JSON only, without markdown fences or explanations.' },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 1200, temperature: 0 },
  );
  const parsed = readComplianceJson(response);

  return {
    status: parsed.status === 'needs_review' ? 'needs_review' : 'passed',
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    rewriteSuggestion: parsed.rewriteSuggestion,
  };
}

function readCommentText(content: string) {
  try {
    const parsed = parseJsonObject<CommentJson>(content);
    const comment = parsed.comment?.trim();
    if (comment) return comment;
  } catch {
    // Some upstream models occasionally return plain text despite JSON instructions.
  }

  return cleanModelText(content);
}

function readComplianceJson(content: string): ComplianceJson {
  try {
    return parseJsonObject<ComplianceJson>(content);
  } catch {
    return {
      status: 'needs_review',
      reasons: ['合规模型返回格式异常，建议人工确认'],
      rewriteSuggestion: cleanModelText(content).slice(0, 220),
    };
  }
}

function hasMissingProductInfo(productInfo: ProductInfo) {
  return Boolean(
    !productInfo.productName?.trim() ||
      !hasKnownProductCategory(productInfo.category) ||
      !productInfo.productClaims.length ||
      !productInfo.skinTypes.length ||
      !productInfo.usageFeel?.trim() ||
      !productInfo.avoidTerms.length,
  );
}

function getInferenceImageUrls(assets: UploadedAsset[]) {
  return assets
    .map((asset) => asset.temporaryObjectUrl ?? asset.localPreviewKey)
    .filter((url): url is string => Boolean(url && (url.startsWith('http') || url.startsWith('data:image/'))));
}

function mergeInferredProductInfo(productInfo: ProductInfo, inferred: InferredProductInfoJson): ProductInfo {
  const hasManualInfo = Boolean(
    productInfo.productName?.trim() ||
      hasKnownProductCategory(productInfo.category) ||
      productInfo.productClaims.length ||
      productInfo.skinTypes.length ||
      productInfo.usageFeel?.trim() ||
      productInfo.avoidTerms.length,
  );
  const merged: ProductInfo = {
    productName: productInfo.productName?.trim() ? productInfo.productName : inferred.productName,
    category: hasKnownProductCategory(productInfo.category) ? productInfo.category.trim() : normalizeInferredCategory(inferred.category),
    productInfoSource: hasManualInfo ? 'mixed' : 'ai_inferred',
    productClaims: productInfo.productClaims.length ? productInfo.productClaims : normalizeStringList(inferred.productClaims),
    skinTypes: productInfo.skinTypes.length ? productInfo.skinTypes : normalizeStringList(inferred.skinTypes),
    usageFeel: productInfo.usageFeel?.trim() ? productInfo.usageFeel : inferred.usageFeel,
    avoidTerms: productInfo.avoidTerms.length ? productInfo.avoidTerms : normalizeStringList(inferred.avoidTerms),
  };

  if (!hasMissingProductInfo(merged) && !hasManualInfo) {
    merged.productInfoSource = 'ai_inferred';
  }

  return merged;
}

function hasKnownProductCategory(category: ProductInfo['category'] | undefined) {
  const cleanCategory = category?.trim();
  return Boolean(cleanCategory && cleanCategory !== 'unknown' && cleanCategory !== '未知/待识别');
}

function normalizeInferredCategory(category: unknown) {
  return typeof category === 'string' && category.trim() ? category.trim().slice(0, 40) : 'unknown';
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function cleanModelText(content: string) {
  return content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

export function buildImagePrompt(productInfo: ProductInfo, imageType: ImageType, personEthnicity: PersonEthnicity = 'yellow') {
  const typeInstruction: Record<ImageType, string> = {
    texture_on_hand:
      'Create an amateur smartphone photo of a real customer showing the product texture on a hand or wrist, with the product packaging nearby if available.',
    bathroom_vanity:
      'Create an amateur smartphone product-only photo of the product naturally placed on a real bathroom sink or vanity counter, with no visible people, no hands, no faces, no arms, no body parts, and no mirror reflection of a person.',
    handheld_product_closeup:
      'Create an amateur smartphone tight close-up of one hand naturally holding the product, front label facing the camera, with the product packaging as the main subject; not a selfie, no full person, no face.',
    selfie_holding_product:
      'Create an amateur smartphone photo of a real customer holding the product, mirror selfie or front-camera selfie style, full face allowed.',
  };

  const sceneInstruction: Record<ImageType, string> = {
    texture_on_hand: [
      'Scene: ordinary apartment close-up, near a window, casual customer review photo.',
      'Lighting: natural light coming from a window on the left side, soft directional daylight, realistic contact shadows around fingers, wrist, product texture, and packaging.',
    ].join('\n'),
    bathroom_vanity: [
      'Scene: product-only bathroom mirror or vanity photo, slightly cluttered sink area, everyday bottles or towels in the background, product standing or leaning naturally on the counter.',
      'Human exclusion: no visible people, no hands, no faces, no arms, no body parts, no silhouette, and no mirror reflection of a person.',
      'Lighting: mixed cool indoor light, small harsh highlights on mirror, faucet, counter, and packaging, realistic contact shadows under the product and nearby objects.',
    ].join('\n'),
    handheld_product_closeup: [
      'Scene: ordinary apartment close-up, one hand naturally holding the product upright, tight crop around the product and fingers, casual customer review photo.',
      'Framing: front label facing the camera, product fills most of the frame, no selfie angle, no full person, no face, no body beyond the holding hand.',
      'Lighting: natural window light or ordinary indoor light, realistic contact shadows where fingers touch the product, mild phone-camera blur near the background.',
    ].join('\n'),
    selfie_holding_product: [
      'Scene: bedroom mirror selfie or casual indoor selfie, ordinary bedroom background, phone held naturally, imperfect framing.',
      'Lighting: daytime natural window light from one side, soft realistic shadows under the chin, arms, hair, hands, and clothing folds.',
    ].join('\n'),
  };

  const ethnicityGuidance = imageType === 'bathroom_vanity' ? '' : buildEthnicityPromptGuidance(personEthnicity);

  return [
    typeInstruction[imageType],
    sceneInstruction[imageType],
    ethnicityGuidance,
    'Overall style: casual buyer-show photo, unposed natural posture, slightly imperfect composition, authentic customer review photo.',
    'Camera look: shot on a phone camera, slightly uneven phone camera exposure, mild overexposure near the main light source, subtle shadow noise in darker areas, mild image noise, subtle jpeg compression.',
    'Realism details: real skin texture, natural skin highlights, not glossy, minor facial asymmetry when a face appears, natural body proportions, real fabric wrinkles and folds, slightly messy everyday background.',
    'Lighting discipline: keep the light source explainable, such as left-side window light, warm ceiling lamp light, or mixed cool bathroom light; use one coherent everyday setup, not a studio setup.',
    'Use uploaded reference images as the source of truth for product packaging shape, label color, cap, logo placement, container size, and texture. Do not invent a different product.',
    `Product: ${productInfo.productName ?? 'skincare product'}`,
    `Category: ${productInfo.category ?? 'unknown'}`,
    `Claims to imply softly, not as text: ${productInfo.productClaims.join(', ')}`,
    `Suitable skin/user context if visible: ${productInfo.skinTypes.join(', ') || 'ordinary real customer'}`,
    `Usage feel to imply visually, not as text: ${productInfo.usageFeel ?? 'natural everyday use'}`,
    `Avoid showing or implying: ${productInfo.avoidTerms.join(', ') || 'medical or exaggerated efficacy claims'}`,
    'No visible text overlays. No exaggerated before-after claims. Keep product consistent with reference images.',
    [
      'Negative prompt:',
      'AI generated, CGI, 3D render, plastic skin, airbrushed skin, perfect face, flawless, doll-like, symmetrical face, studio lighting, cinematic lighting, fashion photoshoot, commercial advertisement, glossy highlights, over-smoothed, overly sharp, HDR look, unreal hands, distorted fingers, fake texture.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEthnicityPromptGuidance(personEthnicity: PersonEthnicity) {
  const guidance: Record<PersonEthnicity, string> = {
    yellow:
      'Visible customer appearance: East Asian customer with natural light-to-medium warm skin tone; hands, wrist, arms, and face should match this appearance when visible.',
    white:
      'Visible customer appearance: white/Caucasian customer with natural fair-to-light skin tone; hands, wrist, arms, and face should match this appearance when visible.',
    black:
      'Visible customer appearance: Black customer with natural deep brown skin tone; hands, wrist, arms, and face should match this appearance when visible.',
  };

  return guidance[personEthnicity];
}
