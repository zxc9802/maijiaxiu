import { z } from 'zod';

export const supportedLanguages = [
  { code: 'zh-CN', label: '中文', generationName: 'Simplified Chinese' },
  { code: 'en-US', label: 'English', generationName: 'English' },
  { code: 'th-TH', label: 'ไทย', generationName: 'Thai' },
  { code: 'ms-MY', label: 'Bahasa Melayu', generationName: 'Malay' },
] as const;

export const productInfoSourceSchema = z.enum(['manual', 'ai_inferred', 'mixed']);
export const productCategorySchema = z
  .string()
  .trim()
  .max(40)
  .transform((category) => category || 'unknown')
  .default('unknown');
export const uploadedAssetTypeSchema = z.enum(['product', 'package', 'texture']);
export const generationModeSchema = z.enum(['comment_only', 'image_with_comment']);
export const imageTypeSchema = z.enum(['texture_on_hand', 'bathroom_vanity', 'handheld_product_closeup', 'selfie_holding_product']);
export const personProfileSchema = z.enum(['muslim_black', 'muslim_asian', 'southeast_asia_deep', 'southeast_asia_asian', 'white']);
export const legacyPersonEthnicitySchema = z.enum(['yellow', 'white', 'black']);
export const legacyPersonEthnicityToProfile: Record<z.infer<typeof legacyPersonEthnicitySchema>, z.infer<typeof personProfileSchema>> = {
  yellow: 'southeast_asia_asian',
  white: 'white',
  black: 'muslim_black',
};
export const seasonClimateSchema = z.enum(['spring_autumn', 'summer', 'winter', 'tropical_humid', 'rainy_season']);
export const sceneElementSchema = z.enum([
  'unboxing',
  'living_room',
  'sofa',
  'dressing_table',
  'southeast_asia_seaside',
  'southeast_asia_city',
]);
export const languageCodeSchema = z.enum(['zh-CN', 'en-US', 'th-TH', 'ms-MY']);
export const complianceStatusSchema = z.enum(['checking', 'passed', 'needs_review']);

export type ProductInfoSource = z.infer<typeof productInfoSourceSchema>;
export type ProductCategory = z.infer<typeof productCategorySchema>;
export type UploadedAssetType = z.infer<typeof uploadedAssetTypeSchema>;
export type GenerationMode = z.infer<typeof generationModeSchema>;
export type ImageType = z.infer<typeof imageTypeSchema>;
export type PersonProfile = z.infer<typeof personProfileSchema>;
export type SeasonClimate = z.infer<typeof seasonClimateSchema>;
export type SceneElement = z.infer<typeof sceneElementSchema>;
export type LanguageCode = z.infer<typeof languageCodeSchema>;
export type ComplianceStatus = z.infer<typeof complianceStatusSchema>;

export const productInfoSchema = z.object({
  productName: z.string().optional(),
  category: productCategorySchema.default('unknown'),
  productInfoSource: productInfoSourceSchema.default('mixed'),
  productClaims: z.array(z.string()).default([]),
  skinTypes: z.array(z.string()).default([]),
  usageFeel: z.string().optional(),
  avoidTerms: z.array(z.string()).default([]),
});

export type ProductInfo = z.infer<typeof productInfoSchema>;

export const uploadedAssetSchema = z.object({
  id: z.string(),
  type: uploadedAssetTypeSchema,
  objectKey: z.string().min(1).max(512).optional(),
  localPreviewKey: z.string().optional(),
  temporaryObjectUrl: z.string().url().optional(),
  deletedAfterProcessing: z.boolean().default(false),
});

export type UploadedAsset = z.infer<typeof uploadedAssetSchema>;

export const imageTypeCountsSchema = z.object({
  texture_on_hand: z.number().int().min(0).max(6),
  bathroom_vanity: z.number().int().min(0).max(6),
  handheld_product_closeup: z.number().int().min(0).max(6),
  selfie_holding_product: z.number().int().min(0).max(6),
});

export type ImageTypeCounts = z.infer<typeof imageTypeCountsSchema>;

export const generationSetSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const legacyEthnicity = legacyPersonEthnicitySchema.safeParse(record.personEthnicity);
  if (record.personProfile || !legacyEthnicity.success) return value;
  return {
    ...record,
    personProfile: legacyPersonEthnicityToProfile[legacyEthnicity.data],
  };
}, z.object({
  id: z.string(),
  name: z.string(),
  mode: generationModeSchema,
  personProfile: personProfileSchema.default('southeast_asia_asian'),
  seasonClimate: seasonClimateSchema.default('spring_autumn'),
  sceneElements: z.array(sceneElementSchema).default(['dressing_table']),
  imageTypeCounts: imageTypeCountsSchema,
  languages: z.array(languageCodeSchema).min(1),
  commentCount: z.number().int().min(1).max(4),
}));

export type GenerationSet = z.infer<typeof generationSetSchema>;

export const generatedImageSchema = z.object({
  id: z.string(),
  type: imageTypeSchema,
  sceneElement: sceneElementSchema.optional(),
  localImageKey: z.string().optional(),
  url: z.string().url().optional(),
  promptSnapshot: z.string(),
});

export type GeneratedImage = z.infer<typeof generatedImageSchema>;

export const generatedCommentSchema = z.object({
  id: z.string(),
  language: languageCodeSchema,
  text: z.string(),
  tone: z.literal('real_user').default('real_user'),
  complianceStatus: complianceStatusSchema,
  complianceReasons: z.array(z.string()).default([]),
  rewriteSuggestion: z.string().optional(),
  promptSnapshot: z.string(),
});

export type GeneratedComment = z.infer<typeof generatedCommentSchema>;

export const generatedResultSchema = z.object({
  id: z.string(),
  setId: z.string(),
  setName: z.string(),
  mode: generationModeSchema,
  images: z.array(generatedImageSchema),
  comments: z.array(generatedCommentSchema),
  createdAt: z.string(),
});

export type GeneratedResult = z.infer<typeof generatedResultSchema>;

export const generateRequestSchema = z.object({
  productInfo: productInfoSchema,
  assets: z.array(uploadedAssetSchema).default([]),
  generationSets: z.array(generationSetSchema).min(1),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const defaultProductInfo: ProductInfo = {
  productName: '焕颜修护晚霜',
  category: '护肤 > 保湿 > 面霜',
  productInfoSource: 'mixed',
  productClaims: ['补水保湿', '吸收后不油亮'],
  skinTypes: ['干性', '混合性'],
  usageFeel: '水润一点的乳霜感，推开不会一坨一坨的，吸收后有柔光感',
  avoidTerms: ['医疗级治愈', '永久修复', '100% 有效', '年轻十岁'],
};

export const defaultGenerationSets = [
  {
    id: 'set-a',
    name: '套件1',
    mode: 'image_with_comment',
    personProfile: 'southeast_asia_asian',
    seasonClimate: 'spring_autumn',
    sceneElements: ['dressing_table'],
    imageTypeCounts: {
      texture_on_hand: 1,
      bathroom_vanity: 1,
      handheld_product_closeup: 0,
      selfie_holding_product: 1,
    },
    languages: ['zh-CN', 'en-US'],
    commentCount: 2,
  },
] satisfies GenerationSet[];

export function getLanguageLabel(code: LanguageCode) {
  return supportedLanguages.find((language) => language.code === code)?.label ?? code;
}
