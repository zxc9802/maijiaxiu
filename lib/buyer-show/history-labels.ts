import type { ComplianceStatus, GeneratedResult, GenerationSet, LanguageCode, ProductInfo } from './schemas';

type HistoryLabelInput = {
  title?: string | null;
  productInfo?: Partial<ProductInfo> | null;
  generationSets?: Array<Pick<GenerationSet, 'imageTypeCounts' | 'languages' | 'commentCount'>> | null;
  results?: Array<Pick<GeneratedResult, 'images' | 'comments'>> | null;
  status?: ComplianceStatus | string | null;
};

export type HistoryMeta = {
  setCount: number;
  imageCount: number;
  commentCount: number;
  languages: LanguageCode[];
  status: ComplianceStatus;
};

const unknownCategoryLabels = new Set(['unknown', '未知', '未知/待识别', '待识别']);
const placeholderHistoryTitles = new Set(['未命名买家秀记录', '未命名记录']);

const languageShortLabels: Record<LanguageCode, string> = {
  'zh-CN': '中',
  'en-US': '英',
  'th-TH': '泰',
  'ms-MY': '马',
};

const languageOrder: LanguageCode[] = ['zh-CN', 'en-US', 'th-TH', 'ms-MY'];

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimLabel(value: string, maxLength = 80) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function isKnownCategory(category: string) {
  return Boolean(category && !unknownCategoryLabels.has(category));
}

function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in languageShortLabels;
}

function normalizeStatus(value: unknown): ComplianceStatus | undefined {
  return value === 'checking' || value === 'needs_review' || value === 'passed' ? value : undefined;
}

function countImagesFromSets(generationSets: HistoryLabelInput['generationSets']) {
  return (generationSets || []).reduce((total, set) => {
    return total + Object.values(set.imageTypeCounts || {}).reduce((sum, count) => sum + (Number.isFinite(count) ? Math.max(0, Number(count)) : 0), 0);
  }, 0);
}

function countCommentsFromSets(generationSets: HistoryLabelInput['generationSets']) {
  return (generationSets || []).reduce((total, set) => {
    if (Number.isFinite(set.commentCount)) return total + Math.max(0, Number(set.commentCount));
    return total + set.languages.length;
  }, 0);
}

function collectLanguages(input: HistoryLabelInput) {
  const seen = new Set<LanguageCode>();

  for (const set of input.generationSets || []) {
    for (const language of set.languages) {
      if (isLanguageCode(language)) seen.add(language);
    }
  }

  for (const result of input.results || []) {
    for (const comment of result.comments || []) {
      if (isLanguageCode(comment.language)) seen.add(comment.language);
    }
  }

  return languageOrder.filter((language) => seen.has(language));
}

function resolveHistoryStatus(input: HistoryLabelInput): ComplianceStatus {
  const explicitStatus = normalizeStatus(input.status);
  if (explicitStatus) return explicitStatus;

  const commentStatuses = (input.results || []).flatMap((result) => result.comments.map((comment) => comment.complianceStatus));
  if (commentStatuses.some((status) => status === 'checking')) return 'checking';
  if (commentStatuses.some((status) => status === 'needs_review')) return 'needs_review';
  return 'passed';
}

function resolveTitleBase(productInfo: HistoryLabelInput['productInfo']) {
  const productName = cleanString(productInfo?.productName);
  if (productName) return { text: trimLabel(productName), strong: true };

  const category = cleanString(productInfo?.category);
  if (isKnownCategory(category)) return { text: trimLabel(category), strong: true };

  const firstClaim = productInfo?.productClaims?.map(cleanString).find(Boolean);
  if (firstClaim) return { text: trimLabel(firstClaim, 36), strong: false };

  const usageFeel = cleanString(productInfo?.usageFeel);
  if (usageFeel) return { text: trimLabel(usageFeel, 36), strong: false };

  const firstSkinType = productInfo?.skinTypes?.map(cleanString).find(Boolean);
  if (firstSkinType) return { text: trimLabel(`${firstSkinType}买家秀`, 36), strong: false };

  return { text: '', strong: false };
}

export function getHistoryMeta(input: HistoryLabelInput): HistoryMeta {
  const resultImageCount = (input.results || []).reduce((total, result) => total + result.images.length, 0);
  const resultCommentCount = (input.results || []).reduce((total, result) => total + result.comments.length, 0);

  return {
    setCount: input.generationSets?.length || input.results?.length || 0,
    imageCount: resultImageCount || countImagesFromSets(input.generationSets),
    commentCount: resultCommentCount || countCommentsFromSets(input.generationSets),
    languages: collectLanguages(input),
    status: resolveHistoryStatus(input),
  };
}

export function formatHistoryStatus(status: ComplianceStatus) {
  if (status === 'checking') return '审核中';
  if (status === 'needs_review') return '需人工判断';
  return '已通过';
}

export function formatHistoryLanguages(languages: LanguageCode[]) {
  return languages.map((language) => languageShortLabels[language]).join('/');
}

export function formatCompactHistoryMeta(meta: Pick<HistoryMeta, 'setCount' | 'imageCount' | 'commentCount'>) {
  const parts = [];
  if (meta.setCount > 0) parts.push(`${meta.setCount}套`);
  parts.push(`${meta.imageCount}图`);
  parts.push(`${meta.commentCount}评`);
  return parts.join('');
}

export function formatHistoryMeta(meta: HistoryMeta) {
  return [
    meta.setCount > 0 ? `${meta.setCount}套` : null,
    `${meta.imageCount}图`,
    `${meta.commentCount}评`,
    formatHistoryLanguages(meta.languages),
    formatHistoryStatus(meta.status),
  ].filter(Boolean).join(' · ');
}

export function createHistoryTitle(input: HistoryLabelInput) {
  const titleBase = resolveTitleBase(input.productInfo);
  if (titleBase.strong) return titleBase.text;

  const meta = getHistoryMeta(input);
  const compactMeta = formatCompactHistoryMeta(meta);

  if (titleBase.text) return `${titleBase.text} · ${compactMeta}`;

  const languageSummary = formatHistoryLanguages(meta.languages);
  return [compactMeta, languageSummary].filter(Boolean).join(' · ') || '买家秀记录';
}

export function formatHistoryDisplayTitle(input: HistoryLabelInput) {
  const title = cleanString(input.title);
  if (title && !placeholderHistoryTitles.has(title)) return trimLabel(title);
  return createHistoryTitle(input);
}
