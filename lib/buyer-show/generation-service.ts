import { buildCompliancePrompt, buildHumanizedCommentPrompt } from './humanizer-rules';
import { generateBuyerShowImage } from './image-provider';
import { createR2ReadUrl } from './r2-storage';
import {
  generateRequestSchema,
  getLanguageLabel,
  type GeneratedComment,
  type GeneratedImage,
  type GeneratedResult,
  type GenerateRequest,
  type ImageType,
  type LanguageCode,
  type PersonProfile,
  type ProductInfo,
  type SeasonClimate,
  type SceneElement,
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
  const imageUrls = await resolveUploadedAssetImageUrls(request.assets);
  const imageGenerationLimiter = createConcurrencyLimiter(2);

  return Promise.all(
    request.generationSets.map(async (set) => {
      const imageRequestsToGenerate = expandImageRequests(set.imageTypeCounts, set.sceneElements);
      const imageGenerationPromise: Promise<GeneratedImage[]> =
        set.mode === 'image_with_comment'
          ? Promise.all(
              imageRequestsToGenerate.map(async ({ type, sceneElement }, index) => {
                const prompt = buildImagePrompt(productInfo, type, set.personProfile, sceneElement, set.seasonClimate);
                const generated = await imageGenerationLimiter(() => generateBuyerShowImage({ prompt, imageUrls, imageType: type }));
                return {
                  id: `${set.id}-image-${index + 1}`,
                  type,
                  sceneElement,
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

function createConcurrencyLimiter(limit: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  function drainQueue() {
    if (activeCount >= limit) return;
    const next = queue.shift();
    if (next) next();
  }

  return async function runLimited<T>(operation: () => Promise<T>): Promise<T> {
    if (activeCount >= limit) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    }

    activeCount += 1;
    try {
      return await operation();
    } finally {
      activeCount -= 1;
      drainQueue();
    }
  };
}

function expandImageRequests(imageTypeCounts: Record<ImageType, number>, sceneElements: SceneElement[] = ['dressing_table']) {
  const scenes = sceneElements.length ? sceneElements : (['dressing_table'] satisfies SceneElement[]);
  const imageTypes = (Object.entries(imageTypeCounts) as Array<[ImageType, number]>).flatMap(([type, count]) =>
    Array.from({ length: count }, () => type),
  );
  return imageTypes.map((type, index) => ({
    type,
    sceneElement: scenes[index % scenes.length],
  }));
}

export async function completeMissingProductInfo(productInfo: ProductInfo, assets: UploadedAsset[]) {
  if (!hasMissingProductInfo(productInfo)) return productInfo;

  const imageUrls = await resolveUploadedAssetImageUrls(assets);
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

export async function resolveUploadedAssetImageUrls(assets: UploadedAsset[]) {
  const urls = await Promise.all(
    assets.map(async (asset) => {
      if (asset.objectKey) {
        return createR2ReadUrl(asset.objectKey);
      }

      return asset.temporaryObjectUrl ?? asset.localPreviewKey;
    }),
  );

  return urls.filter((url): url is string => Boolean(url && (url.startsWith('http') || url.startsWith('data:image/'))));
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

export function buildImagePrompt(
  productInfo: ProductInfo,
  imageType: ImageType,
  personProfile: PersonProfile = 'southeast_asia_asian',
  sceneElement: SceneElement = 'dressing_table',
  seasonClimate: SeasonClimate = 'spring_autumn',
) {
  const typeInstruction: Record<ImageType, string> = {
    texture_on_hand:
      'Create an amateur smartphone photo of a real customer showing the product texture on a hand or wrist, with the product packaging nearby if available.',
    bathroom_vanity:
      'Create an amateur smartphone product-only placement photo of the product naturally placed in the selected everyday scene, with no visible people, no hands, no faces, no arms, no body parts, and no mirror reflection of a person.',
    handheld_product_closeup:
      'Create an amateur smartphone tight close-up of one hand naturally holding the product, front label facing the camera, with the product packaging as the main subject; not a selfie, no full person, no face.',
    selfie_holding_product:
      'Create an amateur smartphone photo of a real customer holding the product in a casual selfie style, full face allowed when natural for the selected scene.',
  };

  const sceneInstruction = buildImageTypeSceneGuidance(imageType, sceneElement);
  const sceneElementInstruction = buildSceneElementPromptGuidance(imageType, sceneElement);
  const effectiveSeasonClimate = resolveEffectiveSeasonClimate(sceneElement, seasonClimate);

  const personProfileGuidance = imageType === 'bathroom_vanity' ? '' : buildPersonProfilePromptGuidance(personProfile);
  const seasonClimateGuidance = buildSeasonClimatePromptGuidance(effectiveSeasonClimate, sceneElement, seasonClimate);
  const promptFusionGuidance = buildPromptFusionGuidance(imageType, personProfile, sceneElement, effectiveSeasonClimate);
  const realismDetailsGuidance = buildRealismDetailsGuidance(imageType);

  return [
    typeInstruction[imageType],
    sceneInstruction,
    sceneElementInstruction,
    seasonClimateGuidance,
    personProfileGuidance,
    promptFusionGuidance,
    'Overall style: casual buyer-show photo, unposed natural posture, slightly imperfect composition, authentic customer review photo.',
    'Camera look: shot on a phone camera, slightly uneven phone camera exposure, mild overexposure near the main light source, subtle shadow noise in darker areas, mild image noise, subtle jpeg compression.',
    realismDetailsGuidance,
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

function buildImageTypeSceneGuidance(imageType: ImageType, sceneElement: SceneElement) {
  const isOutdoorTropicalScene = isTropicalSceneElement(sceneElement);

  const guidance: Record<ImageType, string> = {
    texture_on_hand: [
      isOutdoorTropicalScene
        ? 'Scene: close-up of product texture on a hand or wrist in the selected outdoor everyday scene, casual customer review photo.'
        : 'Scene: ordinary apartment close-up, near a window, casual customer review photo.',
      'Lighting: natural everyday light from the selected scene, realistic contact shadows around fingers, wrist, product texture, and packaging.',
    ].join('\n'),
    bathroom_vanity: [
      'Scene: product-only everyday placement photo, product standing or leaning naturally on a real surface in the selected scene.',
      'Human exclusion: no visible people, no hands, no faces, no arms, no body parts, no silhouette, and no mirror reflection of a person.',
      'Lighting: practical everyday light from the selected scene, realistic contact shadows under the product and nearby objects.',
    ].join('\n'),
    handheld_product_closeup: [
      'Scene: tight close-up, one hand naturally holding the product upright, tight crop around the product and fingers, casual customer review photo.',
      'Framing: front label facing the camera, product fills most of the frame, no selfie angle, no full person, no face, no body beyond the holding hand.',
      'Lighting: natural window light, ordinary indoor light, or shaded outdoor daylight matching the selected scene; realistic contact shadows where fingers touch the product, mild phone-camera blur near the background.',
    ].join('\n'),
    selfie_holding_product: [
      isOutdoorTropicalScene
        ? 'Scene: casual outdoor front-camera selfie in the selected Southeast Asian scene, product held naturally near the face or chest, imperfect phone framing.'
        : 'Scene: casual indoor selfie or mirror selfie matching the selected indoor scene, product held naturally, imperfect phone framing.',
      'Lighting: everyday natural light from the selected scene, soft realistic shadows under the chin, arms, hair, hands, and clothing folds.',
    ].join('\n'),
  };

  return guidance[imageType];
}

function buildSceneElementPromptGuidance(imageType: ImageType, sceneElement: SceneElement) {
  const sceneElementInstruction: Record<ImageType, Record<SceneElement, string>> = {
    texture_on_hand: {
      unboxing:
        'Scene element: close-up beside an opened cardboard shipping box, torn tape, bubble wrap, packing paper, and product carton partly visible on a home table or sofa.',
      living_room:
        'Scene element: ordinary apartment living room close-up, coffee table edge, curtains or TV cabinet softly visible, cup, tissue box, or remote control in the background.',
      sofa:
        'Scene element: close-up near a real sofa, visible fabric texture, throw pillow or blanket softly visible, product texture shown on hand or wrist.',
      dressing_table:
        'Scene element: real dressing table or vanity counter close-up, mirror edge, makeup organizer, cotton pads, comb or small daily items softly visible, no luxury hotel styling.',
      southeast_asia_seaside:
        'Scene element: Southeast Asian seaside close-up, product texture on hand or wrist near a shaded beach cafe table, palm trees, sandy beach, turquoise or indigo water, rocky reef or limestone cliff softly blurred in the background.',
      southeast_asia_city:
        'Scene element: Southeast Asian tropical city close-up, colorful shophouses, covered five-foot-way walkway, awnings, street food stall, scooters or motorbikes softly visible, humid daylight.',
    },
    bathroom_vanity: {
      unboxing:
        'Scene element: product-only unboxing scene, opened cardboard shipping box, torn tape, bubble wrap, packing paper, product carton partly pulled out, slightly messy real customer photo on a home table or sofa.',
      living_room:
        'Scene element: product-only ordinary apartment living room, product on a coffee table, curtains or TV cabinet softly visible, cup, tissue box, remote control, natural window light mixed with indoor ambient light.',
      sofa:
        'Scene element: product-only real sofa scene, product resting on a sofa cushion, visible fabric texture, throw pillow or blanket nearby, soft side window light, imperfect phone framing.',
      dressing_table:
        'Scene element: product-only real dressing table or vanity counter, mirror edge, makeup organizer, cotton pads, comb or small daily items nearby, product standing naturally on the table, warm desk lamp or daylight, no luxury hotel styling.',
      southeast_asia_seaside:
        'Scene element: product-only Southeast Asian seaside customer photo, product placed on a shaded beach cafe table, palm trees, sandy beach, turquoise or indigo water, rocky reef or limestone cliff softly blurred in the background, fishing boat or long-tail boat in the distance, humid daylight.',
      southeast_asia_city:
        'Scene element: product-only Southeast Asian tropical city street, product placed on a small cafe table or stall counter, colorful shophouses, covered five-foot-way walkway, tiled facade, awnings, street food stall, plastic stools, scooters or motorbikes in the background, tropical plants, humid daylight.',
    },
    handheld_product_closeup: {
      unboxing:
        'Scene element: unboxing background, one hand holds the product above an opened cardboard shipping box with torn tape, bubble wrap, packing paper, and product carton partly visible.',
      living_room:
        'Scene element: ordinary apartment living room background, one hand holds the product close to the camera, coffee table, curtains or TV cabinet softly visible.',
      sofa:
        'Scene element: real sofa background, one hand holds the product close to the camera, visible fabric texture, throw pillow or blanket nearby, soft side window light.',
      dressing_table:
        'Scene element: real dressing table close-up, one hand holds the product in front of a vanity counter, mirror edge, makeup organizer, cotton pads, comb or small daily items softly visible behind it, no luxury hotel styling.',
      southeast_asia_seaside:
        'Scene element: Southeast Asian seaside hand-held close-up, one hand holds the product near the sea, palm trees, sandy beach, turquoise or indigo water, rocky reef or limestone cliff softly blurred in the background, shaded humid daylight.',
      southeast_asia_city:
        'Scene element: Southeast Asian tropical city hand-held close-up, one hand holds the product near colorful shophouses, covered five-foot-way walkway, tiled facade, awnings, street food stall, plastic stools, scooters or motorbikes in the background, tropical plants, humid daylight.',
    },
    selfie_holding_product: {
      unboxing:
        'Scene element: indoor unboxing selfie, opened cardboard shipping box, torn tape, bubble wrap, packing paper, and product carton visible on a home table or sofa.',
      living_room:
        'Scene element: ordinary apartment living room selfie, coffee table, curtains or TV cabinet softly visible, cup, tissue box, remote control, natural window light mixed with indoor ambient light.',
      sofa:
        'Scene element: real sofa selfie, person seated or leaning near a sofa, visible fabric texture, throw pillow or blanket nearby, soft side window light, imperfect phone framing.',
      dressing_table:
        'Scene element: dressing-table mirror selfie, real vanity counter, mirror edge, makeup organizer, cotton pads, comb or small daily items nearby, warm desk lamp or daylight, no luxury hotel styling.',
      southeast_asia_seaside:
        'Scene element: Southeast Asian seaside outdoor selfie, shaded beach cafe or walkway near the sea, palm trees, sandy beach, turquoise or indigo water, rocky reef or limestone cliff softly blurred in the background, fishing boat or long-tail boat in the distance, humid daylight.',
      southeast_asia_city:
        'Scene element: Southeast Asian tropical city outdoor selfie, colorful shophouses, covered five-foot-way walkway, tiled facade, awnings, street food stall, plastic stools, scooters or motorbikes in the background, tropical plants, humid daylight, natural street shadows.',
    },
  };

  return sceneElementInstruction[imageType][sceneElement];
}

function buildPersonProfilePromptGuidance(personProfile: PersonProfile) {
  const guidance: Record<PersonProfile, string> = {
    muslim_black:
      'Visible customer appearance: Black Muslim customer with natural deep brown skin tone, dark eyes, natural facial features, modest everyday styling, optional simple hijab for women, no ceremonial costume styling.',
    muslim_asian:
      'Visible customer appearance: Asian Muslim customer with light warm to tan skin tone, dark eyes, natural dark hair if visible, modest everyday styling, optional simple hijab or tudung for women.',
    southeast_asia_deep:
      'Visible customer appearance: Southeast Asian customer with deep tan to brown skin, dark eyes, dark hair, natural tropical everyday appearance; may suggest Melanesian, Papuan, or eastern Indonesian influenced features without defaulting to African appearance.',
    southeast_asia_asian:
      'Visible customer appearance: Southeast Asian Malay, Indonesian, Thai, Vietnamese, or Filipino customer with warm light-medium to tan skin, dark brown eyes, black or dark brown hair, soft oval or round face, and natural cheek fullness.',
    white:
      'Visible customer appearance: white/Caucasian customer with natural fair-to-light skin tone; hands, wrist, arms, and face should match this appearance when visible.',
  };

  return guidance[personProfile];
}

function buildSeasonClimatePromptGuidance(seasonClimate: SeasonClimate, sceneElement: SceneElement, requestedSeasonClimate = seasonClimate) {
  const guidance: Record<SeasonClimate, string> = {
    spring_autumn:
      'Season and climate condition: mild spring or autumn weather, comfortable transitional temperature, light layered daily clothing when people are visible, balanced daylight or soft indoor light.',
    summer:
      'Season and climate condition: hot summer weather, brighter daylight or warm indoor light, lightweight breathable casual clothing when people are visible, mild skin shine from heat only when natural for the scene.',
    winter:
      'Season and climate condition: cold winter weather, heavier everyday layers when people are visible, cooler daylight or warm indoor lamp contrast, dry indoor air feeling without a studio setup.',
    tropical_humid:
      'Season and climate condition: tropical humid weather, warm moist air, thin breathable fabrics when people are visible, lush greenery or humid city/seaside cues when the selected scene supports them, slightly dewy skin highlights without looking glossy or commercial.',
    rainy_season:
      'Season and climate condition: rainy season weather, overcast daylight, wet pavement or wet window cues when suitable, umbrella or raincoat details only if natural for the scene, soft low-contrast shadows.',
  };

  if (seasonClimate !== requestedSeasonClimate && isTropicalSceneElement(sceneElement)) {
    return [
      guidance[seasonClimate],
      'Climate consistency: because the selected scene is tropical Southeast Asia, keep clothing breathable and weather cues warm, humid, or rainy instead of borrowing temperate cold-weather styling.',
    ].join('\n');
  }

  return guidance[seasonClimate];
}

function buildPromptFusionGuidance(imageType: ImageType, personProfile: PersonProfile, sceneElement: SceneElement, seasonClimate: SeasonClimate) {
  const guidance = [
    'Prompt fusion rule: image type decides how much of the person appears; scene chooses location and props; season/climate controls clothing thickness, fabric weight, skin shine, weather cues, and light; person profile controls visible appearance and cultural styling only when people or body parts are visible.',
    imageType === 'bathroom_vanity'
      ? 'Image exposure rule: product-only placement images use scene, season, weather, light, and surface details only; do not apply person clothing or facial guidance.'
      : 'Image exposure rule: visible-person images apply profile guidance to hands, face, sleeves, and styling consistently with the selected season and scene.',
  ];

  const isMuslimProfile = personProfile === 'muslim_black' || personProfile === 'muslim_asian';
  const isTropicalScene = isTropicalSceneElement(sceneElement);

  if (imageType !== 'bathroom_vanity' && isMuslimProfile && (seasonClimate === 'summer' || seasonClimate === 'tropical_humid')) {
    guidance.push(
      'For Muslim profiles in summer or tropical humidity, use modest lightweight breathable long-sleeve clothing, loose cotton or linen layers, and a thin everyday hijab or tudung when a woman is visible.',
    );
  }

  if (imageType !== 'bathroom_vanity' && seasonClimate === 'winter') {
    guidance.push(
      'For winter, use heavier everyday layers such as knitwear, jacket, scarf, or thicker hijab/tudung where culturally appropriate; keep it casual, not fashion editorial.',
    );
  }

  if (seasonClimate === 'rainy_season') {
    guidance.push(
      'For rainy season, add overcast low-contrast light, wet pavement or wet window cues, naturally damp air, and avoid forced umbrella props indoors.',
    );
  }

  if (seasonClimate === 'tropical_humid' || isTropicalScene) {
    guidance.push(
      imageType === 'bathroom_vanity'
        ? 'Tropical-scene consistency: use humid daylight, warm surface reflections, tropical plants or wet-air cues, and no person styling for product-only tropical or seaside Southeast Asian scenes.'
        : 'Tropical-scene consistency: use breathable everyday fabrics, shaded humid daylight, and casual warm-climate styling for tropical humid or seaside Southeast Asian scenes.',
    );
  }

  return guidance.join('\n');
}

function buildRealismDetailsGuidance(imageType: ImageType) {
  if (imageType === 'bathroom_vanity') {
    return 'Realism details: real packaging material, natural surface contact, small dust or water marks when suitable, realistic object scale, slightly messy everyday background, no showroom perfection.';
  }

  if (imageType === 'handheld_product_closeup' || imageType === 'texture_on_hand') {
    return 'Realism details: real skin texture on visible hands or wrist, natural skin highlights, not glossy, natural finger proportions, real product scale, slightly messy everyday background.';
  }

  return 'Realism details: real skin texture, natural skin highlights, not glossy, minor facial asymmetry when a face appears, natural body proportions, real fabric wrinkles and folds, slightly messy everyday background.';
}

function resolveEffectiveSeasonClimate(sceneElement: SceneElement, seasonClimate: SeasonClimate): SeasonClimate {
  if (isTropicalSceneElement(sceneElement) && (seasonClimate === 'winter' || seasonClimate === 'spring_autumn')) {
    return 'tropical_humid';
  }

  return seasonClimate;
}

function isTropicalSceneElement(sceneElement: SceneElement) {
  return sceneElement === 'southeast_asia_seaside' || sceneElement === 'southeast_asia_city';
}
