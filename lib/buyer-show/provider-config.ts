export const providerConfig = {
  textBaseUrl: process.env.SHANBAOB_BASE_URL ?? 'https://www.shanbaob.net/v1',
  textApiKey: process.env.SHANBAOB_API_KEY,
  textModel: process.env.BUYER_SHOW_TEXT_MODEL ?? 'gemini-3.1-pro-preview',
  imageBaseUrl: process.env.YUNWU_IMAGE_BASE_URL ?? 'https://yunwu.ai/v1',
  imageApiKey: process.env.YUNWU_IMAGE_API_KEY,
  imageModel: process.env.YUNWU_IMAGE_MODEL ?? 'gpt-image-2-all',
  imageSize: process.env.YUNWU_IMAGE_SIZE ?? '1152x2048',
  xaiImageBaseUrl: process.env.XAI_IMAGE_BASE_URL ?? 'https://api-xai.ainaibahub.com/v1',
  xaiImageApiKey: process.env.XAI_IMAGE_API_KEY,
  xaiImageModel: process.env.XAI_IMAGE_MODEL ?? 'gpt-image-2',
  xaiImageSize: process.env.XAI_IMAGE_SIZE ?? '1024x1024',
  xaiImageQuality: process.env.XAI_IMAGE_QUALITY ?? 'high',
  falApiKey: process.env.FAL_KEY,
  falImageModel: process.env.FAL_IMAGE_MODEL ?? 'openai/gpt-image-2.5/sunburst/edit',
};

export function requireProviderSecret(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}
