import type { LanguageCode, ProductInfo } from './schemas';

export const humanizerReference = 'https://github.com/blader/humanizer';

export const languageInstructions: Record<LanguageCode, string> = {
  'zh-CN': '用简体中文生成，语气像真实素人评论，允许轻微口语化。',
  'en-US': 'Write in natural English, like a real customer review, not marketing copy.',
  'th-TH': 'เขียนเป็นภาษาไทยแบบรีวิวผู้ใช้จริง ไม่ใช่ภาษาโฆษณา',
  'ms-MY': 'Tulis dalam Bahasa Melayu seperti ulasan pelanggan sebenar, bukan gaya iklan.',
};

export function buildHumanizedCommentPrompt(productInfo: ProductInfo, language: LanguageCode) {
  return [
    `Reference anti-AI-writing style: ${humanizerReference}`,
    languageInstructions[language],
    'Avoid template-like phrasing, exaggerated efficacy claims, medical claims, and overly neat parallel structure.',
    'Prefer concrete but imperfect sensory details, natural transitions, and modest wording.',
    `Product name: ${productInfo.productName ?? 'unknown'}`,
    `Category: ${productInfo.category ?? 'unknown'}`,
    `Claims: ${productInfo.productClaims.join(', ') || 'none'}`,
    `Skin types: ${productInfo.skinTypes.join(', ') || 'none'}`,
    `Usage feel: ${productInfo.usageFeel ?? 'unknown'}`,
    `Avoid terms: ${productInfo.avoidTerms.join(', ') || 'none'}`,
    'Return valid JSON only: {"comment":"..."}. Do not wrap in markdown. Do not explain.',
  ].join('\n');
}

export function buildCompliancePrompt(comment: string, language: LanguageCode) {
  return [
    languageInstructions[language],
    'Review this buyer-show comment for sensitive risk, exaggerated efficacy, platform risk, and medical claims.',
    'Return valid JSON only: {"status":"passed|needs_review","reasons":["..."],"rewriteSuggestion":"optional"}. Do not wrap in markdown. Do not explain.',
    `Comment: ${comment}`,
  ].join('\n');
}
