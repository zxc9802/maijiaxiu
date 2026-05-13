'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  defaultGenerationSets,
  getLanguageLabel,
  generatedResultSchema,
  supportedLanguages,
  type GeneratedResult,
  type GeneratedComment,
  type GeneratedImage,
  type GenerationSet,
  type ImageType,
  type ImageTypeCounts,
  type LanguageCode,
  type PersonGender,
  type PersonProfile,
  type ProductCategory,
  type ProductInfo,
  type SeasonClimate,
  type SceneElement,
  type UploadedAsset,
  type UploadedAssetType,
} from '@/lib/buyer-show/schemas';
import styles from './buyerShowAgent.module.css';

const defaultFixedTags = {
  claims: ['补水保湿', '吸收后不油亮', '熬夜后也不拔干', '后续叠防晒不搓泥'],
  skinTypes: ['干性', '混合性', '换季干敏', '屏障偏弱'],
  usageFeels: ['水润乳霜感', '推开不结块', '吸收后有柔光感', '不厚重'],
};

const languageLabelSmoke = ['中文', 'English', 'ไทย', 'Bahasa Melayu'];
const categorySuggestions = ['护肤 > 保湿 > 面霜', '护肤 > 精华', '美妆 > 底妆', '个护 > 洗护', '母婴 > 湿巾'];
const pendingCategoryLabels = new Set(['unknown', '未知/待识别']);
const defaultPersonProfile: PersonProfile = 'southeast_asia_asian';
const defaultPersonGender: PersonGender = 'female';
const defaultSeasonClimate: SeasonClimate = 'spring_autumn';
const defaultSceneElements: SceneElement[] = ['dressing_table'];
const personProfileLabels: Record<PersonProfile, string> = {
  muslim_black: '穆斯林黑人',
  muslim_asian: '穆斯林亚洲人',
  asian: '亚洲人',
  southeast_asia_deep: '东南亚深肤',
  southeast_asia_asian: '东南亚亚洲人',
  white: '白人',
};
const personGenderLabels: Record<PersonGender, string> = {
  female: '女性',
  male: '男性',
};
const seasonClimateLabels: Record<SeasonClimate, string> = {
  spring_autumn: '春秋',
  summer: '夏季',
  winter: '冬季',
  tropical_humid: '热带湿热',
  rainy_season: '雨季',
};
const sceneElementLabels: Record<SceneElement, string> = {
  unboxing: '拆箱',
  living_room: '客厅',
  sofa: '沙发',
  dressing_table: '梳妆台',
  southeast_asia_seaside: '东南亚户外-海边',
  southeast_asia_city: '东南亚户外-城市',
};

type TagGroup = keyof typeof defaultFixedTags;
type ClientUploadedAsset = UploadedAsset & {
  name: string;
  previewUrl: string;
  uploadStatus?: 'uploading' | 'uploaded' | 'failed';
  uploadError?: string;
};

type AssetUploadCompletion = {
  objectKey?: string;
  error?: string;
};

type SignedAssetUpload = {
  ok: true;
  key: string;
  uploadUrl: string;
  contentType: string;
  expiresIn: number;
};

type AssetUploadError = {
  ok: false;
  error: string;
};

type SavedBuyerShowState = {
  version: 1;
  savedAt: string;
  productName: string;
  category: ProductCategory;
  usageFeel: string;
  avoidTermsInput: string;
  claims: string[];
  skinTypes: string[];
  fixedClaims: string[];
  fixedSkinTypes: string[];
  fixedUsageFeels: string[];
  claimInput: string;
  skinInput: string;
  usageFeelInput: string;
  saveClaimAsFixed: boolean;
  saveSkinAsFixed: boolean;
  saveUsageFeelAsFixed: boolean;
  assets: ClientUploadedAsset[];
  sets: GenerationSet[];
  results: GeneratedResult[];
  generationError?: string;
};

type BuyerShowHistoryItem = {
  id: string;
  title: string;
  productName?: string | null;
  category?: string | null;
  productInfo: ProductInfo;
  generationSets: GenerationSet[];
  results: GeneratedResult[];
  status: GeneratedComment['complianceStatus'];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type BuyerShowGenerationJob = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  productInfo?: ProductInfo;
  results?: GeneratedResult[];
  historyId?: string;
  historyError?: string;
  error?: string;
};

const storageKeys: Record<TagGroup, string> = {
  claims: 'buyerShow.fixedTags.claims',
  skinTypes: 'buyerShow.fixedTags.skinTypes',
  usageFeels: 'buyerShow.fixedTags.usageFeels',
};

const stateStorageKey = 'buyerShow.savedState.v1';
const assetUploadMaxDimension = 1280;
const assetUploadQuality = 0.82;

const uploadSections: Array<{ type: UploadedAssetType; title: string; description: string }> = [
  { type: 'product', title: '产品图', description: '瓶身、罐体、膏体外观，可单张或多张上传' },
  { type: 'package', title: '包装图', description: '正面、背面、侧面，辅助识别包装特征' },
  { type: 'texture', title: '质地图', description: '上手、涂抹、膏体细节，影响评论质感' },
];

function readStoredTags(group: TagGroup) {
  if (typeof window === 'undefined') return defaultFixedTags[group];

  const raw = window.localStorage.getItem(storageKeys[group]);
  if (!raw) return defaultFixedTags[group];

  try {
    const parsed = JSON.parse(raw);
    const stored = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    return Array.from(new Set([...defaultFixedTags[group], ...stored]));
  } catch {
    return defaultFixedTags[group];
  }
}

function createMockResults(sets: GenerationSet[]): GeneratedResult[] {
  return sets.map((set) => ({
    id: `result-${set.id}`,
    setId: set.id,
    setName: set.name,
    mode: set.mode,
    images:
      set.mode === 'image_with_comment'
        ? expandSetImageRequests(set).map(({ type, sceneElement }, index) => ({
            id: `${set.id}-image-${index}`,
            type,
            sceneElement,
            promptSnapshot: `Mock ${type} prompt with ${sceneElement} scene`,
          }))
        : [],
    comments: set.languages.map((language, index) => ({
      id: `${set.id}-${language}`,
      language,
      text: sampleComment(language, index),
      tone: 'real_user',
      complianceStatus: index === 1 && language === 'ms-MY' ? 'needs_review' : 'passed',
      complianceReasons:
        index === 1 && language === 'ms-MY'
          ? ['存在夸张功效表达，需要人工确认']
          : ['按语言分别自检，未发现明显高风险表达'],
      rewriteSuggestion:
        index === 1 && language === 'ms-MY'
          ? 'Teksturnya senang diratakan dan lebih适合 malam. Esok pagi kulit rasa sedikit lebih lembut.'
          : undefined,
      promptSnapshot: `humanizer real_user ${language}`,
    })),
    createdAt: new Date().toISOString(),
  }));
}

function sampleComment(language: LanguageCode, index: number) {
  const comments: Record<LanguageCode, string> = {
    'zh-CN':
      index === 0
        ? '包装挺清爽的，拿在手里不廉价。质地是水润一点的乳霜感，推开不会一坨一坨的，吸收完脸上有点柔光。'
        : '这支面霜我更喜欢晚上用，抹开之后不是那种厚重封住脸的感觉，第二天早上起来脸摸着软一点。',
    'en-US':
      'The jar feels clean and not cheap in hand. The cream has a light watery texture, spreads without clumping, and leaves a soft glow.',
    'th-TH': 'เนื้อครีมเกลี่ยง่ายกว่าที่คิด ไม่ได้หนักหน้ามาก หลังทาแล้วผิวดูนุ่มขึ้นนิดหน่อย เหมาะกับตอนกลางคืน',
    'ms-MY': 'Krim ini senang diratakan dan rasa tidak terlalu berat. Pagi esok kulit terasa sedikit lebih lembut, tapi kesannya tidak berlebihan.',
  };

  return comments[language];
}

function splitCommaList(value: string) {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toAssetPayload(asset: ClientUploadedAsset): UploadedAsset {
  return {
    id: asset.id,
    type: asset.type,
    objectKey: asset.objectKey,
    localPreviewKey: asset.objectKey ? undefined : asset.localPreviewKey,
    temporaryObjectUrl: asset.temporaryObjectUrl,
    deletedAfterProcessing: asset.deletedAfterProcessing,
  };
}

function createOptimisticAsset(type: UploadedAssetType, file: File, index: number): ClientUploadedAsset {
  validateUploadFile(file);
  return {
    id: `${type}-${Date.now()}-${index}`,
    type,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    deletedAfterProcessing: false,
    uploadStatus: 'uploading',
  };
}

function getReferenceImageUrls(assets: ClientUploadedAsset[]) {
  return assets
    .map((asset) => asset.temporaryObjectUrl)
    .filter((url): url is string => Boolean(url && url.startsWith('http')));
}

function cloneGenerationSets(sets: GenerationSet[] = defaultGenerationSets): GenerationSet[] {
  return sets.map((set) => ({
    ...set,
    personProfile: set.personProfile ?? defaultPersonProfile,
    personGender: set.personGender ?? defaultPersonGender,
    seasonClimate: set.seasonClimate ?? defaultSeasonClimate,
    sceneElements: set.sceneElements?.length ? [...set.sceneElements] : [...defaultSceneElements],
    imageTypeCounts: cloneImageTypeCounts(set.imageTypeCounts),
    languages: [...set.languages],
  }));
}

function createClearedGenerationSets(): GenerationSet[] {
  return defaultGenerationSets.map((set, index) => ({
    ...set,
    name: getSuiteDisplayName(index),
    mode: 'comment_only',
    personProfile: defaultPersonProfile,
    personGender: defaultPersonGender,
    seasonClimate: defaultSeasonClimate,
    sceneElements: [...defaultSceneElements],
    imageTypeCounts: createEmptyImageTypeCounts(),
    languages: [],
    commentCount: 0,
  }));
}

function createEmptyImageTypeCounts(): ImageTypeCounts {
  return {
    texture_on_hand: 0,
    bathroom_vanity: 0,
    handheld_product_closeup: 0,
    selfie_holding_product: 0,
  };
}

function cloneImageTypeCounts(counts: ImageTypeCounts): ImageTypeCounts {
  return { ...createEmptyImageTypeCounts(), ...counts };
}

function getSetImageTotal(set: Pick<GenerationSet, 'imageTypeCounts'>) {
  return Object.values(set.imageTypeCounts).reduce((total, count) => total + count, 0);
}

function getResultComplianceStatus(comments: GeneratedComment[]): GeneratedComment['complianceStatus'] {
  if (comments.some((comment) => comment.complianceStatus === 'checking')) return 'checking';
  if (comments.some((comment) => comment.complianceStatus === 'needs_review')) return 'needs_review';
  return 'passed';
}

function getResultComplianceLabel(status: GeneratedComment['complianceStatus']) {
  if (status === 'checking') return '审核中';
  return status === 'needs_review' ? '需人工判断' : '合规通过';
}

function getCommentComplianceLabel(status: GeneratedComment['complianceStatus']) {
  if (status === 'checking') return '审核中';
  return status === 'needs_review' ? '需人工判断' : '通过';
}

function markCommentAsChecking(comment: GeneratedComment): GeneratedComment {
  return {
    ...comment,
    complianceStatus: 'checking',
    complianceReasons: ['审核中，评论已先显示，稍后自动更新。'],
    rewriteSuggestion: undefined,
  };
}

function expandSetImageRequests(set: Pick<GenerationSet, 'imageTypeCounts' | 'sceneElements'>) {
  const sceneElements = set.sceneElements.length ? set.sceneElements : defaultSceneElements;
  const imageTypes = (Object.entries(set.imageTypeCounts) as Array<[ImageType, number]>).flatMap(([type, count]) =>
    Array.from({ length: count }, () => type),
  );
  return imageTypes.map((type, index) => ({
    type,
    sceneElement: sceneElements[index % sceneElements.length],
  }));
}

function revokeAssetPreviewUrl(asset: ClientUploadedAsset) {
  if (asset.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(asset.previewUrl);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readCategory(value: unknown): ProductCategory {
  const category = readString(value).trim();
  if (category === 'skincare') return '护肤 > 保湿 > 面霜';
  if (category === 'beauty') return '美妆 > 底妆';
  if (pendingCategoryLabels.has(category)) return '';
  return category.slice(0, 40);
}

function readAssetType(value: unknown): UploadedAssetType | undefined {
  return value === 'product' || value === 'package' || value === 'texture' ? value : undefined;
}

function readGenerationMode(value: unknown): GenerationSet['mode'] {
  return value === 'image_with_comment' || value === 'comment_only' ? value : 'comment_only';
}

function readImageTypes(value: unknown): ImageType[] {
  const supported = new Set<ImageType>(['texture_on_hand', 'bathroom_vanity', 'handheld_product_closeup', 'selfie_holding_product']);
  return Array.isArray(value) ? value.filter((item): item is ImageType => supported.has(item as ImageType)) : [];
}

function readPersonProfile(value: unknown): PersonProfile {
  if (
    value === 'muslim_black' ||
    value === 'muslim_asian' ||
    value === 'asian' ||
    value === 'southeast_asia_deep' ||
    value === 'southeast_asia_asian' ||
    value === 'white'
  ) {
    return value;
  }

  if (value === 'yellow') return 'southeast_asia_asian';
  if (value === 'black') return 'muslim_black';
  if (value === 'white') return 'white';

  return defaultPersonProfile;
}

function readPersonGender(value: unknown): PersonGender {
  return value === 'male' || value === 'female' ? value : defaultPersonGender;
}

function readSeasonClimate(value: unknown): SeasonClimate {
  return value === 'spring_autumn' ||
    value === 'summer' ||
    value === 'winter' ||
    value === 'tropical_humid' ||
    value === 'rainy_season'
    ? value
    : defaultSeasonClimate;
}

function readSceneElements(value: unknown): SceneElement[] {
  const supported = new Set<SceneElement>(Object.keys(sceneElementLabels) as SceneElement[]);
  const sceneElements = Array.isArray(value) ? value.filter((item): item is SceneElement => supported.has(item as SceneElement)) : [];
  return sceneElements.length ? sceneElements : [...defaultSceneElements];
}

function readImageTypeCounts(value: unknown, legacyImageTypes: ImageType[], legacyImageCount: number): ImageTypeCounts {
  const counts = createEmptyImageTypeCounts();
  const supportedTypes = Object.keys(counts) as ImageType[];

  if (isRecord(value)) {
    for (const type of supportedTypes) {
      counts[type] = readInteger(value[type], 0, 0, 6);
    }
    return counts;
  }

  if (!legacyImageTypes.length || legacyImageCount <= 0) return counts;

  for (let index = 0; index < legacyImageCount; index += 1) {
    const type = legacyImageTypes[index % legacyImageTypes.length] ?? 'bathroom_vanity';
    counts[type] = Math.min(6, counts[type] + 1);
  }

  return counts;
}

function readLanguages(value: unknown): LanguageCode[] {
  const supported = new Set<LanguageCode>(supportedLanguages.map((language) => language.code));
  return Array.isArray(value) ? value.filter((item): item is LanguageCode => supported.has(item as LanguageCode)) : [];
}

function readInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseSavedAsset(value: unknown): ClientUploadedAsset | undefined {
  if (!isRecord(value)) return undefined;
  const type = readAssetType(value.type);
  const id = readString(value.id);
  if (!type || !id) return undefined;

  const localPreviewKey = readOptionalString(value.localPreviewKey);
  const previewUrl = readString(value.previewUrl) || localPreviewKey || '';

  return {
    id,
    type,
    name: readString(value.name) || '已保存图片',
    previewUrl,
    objectKey: readOptionalString(value.objectKey),
    localPreviewKey,
    temporaryObjectUrl: readOptionalString(value.temporaryObjectUrl),
    deletedAfterProcessing: typeof value.deletedAfterProcessing === 'boolean' ? value.deletedAfterProcessing : false,
  };
}

function parseSavedGenerationSet(value: unknown, index: number): GenerationSet | undefined {
  if (!isRecord(value)) return undefined;
  const id = readString(value.id);
  if (!id) return undefined;

  const languages = readLanguages(value.languages);
  const legacyImageTypes = readImageTypes(value.imageTypes);
  const legacyImageCount = readInteger(value.imageCount, 0, 0, 18);
  const imageTypeCounts = readImageTypeCounts(value.imageTypeCounts, legacyImageTypes, legacyImageCount);
  const imageTotal = Object.values(imageTypeCounts).reduce((total, count) => total + count, 0);

  return {
    id,
    name: readString(value.name) || getSuiteDisplayName(index),
    mode: imageTotal > 0 ? 'image_with_comment' : readGenerationMode(value.mode),
    personProfile: readPersonProfile(value.personProfile ?? value.personEthnicity),
    personGender: readPersonGender(value.personGender),
    seasonClimate: readSeasonClimate(value.seasonClimate),
    sceneElements: readSceneElements(value.sceneElements),
    imageTypeCounts,
    languages,
    commentCount: readInteger(value.commentCount, languages.length, 0, 4),
  };
}

function parseSavedState(raw: string): SavedBuyerShowState {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new Error('Unsupported saved state');
  }

  const sets = Array.isArray(parsed.sets)
    ? parsed.sets.map(parseSavedGenerationSet).filter((set): set is GenerationSet => Boolean(set))
    : [];

  const results = Array.isArray(parsed.results)
    ? parsed.results
        .map((item) => generatedResultSchema.safeParse(item))
        .filter((result): result is { success: true; data: GeneratedResult } => result.success)
        .map((result) => result.data)
    : [];

  return {
    version: 1,
    savedAt: readString(parsed.savedAt) || new Date().toISOString(),
    productName: readString(parsed.productName),
    category: readCategory(parsed.category),
    usageFeel: readString(parsed.usageFeel),
    avoidTermsInput: readString(parsed.avoidTermsInput),
    claims: readStringArray(parsed.claims),
    skinTypes: readStringArray(parsed.skinTypes),
    fixedClaims: readStringArray(parsed.fixedClaims),
    fixedSkinTypes: readStringArray(parsed.fixedSkinTypes),
    fixedUsageFeels: readStringArray(parsed.fixedUsageFeels),
    claimInput: readString(parsed.claimInput),
    skinInput: readString(parsed.skinInput),
    usageFeelInput: readString(parsed.usageFeelInput),
    saveClaimAsFixed: readBoolean(parsed.saveClaimAsFixed, true),
    saveSkinAsFixed: readBoolean(parsed.saveSkinAsFixed, true),
    saveUsageFeelAsFixed: readBoolean(parsed.saveUsageFeelAsFixed, true),
    assets: Array.isArray(parsed.assets) ? parsed.assets.map(parseSavedAsset).filter((asset): asset is ClientUploadedAsset => Boolean(asset)) : [],
    sets: sets.length ? cloneGenerationSets(sets) : cloneGenerationSets(),
    results,
    generationError: readOptionalString(parsed.generationError),
  };
}

function formatSnapshotTime(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return '保存的状态';

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getImageSource(image: GeneratedImage) {
  if (image.url) return image.url;
  if (image.localImageKey?.startsWith('data:') || image.localImageKey?.startsWith('blob:')) return image.localImageKey;
  return undefined;
}

function imageDownloadName(image: GeneratedImage) {
  return `${image.type}-${image.id}.png`;
}

function createImageDownloadUrl(href: string, filename: string) {
  if (!href.startsWith('http://') && !href.startsWith('https://')) return href;

  const searchParams = new URLSearchParams({
    filename,
    url: href,
  });

  return `/api/buyer-show/images/download?${searchParams.toString()}`;
}

function triggerImageDownload(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

function getSuiteDisplayName(index: number) {
  return `套件${index + 1}`;
}

function hasManualProductInfo(
  productName: string,
  category: ProductCategory,
  claims: string[],
  skinTypes: string[],
  usageFeel: string,
  avoidTermsInput: string,
) {
  return Boolean(
    productName.trim() ||
      normalizeCategoryForProductInfo(category) !== 'unknown' ||
      claims.length ||
      skinTypes.length ||
      usageFeel.trim() ||
      splitCommaList(avoidTermsInput).length,
  );
}

function normalizeCategoryForProductInfo(category: ProductCategory): ProductCategory {
  const cleanCategory = category.trim();
  return cleanCategory && !pendingCategoryLabels.has(cleanCategory) ? cleanCategory : 'unknown';
}

function displayCategoryFromProductInfo(category: ProductCategory): ProductCategory {
  const cleanCategory = normalizeCategoryForProductInfo(category);
  return cleanCategory === 'unknown' ? '' : cleanCategory;
}

async function prepareImageForUpload(file: File) {
  const contentType = validateUploadFile(file);

  const fallback = {
    blob: file,
    fileName: file.name,
    contentType,
  };

  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return fallback;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, assetUploadMaxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return fallback;

    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', assetUploadQuality));
    if (!blob) return fallback;

    return {
      blob,
      fileName: replaceFileExtension(file.name, 'webp'),
      contentType: 'image/webp',
    };
  } finally {
    bitmap.close();
  }
}

function validateUploadFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('只能上传图片文件');
  }
  const contentType = normalizeUploadContentType(file.type);
  if (!contentType) {
    throw new Error('只支持 JPG、PNG 或 WebP 图片');
  }
  return contentType;
}

function normalizeUploadContentType(contentType: string) {
  const normalized = contentType.trim().toLowerCase();
  return normalized === 'image/png' || normalized === 'image/webp' || normalized === 'image/jpeg' ? normalized : undefined;
}

function replaceFileExtension(fileName: string, extension: string) {
  const cleanName = fileName.trim() || 'upload';
  return `${cleanName.replace(/\.[^.]+$/, '')}.${extension}`;
}

function waitForNextPoll(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getGenerationJobMessage(job: BuyerShowGenerationJob) {
  if (job.status === 'queued') return '生成任务已提交，正在排队...';
  if (job.status === 'processing') return `后台生成中 ${Math.max(5, Math.min(99, job.progress))}%`;
  if (job.status === 'completed') return '生成完成，正在整理结果...';
  return '生成失败';
}

async function uploadAssetToR2(type: UploadedAssetType, file: File) {
  const prepared = await prepareImageForUpload(file);
  const response = await postJson<SignedAssetUpload | AssetUploadError>('/api/buyer-show/assets/sign-upload', {
    assetType: type,
    fileName: prepared.fileName,
    contentType: prepared.contentType,
    byteSize: prepared.blob.size,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  const uploadResponse = await fetch(response.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': response.contentType },
    body: prepared.blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`R2 上传失败（HTTP ${uploadResponse.status}）`);
  }

  return {
    key: response.key,
    blob: prepared.blob,
  };
}

export default function BuyerShowAgentClient() {
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('');
  const [usageFeel, setUsageFeel] = useState('');
  const [avoidTermsInput, setAvoidTermsInput] = useState('');
  const [claims, setClaims] = useState<string[]>([]);
  const [skinTypes, setSkinTypes] = useState<string[]>([]);
  const [fixedClaims, setFixedClaims] = useState(defaultFixedTags.claims);
  const [fixedSkinTypes, setFixedSkinTypes] = useState(defaultFixedTags.skinTypes);
  const [fixedUsageFeels, setFixedUsageFeels] = useState(defaultFixedTags.usageFeels);
  const [claimInput, setClaimInput] = useState('');
  const [skinInput, setSkinInput] = useState('');
  const [usageFeelInput, setUsageFeelInput] = useState('');
  const [saveClaimAsFixed, setSaveClaimAsFixed] = useState(true);
  const [saveSkinAsFixed, setSaveSkinAsFixed] = useState(true);
  const [saveUsageFeelAsFixed, setSaveUsageFeelAsFixed] = useState(true);
  const [assets, setAssets] = useState<ClientUploadedAsset[]>([]);
  const [sets, setSets] = useState<GenerationSet[]>(() => cloneGenerationSets());
  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [historyId, setHistoryId] = useState<string | undefined>();
  const [historyItems, setHistoryItems] = useState<BuyerShowHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | undefined>();
  const [generationStatus, setGenerationStatus] = useState<string | undefined>();
  const [previewImage, setPreviewImage] = useState<GeneratedImage | undefined>();
  const [snapshotStatus, setSnapshotStatus] = useState<string | undefined>();
  const generationRequestIdRef = useRef(0);
  const pendingAssetUploadsRef = useRef(new Map<string, Promise<AssetUploadCompletion>>());

  useEffect(() => {
    setFixedClaims(readStoredTags('claims'));
    setFixedSkinTypes(readStoredTags('skinTypes'));
    setFixedUsageFeels(readStoredTags('usageFeels'));
    void loadHistoryItems();
  }, []);

  const currentProductInfo = useMemo<ProductInfo>(
    () => ({
      productName: productName.trim() || undefined,
      category: normalizeCategoryForProductInfo(category),
      productInfoSource: hasManualProductInfo(productName, category, claims, skinTypes, usageFeel, avoidTermsInput) ? 'manual' : 'ai_inferred',
      productClaims: claims,
      skinTypes,
      usageFeel: usageFeel.trim() || undefined,
      avoidTerms: splitCommaList(avoidTermsInput),
    }),
    [avoidTermsInput, category, claims, productName, skinTypes, usageFeel],
  );

  const totalCommentCount = useMemo(() => sets.reduce((sum, set) => sum + set.languages.length, 0), [sets]);

  function buildSnapshotState(): SavedBuyerShowState {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      productName,
      category,
      usageFeel,
      avoidTermsInput,
      claims,
      skinTypes,
      fixedClaims,
      fixedSkinTypes,
      fixedUsageFeels,
      claimInput,
      skinInput,
      usageFeelInput,
      saveClaimAsFixed,
      saveSkinAsFixed,
      saveUsageFeelAsFixed,
      assets: assets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        name: asset.name,
        objectKey: asset.objectKey,
        localPreviewKey: asset.localPreviewKey,
        temporaryObjectUrl: asset.temporaryObjectUrl,
        deletedAfterProcessing: asset.deletedAfterProcessing,
        previewUrl: asset.localPreviewKey || '',
      })),
      sets: cloneGenerationSets(sets),
      results,
      generationError,
    };
  }

  function saveSnapshotState() {
    try {
      window.localStorage.setItem(stateStorageKey, JSON.stringify(buildSnapshotState()));
      setSnapshotStatus(`状态已保存 ${formatSnapshotTime(new Date().toISOString())}`);
    } catch {
      setSnapshotStatus('状态保存失败');
      setGenerationError('保存状态失败：浏览器本地存储空间不足或不可用。');
    }
  }

  function loadSnapshotState() {
    const raw = window.localStorage.getItem(stateStorageKey);
    if (!raw) {
      setSnapshotStatus('还没有可载入状态');
      return;
    }

    try {
      const snapshot = parseSavedState(raw);
      setProductName(snapshot.productName);
      setCategory(snapshot.category);
      setUsageFeel(snapshot.usageFeel);
      setAvoidTermsInput(snapshot.avoidTermsInput);
      setClaims(snapshot.claims);
      setSkinTypes(snapshot.skinTypes);
      setFixedClaims(snapshot.fixedClaims.length ? snapshot.fixedClaims : defaultFixedTags.claims);
      setFixedSkinTypes(snapshot.fixedSkinTypes.length ? snapshot.fixedSkinTypes : defaultFixedTags.skinTypes);
      setFixedUsageFeels(snapshot.fixedUsageFeels.length ? snapshot.fixedUsageFeels : defaultFixedTags.usageFeels);
      setClaimInput(snapshot.claimInput);
      setSkinInput(snapshot.skinInput);
      setUsageFeelInput(snapshot.usageFeelInput);
      setSaveClaimAsFixed(snapshot.saveClaimAsFixed);
      setSaveSkinAsFixed(snapshot.saveSkinAsFixed);
      setSaveUsageFeelAsFixed(snapshot.saveUsageFeelAsFixed);
      pendingAssetUploadsRef.current.clear();
      setAssets((current) => {
        current.forEach(revokeAssetPreviewUrl);
        return snapshot.assets;
      });
      setSets(cloneGenerationSets(snapshot.sets));
      setResults(snapshot.results);
      setGenerationError(snapshot.generationError);
      setPreviewImage(undefined);
      window.localStorage.setItem(storageKeys.claims, JSON.stringify(snapshot.fixedClaims));
      window.localStorage.setItem(storageKeys.skinTypes, JSON.stringify(snapshot.fixedSkinTypes));
      window.localStorage.setItem(storageKeys.usageFeels, JSON.stringify(snapshot.fixedUsageFeels));
      setSnapshotStatus(`已载入 ${formatSnapshotTime(snapshot.savedAt)}`);
    } catch {
      setSnapshotStatus('状态载入失败');
      setGenerationError('载入状态失败：保存数据无法解析。');
    }
  }

  function buildHistoryPayload(targetResults = results, options?: { productInfo?: ProductInfo; generationSets?: GenerationSet[]; targetHistoryId?: string }) {
    return {
      historyId: options?.targetHistoryId ?? historyId,
      productInfo: options?.productInfo ?? currentProductInfo,
      generationSets: cloneGenerationSets(options?.generationSets ?? sets),
      results: targetResults,
    };
  }

  async function persistCurrentHistory(
    targetResults = results,
    options?: { productInfo?: ProductInfo; generationSets?: GenerationSet[]; targetHistoryId?: string },
  ) {
    if (!targetResults.length) return;

    try {
      const response = await postJson<{ ok: true; item: BuyerShowHistoryItem } | { ok: false; error: string }>(
        '/api/buyer-show/history',
        buildHistoryPayload(targetResults, options),
      );
      if (!response.ok) throw new Error(response.error);
      setHistoryId(response.item.id);
      setSnapshotStatus(`云端历史已保存 ${formatSnapshotTime(response.item.updatedAt)}`);
      void loadHistoryItems();
    } catch (error) {
      setSnapshotStatus('云端历史保存失败');
      setGenerationError(error instanceof Error ? `保存云端历史失败：${error.message}` : '保存云端历史失败');
    }
  }

  async function loadHistoryItems() {
    setIsHistoryLoading(true);
    try {
      const response = await getJson<{ ok: true; items: BuyerShowHistoryItem[] } | { ok: false; error: string }>(
        '/api/buyer-show/history?limit=20',
      );
      if (!response.ok) throw new Error(response.error);
      setHistoryItems(response.items);
    } catch {
      setHistoryItems([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function loadHistoryItem(targetHistoryId: string) {
    if (!targetHistoryId) return;

    try {
      const response = await getJson<{ ok: true; item: BuyerShowHistoryItem } | { ok: false; error: string }>(
        `/api/buyer-show/history/${encodeURIComponent(targetHistoryId)}`,
      );
      if (!response.ok) throw new Error(response.error);

      applyProductInfo(response.item.productInfo);
      setSets(cloneGenerationSets(response.item.generationSets));
      setResults(response.item.results);
      setHistoryId(response.item.id);
      setGenerationError(undefined);
      setPreviewImage(undefined);
      setSnapshotStatus(`已载入云端历史 ${formatSnapshotTime(response.item.updatedAt)}`);
    } catch (error) {
      setGenerationError(error instanceof Error ? `载入云端历史失败：${error.message}` : '载入云端历史失败');
    }
  }

  async function deleteCurrentHistoryItem() {
    if (!historyId) {
      setSnapshotStatus('还没有选中的云端历史');
      return;
    }

    try {
      const response = await requestJson<{ ok: true } | { ok: false; error: string }>(
        `/api/buyer-show/history/${encodeURIComponent(historyId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error(response.error);
      setHistoryId(undefined);
      setSnapshotStatus('云端历史已删除');
      await loadHistoryItems();
    } catch (error) {
      setGenerationError(error instanceof Error ? `删除云端历史失败：${error.message}` : '删除云端历史失败');
    }
  }

  function handleNewProject() {
    generationRequestIdRef.current += 1;
    setProductName('');
    setCategory('');
    setUsageFeel('');
    setAvoidTermsInput('');
    setClaims([]);
    setSkinTypes([]);
    setClaimInput('');
    setSkinInput('');
    setUsageFeelInput('');
    setSaveClaimAsFixed(false);
    setSaveSkinAsFixed(false);
    setSaveUsageFeelAsFixed(false);
    assets.forEach(revokeAssetPreviewUrl);
    pendingAssetUploadsRef.current.clear();
    setAssets([]);
    setSets(createClearedGenerationSets());
    setResults([]);
    setHistoryId(undefined);
    setIsGenerating(false);
    setGenerationError(undefined);
    setPreviewImage(undefined);
    setSnapshotStatus('已新建项目');
  }

  function persistTags(group: TagGroup, tags: string[]) {
    window.localStorage.setItem(storageKeys[group], JSON.stringify(tags));
    if (group === 'claims') setFixedClaims(tags);
    if (group === 'skinTypes') setFixedSkinTypes(tags);
    if (group === 'usageFeels') setFixedUsageFeels(tags);
  }

  function addTag(group: TagGroup, value: string, saveAsFixed: boolean) {
    const cleanValue = value.trim();
    if (!cleanValue) return;

    if (group === 'claims') {
      setClaims((current) => (current.includes(cleanValue) ? current : [...current, cleanValue]));
      if (saveAsFixed) {
        persistTags('claims', fixedClaims.includes(cleanValue) ? fixedClaims : [...fixedClaims, cleanValue]);
      }
      setClaimInput('');
      return;
    }

    if (group === 'skinTypes') {
      setSkinTypes((current) => (current.includes(cleanValue) ? current : [...current, cleanValue]));
      if (saveAsFixed) {
        persistTags('skinTypes', fixedSkinTypes.includes(cleanValue) ? fixedSkinTypes : [...fixedSkinTypes, cleanValue]);
      }
      setSkinInput('');
      return;
    }

    setUsageFeel((current) => {
      const currentTags = splitCommaList(current);
      return (currentTags.includes(cleanValue) ? currentTags : [...currentTags, cleanValue]).join('、');
    });
    if (saveAsFixed) {
      persistTags('usageFeels', fixedUsageFeels.includes(cleanValue) ? fixedUsageFeels : [...fixedUsageFeels, cleanValue]);
    }
    setUsageFeelInput('');
  }

  function toggleArrayValue<T extends string>(values: T[], value: T) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  function updateSetLanguages(setId: string, language: LanguageCode) {
    setSets((current) =>
      current.map((set) => {
        if (set.id !== setId) return set;
        const nextLanguages = toggleArrayValue(set.languages, language);
        return {
          ...set,
          languages: nextLanguages.length ? nextLanguages : set.languages,
          commentCount: nextLanguages.length || set.languages.length,
        };
      }),
    );
  }

  function updateSetMode(setId: string, mode: GenerationSet['mode']) {
    setSets((current) =>
      current.map((set) =>
        set.id === setId
          ? {
              ...set,
              mode,
              imageTypeCounts:
                mode === 'comment_only'
                  ? createEmptyImageTypeCounts()
                  : getSetImageTotal(set) > 0
                    ? set.imageTypeCounts
                    : { ...set.imageTypeCounts, texture_on_hand: 1 },
            }
          : set,
      ),
    );
  }

  function updateSetPersonProfile(setId: string, personProfile: PersonProfile) {
    setSets((current) => current.map((set) => (set.id === setId ? { ...set, personProfile } : set)));
  }

  function updateSetPersonGender(setId: string, personGender: PersonGender) {
    setSets((current) => current.map((set) => (set.id === setId ? { ...set, personGender } : set)));
  }

  function updateSetSeasonClimate(setId: string, seasonClimate: SeasonClimate) {
    setSets((current) => current.map((set) => (set.id === setId ? { ...set, seasonClimate } : set)));
  }

  function toggleSetSceneElement(setId: string, sceneElement: SceneElement) {
    setSets((current) =>
      current.map((set) => {
        if (set.id !== setId) return set;
        const nextSceneElements = toggleArrayValue(set.sceneElements, sceneElement);
        return {
          ...set,
          sceneElements: nextSceneElements.length ? nextSceneElements : set.sceneElements,
        };
      }),
    );
  }

  function updateSetImageTypeCount(setId: string, imageType: ImageType, value: string) {
    const imageCount = Math.max(0, Math.min(6, Number.parseInt(value, 10) || 0));
    setSets((current) =>
      current.map((set) => {
        if (set.id !== setId) return set;
        const imageTypeCounts = {
          ...set.imageTypeCounts,
          [imageType]: imageCount,
        };
        return {
          ...set,
          imageTypeCounts,
          mode: Object.values(imageTypeCounts).some((count) => count > 0) ? 'image_with_comment' : 'comment_only',
        };
      }),
    );
  }

  function toggleSetImageType(setId: string, imageType: ImageType) {
    setSets((current) =>
      current.map((set) => {
        if (set.id !== setId) return set;
        const nextCount = set.imageTypeCounts[imageType] > 0 ? 0 : 1;
        const imageTypeCounts = {
          ...set.imageTypeCounts,
          [imageType]: nextCount,
        };
        return {
          ...set,
          imageTypeCounts,
          mode: Object.values(imageTypeCounts).some((count) => count > 0) ? 'image_with_comment' : 'comment_only',
        };
      }),
    );
  }

  function addGenerationSet() {
    setSets((current) => {
      const nextIndex = current.length + 1;
      return [
        ...current,
        {
          id: `set-${Date.now()}`,
          name: getSuiteDisplayName(nextIndex - 1),
          mode: 'comment_only',
          personProfile: defaultPersonProfile,
          personGender: defaultPersonGender,
          seasonClimate: defaultSeasonClimate,
          sceneElements: [...defaultSceneElements],
          imageTypeCounts: createEmptyImageTypeCounts(),
          languages: ['zh-CN'],
          commentCount: 1,
        },
      ];
    });
  }

  function removeGenerationSet(setId: string) {
    setSets((current) => {
      if (current.length <= 1) return current;
      setResults((resultsCurrent) => resultsCurrent.filter((result) => result.setId !== setId));
      return current.filter((set) => set.id !== setId);
    });
  }

  async function handleAssetUpload(type: UploadedAssetType, event: ChangeEvent<HTMLInputElement>) {
    const uploadInput = event.currentTarget;
    const files = Array.from(uploadInput.files ?? []);
    if (!files.length) return;

    setGenerationError(undefined);
    try {
      files.forEach(validateUploadFile);
      const optimisticAssets = files.map((file, index) => createOptimisticAsset(type, file, index));
      setAssets((current) => [...current, ...optimisticAssets]);
      optimisticAssets.forEach((asset, index) => {
        startAssetUpload(asset, files[index]);
      });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      uploadInput.value = '';
    }
  }

  function startAssetUpload(asset: ClientUploadedAsset, file: File) {
    const uploadPromise = uploadAssetToR2(asset.type, file)
      .then((uploaded): AssetUploadCompletion => {
        setAssets((current) =>
          current.map((item) =>
            item.id === asset.id
              ? { ...item, objectKey: uploaded.key, uploadStatus: 'uploaded', uploadError: undefined }
              : item,
          ),
        );
        return { objectKey: uploaded.key };
      })
      .catch((error): AssetUploadCompletion => {
        const message = error instanceof Error ? error.message : '图片上传失败';
        setAssets((current) =>
          current.map((item) => (item.id === asset.id ? { ...item, uploadStatus: 'failed', uploadError: message } : item)),
        );
        return { error: message };
      });

    pendingAssetUploadsRef.current.set(asset.id, uploadPromise);
    return uploadPromise;
  }

  async function ensureAssetsUploaded(targetAssets: ClientUploadedAsset[]) {
    return Promise.all(
      targetAssets.map(async (asset) => {
        if (asset.objectKey) return asset;

        const pendingUpload = pendingAssetUploadsRef.current.get(asset.id);
        if (!pendingUpload) {
          throw new Error(asset.uploadError || `${asset.name} 还没有完成上传，请稍后重试`);
        }

        const uploaded = await pendingUpload;
        if (uploaded.error || !uploaded.objectKey) {
          throw new Error(uploaded.error || `${asset.name} 上传失败，请重新选择图片`);
        }

        return {
          ...asset,
          objectKey: uploaded.objectKey,
          uploadStatus: 'uploaded' as const,
          uploadError: undefined,
        };
      }),
    );
  }

  function removeAsset(assetId: string) {
    pendingAssetUploadsRef.current.delete(assetId);
    setAssets((current) => {
      const asset = current.find((item) => item.id === assetId);
      if (asset) revokeAssetPreviewUrl(asset);
      return current.filter((item) => item.id !== assetId);
    });
  }

  function updateCommentCompliance(
    resultId: string,
    commentId: string,
    compliance: {
      status: GeneratedComment['complianceStatus'];
      reasons: string[];
      rewriteSuggestion?: string;
    },
  ) {
    setResults((current) => {
      const nextResults = current.map((result) =>
        result.id === resultId
          ? {
              ...result,
              comments: result.comments.map((comment) =>
                comment.id === commentId
                  ? {
                      ...comment,
                      complianceStatus: compliance.status,
                      complianceReasons: compliance.reasons,
                      rewriteSuggestion: compliance.rewriteSuggestion,
                    }
                  : comment,
              ),
            }
          : result,
      );
      return nextResults;
    });
  }

  async function runComplianceChecks(targets: Array<Pick<GeneratedResult, 'id' | 'comments'>>, requestId = generationRequestIdRef.current) {
    await Promise.all(
      targets.flatMap((result) =>
        result.comments
          .filter((comment) => comment.complianceStatus === 'checking')
          .map(async (comment) => {
            try {
              const response = await postJson<
                | { ok: true; compliance: { status: GeneratedComment['complianceStatus']; reasons: string[]; rewriteSuggestion?: string } }
                | { ok: false; error: string }
              >('/api/buyer-show/compliance-check', {
                comment: comment.text,
                language: comment.language,
              });

              if (!response.ok) throw new Error(response.error);
              if (generationRequestIdRef.current !== requestId) return;

              updateCommentCompliance(result.id, comment.id, {
                status: response.compliance.status,
                reasons: response.compliance.reasons,
                rewriteSuggestion: response.compliance.rewriteSuggestion,
              });
            } catch (error) {
              if (generationRequestIdRef.current !== requestId) return;
              updateCommentCompliance(result.id, comment.id, {
                status: 'needs_review',
                reasons: [`自检失败：${error instanceof Error ? error.message : '请人工确认'}`],
              });
            }
          }),
      ),
    );
  }

  async function generateResults() {
    const requestId = generationRequestIdRef.current + 1;
    generationRequestIdRef.current = requestId;
    setIsGenerating(true);
    setGenerationError(undefined);
    setGenerationStatus('生成任务已提交，正在创建后台任务...');

    try {
      const generationSets = sets.map((set, index) => ({ ...set, name: getSuiteDisplayName(index) }));
      const uploadedAssets = await ensureAssetsUploaded(assets);
      if (generationRequestIdRef.current !== requestId) return;
      const response = await postJson<
        { ok: true; jobId: string; job: BuyerShowGenerationJob } | { ok: false; error: string }
      >(
        '/api/buyer-show/generate',
        {
          productInfo: currentProductInfo,
          assets: uploadedAssets.map(toAssetPayload),
          generationSets,
        },
      );

      if (!response.ok) {
        throw new Error(response.error);
      }

      setGenerationStatus(getGenerationJobMessage(response.job));
      const completedJob = await pollGenerationJob(response.jobId, requestId);
      if (generationRequestIdRef.current !== requestId) return;

      if (completedJob.productInfo) {
        applyProductInfo(completedJob.productInfo);
      }
      setResults(completedJob.results ?? []);
      setSnapshotStatus('生成完成，云端历史未保存');
      setGenerationStatus(undefined);
      void runComplianceChecks(completedJob.results ?? [], requestId);
    } catch (error) {
      if (generationRequestIdRef.current === requestId) {
        setGenerationError(error instanceof Error ? error.message : '生成失败，请稍后重试');
        setGenerationStatus(undefined);
      }
    } finally {
      if (generationRequestIdRef.current === requestId) {
        setIsGenerating(false);
      }
    }
  }

  async function pollGenerationJob(jobId: string, requestId: number): Promise<BuyerShowGenerationJob> {
    let attempt = 0;

    while (generationRequestIdRef.current === requestId) {
      const response = await getJson<{ ok: true; job: BuyerShowGenerationJob } | { ok: false; error: string }>(
        `/api/buyer-show/generate/${encodeURIComponent(jobId)}`,
      );

      if (!response.ok) {
        throw new Error(response.error);
      }

      setGenerationStatus(getGenerationJobMessage(response.job));

      if (response.job.status === 'completed') {
        return response.job;
      }

      if (response.job.status === 'failed') {
        throw new Error(response.job.error || '生成失败，请稍后重试');
      }

      attempt += 1;
      await waitForNextPoll(Math.min(3000, 1000 + attempt * 250));
    }

    throw new Error('生成任务已取消');
  }

  async function regenerateComment(resultId: string, comment: GeneratedComment) {
    setGenerationError(undefined);
    try {
      const response = await postJson<{ ok: true; comment: GeneratedComment } | { ok: false; error: string }>(
        '/api/buyer-show/regenerate-comment',
        {
          productInfo: currentProductInfo,
          language: comment.language,
          setId: resultId,
        },
      );

      if (!response.ok) throw new Error(response.error);

      setResults((current) => {
        const nextResults = current.map((result) =>
          result.id === resultId
            ? {
                ...result,
                comments: result.comments.map((item) => (item.id === comment.id ? response.comment : item)),
              }
            : result,
        );
        return nextResults;
      });
      void runComplianceChecks([{ id: resultId, comments: [response.comment] }]);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '重生成评论失败');
    }
  }

  async function regenerateImage(resultId: string, setId: string, image: GeneratedImage) {
    setGenerationError(undefined);
    const set = sets.find((item) => item.id === setId);
    const personProfile = set?.personProfile ?? defaultPersonProfile;
    const personGender = set?.personGender ?? defaultPersonGender;
    const seasonClimate = set?.seasonClimate ?? defaultSeasonClimate;
    const sceneElement = image.sceneElement ?? set?.sceneElements[0] ?? defaultSceneElements[0];
    try {
      const uploadedAssets = await ensureAssetsUploaded(assets);
      const response = await postJson<
        | { ok: true; image: { url?: string; b64Json?: string; localImageKey?: string; promptSnapshot?: string } }
        | { ok: false; error: string }
      >('/api/buyer-show/regenerate-image', {
        productInfo: currentProductInfo,
        imageType: image.type,
        personProfile,
        personGender,
        sceneElement,
        seasonClimate,
        imageUrls: getReferenceImageUrls(uploadedAssets),
        assets: uploadedAssets.map(toAssetPayload),
      });

      if (!response.ok) throw new Error(response.error);

      setResults((current) => {
        const nextResults = current.map((result) =>
          result.id === resultId
            ? {
                ...result,
                images: result.images.map((item) =>
                  item.id === image.id
                    ? {
                        ...item,
                        url: response.image.url,
                        localImageKey: response.image.b64Json
                          ? `data:image/png;base64,${response.image.b64Json}`
                          : response.image.localImageKey,
                        promptSnapshot: response.image.promptSnapshot ?? item.promptSnapshot,
                      }
                    : item,
                ),
              }
            : result,
        );
        return nextResults;
      });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '重生成图片失败');
    }
  }

  async function recheckComment(resultId: string, comment: GeneratedComment) {
    const requestId = generationRequestIdRef.current;
    setGenerationError(undefined);
    setResults((current) =>
      current.map((result) =>
        result.id === resultId
          ? {
              ...result,
              comments: result.comments.map((item) => (item.id === comment.id ? markCommentAsChecking(item) : item)),
            }
          : result,
      ),
    );

    try {
      const response = await postJson<
        | { ok: true; compliance: { status: GeneratedComment['complianceStatus']; reasons: string[]; rewriteSuggestion?: string } }
        | { ok: false; error: string }
      >('/api/buyer-show/compliance-check', {
        comment: comment.text,
        language: comment.language,
      });

      if (!response.ok) throw new Error(response.error);
      if (generationRequestIdRef.current !== requestId) return;

      updateCommentCompliance(resultId, comment.id, {
        status: response.compliance.status,
        reasons: response.compliance.reasons,
        rewriteSuggestion: response.compliance.rewriteSuggestion,
      });
    } catch (error) {
      if (generationRequestIdRef.current !== requestId) return;
      updateCommentCompliance(resultId, comment.id, {
        status: 'needs_review',
        reasons: [`自检失败：${error instanceof Error ? error.message : '请人工确认'}`],
      });
    }
  }

  async function copyComment(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function updateCommentText(resultId: string, commentId: string, text: string) {
    setResults((current) =>
      current.map((result) =>
        result.id === resultId
          ? {
              ...result,
              comments: result.comments.map((comment) => (comment.id === commentId ? { ...comment, text } : comment)),
            }
          : result,
      ),
    );
  }

  async function downloadImage(image: GeneratedImage) {
    const href = getImageSource(image);
    if (!href) {
      setGenerationError('这张图还没有可下载的真实图片地址');
      return;
    }

    const filename = imageDownloadName(image);
    const downloadUrl = createImageDownloadUrl(href, filename);
    setGenerationError(undefined);

    if (downloadUrl === href) {
      triggerImageDownload(downloadUrl, filename);
      return;
    }

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error('图片下载失败，请稍后重试');
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      triggerImageDownload(blobUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '图片下载失败，请稍后重试');
    }
  }

  function applyProductInfo(productInfo: ProductInfo) {
    setProductName(productInfo.productName ?? '');
    setCategory(displayCategoryFromProductInfo(productInfo.category));
    setClaims(productInfo.productClaims);
    setSkinTypes(productInfo.skinTypes);
    setUsageFeel(productInfo.usageFeel ?? '');
    setAvoidTermsInput(productInfo.avoidTerms.join('、'));
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>✦</div>
          <div>
            <div>买家秀智能体</div>
            <div className={styles.subtle}>运营草稿生成工具</div>
          </div>
        </div>

        <nav className={styles.nav}>
          <a href="#upload">上传素材</a>
          <a href="#product-info">商品信息</a>
          <a href="#sets">配置套件</a>
          <a href="#results">生成结果</a>
        </nav>

        <div className={styles.summary}>
          <strong>当前摘要</strong>
          <div className={styles.summaryRow}>
            <span>产品</span>
            <strong>{currentProductInfo.productName ?? '待补全'}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>肤质</span>
            <strong>{skinTypes.length ? skinTypes.join(' / ') : '待补全'}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>功效</span>
            <strong>{claims.length ? claims.slice(0, 2).join('、') : '待补全'}</strong>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <h1>买家秀智能体</h1>
            <p className={styles.subtle}>上传素材、补全商品信息、配置 A/B/C 套件并审核评论自检结果</p>
          </div>
          <div className={styles.topbarUtility}>
            <div className={styles.topbarActions}>
              <button className={styles.secondaryButton} data-action="save-state" onClick={saveSnapshotState} type="button">
                保存状态
              </button>
              <button className={styles.secondaryButton} data-action="load-state" onClick={loadSnapshotState} type="button">
                载入状态
              </button>
              <button className={styles.secondaryButton} onClick={handleNewProject} type="button">
                新建项目
              </button>
            </div>
            <div className={styles.historyControls}>
              <select
                aria-label="云端历史"
                data-action="load-history"
                disabled={isHistoryLoading || !historyItems.length}
                onChange={(event) => void loadHistoryItem(event.target.value)}
                value={historyId ?? ''}
              >
                <option value="">{isHistoryLoading ? '历史加载中' : '云端历史'}</option>
                {historyItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatSnapshotTime(item.updatedAt)} · {item.title}
                  </option>
                ))}
              </select>
              <button className={styles.secondaryButton} data-action="refresh-history" onClick={() => void loadHistoryItems()} type="button">
                刷新历史
              </button>
              <button className={styles.secondaryButton} data-action="save-cloud-history" disabled={!results.length} onClick={() => void persistCurrentHistory()} type="button">
                保存云端历史
              </button>
              <button className={styles.dangerButton} data-action="delete-history" disabled={!historyId} onClick={() => void deleteCurrentHistoryItem()} type="button">
                删除历史
              </button>
            </div>
            {snapshotStatus ? <span className={styles.stateStatus}>{snapshotStatus}</span> : null}
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.section} id="upload">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Step 1 of 4</p>
                <h2>上传素材</h2>
                <p className={styles.subtle}>分区上传产品图、包装图、质地图；多张图用于帮助 AI 理解同一个商品。</p>
              </div>
            </div>
            <div className={styles.uploadGrid}>
              {uploadSections.map((section) => {
                const sectionAssets = assets.filter((asset) => asset.type === section.type);
                return (
                  <article className={styles.uploadZone} data-upload-type={section.type} key={section.type}>
                    <label className={styles.uploadDrop}>
                      <strong>{section.title}</strong>
                      <span className={styles.subtle}>{section.description}</span>
                      <span className={styles.secondaryButton}>选择图片</span>
                      <input
                        accept="image/*"
                        className={styles.fileInput}
                        multiple
                        onChange={(event) => handleAssetUpload(section.type, event)}
                        type="file"
                      />
                    </label>
                    {sectionAssets.length ? (
                      <div className={styles.uploadPreviewList}>
                        {sectionAssets.map((asset) => (
                          <div className={styles.uploadPreview} key={asset.id}>
                            <img alt={asset.name} src={asset.previewUrl} />
                            <span>{asset.name}</span>
                            <button
                              className={styles.removeAssetButton}
                              onClick={(event) => {
                                event.preventDefault();
                                removeAsset(asset.id);
                              }}
                              type="button"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.section} id="product-info">
            <div>
              <p className={styles.kicker}>Step 2 of 4</p>
              <h2>商品信息</h2>
              <p className={styles.subtle}>用户填写内容优先，未填写的字段会根据上传的商品图、包装图、质地图由 AI 补全。</p>
            </div>
              <div className={styles.panel}>
                <div className={styles.panelTitle}>
                  <h3>填写与确认</h3>
                </div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    商品名称
                    <input onChange={(event) => setProductName(event.target.value)} value={productName} />
                  </label>
                  <label className={styles.field}>
                    品类
                    <input
                      list="buyer-show-category-suggestions"
                      maxLength={40}
                      onChange={(event) => setCategory(event.target.value)}
                      placeholder="未知/待识别，或输入品类"
                      value={category}
                    />
                    <datalist id="buyer-show-category-suggestions">
                      {categorySuggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                      <option value="未知/待识别" />
                    </datalist>
                  </label>
                  <TagManager
                    className={styles.full}
                    title="功效 / 重点卖点"
                    inputLabel="自定义卖点"
                    inputValue={claimInput}
                    fixedTags={fixedClaims}
                    saveAsFixed={saveClaimAsFixed}
                    selected={claims}
                    setInputValue={setClaimInput}
                    onAdd={() => addTag('claims', claimInput, saveClaimAsFixed)}
                    onDelete={(tag) => persistTags('claims', fixedClaims.filter((item) => item !== tag))}
                    onSaveAsFixedChange={setSaveClaimAsFixed}
                    onToggle={(tag) => setClaims((current) => toggleArrayValue(current, tag))}
                  />
                  <TagManager
                    className={styles.full}
                    title="适用肤质"
                    inputLabel="自定义肤质"
                    inputValue={skinInput}
                    fixedTags={fixedSkinTypes}
                    saveAsFixed={saveSkinAsFixed}
                    selected={skinTypes}
                    setInputValue={setSkinInput}
                    onAdd={() => addTag('skinTypes', skinInput, saveSkinAsFixed)}
                    onDelete={(tag) => persistTags('skinTypes', fixedSkinTypes.filter((item) => item !== tag))}
                    onSaveAsFixedChange={setSaveSkinAsFixed}
                    onToggle={(tag) => setSkinTypes((current) => toggleArrayValue(current, tag))}
                  />
                  <TagManager
                    className={styles.full}
                    title="使用感"
                    inputLabel="自定义使用感"
                    inputValue={usageFeelInput}
                    fixedTags={fixedUsageFeels}
                    saveAsFixed={saveUsageFeelAsFixed}
                    selected={splitCommaList(usageFeel)}
                    setInputValue={setUsageFeelInput}
                    onAdd={() => addTag('usageFeels', usageFeelInput, saveUsageFeelAsFixed)}
                    onDelete={(tag) => persistTags('usageFeels', fixedUsageFeels.filter((item) => item !== tag))}
                    onSaveAsFixedChange={setSaveUsageFeelAsFixed}
                    onToggle={(tag) => setUsageFeel((current) => toggleArrayValue(splitCommaList(current), tag).join('、'))}
                  />
                  <label className={`${styles.field} ${styles.full}`}>
                    避免表达
                    <input onChange={(event) => setAvoidTermsInput(event.target.value)} value={avoidTermsInput} />
                  </label>
                </div>
              </div>
          </section>

          <section className={styles.section} id="sets">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Step 3 of 4</p>
                <h2>配置套件</h2>
                <p className={styles.subtle}>每个套件独立选择输出模式、图片类型和评论语言。</p>
              </div>
              <button className={styles.primaryButton} onClick={addGenerationSet} type="button">
                添加套件
              </button>
            </div>
            <div className={styles.suiteGrid}>
              {sets.map((set, index) => (
                <article className={styles.suiteCard} key={set.id}>
                  <div className={styles.suiteHead}>
                    <div>
                      <strong className={styles.suiteName}>{getSuiteDisplayName(index)}</strong>
                    </div>
                    <button
                      className={styles.dangerButton}
                      disabled={sets.length <= 1}
                      onClick={() => removeGenerationSet(set.id)}
                      type="button"
                    >
                      删除套件
                    </button>
                  </div>
                  <div className={styles.suiteBody}>
                    <div className={styles.segmented}>
                      <button
                        className={set.mode === 'comment_only' ? styles.active : ''}
                        onClick={() => updateSetMode(set.id, 'comment_only')}
                        type="button"
                      >
                        只生成评论
                      </button>
                      <button
                        className={set.mode === 'image_with_comment' ? styles.active : ''}
                        onClick={() => updateSetMode(set.id, 'image_with_comment')}
                        type="button"
                      >
                        X图 + 1评论
                      </button>
                    </div>
                    <div className={styles.ethnicityPicker}>
                      <strong>人物画像</strong>
                      <div className={styles.chipRow}>
                        {Object.entries(personProfileLabels).map(([value, label]) => {
                          const personProfile = value as PersonProfile;
                          return (
                            <label className={styles.chip} data-person-profile={personProfile} key={personProfile}>
                              <input
                                checked={set.personProfile === personProfile}
                                name={`${set.id}-person-profile`}
                                onChange={() => updateSetPersonProfile(set.id, personProfile)}
                                type="radio"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className={styles.ethnicityPicker}>
                      <strong>性别</strong>
                      <div className={styles.chipRow}>
                        {Object.entries(personGenderLabels).map(([value, label]) => {
                          const personGender = value as PersonGender;
                          return (
                            <label className={styles.chip} data-person-gender={personGender} key={personGender}>
                              <input
                                checked={set.personGender === personGender}
                                name={`${set.id}-person-gender`}
                                onChange={() => updateSetPersonGender(set.id, personGender)}
                                type="radio"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className={styles.ethnicityPicker}>
                      <strong>季节气候</strong>
                      <div className={styles.chipRow}>
                        {Object.entries(seasonClimateLabels).map(([value, label]) => {
                          const seasonClimate = value as SeasonClimate;
                          return (
                            <label className={styles.chip} data-season-climate={seasonClimate} key={seasonClimate}>
                              <input
                                checked={set.seasonClimate === seasonClimate}
                                name={`${set.id}-season-climate`}
                                onChange={() => updateSetSeasonClimate(set.id, seasonClimate)}
                                type="radio"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className={styles.languagePicker}>
                      <strong>场景元素</strong>
                      <div className={styles.chipRow}>
                        {Object.entries(sceneElementLabels).map(([value, label]) => {
                          const sceneElement = value as SceneElement;
                          return (
                            <label className={styles.chip} data-scene-element={sceneElement} key={sceneElement}>
                              <input
                                checked={set.sceneElements.includes(sceneElement)}
                                onChange={() => toggleSetSceneElement(set.id, sceneElement)}
                                type="checkbox"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                      <p className={styles.subtle}>多张图会按所选场景顺序轮换；至少保留一个场景。</p>
                    </div>
                    <div className={styles.languagePicker} data-language-selector={set.id}>
                      <strong>评论语言</strong>
                      <div className={styles.chipRow}>
                        {supportedLanguages.map((language) => (
                          <label className={styles.chip} data-language-code={language.code} key={language.code}>
                            <input
                              checked={set.languages.includes(language.code)}
                              onChange={() => updateSetLanguages(set.id, language.code)}
                              type="checkbox"
                            />
                            {language.label}
                          </label>
                        ))}
                      </div>
                      <p className={styles.subtle}>同图多语言评论，按语言分别自检。</p>
	                    </div>
	                    <div className={styles.numberRow}>
	                      <label>
	                        图片合计
	                        <input readOnly value={`共 ${getSetImageTotal(set)} 张图`} />
	                      </label>
	                      <label>
	                        评论
	                        <input readOnly value={set.languages.length} />
	                      </label>
	                    </div>
	                    <strong>每类生成数量</strong>
	                    <div className={styles.imageTypeList}>
	                      {Object.entries(imageTypeLabels).map(([type, label]) => {
	                        const imageType = type as ImageType;
	                        return (
	                          <div className={styles.imageType} data-image-type={type} key={type}>
	                            <input
	                              aria-label={`启用${label}`}
	                              checked={set.imageTypeCounts[imageType] > 0}
	                              onChange={() => toggleSetImageType(set.id, imageType)}
	                              type="checkbox"
	                            />
	                            <span>{label}</span>
	                            <label className={styles.typeCountControl}>
	                              张数
	                              <input
	                                aria-label={`${label}张数`}
	                                max={6}
	                                min={0}
	                                onChange={(event) => updateSetImageTypeCount(set.id, imageType, event.target.value)}
	                                type="number"
	                                value={set.imageTypeCounts[imageType]}
	                              />
	                            </label>
	                          </div>
	                        );
	                      })}
	                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} id="results">
            <div>
              <p className={styles.kicker}>Step 4 of 4</p>
              <h2>生成结果</h2>
              <p className={styles.subtle}>按套件展示缩略图、各语言评论文本、合规状态。自检只做提示，不强制拦截。</p>
              {generationStatus ? <p className={styles.progressText}>{generationStatus}</p> : null}
              {generationError ? <p className={styles.errorText}>生成接口返回：{generationError}</p> : null}
            </div>
            <div className={styles.resultList}>
              {results.map((result, index) => {
                const resultComplianceStatus = getResultComplianceStatus(result.comments);

                return (
                  <article
                    className={`${styles.resultCard} ${result.mode === 'comment_only' ? styles.commentOnly : ''}`}
                    data-result-mode={result.mode}
                    key={result.id}
                  >
                  {result.mode !== 'comment_only' ? (
                    <div className={styles.smallThumbs}>
                      {result.images.map((image) => (
                        <ResultImageFrame
                          image={image}
                          key={image.id}
                          onDownload={() => downloadImage(image)}
                          onPreview={() => setPreviewImage(image)}
                          onRegenerate={() => regenerateImage(result.id, result.setId, image)}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.resultContent}>
                    <div className={styles.resultHead}>
                      <div>
                        <h3>{getSuiteDisplayName(index)}</h3>
                        <p className={styles.subtle}>{result.images.length} 张图 + {result.comments.length} 语言评论</p>
                      </div>
                      <span
                        className={`${styles.statusChip} ${
                          resultComplianceStatus === 'passed'
                            ? styles.passed
                            : resultComplianceStatus === 'checking'
                              ? styles.checking
                              : styles.review
                        }`}
                      >
                        {getResultComplianceLabel(resultComplianceStatus)}
                      </span>
                    </div>
                    <div className={styles.languageResultList}>
                      {result.comments.map((comment) => (
                        <div className={styles.languageResult} data-result-language={comment.language} key={comment.id}>
                          <div className={styles.languageResultHead}>
                            <span className={`${styles.statusChip} ${styles.languageBadge}`}>{getLanguageLabel(comment.language)}</span>
                            <span
                              className={`${styles.statusChip} ${
                                comment.complianceStatus === 'passed'
                                  ? styles.passed
                                  : comment.complianceStatus === 'checking'
                                    ? styles.checking
                                    : styles.review
                              }`}
                            >
                              {getCommentComplianceLabel(comment.complianceStatus)}
                            </span>
                          </div>
                          <div className={styles.commentBox}>
                            <div className={styles.commentLabel}>
                              <label htmlFor={comment.id}>生成评论</label>
                              <button className={styles.secondaryButton} data-action="copy-comment" onClick={() => copyComment(comment.text)}>
                                复制评论
                              </button>
                            </div>
                            <textarea
                              id={comment.id}
                              onChange={(event) => updateCommentText(result.id, comment.id, event.target.value)}
                              rows={4}
                              value={comment.text}
                            />
                          </div>
                          <div className={`${styles.complianceBox} ${comment.complianceStatus === 'needs_review' ? styles.warning : ''}`}>
                            <strong>按语言分别自检</strong>
                            <span>{comment.complianceReasons.join('；')}</span>
                            {comment.rewriteSuggestion ? <span>改写建议：{comment.rewriteSuggestion}</span> : null}
                          </div>
                          <div className={styles.resultActions}>
                            <button className={styles.secondaryButton} onClick={() => regenerateComment(result.id, comment)}>
                              重生成评论
                            </button>
                            <button className={styles.secondaryButton} data-action="recheck-comment" onClick={() => recheckComment(result.id, comment)}>
                              重新审查
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        {previewImage ? (
          <div className={styles.previewOverlay} role="dialog" aria-modal="true">
            <div className={styles.previewPanel}>
              <div className={styles.resultHead}>
                <strong>{imageTypeLabels[previewImage.type]}</strong>
                <button className={styles.iconButton} onClick={() => setPreviewImage(undefined)} type="button">
                  ×
                </button>
              </div>
              {getImageSource(previewImage) ? (
                <img alt={imageTypeLabels[previewImage.type]} src={getImageSource(previewImage)} />
              ) : (
                <div className={styles.previewPlaceholder}>当前是占位缩略图，生成后可放大预览。</div>
              )}
            </div>
          </div>
        ) : null}

        <footer className={styles.footerBar}>
          <span className={styles.subtle}>
            {sets.length} 个套件，共 {totalCommentCount} 条多语言评论。上传图和生成图优先保存在用户浏览器本地。
          </span>
          <button className={styles.primaryButton} disabled={isGenerating} onClick={generateResults}>
            {isGenerating ? '生成中...' : '开始生成'}
          </button>
        </footer>
      </main>
    </div>
  );
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function getJson<T>(url: string): Promise<T> {
  return requestJson<T>(url);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: `接口返回为空（HTTP ${response.status}）` } as T;
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    if (
      !response.ok &&
      (typeof parsed !== 'object' || parsed === null || !('ok' in (parsed as Record<string, unknown>)))
    ) {
      return { ok: false, error: `接口请求失败（HTTP ${response.status}）` } as T;
    }
    return parsed;
  } catch {
    const looksLikeHtml = /^<!doctype/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
    const message = looksLikeHtml
      ? '接口返回了 HTML 错误页，本地服务可能正在重启或接口路由异常。请稍后重试。'
      : `接口返回不是有效 JSON：${trimmed.slice(0, 160)}`;
    return { ok: false, error: `${message}（HTTP ${response.status}）` } as T;
  }
}

function ResultImageFrame({
  image,
  onDownload,
  onPreview,
  onRegenerate,
}: {
  image: GeneratedImage;
  onDownload: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
}) {
  const imageSource = getImageSource(image);

  return (
    <div className={styles.smallThumb}>
      <button className={styles.imagePreviewButton} onClick={onPreview} type="button">
        {imageSource ? <img alt={imageTypeLabels[image.type]} src={imageSource} /> : <span>{imageTypeLabels[image.type]}</span>}
      </button>
      <div className={styles.imageActionGroup}>
        <button className={styles.imageAction} data-action="regenerate-single-image" onClick={onRegenerate} type="button">
          重生成单图
        </button>
        <button className={styles.imageAction} onClick={onDownload} type="button">
          下载图片
        </button>
      </div>
    </div>
  );
}

function TagManager({
  className,
  title,
  inputLabel,
  inputValue,
  fixedTags,
  saveAsFixed,
  selected,
  setInputValue,
  onAdd,
  onDelete,
  onSaveAsFixedChange,
  onToggle,
}: {
  className?: string;
  title: string;
  inputLabel: string;
  inputValue: string;
  fixedTags: string[];
  saveAsFixed: boolean;
  selected: string[];
  setInputValue: (value: string) => void;
  onAdd: () => void;
  onDelete: (tag: string) => void;
  onSaveAsFixedChange: (value: boolean) => void;
  onToggle: (tag: string) => void;
}) {
  const allTags = Array.from(new Set([...selected, ...fixedTags]));

  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      <span>{title}</span>
      <div className={styles.tagManager}>
        <div className={styles.chipRow}>
          {allTags.map((tag) => (
            <label className={styles.chip} key={tag}>
              <input checked={selected.includes(tag)} onChange={() => onToggle(tag)} type="checkbox" />
              <span className={styles.chipText}>{tag}</span>
              {fixedTags.includes(tag) ? (
                <button
                  className={styles.deleteTagButton}
                  data-action="delete-fixed-tag"
                  onClick={(event) => {
                    event.preventDefault();
                    onDelete(tag);
                  }}
                  title={`删除固定标签：${tag}`}
                  type="button"
                >
                  ×
                </button>
              ) : null}
            </label>
          ))}
        </div>
        <div className={styles.customTagRow}>
          <input aria-label={inputLabel} onChange={(event) => setInputValue(event.target.value)} placeholder={inputLabel} value={inputValue} />
          <label className={styles.chip}>
            <input checked={saveAsFixed} onChange={(event) => onSaveAsFixedChange(event.target.checked)} type="checkbox" /> 保存为固定标签
          </label>
          <button className={styles.secondaryButton} data-action="save-fixed-tag" onClick={onAdd} type="button">
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

const imageTypeLabels = {
  texture_on_hand: '质地上手图',
  bathroom_vanity: '商品摆放场景图',
  handheld_product_closeup: '手持商品特写图',
  selfie_holding_product: '真人自拍持产品图',
} as const;
