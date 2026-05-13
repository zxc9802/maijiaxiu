import { request } from 'node:https';
import { URL } from 'node:url';
import { providerConfig, requireProviderSecret } from './provider-config';
import type { ImageType } from './schemas';

type ImageGenerationInput = {
  prompt: string;
  imageUrls?: string[];
  imageType?: ImageType;
};

type ProviderHttpResponse = {
  ok: boolean;
  status: number;
  body: string;
};

export async function generateBuyerShowImage(input: ImageGenerationInput) {
  const apiKey = requireProviderSecret(providerConfig.imageApiKey, 'YUNWU_IMAGE_API_KEY');
  const response = await requestImageGeneration({
    url: `${providerConfig.imageBaseUrl}/images/generations`,
    apiKey,
    payload: {
      model: providerConfig.imageModel ?? 'gpt-image-2-all',
      size: providerConfig.imageSize,
      n: 1,
      prompt: input.prompt,
      image: input.imageUrls ?? [],
    },
  });

  const raw = response.body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Image provider returned non-JSON response: ${raw.slice(0, 160)}`);
  }

  if (!response.ok) {
    throw new Error(readProviderError(parsed) ?? `Image provider failed with HTTP ${response.status}`);
  }

  const first = (parsed as { data?: Array<{ url?: string; b64_json?: string }> }).data?.[0];
  if (!first?.url && !first?.b64_json) {
    throw new Error('Image provider returned no image data');
  }

  return {
    url: first.url,
    b64Json: first.b64_json,
    type: input.imageType,
  };
}

async function requestImageGeneration({
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
    } catch {
      return await requestJsonOverHttp1(url, headers, payload);
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
