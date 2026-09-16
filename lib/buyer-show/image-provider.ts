import { trackProviderRequest } from './usage-monitor';
import { request } from 'node:https';
import { URL } from 'node:url';
import { providerConfig, requireProviderSecret } from './provider-config';
import type { ImageType } from './schemas';

type ImageGenerationInput = {
  prompt: string;
  imageUrls?: string[];
  imageType?: ImageType;
};

type GeneratedProviderImage = {
  url?: string;
  b64Json?: string;
};

type ImageProviderName = 'yunwu' | 'xai';

type ImageProviderConfig = {
  name: ImageProviderName;
  baseUrl: string;
  apiKey?: string;
  apiKeyEnvName: string;
  model: string;
  size: string;
  quality?: string;
};

type ImageProviderAttempt = {
  provider: ImageProviderConfig;
  attemptNumber: number;
};

type ProviderHttpResponse = {
  ok: boolean;
  status: number;
  body: string;
};

const maxImageProviderAttempts = 5;
const retryableProviderStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export async function generateBuyerShowImage(input: ImageGenerationInput) {
  const attempts = buildAlternatingImageProviderAttempts(buildImageProviders());
  let lastError: Error | undefined;
  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const generated =
        attempt.provider.name === 'xai'
          ? await requestXaiImageGeneration(input, attempt.provider)
          : await requestYunwuImageGeneration(input, attempt.provider);

      return {
        ...generated,
        type: input.imageType,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Image provider failed');
      failures.push(`${attempt.provider.name}#${attempt.attemptNumber}: ${lastError.message}`);
    }
  }

  console.error('[buyer-show-image-provider] All image providers failed', failures, lastError);
  throw new Error('图片生成失败，请稍后重试');
}

function buildImageProviders(): ImageProviderConfig[] {
  return [
    {
      name: 'yunwu',
      baseUrl: providerConfig.imageBaseUrl,
      apiKey: providerConfig.imageApiKey,
      apiKeyEnvName: 'YUNWU_IMAGE_API_KEY',
      model: providerConfig.imageModel ?? 'gpt-image-2-all',
      size: providerConfig.imageSize,
    },
    {
      name: 'xai',
      baseUrl: providerConfig.xaiImageBaseUrl,
      apiKey: providerConfig.xaiImageApiKey,
      apiKeyEnvName: 'XAI_IMAGE_API_KEY',
      model: providerConfig.xaiImageModel,
      size: providerConfig.xaiImageSize,
      quality: providerConfig.xaiImageQuality,
    },
  ];
}

function buildAlternatingImageProviderAttempts(providers: ImageProviderConfig[]): ImageProviderAttempt[] {
  return Array.from({ length: maxImageProviderAttempts }, (_, index) => index + 1).flatMap((attemptNumber) =>
    providers.map((provider) => ({ provider, attemptNumber })),
  );
}

async function requestYunwuImageGeneration(
  input: ImageGenerationInput,
  provider: ImageProviderConfig,
): Promise<GeneratedProviderImage> {
  if (input.imageUrls?.length) {
    return requestImageEdit(input, provider);
  }

  const response = await requestJsonImageGeneration({
    url: buildProviderUrl(provider.baseUrl, '/images/generations'),
    apiKey: requireProviderSecret(provider.apiKey, provider.apiKeyEnvName),
    payload: {
      model: provider.model,
      size: provider.size,
      n: 1,
      prompt: input.prompt,
      image: input.imageUrls ?? [],
    },
  });

  return readImageFromJsonResponse(response);
}

async function requestXaiImageGeneration(
  input: ImageGenerationInput,
  provider: ImageProviderConfig,
): Promise<GeneratedProviderImage> {
  if (input.imageUrls?.length) {
    return requestImageEdit(input, provider);
  }

  const response = await requestJsonImageGeneration({
    url: buildProviderUrl(provider.baseUrl, '/images/generations'),
    apiKey: requireProviderSecret(provider.apiKey, provider.apiKeyEnvName),
    payload: {
      model: provider.model,
      prompt: input.prompt,
      size: provider.size,
      quality: provider.quality,
      output_format: 'png',
      response_format: 'b64_json',
      stream: true,
    },
  });

  if (!response.ok) {
    const parsed = parseProviderJson(response.body);
    throw new Error(readProviderError(parsed) ?? `Image provider failed with HTTP ${response.status}`);
  }

  return {
    b64Json: readStreamedImageB64Json(response.body) ?? readImageFromParsedJson(parseProviderJson(response.body)).b64Json,
  };
}

async function requestImageEdit(input: ImageGenerationInput, provider: ImageProviderConfig): Promise<GeneratedProviderImage> {
  const apiKey = requireProviderSecret(provider.apiKey, provider.apiKeyEnvName);
  const form = new FormData();
  form.append('model', provider.model);
  form.append('prompt', input.prompt);
  form.append('n', '1');
  form.append('size', provider.size);
  form.append('quality', provider.quality ?? 'high');
  form.append('output_format', 'png');
  form.append('response_format', 'b64_json');

  const referenceImages = await Promise.all((input.imageUrls ?? []).map(readReferenceImage));
  for (const image of referenceImages) {
    form.append('image', image.blob, image.filename);
  }

  try {
    const providerResponse = await trackProviderRequest(buildProviderUrl(provider.baseUrl, '/images/edits'), provider.model, async () => {
      const response = await fetch(buildProviderUrl(provider.baseUrl, '/images/edits'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      } satisfies ProviderHttpResponse;
    });

    return readImageFromJsonResponse(providerResponse);
  } catch (error) {
    if (shouldRetryImageProviderError(error instanceof Error ? error : new Error('Image provider failed'))) {
      throw new Error(`Image provider connection failed: ${readConnectionErrorMessage(error)}`);
    }

    throw error;
  }
}

async function readReferenceImage(url: string, index: number) {
  if (url.startsWith('data:image/')) {
    return readDataReferenceImage(url, index);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reference image fetch failed with HTTP ${response.status}`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  return {
    blob: new Blob([await response.arrayBuffer()], { type: mimeType }),
    filename: `reference-${index + 1}.${extensionForMimeType(mimeType)}`,
  };
}

function readDataReferenceImage(url: string, index: number) {
  const match = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Reference image data URL must be base64 encoded');
  }

  const [, mimeType, b64Json] = match;
  const bytes = Buffer.from(b64Json, 'base64');
  return {
    blob: new Blob([Uint8Array.from(bytes)], { type: mimeType }),
    filename: `reference-${index + 1}.${extensionForMimeType(mimeType)}`,
  };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function readImageFromJsonResponse(response: ProviderHttpResponse): GeneratedProviderImage {
  const parsed = parseProviderJson(response.body);

  if (!response.ok) {
    const retryContext = shouldRetryImageProviderResponse(response) ? ' (retryable)' : '';
    throw new Error(readProviderError(parsed) ?? `Image provider failed with HTTP ${response.status}${retryContext}`);
  }

  return readImageFromParsedJson(parsed);
}

function readImageFromParsedJson(parsed: unknown): GeneratedProviderImage {
  const first = (parsed as { data?: Array<{ url?: string; b64_json?: string }> }).data?.[0];
  if (!first?.url && !first?.b64_json) {
    throw new Error('Image provider returned no image data');
  }

  return {
    url: first.url,
    b64Json: first.b64_json,
  };
}

function parseProviderJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Image provider returned non-JSON response: ${raw.slice(0, 160)}`);
  }
}

function readStreamedImageB64Json(raw: string) {
  let lastB64Json: string | undefined;

  for (const block of raw.split(/\n\n+/)) {
    const dataText = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();

    if (!dataText || dataText === '[DONE]') continue;

    try {
      const parsed = JSON.parse(dataText) as { b64_json?: unknown; data?: Array<{ b64_json?: unknown }> };
      const imageData = parsed.data?.find((item) => typeof item.b64_json === 'string');
      let b64Json: string | undefined;
      if (typeof parsed.b64_json === 'string') {
        b64Json = parsed.b64_json;
      } else if (typeof imageData?.b64_json === 'string') {
        b64Json = imageData.b64_json;
      }
      if (b64Json) lastB64Json = b64Json;
    } catch {
      // Ignore malformed event chunks and let the final no-image-data error explain the failure.
    }
  }

  return lastB64Json;
}

function buildProviderUrl(baseUrl: string, pathname: string) {
  return `${baseUrl.replace(/\/+$/, '')}${pathname}`;
}

function shouldRetryImageProviderResponse(response: ProviderHttpResponse) {
  return retryableProviderStatuses.has(response.status) || (response.status >= 500 && response.status < 600);
}

function shouldRetryImageProviderError(error: Error) {
  return (
    error.message.startsWith('Image provider connection failed') ||
    error.message.startsWith('Reference image fetch failed') ||
    error.message.startsWith('Image provider returned non-JSON response') ||
    /HTTP (408|409|425|429|5\d\d)/.test(error.message) ||
    /Bad Gateway|Gateway Timeout|temporarily unavailable/i.test(error.message)
  );
}

async function requestJsonImageGeneration({
  url,
  apiKey,
  payload,
}: {
  url: string;
  apiKey: string;
  payload: Record<string, unknown>;
}) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    try {
      return await trackProviderRequest(url, String(payload.model), async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        return {
          ok: response.ok,
          status: response.status,
          body: await response.text(),
        } satisfies ProviderHttpResponse;
      });
    } catch {
      return await trackProviderRequest(url, String(payload.model), () => requestJsonOverHttp1(url, headers, payload));
    }
  } catch (error) {
    throw new Error(`Image provider connection failed: ${readConnectionErrorMessage(error)}`);
  }
}

function readConnectionErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'unknown network error';
}

function requestJsonOverHttp1(url: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  const endpoint = new URL(url);
  const body = JSON.stringify(payload);

  return new Promise<ProviderHttpResponse>((resolve, reject) => {
    const req = request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
        agent: false,
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            body: responseBody,
          });
        });
      },
    );

    req.setTimeout(180000, () => {
      req.destroy(new Error('Image provider HTTP/1.1 request timed out'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function readProviderError(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const error = (value as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : undefined;
}
