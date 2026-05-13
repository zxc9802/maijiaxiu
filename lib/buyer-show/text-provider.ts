import { request } from 'node:https';
import { URL } from 'node:url';
import { providerConfig, requireProviderSecret } from './provider-config';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'image_url';
            image_url: { url: string };
          }
      >;
};

type ChatOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

type ProviderHttpResponse = {
  ok: boolean;
  status: number;
  body: string;
};

export async function createChatCompletion(messages: ChatMessage[], options: ChatOptions = {}) {
  const apiKey = requireProviderSecret(providerConfig.textApiKey, 'SHANBAOB_API_KEY');
  const model = options.model ?? providerConfig.textModel ?? 'gemini-3.1-pro-preview';

  const response = await requestChatCompletion({
    url: `${providerConfig.textBaseUrl}/chat/completions`,
    apiKey,
    payload: {
      model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 1200,
      stream: false,
    },
  });

  const raw = response.body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Text provider returned non-JSON response: ${raw.slice(0, 160)}`);
  }

  if (!response.ok) {
    const message = readProviderError(parsed) ?? `Text provider failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = readAssistantContent(parsed);
  if (!content) {
    throw new Error('Text provider returned an empty assistant message');
  }

  return content;
}

async function requestChatCompletion({
  url,
  apiKey,
  payload,
}: {
  url: string;
  apiKey: string;
  payload: Record<string, unknown>;
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
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
    throw new Error(`Text provider connection failed: ${readConnectionErrorMessage(error)}`);
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

    req.setTimeout(120000, () => {
      req.destroy(new Error('Text provider HTTP/1.1 request timed out'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export function parseJsonObject<T>(content: string): T {
  return JSON.parse(extractJsonObjectText(content)) as T;
}

function extractJsonObjectText(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }

  return candidate;
}

function readAssistantContent(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const choices = (value as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : undefined;
}

function readProviderError(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const error = (value as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : undefined;
}
