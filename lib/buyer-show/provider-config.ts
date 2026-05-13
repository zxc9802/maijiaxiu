export const providerConfig = {
  textBaseUrl: process.env.SHANBAOB_BASE_URL ?? 'https://www.shanbaob.net/v1',
  textApiKey: process.env.SHANBAOB_API_KEY,
  textModel: process.env.BUYER_SHOW_TEXT_MODEL ?? 'gemini-3.1-pro-preview',
  imageBaseUrl: process.env.YUNWU_IMAGE_BASE_URL ?? 'https://yunwu.ai/v1',
  imageApiKey: process.env.YUNWU_IMAGE_API_KEY,
  imageModel: process.env.YUNWU_IMAGE_MODEL ?? 'gpt-image-2-all',
  imageSize: process.env.YUNWU_IMAGE_SIZE ?? '1152x2048',
};

export function requireProviderSecret(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}
