import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type UsageUser = { userId: string; ssoVerified?: boolean };
type HttpResult = { status: number; body: string };
type Status = 'pending' | 'completed' | 'failed' | 'interrupted';
const users = new AsyncLocalStorage<string | undefined>();

// Call only with the live-validated session or its server-owned job snapshot.
export function withUsageUser<T>(user: UsageUser, work: () => T): T {
  return users.run(user.ssoVerified === true ? user.userId : undefined, work);
}

export function isOpenLux(url: string) {
  try { return new URL(url).hostname.toLowerCase() === 'api.openlux.ai'; } catch { return false; }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function count(...values: unknown[]): number | null {
  return values.find((v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) ?? null;
}

export function parseUsage(value: unknown) {
  const root = object(value);
  const data = Object.keys(object(root.response)).length ? object(root.response) : root;
  const usage = object(data.usage);
  const gemini = object(data.usageMetadata);
  const inputDetails = object(usage.input_tokens_details ?? usage.prompt_tokens_details);
  const outputDetails = object(usage.output_tokens_details ?? usage.completion_tokens_details);
  const inputTokens = count(usage.input_tokens, usage.prompt_tokens, gemini.promptTokenCount);
  const candidates = count(gemini.candidatesTokenCount);
  const outputTokens = count(usage.output_tokens, usage.completion_tokens) ??
    (candidates !== null ? candidates + (count(gemini.thoughtsTokenCount) ?? 0) : null);
  const totalTokens = inputTokens !== null && outputTokens !== null
    ? inputTokens + outputTokens : count(usage.total_tokens, gemini.totalTokenCount);
  const imageDetails = Array.isArray(gemini.promptTokensDetails) ? gemini.promptTokensDetails.map(object).filter(d => d.modality === 'IMAGE') : [];
  const imageCounts = imageDetails.map(d => count(d.tokenCount));
  return {
    tokenBasis: inputTokens !== null || outputTokens !== null || totalTokens !== null ? 'reported' as const : 'missing' as const,
    inputTokens, outputTokens, totalTokens,
    cachedInputTokens: count(inputDetails.cached_tokens, gemini.cachedContentTokenCount),
    cacheWriteTokens: count(usage.cache_creation_input_tokens),
    reasoningTokens: count(outputDetails.reasoning_tokens, gemini.thoughtsTokenCount),
    imageInputTokens: count(inputDetails.image_tokens, usage.image_input_tokens) ??
      (imageCounts.length && imageCounts.every(n => n !== null) ? imageCounts.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null),
  };
}

export function parseProviderResponse(response: HttpResult) {
  const chunks: Record<string, unknown>[] = [];
  try { chunks.push(object(JSON.parse(response.body))); } catch {
    for (const line of response.body.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try { chunks.push(object(JSON.parse(line.slice(5).trim()))); } catch { /* SSE markers have no usage. */ }
    }
  }
  const last = chunks.at(-1) ?? {};
  const usageChunk = [...chunks].reverse().find(c => parseUsage(c).tokenBasis === 'reported') ?? last;
  const state = String(last.status ?? object(last.response).status ?? '');
  let status: Status = 'completed';
  if (response.status >= 400 || chunks.some(c => c.error || /failed|error/.test(String(c.type ?? c.status ?? '')))) status = 'failed';
  else if (response.status === 202 || ['pending', 'queued', 'processing', 'in_progress'].includes(state)) status = 'pending';
  else if (!chunks.length || (response.body.trimStart().startsWith('data:') && !response.body.includes('[DONE]') && !chunks.some(c => /completed|succeeded/.test(String(c.type ?? c.status ?? ''))))) status = 'interrupted';
  const id = last.id ?? object(last.response).id;
  return { status, usage: parseUsage(usageChunk), upstreamRequestId: typeof id === 'string' ? id.slice(0, 200) : undefined };
}

function config() {
  const mainUrl = process.env.MAIN_APP_URL?.trim().replace(/\/+$/, '');
  const secret = process.env.USAGE_MONITOR_INTERNAL_SECRET?.trim();
  if (!mainUrl || !secret) return null;
  return { url: `${mainUrl}/api/sso/usage`, secret, dir: process.env.USAGE_MONITOR_OUTBOX_DIR || join(process.cwd(), 'data', 'usage-outbox') };
}
type Event = ReturnType<typeof parseUsage> & { userId: string; requestId: string; provider: string; model: string; status: Status; upstreamRequestId?: string };

async function persist(event: Event) {
  const settings = config();
  if (!settings) return;
  const path = join(settings.dir, `${event.requestId}-${event.status === 'pending' ? '0' : '1'}.json`);
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(settings.dir, { recursive: true });
    await writeFile(temp, JSON.stringify(event), { mode: 0o600 });
    await rename(temp, path);
  } catch {
    console.error('[usage-monitor] Could not persist usage metadata; check persistent outbox storage.');
    await unlink(temp).catch(() => {});
  }
}

let drain: Promise<void> | undefined;
export async function drainUsageOutbox() {
  if (drain) return drain;
  drain = drainBatch().finally(() => { drain = undefined; });
  return drain;
}
async function drainBatch() {
  const settings = config();
  if (!settings) return;
  try {
    const files = (await readdir(settings.dir)).filter(f => /^[a-f0-9-]{36}-[01]\.json$/.test(f)).sort().slice(0, 10);
    for (const file of files) {
      const path = join(settings.dir, file);
      try {
        const body = await readFile(path, 'utf8');
        const response = await fetch(settings.url, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-usage-tool': 'maijiaxiu', 'x-usage-secret': settings.secret },
          body, signal: AbortSignal.timeout(2000), redirect: 'error',
        });
        if (!response.ok || object(await response.json()).success !== true) break;
        await unlink(path);
      } catch { break; }
    }
  } catch { /* Empty/missing outbox or storage outage must not fail generation. */ }
}

export async function trackProviderRequest<T extends HttpResult>(url: string, model: string, send: () => Promise<T>): Promise<T> {
  const userId = users.getStore();
  if (!userId || !isOpenLux(url) || !config()) return send();
  const event: Event = { userId, requestId: randomUUID(), provider: 'api.openlux.ai', model, status: 'pending', ...parseUsage({}) };
  await persist(event);
  let response: T;
  try { response = await send(); } catch (error) {
    await persist({ ...event, status: 'failed' });
    await drainUsageOutbox();
    throw error;
  }
  const parsed = parseProviderResponse(response);
  await persist({ ...event, ...parsed.usage, status: parsed.status, upstreamRequestId: parsed.upstreamRequestId });
  await drainUsageOutbox();
  return response;
}
